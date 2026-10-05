// Mux game video — cleanup worker, sweep and reconciliation (plan R3, Task 3d;
// rulings E2/E3/E4). The repository and the Mux client are mocked at their
// module boundaries (E2): these tests pin the outcome mapping, ownership
// checks (E3), retry/backoff budget, exactly-once quota release and the
// in-process scheduling (E4).
const mockRepository = {
  getVideoDeployment: jest.fn(),
  findUploadAttemptById: jest.fn(),
  transitionUploadAttempt: jest.fn(),
  takeUploadAttemptStoredMinutes: jest.fn(),
  listStaleUploadAttempts: jest.fn(),
  isGameVideoGenerationReferenced: jest.fn(),
  enqueueCleanupJob: jest.fn(),
  claimDueCleanupJobs: jest.fn(),
  listDueCleanupJobs: jest.fn(),
  completeCleanupJob: jest.fn(),
  failCleanupJobAttempt: jest.fn(),
  deferCleanupJob: jest.fn(),
  releaseUploadSlot: jest.fn(),
  releaseStoredMinutes: jest.fn(),
  listProviderAnchorAttempts: jest.fn(),
  countForeignVideoWork: jest.fn(),
};
const mockMux = {
  isMuxConfigured: jest.fn(),
  cancelDirectUpload: jest.fn(),
  deleteAsset: jest.fn(),
  getDirectUpload: jest.fn(),
  getAsset: jest.fn(),
  createDirectUpload: jest.fn(),
};
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

const { MuxApiError } = require('../../modules/video/mux.client');
const cleanup = require('../../modules/video/video.cleanup');

const DEPLOYMENT = 'test:tsw_2026_test';
const GAME_ID = '64b7f0c2a1b2c3d4e5f60718';
const LEAGUE_ID = '64b7f0c2a1b2c3d4e5f60719';
const ATTEMPT_ID = '64b7f0c2a1b2c3d4e5f6071b';
const OTHER_ATTEMPT_ID = '64b7f0c2a1b2c3d4e5f6071d';
const JOB_ID = '64b7f0c2a1b2c3d4e5f6071c';
const GENERATION_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const NOW = new Date('2026-10-04T12:00:00.000Z');
const LEASE_OWNER = 'video-cleanup:test';
const UPLOAD_URL = 'https://storage.googleapis.com/video-storage-upload/secret-signed-url';

function attempt(overrides = {}) {
  return {
    _id: ATTEMPT_ID,
    gameId: GAME_ID,
    generationId: GENERATION_ID,
    billingResource: { type: 'league', id: LEAGUE_ID },
    status: 'cancelled',
    uploadId: 'up-1',
    reservedMinutes: 180,
    storedMinutes: 0,
    errorMessage: null,
    deployment: DEPLOYMENT,
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    _id: JOB_ID,
    kind: 'cancel_upload',
    targetId: 'up-1',
    attemptId: ATTEMPT_ID,
    gameId: GAME_ID,
    reason: 'upload_cancelled',
    deployment: DEPLOYMENT,
    status: 'leased',
    leaseOwner: LEASE_OWNER,
    attempts: 1,
    ...overrides,
  };
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function loggedText() {
  return JSON.stringify([
    mockLogger.warn.mock.calls,
    mockLogger.error.mock.calls,
    mockLogger.info.mock.calls,
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of Object.values(mockRepository)) fn.mockReset();
  for (const fn of Object.values(mockMux)) fn.mockReset();
  mockRepository.getVideoDeployment.mockReturnValue(DEPLOYMENT);
  mockRepository.findUploadAttemptById.mockResolvedValue(attempt());
  mockRepository.completeCleanupJob.mockImplementation(async ({ outcome }) => ({
    _id: JOB_ID,
    status: 'done',
    outcome,
  }));
  mockRepository.failCleanupJobAttempt.mockImplementation(async ({ retryable, nextAttemptAt }) => ({
    _id: JOB_ID,
    status: retryable && nextAttemptAt ? 'pending' : 'failed',
  }));
  mockRepository.enqueueCleanupJob.mockImplementation(async (input) => ({
    _id: OTHER_ATTEMPT_ID,
    status: 'pending',
    ...input,
  }));
  mockRepository.takeUploadAttemptStoredMinutes.mockResolvedValue(0);
  mockRepository.releaseUploadSlot.mockResolvedValue({});
  mockRepository.releaseStoredMinutes.mockResolvedValue({});
  mockRepository.claimDueCleanupJobs.mockResolvedValue([]);
  mockRepository.listStaleUploadAttempts.mockResolvedValue([]);
  mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(false);
  mockRepository.listProviderAnchorAttempts.mockResolvedValue([]);
  mockRepository.countForeignVideoWork.mockResolvedValue({ attempts: 0, jobs: 0 });
  mockMux.isMuxConfigured.mockReturnValue(true);
});

afterEach(() => {
  cleanup.stopVideoCleanupSweep();
  jest.restoreAllMocks();
});

describe('processCleanupJob — cancel_upload', () => {
  test.each(['cancelled', 'expired', 'gone'])(
    'Mux %s → the job completes with that outcome, nothing else is enqueued',
    async (outcome) => {
      mockMux.cancelDirectUpload.mockResolvedValue({ outcome });

      const result = await cleanup.processCleanupJob(job(), { now: NOW });

      expect(mockMux.cancelDirectUpload).toHaveBeenCalledWith('up-1');
      expect(mockRepository.completeCleanupJob).toHaveBeenCalledWith({
        jobId: JOB_ID,
        leaseOwner: LEASE_OWNER,
        outcome,
        now: NOW,
      });
      expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
      expect(mockMux.deleteAsset).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'done', outcome });
    }
  );

  test('completed(assetId) → records the asset on the owning attempt, enqueues delete_asset, then completes', async () => {
    mockMux.cancelDirectUpload.mockResolvedValue({ outcome: 'completed', assetId: 'as-9' });
    mockRepository.transitionUploadAttempt.mockResolvedValue(attempt({ assetId: 'as-9' }));

    const result = await cleanup.processCleanupJob(job(), { now: NOW });

    // Same status: only the asset id is recorded (identity-checked, E3).
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      fromStatuses: ['cancelled'],
      toStatus: 'cancelled',
      expectedUploadId: 'up-1',
      expectedAssetId: null,
      set: { assetId: 'as-9' },
    });
    expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith({
      kind: 'delete_asset',
      targetId: 'as-9',
      attemptId: ATTEMPT_ID,
      gameId: GAME_ID,
      reason: 'cancel_completed',
      now: NOW,
    });
    expect(mockRepository.completeCleanupJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, outcome: 'completed' })
    );
    const order = [
      mockRepository.transitionUploadAttempt.mock.invocationCallOrder[0],
      mockRepository.enqueueCleanupJob.mock.invocationCallOrder[0],
      mockRepository.completeCleanupJob.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The worker never deletes inline: the delete is its own durable job.
    expect(mockMux.deleteAsset).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'done', outcome: 'completed' });
  });

  test('completed(assetId) when the attempt already recorded that asset → no rewrite, still enqueues the delete', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ assetId: 'as-9' }));
    mockMux.cancelDirectUpload.mockResolvedValue({ outcome: 'completed', assetId: 'as-9' });

    await cleanup.processCleanupJob(job(), { now: NOW });

    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
    expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'delete_asset', targetId: 'as-9' })
    );
  });

  test('completed(assetId) when the attempt owns a DIFFERENT asset → no delete, terminal failure + ops warning', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ assetId: 'as-other' }));
    mockMux.cancelDirectUpload.mockResolvedValue({ outcome: 'completed', assetId: 'as-9' });

    const result = await cleanup.processCleanupJob(job(), { now: NOW });

    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, retryable: false, nextAttemptAt: null })
    );
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });

  test('completed(assetId) when the owning attempt changed or vanished mid-job → no delete, retried later', async () => {
    mockMux.cancelDirectUpload.mockResolvedValue({ outcome: 'completed', assetId: 'as-9' });
    mockRepository.transitionUploadAttempt.mockResolvedValue(null);

    const result = await cleanup.processCleanupJob(job(), { now: NOW, random: () => 0.5 });

    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.completeCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: true, nextAttemptAt: expect.any(Date) })
    );
    expect(result.status).toBe('retry');
  });
});

describe('processCleanupJob — ownership (E3: nothing without an owning attempt)', () => {
  test.each([
    ['no attempt exists', null],
    ['the attempt owns a different upload', attempt({ uploadId: 'up-other' })],
    ['the attempt belongs to another deployment', attempt({ deployment: 'production:tsw' })],
  ])('cancel_upload refused when %s: no Mux call, terminal failure, warning', async (_l, owner) => {
    mockRepository.findUploadAttemptById.mockResolvedValue(owner);

    const result = await cleanup.processCleanupJob(job(), { now: NOW });

    expect(mockRepository.findUploadAttemptById).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(mockMux.cancelDirectUpload).not.toHaveBeenCalled();
    expect(mockMux.deleteAsset).not.toHaveBeenCalled();
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith({
      jobId: JOB_ID,
      leaseOwner: LEASE_OWNER,
      retryable: false,
      nextAttemptAt: null,
      error: 'ownership_not_proven',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, kind: 'cancel_upload', gameId: GAME_ID }),
      expect.any(String)
    );
    expect(result.status).toBe('failed');
  });

  test('delete_asset refused unless the attempt owns that asset id', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ assetId: 'as-other' }));

    const result = await cleanup.processCleanupJob(
      job({ kind: 'delete_asset', targetId: 'as-9' }),
      { now: NOW }
    );

    expect(mockMux.deleteAsset).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: false, error: 'ownership_not_proven' })
    );
    expect(result.status).toBe('failed');
  });

  test('a failed attempt read is a retryable failure — never treated as "no owner"', async () => {
    mockRepository.findUploadAttemptById.mockRejectedValue(new Error('connection lost'));

    const result = await cleanup.processCleanupJob(job(), { now: NOW, random: () => 0.5 });

    expect(mockMux.cancelDirectUpload).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: true, nextAttemptAt: expect.any(Date) })
    );
    expect(result.status).toBe('retry');
  });
});

describe('processCleanupJob — reference recheck (T4 removal order: enqueue before detach)', () => {
  // Callers persist the job BEFORE detaching/replacing Game.video (R3), so a
  // job can exist while its generation is still attached. The worker must
  // never delete media the Game still references. A deferral is not a try: it
  // does not spend the job's Mux retry budget (deferCleanupJob refunds the
  // claim), and a separate deferral window bounds a forever-referenced job.
  const deleteJob = (overrides) =>
    job({ kind: 'delete_asset', targetId: 'as-9', reason: 'video_removed', ...overrides });

  beforeEach(() => {
    mockRepository.deferCleanupJob.mockImplementation(async ({ nextAttemptAt }) => ({
      _id: JOB_ID,
      status: 'pending',
      nextAttemptAt,
    }));
  });

  test('cancel_upload whose generation is still referenced → deferred (budget untouched), no Mux call', async () => {
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(true);

    const result = await cleanup.processCleanupJob(job({ attempts: 2, deferrals: 0 }), {
      now: NOW,
    });

    expect(mockRepository.isGameVideoGenerationReferenced).toHaveBeenCalledWith({
      gameId: GAME_ID,
      generationId: GENERATION_ID,
    });
    expect(mockMux.cancelDirectUpload).not.toHaveBeenCalled();
    expect(mockRepository.completeCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).not.toHaveBeenCalled();
    expect(mockRepository.deferCleanupJob).toHaveBeenCalledWith({
      jobId: JOB_ID,
      leaseOwner: LEASE_OWNER,
      nextAttemptAt: new Date(NOW.getTime() + cleanup.CLEANUP_REFERENCED_DEFER_MS),
      now: NOW,
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        jobId: JOB_ID,
        kind: 'cancel_upload',
        gameId: GAME_ID,
        attemptId: ATTEMPT_ID,
        targetId: 'up-1',
        deferrals: 1,
      },
      'Video cleanup deferred: media still referenced by its game'
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'retry' });
  });

  test('delete_asset whose generation is still referenced → deferred, the asset is not deleted', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ assetId: 'as-9' }));
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(true);

    const result = await cleanup.processCleanupJob(deleteJob(), { now: NOW });

    expect(mockMux.deleteAsset).not.toHaveBeenCalled();
    expect(mockRepository.takeUploadAttemptStoredMinutes).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'retry' });
  });

  test('deferrals do not spend the retry budget: a job at MAX attempts is still deferred, not failed', async () => {
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(true);

    const result = await cleanup.processCleanupJob(
      job({ attempts: cleanup.CLEANUP_MAX_ATTEMPTS, deferrals: 3, firstDeferredAt: NOW }),
      { now: NOW }
    );

    expect(mockRepository.failCleanupJobAttempt).not.toHaveBeenCalled();
    expect(mockRepository.deferCleanupJob).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'retry' });
  });

  test('deferral delay grows from the base and is capped', () => {
    const { cleanupDeferAt, CLEANUP_REFERENCED_DEFER_MS, CLEANUP_MAX_DEFER_DELAY_MS } = cleanup;
    const delay = (deferrals) => cleanupDeferAt(deferrals, NOW).getTime() - NOW.getTime();
    expect(delay(0)).toBe(CLEANUP_REFERENCED_DEFER_MS);
    expect(delay(1)).toBe(CLEANUP_REFERENCED_DEFER_MS * 2);
    expect(delay(50)).toBe(CLEANUP_MAX_DEFER_DELAY_MS);
    expect(CLEANUP_MAX_DEFER_DELAY_MS).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  test('still referenced past the deferral window → terminal failure with a distinct log, never a deletion', async () => {
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(true);
    const firstDeferredAt = new Date(NOW.getTime() - cleanup.CLEANUP_MAX_DEFERRAL_MS);

    const result = await cleanup.processCleanupJob(
      job({ attempts: 1, deferrals: 40, firstDeferredAt }),
      { now: NOW }
    );

    expect(mockMux.cancelDirectUpload).not.toHaveBeenCalled();
    expect(mockRepository.deferCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith({
      jobId: JOB_ID,
      leaseOwner: LEASE_OWNER,
      retryable: false,
      nextAttemptAt: null,
      error: 'still_referenced_expired',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        jobId: JOB_ID,
        kind: 'cancel_upload',
        gameId: GAME_ID,
        attemptId: ATTEMPT_ID,
        targetId: 'up-1',
        deferrals: 40,
        firstDeferredAt,
      },
      'Video cleanup abandoned: media still referenced after the deferral window'
    );
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      'Video cleanup job failed permanently'
    );
    expect(result).toEqual({ status: 'failed' });
  });

  test('a deferral that lost the lease reports lost_lease', async () => {
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(true);
    mockRepository.deferCleanupJob.mockResolvedValue(null);

    await expect(cleanup.processCleanupJob(job(), { now: NOW })).resolves.toEqual({
      status: 'lost_lease',
    });
  });

  test('a failed deferral write is logged and the lease simply expires', async () => {
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(true);
    mockRepository.deferCleanupJob.mockRejectedValue(new Error('db down'));

    await expect(cleanup.processCleanupJob(job(), { now: NOW })).resolves.toEqual({
      status: 'error',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID }),
      'Video cleanup could not record a deferral'
    );
  });

  test('not referenced (detached, replaced, or the game no longer exists) → proceeds to Mux', async () => {
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(false);
    mockMux.cancelDirectUpload.mockResolvedValue({ outcome: 'cancelled' });

    const result = await cleanup.processCleanupJob(job(), { now: NOW });

    expect(mockMux.cancelDirectUpload).toHaveBeenCalledWith('up-1');
    const order = [
      mockRepository.findUploadAttemptById.mock.invocationCallOrder[0],
      mockRepository.isGameVideoGenerationReferenced.mock.invocationCallOrder[0],
      mockMux.cancelDirectUpload.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(mockRepository.deferCleanupJob).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'done', outcome: 'cancelled' });
  });

  test('a failed reference read is retried with normal backoff (a real try), never read as "unreferenced"', async () => {
    const error = new Error('connection lost');
    mockRepository.isGameVideoGenerationReferenced.mockRejectedValue(error);

    const result = await cleanup.processCleanupJob(job({ attempts: 1 }), {
      now: NOW,
      random: () => 0.5,
    });

    expect(mockMux.cancelDirectUpload).not.toHaveBeenCalled();
    expect(mockRepository.deferCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        retryable: true,
        nextAttemptAt: new Date(NOW.getTime() + cleanup.CLEANUP_BASE_RETRY_DELAY_MS),
        error,
      })
    );
    expect(result).toEqual({ status: 'retry' });
  });

  test('ownership is proven before the reference read', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(null);

    await cleanup.processCleanupJob(job(), { now: NOW });

    expect(mockRepository.isGameVideoGenerationReferenced).not.toHaveBeenCalled();
    expect(mockMux.cancelDirectUpload).not.toHaveBeenCalled();
  });
});

describe('processCleanupJob — delete_asset', () => {
  const deleteJob = () => job({ kind: 'delete_asset', targetId: 'as-9', reason: 'replaced' });

  test.each(['deleted', 'gone'])(
    'Mux %s → completes, then releases the stored minutes exactly once',
    async (outcome) => {
      mockRepository.findUploadAttemptById.mockResolvedValue(
        attempt({ status: 'superseded', assetId: 'as-9', storedMinutes: 91 })
      );
      mockMux.deleteAsset.mockResolvedValue({ outcome });
      mockRepository.takeUploadAttemptStoredMinutes.mockResolvedValue(91);

      const result = await cleanup.processCleanupJob(deleteJob(), { now: NOW });

      expect(mockMux.deleteAsset).toHaveBeenCalledWith('as-9');
      expect(mockRepository.completeCleanupJob).toHaveBeenCalledWith({
        jobId: JOB_ID,
        leaseOwner: LEASE_OWNER,
        outcome,
        now: NOW,
      });
      expect(mockRepository.takeUploadAttemptStoredMinutes).toHaveBeenCalledWith(ATTEMPT_ID);
      expect(mockRepository.releaseStoredMinutes).toHaveBeenCalledWith({
        resource: { type: 'league', id: LEAGUE_ID },
        minutes: 91,
      });
      expect(
        mockRepository.completeCleanupJob.mock.invocationCallOrder[0] <
          mockRepository.takeUploadAttemptStoredMinutes.mock.invocationCallOrder[0]
      ).toBe(true);
      expect(result).toEqual({ status: 'done', outcome });
    }
  );

  test('no stored minutes to hand back (already taken, or never ready) → no release', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ assetId: 'as-9' }));
    mockMux.deleteAsset.mockResolvedValue({ outcome: 'deleted' });
    mockRepository.takeUploadAttemptStoredMinutes.mockResolvedValue(0);

    await cleanup.processCleanupJob(deleteJob(), { now: NOW });

    expect(mockRepository.releaseStoredMinutes).not.toHaveBeenCalled();
  });

  test('a stored-minute release failure after a confirmed delete is logged, not retried', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ assetId: 'as-9' }));
    mockMux.deleteAsset.mockResolvedValue({ outcome: 'deleted' });
    mockRepository.takeUploadAttemptStoredMinutes.mockResolvedValue(91);
    mockRepository.releaseStoredMinutes.mockRejectedValue(new Error('connection lost'));

    const result = await cleanup.processCleanupJob(deleteJob(), { now: NOW });

    expect(result).toEqual({ status: 'done', outcome: 'deleted' });
    expect(mockRepository.failCleanupJobAttempt).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('lost lease on completion → reported, never thrown', async () => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ assetId: 'as-9' }));
    mockMux.deleteAsset.mockResolvedValue({ outcome: 'deleted' });
    mockRepository.completeCleanupJob.mockResolvedValue(null);

    await expect(cleanup.processCleanupJob(deleteJob(), { now: NOW })).resolves.toEqual({
      status: 'lost_lease',
      outcome: 'deleted',
    });
  });
});

describe('processCleanupJob — failures, backoff and budget', () => {
  const deleteJob = (overrides) =>
    job({ kind: 'delete_asset', targetId: 'as-9', reason: 'replaced', ...overrides });

  beforeEach(() => {
    mockRepository.findUploadAttemptById.mockResolvedValue(attempt({ assetId: 'as-9' }));
  });

  test.each([
    ['5xx', new MuxApiError('Mux request failed (503)', { status: 503, retryable: true })],
    ['429', new MuxApiError('Mux request failed (429)', { status: 429, retryable: true })],
    ['network', new MuxApiError('Mux request failed (network)', { retryable: true })],
    ['database error', new Error('connection lost')],
  ])('retryable (%s) → back to pending with exponential backoff', async (_label, error) => {
    mockMux.deleteAsset.mockRejectedValue(error);

    const result = await cleanup.processCleanupJob(deleteJob({ attempts: 3 }), {
      now: NOW,
      random: () => 0.5, // jitter factor 1.0
    });

    // attempts 3 → base 60 s × 2^2 = 4 min
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith({
      jobId: JOB_ID,
      leaseOwner: LEASE_OWNER,
      retryable: true,
      nextAttemptAt: new Date(NOW.getTime() + 4 * 60 * 1000),
      error,
    });
    expect(mockRepository.completeCleanupJob).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(result.status).toBe('retry');
  });

  test('backoff is jittered (±20%) and capped at one hour', () => {
    const { cleanupRetryAt, CLEANUP_BASE_RETRY_DELAY_MS, CLEANUP_MAX_RETRY_DELAY_MS } = cleanup;
    expect(cleanupRetryAt(1, NOW, () => 0).getTime() - NOW.getTime()).toBe(
      CLEANUP_BASE_RETRY_DELAY_MS * 0.8
    );
    expect(cleanupRetryAt(1, NOW, () => 1).getTime() - NOW.getTime()).toBe(
      CLEANUP_BASE_RETRY_DELAY_MS * 1.2
    );
    expect(cleanupRetryAt(30, NOW, () => 0.5).getTime() - NOW.getTime()).toBe(
      CLEANUP_MAX_RETRY_DELAY_MS
    );
  });

  test('non-retryable Mux error → terminal failure with a structured, secret-free warning (L8)', async () => {
    const error = new MuxApiError('Mux request failed (401)', { status: 401, retryable: false });
    mockMux.deleteAsset.mockRejectedValue(error);

    const result = await cleanup.processCleanupJob(deleteJob(), { now: NOW });

    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith({
      jobId: JOB_ID,
      leaseOwner: LEASE_OWNER,
      retryable: false,
      nextAttemptAt: null,
      error,
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        jobId: JOB_ID,
        kind: 'delete_asset',
        gameId: GAME_ID,
        attemptId: ATTEMPT_ID,
        targetId: 'as-9',
        attempts: 1,
        exhausted: false,
        lastError: 'MuxApiError 401: Mux request failed (401)',
      },
      'Video cleanup job failed permanently'
    );
    expect(result.status).toBe('failed');
  });

  test('MAX_ATTEMPTS reached on a retryable error → terminal failure + warning', async () => {
    mockMux.deleteAsset.mockRejectedValue(
      new MuxApiError('Mux request failed (503)', { status: 503, retryable: true })
    );

    const result = await cleanup.processCleanupJob(
      deleteJob({ attempts: cleanup.CLEANUP_MAX_ATTEMPTS }),
      { now: NOW }
    );

    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: true, nextAttemptAt: null })
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, exhausted: true }),
      'Video cleanup job failed permanently'
    );
    expect(result.status).toBe('failed');
  });

  test('an unexpected Mux outcome is a terminal failure, not a success', async () => {
    mockMux.deleteAsset.mockResolvedValue({ outcome: 'mystery' });

    const result = await cleanup.processCleanupJob(deleteJob(), { now: NOW });

    expect(mockRepository.completeCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.failCleanupJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: false })
    );
    expect(result.status).toBe('failed');
  });

  test('a failure while recording the failure is logged; the lease expiry recovers the job', async () => {
    mockMux.deleteAsset.mockRejectedValue(new MuxApiError('x', { status: 503, retryable: true }));
    mockRepository.failCleanupJobAttempt.mockRejectedValue(new Error('connection lost'));

    await expect(cleanup.processCleanupJob(deleteJob(), { now: NOW })).resolves.toEqual({
      status: 'error',
    });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('logs never carry upload URLs or tokens', async () => {
    mockMux.deleteAsset.mockRejectedValue(
      new MuxApiError('Mux request failed (400)', { status: 400, retryable: false })
    );
    await cleanup.processCleanupJob(deleteJob({ uploadUrl: UPLOAD_URL }), { now: NOW });
    expect(loggedText()).not.toContain(UPLOAD_URL);
    expect(loggedText()).not.toMatch(/token|https?:\/\//i);
  });
});

describe('runCleanupBatch', () => {
  test('claims one job at a time (fresh lease each), processes until none are due', async () => {
    mockRepository.claimDueCleanupJobs
      .mockResolvedValueOnce([job({ _id: 'j1', kind: 'delete_asset', targetId: 'as-9' })])
      .mockResolvedValueOnce([job({ _id: 'j2' })])
      .mockResolvedValueOnce([]);
    mockRepository.findUploadAttemptById
      .mockResolvedValueOnce(attempt({ assetId: 'as-9' }))
      .mockResolvedValueOnce(attempt());
    mockMux.deleteAsset.mockResolvedValue({ outcome: 'deleted' });
    mockMux.cancelDirectUpload.mockRejectedValue(
      new MuxApiError('x', { status: 503, retryable: true })
    );

    const summary = await cleanup.runCleanupBatch({ now: NOW, limit: 10, leaseOwner: 'w1' });

    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalledTimes(3);
    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalledWith({
      now: NOW,
      limit: 1,
      leaseOwner: 'w1',
      leaseMs: cleanup.CLEANUP_LEASE_MS,
    });
    expect(summary).toEqual({
      skipped: null,
      claimed: 2,
      done: 1,
      retry: 1,
      failed: 0,
      lostLease: 0,
      error: 0,
    });
  });

  test('is bounded by limit and mints a lease owner when none is given', async () => {
    mockRepository.claimDueCleanupJobs.mockResolvedValue([job()]);
    mockMux.cancelDirectUpload.mockResolvedValue({ outcome: 'gone' });

    const summary = await cleanup.runCleanupBatch({ limit: 2 });

    expect(summary.claimed).toBe(2);
    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalledTimes(2);
    const { leaseOwner, now } = mockRepository.claimDueCleanupJobs.mock.calls[0][0];
    expect(leaseOwner).toMatch(/^video-cleanup:/);
    expect(now).toBeInstanceOf(Date);
  });

  test('a caller-supplied limit is clamped (a run stays bounded)', async () => {
    mockRepository.claimDueCleanupJobs.mockResolvedValue([job()]);
    mockMux.cancelDirectUpload.mockResolvedValue({ outcome: 'gone' });

    const summary = await cleanup.runCleanupBatch({ now: NOW, limit: 10_000 });

    expect(summary.claimed).toBe(cleanup.CLEANUP_MAX_BATCH_LIMIT);
    expect(cleanup.CLEANUP_MAX_BATCH_LIMIT).toBe(50);
  });

  test('does nothing (no claim, no Mux call) when Mux is not configured', async () => {
    mockMux.isMuxConfigured.mockReturnValue(false);

    const summary = await cleanup.runCleanupBatch({ now: NOW });

    expect(summary).toMatchObject({ skipped: 'mux_not_configured', claimed: 0 });
    expect(mockRepository.claimDueCleanupJobs).not.toHaveBeenCalled();
  });
});

// V6: a database paired with the wrong Mux environment sees every target as
// 404 ("gone"). Before treating any 404 as gone, prove the credentials can see
// this deployment's live (ready) media.
describe('verifyMuxEnvironment', () => {
  const notFound = () => new MuxApiError('not found', { status: 404, retryable: false });

  test('verified when there is no live media to compare against', async () => {
    await expect(cleanup.verifyMuxEnvironment()).resolves.toMatchObject({ verified: true });
    expect(mockMux.getAsset).not.toHaveBeenCalled();
  });

  test('verified as soon as one live asset is visible', async () => {
    mockRepository.listProviderAnchorAttempts.mockResolvedValue([
      { assetId: 'as-removed' },
      { assetId: 'as-live' },
    ]);
    mockMux.getAsset.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({ id: 'as-live' });

    await expect(cleanup.verifyMuxEnvironment()).resolves.toMatchObject({ verified: true });
    expect(mockRepository.listProviderAnchorAttempts).toHaveBeenCalledWith({ limit: 3 });
  });

  test('not verified when every live asset is missing, and says so', async () => {
    mockRepository.listProviderAnchorAttempts.mockResolvedValue([
      { assetId: 'a' },
      { assetId: 'b' },
    ]);
    mockMux.getAsset.mockRejectedValue(notFound());

    await expect(cleanup.verifyMuxEnvironment()).resolves.toMatchObject({ verified: false });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ deployment: DEPLOYMENT, anchors: 2 }),
      expect.stringMatching(/paused/)
    );
  });

  test('a transient provider failure propagates (nothing is decided)', async () => {
    mockRepository.listProviderAnchorAttempts.mockResolvedValue([{ assetId: 'a' }]);
    mockMux.getAsset.mockRejectedValue(new MuxApiError('down', { status: 503, retryable: true }));

    await expect(cleanup.verifyMuxEnvironment()).rejects.toMatchObject({ status: 503 });
  });

  test('runCleanupBatch claims nothing while the environment is unverified', async () => {
    mockRepository.listProviderAnchorAttempts.mockResolvedValue([{ assetId: 'a' }]);
    mockMux.getAsset.mockRejectedValue(notFound());

    const summary = await cleanup.runCleanupBatch({ now: NOW });

    expect(summary).toMatchObject({ skipped: 'mux_environment_unverified', claimed: 0 });
    expect(mockRepository.claimDueCleanupJobs).not.toHaveBeenCalled();
  });
});

// V6: a changed deployment label (APP_ENV/DB name) silently orphans every
// attempt and job; surface it instead of reporting zero outstanding work.
describe('warnForeignVideoWork', () => {
  test('warns when another deployment label holds in-flight attempts or open jobs', async () => {
    mockRepository.countForeignVideoWork.mockResolvedValue({ attempts: 2, jobs: 1 });

    await expect(cleanup.warnForeignVideoWork()).resolves.toEqual({ attempts: 2, jobs: 1 });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ deployment: DEPLOYMENT, attempts: 2, jobs: 1 }),
      expect.stringMatching(/another deployment/)
    );
  });

  test('stays quiet when there is none', async () => {
    await cleanup.warnForeignVideoWork();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});

describe('previewCleanupBatch (dry-run)', () => {
  test('lists due jobs without leasing them or calling Mux', async () => {
    mockRepository.listDueCleanupJobs.mockResolvedValue([
      job({ status: 'pending', leaseOwner: null }),
    ]);

    const preview = await cleanup.previewCleanupBatch({ now: NOW, limit: 5 });

    expect(mockRepository.listDueCleanupJobs).toHaveBeenCalledWith({ now: NOW, limit: 5 });
    expect(preview).toEqual([
      {
        jobId: JOB_ID,
        kind: 'cancel_upload',
        targetId: 'up-1',
        attemptId: ATTEMPT_ID,
        gameId: GAME_ID,
        status: 'pending',
        attempts: 1,
      },
    ]);
    expect(mockRepository.claimDueCleanupJobs).not.toHaveBeenCalled();
    expect(Object.values(mockMux).some((fn) => fn.mock.calls.length > 0)).toBe(false);
  });
});

describe('reconcileStaleAttempts', () => {
  const stale = (overrides) => attempt({ status: 'uploading', ...overrides });

  test('lists this deployment’s in-flight attempts older than the grace period (default 24 h > Mux’s 6 h)', async () => {
    expect(cleanup.RECONCILE_GRACE_MS).toBe(24 * 60 * 60 * 1000);

    await cleanup.reconcileStaleAttempts({ now: NOW, limit: 7 });

    expect(mockRepository.listStaleUploadAttempts).toHaveBeenCalledWith({
      olderThan: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
      limit: 7,
      statuses: ['reserved', 'uploading', 'processing'],
    });
  });

  test('an attempt still referenced by its Game is left alone', async () => {
    mockRepository.listStaleUploadAttempts.mockResolvedValue([stale()]);
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(true);

    const summary = await cleanup.reconcileStaleAttempts({ now: NOW });

    expect(mockRepository.isGameVideoGenerationReferenced).toHaveBeenCalledWith({
      gameId: GAME_ID,
      generationId: GENERATION_ID,
    });
    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ scanned: 1, referenced: 1, reconciled: 0 });
  });

  test('unreferenced uploading attempt: recheck → conditional transition → enqueue cancel → release slot once', async () => {
    mockRepository.listStaleUploadAttempts.mockResolvedValue([stale()]);
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(false);
    mockRepository.transitionUploadAttempt.mockResolvedValue(stale({ status: 'cancelled' }));

    const summary = await cleanup.reconcileStaleAttempts({ now: NOW });

    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      fromStatuses: ['uploading'],
      toStatus: 'cancelled',
      expectedUploadId: 'up-1',
      expectedAssetId: null,
      set: { errorMessage: cleanup.RECONCILED_ERROR_MESSAGE },
    });
    expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith({
      kind: 'cancel_upload',
      targetId: 'up-1',
      attemptId: ATTEMPT_ID,
      gameId: GAME_ID,
      reason: 'reconcile_stale',
      now: NOW,
    });
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledWith({
      resource: { type: 'league', id: LEAGUE_ID },
      reservedMinutes: 180,
    });
    const order = [
      mockRepository.isGameVideoGenerationReferenced.mock.invocationCallOrder[0],
      mockRepository.transitionUploadAttempt.mock.invocationCallOrder[0],
      mockRepository.enqueueCleanupJob.mock.invocationCallOrder[0],
      mockRepository.releaseUploadSlot.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(summary).toMatchObject({ scanned: 1, reconciled: 1, enqueued: 1, raced: 0, errors: 0 });
  });

  test('unreferenced processing attempt with an asset → enqueue delete_asset for it', async () => {
    mockRepository.listStaleUploadAttempts.mockResolvedValue([
      stale({ status: 'processing', assetId: 'as-9' }),
    ]);
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(false);
    mockRepository.transitionUploadAttempt.mockResolvedValue({});

    await cleanup.reconcileStaleAttempts({ now: NOW });

    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatuses: ['processing'],
        expectedUploadId: 'up-1',
        expectedAssetId: 'as-9',
      })
    );
    expect(mockRepository.enqueueCleanupJob).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'delete_asset', targetId: 'as-9' })
    );
  });

  test('a reserved attempt that never reached Mux → slot released, no provider cleanup enqueued', async () => {
    mockRepository.listStaleUploadAttempts.mockResolvedValue([
      stale({ status: 'reserved', uploadId: undefined }),
    ]);
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(false);
    mockRepository.transitionUploadAttempt.mockResolvedValue({});

    const summary = await cleanup.reconcileStaleAttempts({ now: NOW });

    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUploadId: null, expectedAssetId: null })
    );
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ reconciled: 1, enqueued: 0 });
  });

  test('lost the transition race (null) → no enqueue and no slot release', async () => {
    mockRepository.listStaleUploadAttempts.mockResolvedValue([stale()]);
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(false);
    mockRepository.transitionUploadAttempt.mockResolvedValue(null);

    const summary = await cleanup.reconcileStaleAttempts({ now: NOW });

    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ raced: 1, reconciled: 0 });
  });

  test('a failed reference read skips that attempt (never "not referenced") and continues', async () => {
    mockRepository.listStaleUploadAttempts.mockResolvedValue([
      stale(),
      stale({ _id: OTHER_ATTEMPT_ID, uploadId: 'up-2' }),
    ]);
    mockRepository.isGameVideoGenerationReferenced
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(false);
    mockRepository.transitionUploadAttempt.mockResolvedValue({});

    const summary = await cleanup.reconcileStaleAttempts({ now: NOW });

    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledTimes(1);
    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: OTHER_ATTEMPT_ID })
    );
    expect(summary).toMatchObject({ scanned: 2, errors: 1, reconciled: 1 });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('enqueue failure → the attempt is restored to its in-flight status (retried next sweep), slot kept', async () => {
    mockRepository.listStaleUploadAttempts.mockResolvedValue([stale({ errorMessage: null })]);
    mockRepository.isGameVideoGenerationReferenced.mockResolvedValue(false);
    mockRepository.transitionUploadAttempt.mockResolvedValue({});
    mockRepository.enqueueCleanupJob.mockRejectedValue(new Error('connection lost'));

    const summary = await cleanup.reconcileStaleAttempts({ now: NOW });

    expect(mockRepository.transitionUploadAttempt).toHaveBeenCalledTimes(2);
    expect(mockRepository.transitionUploadAttempt).toHaveBeenLastCalledWith({
      attemptId: ATTEMPT_ID,
      fromStatuses: ['cancelled'],
      toStatus: 'uploading',
      expectedUploadId: 'up-1',
      expectedAssetId: null,
      set: { errorMessage: null },
    });
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ errors: 1, reconciled: 0 });
  });

  test('dry run: reads only — no transition, enqueue, release or Mux call — and lists the plan', async () => {
    mockRepository.listStaleUploadAttempts.mockResolvedValue([
      stale(),
      stale({ _id: OTHER_ATTEMPT_ID, status: 'processing', assetId: 'as-9' }),
    ]);
    mockRepository.isGameVideoGenerationReferenced
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const summary = await cleanup.reconcileStaleAttempts({ now: NOW, dryRun: true });

    expect(mockRepository.transitionUploadAttempt).not.toHaveBeenCalled();
    expect(mockRepository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(mockRepository.releaseUploadSlot).not.toHaveBeenCalled();
    expect(Object.values(mockMux).some((fn) => fn.mock.calls.length > 0)).toBe(false);
    expect(summary).toMatchObject({ dryRun: true, scanned: 2, referenced: 1, reconciled: 0 });
    expect(summary.planned).toEqual([
      {
        attemptId: ATTEMPT_ID,
        gameId: GAME_ID,
        status: 'uploading',
        cleanup: { kind: 'cancel_upload', targetId: 'up-1' },
      },
    ]);
  });
});

describe('kickCleanup', () => {
  test('runs one batch on setImmediate, after the caller returns', async () => {
    const returned = cleanup.kickCleanup();

    expect(returned).toBeUndefined();
    expect(mockRepository.claimDueCleanupJobs).not.toHaveBeenCalled();
    await flushPromises();
    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalled();
  });

  test('swallows and logs errors (never throws, no unhandled rejection)', async () => {
    mockRepository.claimDueCleanupJobs.mockRejectedValue(new Error('connection lost'));

    expect(() => cleanup.kickCleanup()).not.toThrow();
    await flushPromises();
    await flushPromises();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Video cleanup kick failed'
    );
  });

  test('is a no-op when Mux is not configured', async () => {
    mockMux.isMuxConfigured.mockReturnValue(false);
    cleanup.kickCleanup();
    await flushPromises();
    expect(mockRepository.claimDueCleanupJobs).not.toHaveBeenCalled();
  });
});

describe('startVideoCleanupSweep / stopVideoCleanupSweep', () => {
  let tick;
  let unref;
  let setIntervalSpy;
  let clearIntervalSpy;

  beforeEach(() => {
    tick = null;
    unref = jest.fn();
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((fn) => {
      tick = fn;
      return { unref };
    });
    clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  });

  test('starts one unref’d interval (idempotent) and stops it', async () => {
    expect(cleanup.startVideoCleanupSweep({ intervalMs: 1000 })).toBe(true);
    expect(cleanup.startVideoCleanupSweep({ intervalMs: 1000 })).toBe(false);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(unref).toHaveBeenCalled();

    await cleanup.stopVideoCleanupSweep();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  test('is not started when Mux is not configured', () => {
    mockMux.isMuxConfigured.mockReturnValue(false);
    expect(cleanup.startVideoCleanupSweep()).toBe(false);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  test('a tick runs the cleanup batch, then the reconcile', async () => {
    cleanup.startVideoCleanupSweep({ intervalMs: 1000 });
    await tick();

    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalled();
    expect(mockRepository.listStaleUploadAttempts).toHaveBeenCalled();
    expect(
      mockRepository.claimDueCleanupJobs.mock.invocationCallOrder[0] <
        mockRepository.listStaleUploadAttempts.mock.invocationCallOrder[0]
    ).toBe(true);
  });

  test('ticks never overlap: a tick while a run is in flight is skipped', async () => {
    const claim = deferred();
    mockRepository.claimDueCleanupJobs.mockReturnValueOnce(claim.promise);
    cleanup.startVideoCleanupSweep({ intervalMs: 1000 });

    const first = tick();
    tick();
    tick();
    // The batch verifies the Mux environment (V6) before its first claim.
    await flushPromises();
    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalledTimes(1);

    claim.resolve([]);
    await first;
    await tick();
    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalledTimes(2);
  });

  test('a failing run is logged and does not stop later ticks', async () => {
    mockRepository.claimDueCleanupJobs.mockRejectedValueOnce(new Error('connection lost'));
    cleanup.startVideoCleanupSweep({ intervalMs: 1000 });

    await tick();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Video cleanup sweep failed'
    );
    await tick();
    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalledTimes(2);
  });

  test('stop waits for the in-flight run, which claims no further jobs', async () => {
    const claim = deferred();
    mockRepository.claimDueCleanupJobs.mockReturnValueOnce(claim.promise);
    mockMux.cancelDirectUpload.mockResolvedValue({ outcome: 'gone' });
    cleanup.startVideoCleanupSweep({ intervalMs: 1000 });

    tick();
    await flushPromises(); // past the V6 environment check, into the claim
    let stopped = false;
    const stopping = cleanup.stopVideoCleanupSweep().then(() => {
      stopped = true;
    });
    await flushPromises();
    expect(stopped).toBe(false);

    claim.resolve([job()]);
    await stopping;

    expect(stopped).toBe(true);
    // The claimed job finished; no second claim and no reconcile after stop.
    expect(mockRepository.completeCleanupJob).toHaveBeenCalledTimes(1);
    expect(mockRepository.claimDueCleanupJobs).toHaveBeenCalledTimes(1);
    expect(mockRepository.listStaleUploadAttempts).not.toHaveBeenCalled();
  });
});
