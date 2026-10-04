// Mux game video Task 4 — upload, cancel and remove (plan R1–R4, R8; rulings
// P1/P2/P6, E1–E6; controller addendum). The repository, Mux client, policy,
// worker kick and games.service are mocked at their module boundaries (E2);
// these tests pin call order (reserve before Mux, enqueue before detach),
// exactly-once quota release, and the concurrent-create single winner with
// deferred promises. Ids are valid 24-hex ObjectIds.
const mockRepository = {
  reserveUploadSlot: jest.fn(),
  releaseUploadSlot: jest.fn(),
  releaseStoredMinutes: jest.fn(),
  createUploadAttempt: jest.fn(),
  setUploadAttemptUploadId: jest.fn(),
  findUploadAttemptById: jest.fn(),
  findUploadAttemptByGenerationId: jest.fn(),
  transitionUploadAttempt: jest.fn(),
  takeUploadAttemptStoredMinutes: jest.fn(),
  enqueueCleanupJob: jest.fn(),
  attachGameVideo: jest.fn(),
  detachGameVideo: jest.fn(),
};
const mockMux = { isMuxConfigured: jest.fn(), createDirectUpload: jest.fn() };
const mockCleanup = { kickCleanup: jest.fn() };
const mockPolicy = { resolveUploadAllowance: jest.fn(), resolveVideoManagerAccess: jest.fn() };
const mockGamesService = { assertGameAccess: jest.fn() };
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock('../../config/logger', () => ({ logger: mockLogger }));
jest.mock('../../modules/video/video.repository', () => ({
  ...mockRepository,
  UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES: ['reserved', 'uploading', 'processing'],
  summarizeCleanupError: jest.requireActual('../../modules/video/video.repository')
    .summarizeCleanupError,
}));
jest.mock('../../modules/video/mux.client', () => ({
  ...mockMux,
  MuxApiError: jest.requireActual('../../modules/video/mux.client').MuxApiError,
}));
jest.mock('../../modules/video/video.cleanup', () => mockCleanup);
jest.mock('../../modules/video/video.policy', () => ({
  ...mockPolicy,
  UPLOAD_ALLOWANCE_REASONS: jest.requireActual('../../modules/video/video.policy')
    .UPLOAD_ALLOWANCE_REASONS,
}));
jest.mock('../../modules/games/games.service', () => mockGamesService);

const { ApiError } = require('../../utils/apiError');
const { MuxApiError } = require('../../modules/video/mux.client');
const { UPLOAD_ALLOWANCE_REASONS } = require('../../modules/video/video.policy');
const videoService = require('../../modules/video/video.service');

const GAME_ID = '64b7f0c2a1b2c3d4e5f60718';
const LEAGUE_ID = '64b7f0c2a1b2c3d4e5f60719';
const USER_ID = '64b7f0c2a1b2c3d4e5f6071a';
const ATTEMPT_ID = '64b7f0c2a1b2c3d4e5f6071b';
const OTHER_ATTEMPT_ID = '64b7f0c2a1b2c3d4e5f6071c';
const OLD_ATTEMPT_ID = '64b7f0c2a1b2c3d4e5f6071d';
const OTHER_GAME_ID = '64b7f0c2a1b2c3d4e5f6071e';
const NEW_GENERATION = 'b1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_GENERATION = 'c1b2c3d4e5f60718293a4b5c6d7e8f90';
const OLD_GENERATION = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const ORIGIN = 'http://localhost:5173'; // allowed by config/cors in the test env
const UPLOAD_URL = 'https://storage.googleapis.com/video-storage-upload/secret-signed-url';
const RESOURCE = { type: 'league', id: LEAGUE_ID };
const LIMITS = { maxStoredMinutes: 600, maxConcurrentUploads: 1, maxCreatesPerDay: 3 };

function game(overrides = {}) {
  return {
    _id: GAME_ID,
    gameContext: 'league',
    leagueId: LEAGUE_ID,
    status: 'in_progress',
    videoUrl: null,
    video: null,
    ...overrides,
  };
}

function attempt(overrides = {}) {
  return {
    _id: ATTEMPT_ID,
    gameId: GAME_ID,
    generationId: NEW_GENERATION,
    billingResource: RESOURCE,
    reservedMinutes: 180,
    storedMinutes: 0,
    status: 'reserved',
    deployment: 'test:tsw_2026_test',
    ...overrides,
  };
}

function oldVideo(overrides = {}) {
  return {
    provider: 'mux',
    status: 'uploading',
    generationId: OLD_GENERATION,
    version: 3,
    uploadId: 'up-old',
    assetId: null,
    ...overrides,
  };
}

function attachedGame(video = {}) {
  return {
    _id: GAME_ID,
    video: {
      provider: 'mux',
      status: 'uploading',
      generationId: NEW_GENERATION,
      version: 1759579200000,
      uploadId: 'up-new',
      assetId: null,
      playbackId: null,
      durationSeconds: null,
      errorMessage: null,
      ...video,
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function callOrder(...mocks) {
  return mocks.map((mock) => mock.mock.invocationCallOrder[0]);
}

function expectAscending(order) {
  expect(order.every((n) => typeof n === 'number')).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
}

function loggedText() {
  return JSON.stringify(
    ['debug', 'info', 'warn', 'error'].map((level) => mockLogger[level].mock.calls)
  );
}

const create = (overrides = {}) =>
  videoService.createGameVideoUpload({
    userId: USER_ID,
    gameId: GAME_ID,
    origin: ORIGIN,
    ...overrides,
  });

beforeEach(() => {
  jest.resetAllMocks();
  mockGamesService.assertGameAccess.mockResolvedValue(game());
  mockPolicy.resolveUploadAllowance.mockResolvedValue({
    allowed: true,
    reason: null,
    billingResource: RESOURCE,
    limits: LIMITS,
  });
  mockPolicy.resolveVideoManagerAccess.mockResolvedValue({ allowed: true, reason: null });
  mockRepository.reserveUploadSlot.mockResolvedValue({ activeUploads: 1 });
  mockRepository.releaseUploadSlot.mockResolvedValue({ activeUploads: 0 });
  mockRepository.releaseStoredMinutes.mockResolvedValue({ storedMinutes: 0 });
  mockRepository.createUploadAttempt.mockResolvedValue(attempt());
  mockRepository.setUploadAttemptUploadId.mockResolvedValue(
    attempt({ status: 'uploading', uploadId: 'up-new' })
  );
  mockRepository.transitionUploadAttempt.mockImplementation(async ({ toStatus }) =>
    attempt({ status: toStatus })
  );
  mockRepository.takeUploadAttemptStoredMinutes.mockResolvedValue(0);
  mockRepository.enqueueCleanupJob.mockImplementation(async (input) => ({
    _id: '64b7f0c2a1b2c3d4e5f60799',
    status: 'pending',
    ...input,
  }));
  mockRepository.attachGameVideo.mockResolvedValue(attachedGame());
  mockRepository.detachGameVideo.mockImplementation(async ({ generationId }) => ({
    generationId,
  }));
  mockMux.isMuxConfigured.mockReturnValue(true);
  mockMux.createDirectUpload.mockResolvedValue({ id: 'up-new', url: UPLOAD_URL });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('createGameVideoUpload', () => {
  test('first upload: reserve quota → attempt → Mux → record upload id → attach; returns the bearer URL once', async () => {
    const result = await create();

    expect(mockGamesService.assertGameAccess).toHaveBeenCalledWith(USER_ID, GAME_ID, {
      requireWritable: true,
    });
    expect(mockPolicy.resolveUploadAllowance).toHaveBeenCalledWith({
      userId: USER_ID,
      game: game(),
    });
    expect(mockRepository.reserveUploadSlot).toHaveBeenCalledWith({
      resource: RESOURCE,
      limits: LIMITS,
      reservedMinutes: videoService.UPLOAD_RESERVATION_MINUTES,
    });
    expect(videoService.UPLOAD_RESERVATION_MINUTES).toBe(180);
    expect(mockRepository.createUploadAttempt).toHaveBeenCalledWith({
      gameId: GAME_ID,
      billingResource: RESOURCE,
      createdBy: USER_ID,
      sameRecording: false,
      previousTimelineId: null,
      reservedMinutes: 180,
    });
    expect(mockMux.createDirectUpload).toHaveBeenCalledWith({
      gameId: GAME_ID,
      corsOrigin: ORIGIN,
    });
    expect(mockRepository.setUploadAttemptUploadId).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      uploadId: 'up-new',
    });
    expect(mockRepository.attachGameVideo).toHaveBeenCalledWith({
      gameId: GAME_ID,
      expectedGenerationId: null,
      allowReplaceStatuses: [],
      previousVersion: null,
      video: {
        status: 'uploading',
        generationId: NEW_GENERATION,
        uploadId: 'up-new',
        uploadedByUserId: USER_ID,
        uploadStartedAt: expect.any(Date),
        equivalentTimelines: [],
      },
    });
    expectAscending(
      callOrder(
        mockRepository.reserveUploadSlot,
        mockRepository.createUploadAttempt,
        mockMux.createDirectUpload,
        mockRepository.setUploadAttemptUploadId,
        mockRepository.attachGameVideo
      )
    );
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
    expect(result).toEqual({
      uploadUrl: UPLOAD_URL,
      attemptId: ATTEMPT_ID,
      video: {
        provider: 'mux',
        status: 'uploading',
        durationSeconds: null,
        errorMessage: null,
        version: 1759579200000,
      },
    });
  });

  test('sameRecording is stored with the current timeline (P6)', async () => {
    mockGamesService.assertGameAccess.mockResolvedValue(
      game({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    );

    await create({ sameRecording: true });

    expect(mockRepository.createUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ sameRecording: true, previousTimelineId: 'youtube:dQw4w9WgXcQ' })
    );
  });

  test('sameRecording without a current timeline is meaningless and stored false', async () => {
    await create({ sameRecording: true });

    expect(mockRepository.createUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ sameRecording: false, previousTimelineId: null })
    );
  });

  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['not allowlisted', 'https://evil.example'],
  ])('%s Origin → 403 before any read, reservation or Mux call (E6)', async (_label, origin) => {
    await expect(create({ origin })).rejects.toMatchObject({
      statusCode: 403,
      details: { reason: 'origin_not_allowed' },
    });
    expect(mockGamesService.assertGameAccess).not.toHaveBeenCalled();
    expect(mockRepository.reserveUploadSlot).not.toHaveBeenCalled();
    expect(mockMux.createDirectUpload).not.toHaveBeenCalled();
  });

  test('no writable game access → the access error propagates, no Mux call', async () => {
    mockGamesService.assertGameAccess.mockRejectedValue(
      new ApiError(402, 'An active League subscription is required to make changes')
    );

    await expect(create()).rejects.toMatchObject({ statusCode: 402 });
    expect(mockPolicy.resolveUploadAllowance).not.toHaveBeenCalled();
    expect(mockMux.createDirectUpload).not.toHaveBeenCalled();
  });

  test.each(Object.values(UPLOAD_ALLOWANCE_REASONS))(
    'allowance denied (%s) → 403 exposing the reason; no reservation, no Mux call',
    async (reason) => {
      mockPolicy.resolveUploadAllowance.mockResolvedValue({
        allowed: false,
        reason,
        billingResource: null,
        limits: null,
      });

      await expect(create()).rejects.toMatchObject({ statusCode: 403, details: { reason } });
      expect(mockRepository.reserveUploadSlot).not.toHaveBeenCalled();
      expect(mockRepository.createUploadAttempt).not.toHaveBeenCalled();
      expect(mockMux.createDirectUpload).not.toHaveBeenCalled();
    }
  );

  test.each(['processing', 'ready'])(
    'existing %s video → 409 video_exists; nothing reserved',
    async (status) => {
      mockGamesService.assertGameAccess.mockResolvedValue(game({ video: oldVideo({ status }) }));

      await expect(create()).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: 'video_exists' },
      });
      expect(mockRepository.reserveUploadSlot).not.toHaveBeenCalled();
      expect(mockMux.createDirectUpload).not.toHaveBeenCalled();
    }
  );

  test('quota exhausted → 429 quota_exceeded; no attempt, no Mux call', async () => {
    mockRepository.reserveUploadSlot.mockResolvedValue(null);

    await expect(create()).rejects.toMatchObject({
      statusCode: 429,
      details: { reason: 'quota_exceeded' },
    });
    expect(mockRepository.createUploadAttempt).not.toHaveBeenCalled();
    expect(mockMux.createDirectUpload).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
  });

  test('attempt creation fails → the reserved slot is released once, no Mux call', async () => {
    mockRepository.createUploadAttempt.mockRejectedValue(new Error('db down'));

    await expect(create()).rejects.toThrow('db down');
    expect(mockMux.createDirectUpload).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledWith({
      resource: RESOURCE,
      reservedMinutes: 180,
    });
  });

  test('Mux failure → attempt rejected, slot released exactly once, 502 with no provider detail', async () => {
    const muxError = new MuxApiError('Mux request failed (503)', { status: 503, retryable: true });
    mockMux.createDirectUpload.mockRejectedValue(muxError);

    const error = await create().catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: 502, details: { reason: 'provider_unavailable' } });
    expect(error.message).not.toMatch(/mux|503/i);
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      fromStatuses: ['reserved', 'uploading', 'processing'],
      toStatus: 'rejected',
      set: { errorMessage: 'provider_create_failed' },
    });
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledWith({
      resource: RESOURCE,
      reservedMinutes: 180,
    });
    expect(mockRepository.setUploadAttemptUploadId).not.toHaveBeenCalled();
    expect(mockRepository.attachGameVideo).not.toHaveBeenCalled();
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
  });

  test('Mux failure after someone else already retired the attempt → no second release', async () => {
    mockMux.createDirectUpload.mockRejectedValue(new Error('boom'));
    mockRepository.transitionUploadAttempt.mockResolvedValue(null);

    await expect(create()).rejects.toMatchObject({ statusCode: 502 });
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
    expect(mockRepository.takeUploadAttemptStoredMinutes).not.toHaveBeenCalled();
  });

  test('attempt cancelled while Mux was creating the upload → 409, no attach, no release, no URL', async () => {
    mockRepository.setUploadAttemptUploadId.mockResolvedValue(null);

    const error = await create().catch((e) => e);

    expect(error).toMatchObject({ statusCode: 409, details: { reason: 'upload_cancelled' } });
    expect(JSON.stringify(error)).not.toContain(UPLOAD_URL);
    expect(mockRepository.attachGameVideo).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
  });

  test('recording the upload id fails → attempt rejected and slot released; error propagates', async () => {
    mockRepository.setUploadAttemptUploadId.mockRejectedValue(new Error('db down'));

    await expect(create()).rejects.toThrow('db down');
    expect(mockRepository.attachGameVideo).not.toHaveBeenCalled();
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: ATTEMPT_ID, toStatus: 'rejected' })
    );
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
  });

  describe('replacing an uploading/errored video (GC)', () => {
    test('uploading: old upload cancel is enqueued BEFORE the attach; old attempt superseded, its slot released once', async () => {
      mockGamesService.assertGameAccess.mockResolvedValue(game({ video: oldVideo() }));
      mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
        attempt({
          _id: OLD_ATTEMPT_ID,
          generationId: OLD_GENERATION,
          status: 'uploading',
          uploadId: 'up-old',
        })
      );
      mockRepository.transitionUploadAttempt.mockImplementation(async (input) =>
        input.attemptId === OLD_ATTEMPT_ID ? attempt({ _id: OLD_ATTEMPT_ID }) : null
      );

      await create();

      expect(mockRepository.findUploadAttemptByGenerationId).toHaveBeenCalledWith(OLD_GENERATION);
      expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledTimes(1);
      expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith({
        kind: 'cancel_upload',
        targetId: 'up-old',
        attemptId: OLD_ATTEMPT_ID,
        gameId: GAME_ID,
        reason: 'replaced',
      });
      expect(mockRepository.attachGameVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedGenerationId: OLD_GENERATION,
          allowReplaceStatuses: ['uploading', 'errored'],
          previousVersion: 3,
        })
      );
      expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith({
        attemptId: OLD_ATTEMPT_ID,
        fromStatuses: ['reserved', 'uploading', 'processing'],
        toStatus: 'superseded',
        set: {},
      });
      expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
      expectAscending(
        callOrder(
          mockRepository.enqueueCleanupJob,
          mockRepository.attachGameVideo,
          mockRepository.transitionUploadAttempt,
          mockRepository.releaseUploadSlot,
          mockCleanup.kickCleanup
        )
      );
    });

    test('errored with an asset: deletes the asset; settled attempt superseded without a slot release', async () => {
      mockGamesService.assertGameAccess.mockResolvedValue(
        game({ video: oldVideo({ status: 'errored', assetId: 'as-old' }) })
      );
      mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
        attempt({
          _id: OLD_ATTEMPT_ID,
          generationId: OLD_GENERATION,
          status: 'errored',
          uploadId: 'up-old',
          assetId: 'as-old',
        })
      );
      mockRepository.transitionUploadAttempt.mockImplementation(async (input) =>
        input.fromStatuses.includes('errored') ? attempt({ status: 'superseded' }) : null
      );

      await create();

      expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledTimes(1);
      expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'delete_asset', targetId: 'as-old', reason: 'replaced' })
      );
      expect(mockRepository.transitionUploadAttempt).toHaveBeenLastCalledWith({
        attemptId: OLD_ATTEMPT_ID,
        fromStatuses: ['ready', 'errored'],
        toStatus: 'superseded',
        set: {},
      });
      expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
      expect(mockRepository.takeUploadAttemptStoredMinutes).toHaveBeenCalledWith(OLD_ATTEMPT_ID);
      expect(mockRepository.releaseStoredMinutes).not.toHaveBeenCalled();
    });

    test('enqueueing the old cleanup fails → no attach; the new upload is abandoned and its slot released', async () => {
      mockGamesService.assertGameAccess.mockResolvedValue(game({ video: oldVideo() }));
      mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
        attempt({ _id: OLD_ATTEMPT_ID, generationId: OLD_GENERATION, uploadId: 'up-old' })
      );
      mockRepository.enqueueCleanupJob.mockRejectedValueOnce(new Error('db down'));

      await expect(create()).rejects.toThrow('db down');

      expect(mockRepository.attachGameVideo).not.toHaveBeenCalled();
      expect(mockRepository.enqueueCleanupJob).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'cancel_upload',
          targetId: 'up-new',
          attemptId: ATTEMPT_ID,
        })
      );
      expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledTimes(1);
      expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId: ATTEMPT_ID, toStatus: 'rejected' })
      );
      expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    });

    test('a replaced video without an owning attempt is attached over with a warning (E3: never cleaned)', async () => {
      mockGamesService.assertGameAccess.mockResolvedValue(game({ video: oldVideo() }));
      mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(null);

      await create();

      expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
      expect(mockRepository.attachGameVideo).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ gameId: GAME_ID, generationId: OLD_GENERATION }),
        expect.stringContaining('no owning upload attempt')
      );
    });
  });

  test('attach lost a race → cancel the NEW upload, attempt superseded, slot released, kick, 409', async () => {
    mockRepository.attachGameVideo.mockResolvedValue(null);

    const error = await create().catch((e) => e);

    expect(error).toMatchObject({ statusCode: 409, details: { reason: 'upload_conflict' } });
    expect(JSON.stringify(error)).not.toContain(UPLOAD_URL);
    expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith({
      kind: 'cancel_upload',
      targetId: 'up-new',
      attemptId: ATTEMPT_ID,
      gameId: GAME_ID,
      reason: 'attach_lost',
    });
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: ATTEMPT_ID, toStatus: 'superseded' })
    );
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    expect(mockCleanup.kickCleanup).toHaveBeenCalledTimes(1);
    expectAscending(
      callOrder(
        mockRepository.enqueueCleanupJob,
        mockRepository.transitionUploadAttempt,
        mockRepository.releaseUploadSlot,
        mockCleanup.kickCleanup
      )
    );
  });

  test('attach lost and the cancel cannot be queued → still retired (the URL was never disclosed)', async () => {
    mockRepository.attachGameVideo.mockResolvedValue(null);
    mockRepository.enqueueCleanupJob.mockRejectedValue(new Error('db down'));

    await expect(create()).rejects.toMatchObject({ statusCode: 409 });
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: ATTEMPT_ID }),
      expect.stringContaining('could not be queued')
    );
  });

  test('two simultaneous creates leave exactly one winner (deferred interleaving)', async () => {
    // Both requests pass every check and reach Mux before either attaches.
    const muxA = deferred();
    const muxB = deferred();
    mockMux.createDirectUpload
      .mockImplementationOnce(() => muxA.promise)
      .mockImplementationOnce(() => muxB.promise);
    mockRepository.createUploadAttempt
      .mockResolvedValueOnce(attempt({ _id: ATTEMPT_ID, generationId: NEW_GENERATION }))
      .mockResolvedValueOnce(attempt({ _id: OTHER_ATTEMPT_ID, generationId: OTHER_GENERATION }));
    mockRepository.setUploadAttemptUploadId.mockImplementation(async ({ attemptId, uploadId }) =>
      attempt({ _id: attemptId, status: 'uploading', uploadId })
    );
    // The conditional attach (filter video: null) admits only the first writer.
    let attachedGeneration = null;
    mockRepository.attachGameVideo.mockImplementation(async ({ expectedGenerationId, video }) => {
      if (expectedGenerationId !== null || attachedGeneration) return null;
      attachedGeneration = video.generationId;
      return attachedGame({ generationId: video.generationId, uploadId: video.uploadId });
    });

    const first = create();
    const second = create();
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockMux.createDirectUpload).toHaveBeenCalledTimes(2);

    // The second request's Mux call returns first and wins the attach.
    muxB.resolve({ id: 'up-b', url: `${UPLOAD_URL}-b` });
    muxA.resolve({ id: 'up-a', url: `${UPLOAD_URL}-a` });
    const [a, b] = await Promise.allSettled([first, second]);

    expect(b.status).toBe('fulfilled');
    expect(b.value).toMatchObject({ uploadUrl: `${UPLOAD_URL}-b`, attemptId: OTHER_ATTEMPT_ID });
    expect(a.status).toBe('rejected');
    expect(a.reason).toMatchObject({ statusCode: 409, details: { reason: 'upload_conflict' } });
    expect(attachedGeneration).toBe(OTHER_GENERATION);

    // Only the loser compensates: its upload is cancelled and its slot freed once.
    expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledTimes(1);
    expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cancel_upload', targetId: 'up-a', attemptId: ATTEMPT_ID })
    );
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledTimes(1);
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: ATTEMPT_ID, toStatus: 'superseded' })
    );
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
  });

  test('the upload URL never reaches a log line, on success or on any failure path', async () => {
    await create();
    mockRepository.attachGameVideo.mockResolvedValueOnce(null);
    await create().catch(() => {});
    mockRepository.setUploadAttemptUploadId.mockResolvedValueOnce(null);
    await create().catch(() => {});
    mockRepository.setUploadAttemptUploadId.mockRejectedValueOnce(new Error('db down'));
    await create().catch(() => {});

    expect(mockLogger.warn.mock.calls.length + mockLogger.info.mock.calls.length).toBeGreaterThan(
      0
    );
    expect(loggedText()).not.toContain(UPLOAD_URL);
    expect(loggedText()).not.toContain('secret-signed-url');
  });
});

// ─── cancel ──────────────────────────────────────────────────────────────────

describe('cancelGameVideoUpload', () => {
  const cancel = () =>
    videoService.cancelGameVideoUpload({ userId: USER_ID, gameId: GAME_ID, attemptId: ATTEMPT_ID });

  test('requires writable access and league owner/manager (not the hosting allowance)', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ status: 'reserved' }));

    await cancel();

    expect(mockGamesService.assertGameAccess).toHaveBeenCalledWith(USER_ID, GAME_ID, {
      requireWritable: true,
    });
    expect(mockPolicy.resolveVideoManagerAccess).toHaveBeenCalledWith({
      userId: USER_ID,
      game: game(),
    });
    expect(mockPolicy.resolveUploadAllowance).not.toHaveBeenCalled();
  });

  test('not a league owner/manager → 403 with the reason, nothing written', async () => {
    mockPolicy.resolveVideoManagerAccess.mockResolvedValue({
      allowed: false,
      reason: 'not_league_manager',
    });

    await expect(cancel()).rejects.toMatchObject({
      statusCode: 403,
      details: { reason: 'not_league_manager' },
    });
    expect(mockRepository.findUploadAttemptById).not.toHaveBeenCalled();
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
  });

  test.each([
    ['unknown attempt', null],
    ['attempt of another game', attempt({ gameId: OTHER_GAME_ID, status: 'uploading' })],
  ])('%s → 404 attempt_not_found', async (_label, found) => {
    mockRepository.findUploadAttemptById.mockResolvedValue(found);

    await expect(cancel()).rejects.toMatchObject({
      statusCode: 404,
      details: { reason: 'attempt_not_found' },
    });
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.detachGameVideo).not.toHaveBeenCalled();
  });

  test.each(['cancelled', 'superseded', 'rejected'])(
    'already %s → idempotent no-op',
    async (status) => {
      mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ status }));

      await expect(cancel()).resolves.toEqual({ cancelled: false, status });
      expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
      expect(mockRepository.detachGameVideo).not.toHaveBeenCalled();
      expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
      expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
    }
  );

  test('ready → 409 video_ready: a finished video is removed only via DELETE /video', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(
      attempt({ status: 'ready', uploadId: 'up-1', assetId: 'as-1' })
    );

    await expect(cancel()).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'video_ready' },
    });
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
  });

  test.each([
    ['reserved', {}, null, 'slot'],
    ['uploading', { uploadId: 'up-1' }, { kind: 'cancel_upload', targetId: 'up-1' }, 'slot'],
    [
      'processing',
      { uploadId: 'up-1', assetId: 'as-1' },
      { kind: 'delete_asset', targetId: 'as-1' },
      'slot',
    ],
    [
      'errored',
      { uploadId: 'up-1', assetId: 'as-1' },
      { kind: 'delete_asset', targetId: 'as-1' },
      'minutes',
    ],
  ])('%s → enqueue → detach → retire → kick', async (status, ids, target, released) => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ status, ...ids }));
    mockRepository.transitionUploadAttempt.mockImplementation(async ({ fromStatuses }) =>
      fromStatuses.includes(status) ? attempt({ status: 'cancelled' }) : null
    );

    await expect(cancel()).resolves.toEqual({ cancelled: true });

    if (target) {
      expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith({
        ...target,
        attemptId: ATTEMPT_ID,
        gameId: GAME_ID,
        reason: 'upload_cancelled',
      });
    } else {
      expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    }
    expect(mockRepository.detachGameVideo).toHaveBeenCalledWith({
      gameId: GAME_ID,
      generationId: NEW_GENERATION,
    });
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: ATTEMPT_ID, toStatus: 'cancelled' })
    );
    if (released === 'slot') {
      expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
      expect(mockRepository.releaseUploadSlot).toHaveBeenCalledWith({
        resource: RESOURCE,
        reservedMinutes: 180,
      });
      expect(mockRepository.takeUploadAttemptStoredMinutes).not.toHaveBeenCalled();
    } else {
      expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
      expect(mockRepository.takeUploadAttemptStoredMinutes).toHaveBeenCalledWith(ATTEMPT_ID);
    }
    const order = callOrder(
      mockRepository.detachGameVideo,
      mockRepository.transitionUploadAttempt,
      mockCleanup.kickCleanup
    );
    if (target) order.unshift(mockRepository.enqueueCleanupJob.mock.invocationCallOrder[0]);
    expectAscending(order);
  });

  test('cancel of an attempt the game no longer carries still retires it (detach returns null)', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(
      attempt({ status: 'uploading', uploadId: 'up-1' })
    );
    mockRepository.detachGameVideo.mockResolvedValue(null);

    await expect(cancel()).resolves.toEqual({ cancelled: true });
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
  });

  test('enqueue failure → 5xx path: no detach, no retire, no release, no kick', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(
      attempt({ status: 'uploading', uploadId: 'up-1' })
    );
    mockRepository.enqueueCleanupJob.mockRejectedValue(new Error('db down'));

    await expect(cancel()).rejects.toThrow('db down');
    expect(mockRepository.detachGameVideo).not.toHaveBeenCalled();
    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
    expect(mockCleanup.kickCleanup).not.toHaveBeenCalled();
  });
});

// ─── remove ──────────────────────────────────────────────────────────────────

describe('removeGameVideo', () => {
  const remove = () => videoService.removeGameVideo({ userId: USER_ID, gameId: GAME_ID });
  const withVideo = (video) =>
    mockGamesService.assertGameAccess.mockResolvedValue(game({ video: oldVideo(video) }));

  test('no hosted video → 404 no_video', async () => {
    await expect(remove()).rejects.toMatchObject({
      statusCode: 404,
      details: { reason: 'no_video' },
    });
    expect(mockRepository.detachGameVideo).not.toHaveBeenCalled();
  });

  test('not a league owner/manager → 403, nothing written', async () => {
    withVideo({ status: 'ready' });
    mockPolicy.resolveVideoManagerAccess.mockResolvedValue({
      allowed: false,
      reason: 'not_league_game',
    });

    await expect(remove()).rejects.toMatchObject({
      statusCode: 403,
      details: { reason: 'not_league_game' },
    });
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.detachGameVideo).not.toHaveBeenCalled();
  });

  test.each([
    ['uploading', 'uploading', { uploadId: 'up-old' }, 'cancel_upload', 'up-old'],
    [
      'processing',
      'processing',
      { uploadId: 'up-old', assetId: 'as-old' },
      'delete_asset',
      'as-old',
    ],
    ['errored', 'errored', { uploadId: 'up-old', assetId: 'as-old' }, 'delete_asset', 'as-old'],
    ['ready', 'ready', { uploadId: 'up-old', assetId: 'as-old' }, 'delete_asset', 'as-old'],
  ])(
    '%s video → enqueue → detach → retire → kick; returns { video: null }',
    async (videoStatus, attemptStatus, ids, kind, targetId) => {
      withVideo({ status: videoStatus, ...ids });
      mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
        attempt({
          _id: OLD_ATTEMPT_ID,
          generationId: OLD_GENERATION,
          status: attemptStatus,
          ...ids,
        })
      );

      await expect(remove()).resolves.toEqual({ video: null });

      expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith({
        kind,
        targetId,
        attemptId: OLD_ATTEMPT_ID,
        gameId: GAME_ID,
        reason: 'video_removed',
      });
      expect(mockRepository.detachGameVideo).toHaveBeenCalledWith({
        gameId: GAME_ID,
        generationId: OLD_GENERATION,
      });
      expectAscending(
        callOrder(
          mockRepository.enqueueCleanupJob,
          mockRepository.detachGameVideo,
          mockRepository.transitionUploadAttempt,
          mockCleanup.kickCleanup
        )
      );
    }
  );

  test('ready media releases its stored minutes exactly once (takeUploadAttemptStoredMinutes)', async () => {
    withVideo({ status: 'ready', assetId: 'as-old' });
    mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
      attempt({
        _id: OLD_ATTEMPT_ID,
        generationId: OLD_GENERATION,
        status: 'ready',
        assetId: 'as-old',
        storedMinutes: 42,
      })
    );
    mockRepository.transitionUploadAttempt.mockImplementation(async ({ fromStatuses }) =>
      fromStatuses.includes('ready') ? attempt({ status: 'cancelled' }) : null
    );
    mockRepository.takeUploadAttemptStoredMinutes.mockResolvedValue(42);

    await remove();

    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledTimes(2);
    expect(mockRepository.takeUploadAttemptStoredMinutes).toHaveBeenCalledWith(OLD_ATTEMPT_ID);
    expect(mockRepository.releaseStoredMinutes).toHaveBeenCalledTimes(1);
    expect(mockRepository.releaseStoredMinutes).toHaveBeenCalledWith({
      resource: RESOURCE,
      minutes: 42,
    });
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
  });

  test('in-flight media releases its upload slot exactly once', async () => {
    withVideo({ status: 'processing', assetId: 'as-old' });
    mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
      attempt({ _id: OLD_ATTEMPT_ID, generationId: OLD_GENERATION, status: 'processing' })
    );

    await remove();

    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledTimes(1);
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    expect(mockRepository.takeUploadAttemptStoredMinutes).not.toHaveBeenCalled();
  });

  test('enqueue failure → no detach, error propagates (never reports success)', async () => {
    withVideo({ status: 'ready', assetId: 'as-old' });
    mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
      attempt({ _id: OLD_ATTEMPT_ID, status: 'ready', assetId: 'as-old' })
    );
    mockRepository.enqueueCleanupJob.mockRejectedValue(new Error('db down'));

    await expect(remove()).rejects.toThrow('db down');
    expect(mockRepository.detachGameVideo).not.toHaveBeenCalled();
    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
    expect(mockCleanup.kickCleanup).not.toHaveBeenCalled();
  });

  test('detach lost a race → 409 video_changed; the attempt is not retired here', async () => {
    withVideo({ status: 'errored', uploadId: 'up-old' });
    mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
      attempt({ _id: OLD_ATTEMPT_ID, status: 'errored', uploadId: 'up-old' })
    );
    mockRepository.detachGameVideo.mockResolvedValue(null);

    await expect(remove()).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'video_changed' },
    });
    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
  });

  test('no owning attempt → detached anyway (tokens denied) with a warning; nothing enqueued (E3)', async () => {
    withVideo({ status: 'ready', assetId: 'as-legacy' });
    mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(null);

    await expect(remove()).resolves.toEqual({ video: null });
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.detachGameVideo).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: GAME_ID, generationId: OLD_GENERATION }),
      expect.stringContaining('no owning upload attempt')
    );
  });

  test('a quota release failure after the transition is logged (alertable), removal still succeeds', async () => {
    withVideo({ status: 'uploading', uploadId: 'up-old' });
    mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
      attempt({ _id: OLD_ATTEMPT_ID, status: 'uploading', uploadId: 'up-old' })
    );
    mockRepository.releaseUploadSlot.mockRejectedValue(new Error('db down'));

    await expect(remove()).resolves.toEqual({ video: null });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: OLD_ATTEMPT_ID }),
      'Video quota release failed after the upload attempt was retired'
    );
    expect(mockCleanup.kickCleanup).toHaveBeenCalled();
  });
});

// ─── game deletion ───────────────────────────────────────────────────────────

describe('game deletion helpers', () => {
  test('queueGameVideoCleanupForDeletion: no video → null without reads', async () => {
    await expect(videoService.queueGameVideoCleanupForDeletion(game())).resolves.toBeNull();
    expect(mockRepository.findUploadAttemptByGenerationId).not.toHaveBeenCalled();
  });

  test('queueGameVideoCleanupForDeletion: enqueues the attempt cleanup and returns the attempt', async () => {
    const owner = attempt({ _id: OLD_ATTEMPT_ID, status: 'ready', assetId: 'as-old' });
    mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(owner);

    await expect(
      videoService.queueGameVideoCleanupForDeletion(game({ video: oldVideo({ status: 'ready' }) }))
    ).resolves.toBe(owner);
    expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith({
      kind: 'delete_asset',
      targetId: 'as-old',
      attemptId: OLD_ATTEMPT_ID,
      gameId: GAME_ID,
      reason: 'game_deleted',
    });
    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
    expect(mockCleanup.kickCleanup).not.toHaveBeenCalled();
  });

  test('queueGameVideoCleanupForDeletion: enqueue failure propagates', async () => {
    mockRepository.findUploadAttemptByGenerationId.mockResolvedValue(
      attempt({ _id: OLD_ATTEMPT_ID, uploadId: 'up-old' })
    );
    mockRepository.enqueueCleanupJob.mockRejectedValue(new Error('db down'));

    await expect(
      videoService.queueGameVideoCleanupForDeletion(game({ video: oldVideo() }))
    ).rejects.toThrow('db down');
  });

  test('finishGameVideoCleanupAfterDeletion: retires the attempt, kicks, never throws', async () => {
    const owner = attempt({ _id: OLD_ATTEMPT_ID, status: 'uploading', uploadId: 'up-old' });

    await videoService.finishGameVideoCleanupAfterDeletion(owner);
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: OLD_ATTEMPT_ID, toStatus: 'cancelled' })
    );
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    expect(mockCleanup.kickCleanup).toHaveBeenCalledTimes(1);

    mockRepository.transitionUploadAttempt.mockRejectedValue(new Error('db down'));
    await expect(videoService.finishGameVideoCleanupAfterDeletion(owner)).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('finishGameVideoCleanupAfterDeletion(null) is a no-op', async () => {
    await videoService.finishGameVideoCleanupAfterDeletion(null);
    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
    expect(mockCleanup.kickCleanup).not.toHaveBeenCalled();
  });
});
