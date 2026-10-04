// Mux game video — persistence layer (plan Task 3b; rulings E1/E2/E3, R2–R4).
// No database (E2): atomicity is asserted through the exact filter/update
// shapes handed to the Model, real Mongoose validation via validateSync(), and
// — for Game.video writes — the cast update that reaches the driver collection.
const mongoose = require('mongoose');

const videoRepository = require('../../modules/video/video.repository');
const { Game } = require('../../modules/games/games.repository');

const {
  VideoUploadAttempt,
  VideoCleanupJob,
  VideoWebhookEvent,
  VideoQuotaCounter,
  UPLOAD_ATTEMPT_STATUSES,
  UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES,
  getVideoDeployment,
} = videoRepository;

const GAME_ID = '64b7f0c2a1b2c3d4e5f60718';
const LEAGUE_ID = '64b7f0c2a1b2c3d4e5f60719';
const USER_ID = '64b7f0c2a1b2c3d4e5f6071a';
const ATTEMPT_ID = '64b7f0c2a1b2c3d4e5f6071b';
const JOB_ID = '64b7f0c2a1b2c3d4e5f6071c';
const GENERATION_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const NOW = new Date('2026-10-04T12:00:00.000Z');

function duplicateKeyError() {
  return Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
}

function writtenPaths(update) {
  return Object.values(update).flatMap((operator) => Object.keys(operator));
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getVideoDeployment', () => {
  test('names this database deployment from existing env, never from credentials', () => {
    const deployment = getVideoDeployment();
    // setupEnv: NODE_ENV=test, MONGO_URI=mongodb://127.0.0.1:27017/tsw_2026_test
    expect(deployment).toBe('test:tsw_2026_test');
  });
});

describe('VideoUploadAttempt schema', () => {
  const valid = {
    gameId: GAME_ID,
    generationId: GENERATION_ID,
    billingResource: { type: 'league', id: LEAGUE_ID },
    createdBy: USER_ID,
    reservedMinutes: 180,
    deployment: 'test:tsw_2026_test',
  };

  test('a reserved attempt validates with defaults', () => {
    const attempt = new VideoUploadAttempt(valid);
    expect(attempt.validateSync()).toBeUndefined();
    expect(attempt.status).toBe('reserved');
    expect(attempt.sameRecording).toBe(false);
    expect(attempt.previousTimelineId).toBeNull();
    expect(attempt.storedMinutes).toBe(0);
    expect(attempt.billingResource.type).toBe('league');
    expect(String(attempt.billingResource.id)).toBe(LEAGUE_ID);
    // Unset (not null) so the partial unique indexes never collide on null.
    expect(attempt.uploadId).toBeUndefined();
    expect(attempt.assetId).toBeUndefined();
  });

  test('declares every lifecycle status', () => {
    expect(UPLOAD_ATTEMPT_STATUSES).toEqual([
      'reserved',
      'uploading',
      'processing',
      'ready',
      'errored',
      'cancelled',
      'superseded',
      'rejected',
    ]);
    expect(VideoUploadAttempt.schema.path('status').enumValues).toEqual(UPLOAD_ATTEMPT_STATUSES);
    expect(UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES).toEqual(['reserved', 'uploading', 'processing']);
  });

  test('rejects a missing owner, bad resource type, bad status and fractional minutes', () => {
    for (const key of ['gameId', 'generationId', 'createdBy', 'deployment', 'reservedMinutes']) {
      const doc = { ...valid };
      delete doc[key];
      expect(new VideoUploadAttempt(doc).validateSync().errors[key]).toBeDefined();
    }
    expect(
      new VideoUploadAttempt({
        ...valid,
        billingResource: { type: 'team', id: LEAGUE_ID },
      }).validateSync().errors['billingResource.type']
    ).toBeDefined();
    expect(
      new VideoUploadAttempt({ ...valid, status: 'deleted' }).validateSync().errors.status
    ).toBeDefined();
    expect(
      new VideoUploadAttempt({ ...valid, reservedMinutes: 1.5 }).validateSync().errors
        .reservedMinutes
    ).toBeDefined();
  });

  test('upload/asset/generation ids are unique; upload/asset only when set (partial)', () => {
    const indexes = VideoUploadAttempt.schema.indexes();
    const find = (key) => indexes.find(([fields]) => Object.keys(fields).join() === key);
    expect(find('generationId')[1]).toMatchObject({ unique: true });
    expect(find('uploadId')[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { uploadId: { $type: 'string' } },
    });
    expect(find('assetId')[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { assetId: { $type: 'string' } },
    });
    expect(find('deployment,status,updatedAt')).toBeDefined();
  });
});

describe('upload attempts', () => {
  test('createUploadAttempt reserves with a fresh generation id and this deployment', async () => {
    const create = jest
      .spyOn(VideoUploadAttempt, 'create')
      .mockImplementation(async (doc) => new VideoUploadAttempt(doc));

    const attempt = await videoRepository.createUploadAttempt({
      gameId: GAME_ID,
      billingResource: { type: 'league', id: LEAGUE_ID },
      createdBy: USER_ID,
      sameRecording: true,
      previousTimelineId: 'youtube:dQw4w9WgXcQ',
      reservedMinutes: 180,
    });

    const [doc] = create.mock.calls[0];
    expect(doc).toMatchObject({
      gameId: GAME_ID,
      billingResource: { type: 'league', id: LEAGUE_ID },
      createdBy: USER_ID,
      sameRecording: true,
      previousTimelineId: 'youtube:dQw4w9WgXcQ',
      reservedMinutes: 180,
      status: 'reserved',
      deployment: 'test:tsw_2026_test',
    });
    expect(doc.generationId).toMatch(/^[0-9a-f]{32}$/);
    // Plain object back, not a saveable document.
    expect(attempt.save).toBeUndefined();
    expect(attempt.generationId).toBe(doc.generationId);
  });

  test('two attempts never share a generation id', async () => {
    jest
      .spyOn(VideoUploadAttempt, 'create')
      .mockImplementation(async (doc) => new VideoUploadAttempt(doc));
    const input = {
      gameId: GAME_ID,
      billingResource: { type: 'league', id: LEAGUE_ID },
      createdBy: USER_ID,
      reservedMinutes: 10,
    };
    const a = await videoRepository.createUploadAttempt(input);
    const b = await videoRepository.createUploadAttempt(input);
    expect(a.generationId).not.toBe(b.generationId);
  });

  test('setUploadAttemptUploadId records the Mux upload only on a reserved attempt without one', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoUploadAttempt, 'findOneAndUpdate')
      .mockResolvedValue({ _id: ATTEMPT_ID, status: 'uploading', uploadId: 'up-1' });

    const result = await videoRepository.setUploadAttemptUploadId({
      attemptId: ATTEMPT_ID,
      uploadId: 'up-1',
    });

    expect(result).toMatchObject({ uploadId: 'up-1' });
    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: ATTEMPT_ID, status: 'reserved', uploadId: null });
    expect(update).toEqual({ $set: { uploadId: 'up-1', status: 'uploading' } });
    expect(options).toMatchObject({ new: true, runValidators: true, lean: true });
  });

  test('setUploadAttemptUploadId returns null when the attempt moved on', async () => {
    jest.spyOn(VideoUploadAttempt, 'findOneAndUpdate').mockResolvedValue(null);
    await expect(
      videoRepository.setUploadAttemptUploadId({ attemptId: ATTEMPT_ID, uploadId: 'up-1' })
    ).resolves.toBeNull();
  });

  test.each([
    ['findUploadAttemptById', ATTEMPT_ID, { _id: ATTEMPT_ID }],
    ['findUploadAttemptByUploadId', 'up-1', { uploadId: 'up-1' }],
    ['findUploadAttemptByAssetId', 'as-1', { assetId: 'as-1' }],
    ['findUploadAttemptByGenerationId', GENERATION_ID, { generationId: GENERATION_ID }],
  ])('%s looks up by its key (lean)', async (fn, key, filter) => {
    const findOne = jest.spyOn(VideoUploadAttempt, 'findOne').mockResolvedValue({ _id: 'x' });
    await expect(videoRepository[fn](key)).resolves.toEqual({ _id: 'x' });
    expect(findOne).toHaveBeenCalledWith(filter, null, { lean: true });
  });

  test.each([
    ['findUploadAttemptByUploadId', null],
    ['findUploadAttemptByAssetId', ''],
    ['findUploadAttemptByGenerationId', undefined],
  ])('%s never matches a missing key (no "null" lookups)', async (fn, key) => {
    const findOne = jest.spyOn(VideoUploadAttempt, 'findOne');
    await expect(videoRepository[fn](key)).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  test('transitionUploadAttempt filters on the expected prior status and identities', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoUploadAttempt, 'findOneAndUpdate')
      .mockResolvedValue({ _id: ATTEMPT_ID, status: 'processing', assetId: 'as-1' });

    const result = await videoRepository.transitionUploadAttempt({
      attemptId: ATTEMPT_ID,
      fromStatuses: ['uploading'],
      toStatus: 'processing',
      expectedUploadId: 'up-1',
      expectedAssetId: null,
      set: { assetId: 'as-1' },
    });

    expect(result).toMatchObject({ status: 'processing' });
    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: ATTEMPT_ID,
      status: { $in: ['uploading'] },
      uploadId: 'up-1',
      assetId: null,
    });
    expect(update).toEqual({ $set: { assetId: 'as-1', status: 'processing' } });
    expect(options).toMatchObject({ new: true, runValidators: true, lean: true });
  });

  test('transitionUploadAttempt omits identity filters it was not given', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoUploadAttempt, 'findOneAndUpdate')
      .mockResolvedValue(null);

    await expect(
      videoRepository.transitionUploadAttempt({
        attemptId: ATTEMPT_ID,
        fromStatuses: ['ready'],
        toStatus: 'superseded',
      })
    ).resolves.toBeNull();

    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: ATTEMPT_ID, status: { $in: ['ready'] } });
    expect(update).toEqual({ $set: { status: 'superseded' } });
  });

  test('transitionUploadAttempt refuses unknown statuses and non-allowlisted fields', async () => {
    const findOneAndUpdate = jest.spyOn(VideoUploadAttempt, 'findOneAndUpdate');
    await expect(
      videoRepository.transitionUploadAttempt({
        attemptId: ATTEMPT_ID,
        fromStatuses: [],
        toStatus: 'ready',
      })
    ).rejects.toThrow(/fromStatuses/);
    await expect(
      videoRepository.transitionUploadAttempt({
        attemptId: ATTEMPT_ID,
        fromStatuses: ['processing'],
        toStatus: 'deleted',
      })
    ).rejects.toThrow(/toStatus/);
    await expect(
      videoRepository.transitionUploadAttempt({
        attemptId: ATTEMPT_ID,
        fromStatuses: ['processing'],
        toStatus: 'ready',
        set: { generationId: 'other' },
      })
    ).rejects.toThrow(/generationId/);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('takeUploadAttemptStoredMinutes hands out committed minutes exactly once', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoUploadAttempt, 'findOneAndUpdate')
      .mockResolvedValueOnce({ _id: ATTEMPT_ID, storedMinutes: 42 })
      .mockResolvedValueOnce(null);

    await expect(videoRepository.takeUploadAttemptStoredMinutes(ATTEMPT_ID)).resolves.toBe(42);
    await expect(videoRepository.takeUploadAttemptStoredMinutes(ATTEMPT_ID)).resolves.toBe(0);

    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: ATTEMPT_ID, storedMinutes: { $gt: 0 } });
    expect(update).toEqual({ $set: { storedMinutes: 0 } });
    expect(options).toMatchObject({ new: false, lean: true });
  });

  test('listStaleUploadAttempts is bounded, oldest first, in-flight only, this deployment only', async () => {
    const find = jest.spyOn(VideoUploadAttempt, 'find').mockResolvedValue([]);
    const olderThan = new Date('2026-10-04T10:00:00.000Z');

    await videoRepository.listStaleUploadAttempts({ olderThan, limit: 5000 });

    const [filter, projection, options] = find.mock.calls[0];
    expect(filter).toEqual({
      deployment: 'test:tsw_2026_test',
      status: { $in: ['reserved', 'uploading', 'processing'] },
      updatedAt: { $lt: olderThan },
    });
    expect(projection).toBeNull();
    expect(options).toEqual({ sort: { updatedAt: 1 }, limit: 100, lean: true });
  });

  test('listStaleUploadAttempts accepts explicit statuses and a small limit', async () => {
    const find = jest.spyOn(VideoUploadAttempt, 'find').mockResolvedValue([]);
    await videoRepository.listStaleUploadAttempts({
      olderThan: NOW,
      limit: 10,
      statuses: ['errored'],
    });
    const [filter, , options] = find.mock.calls[0];
    expect(filter.status).toEqual({ $in: ['errored'] });
    expect(options.limit).toBe(10);
  });
});

describe('VideoCleanupJob', () => {
  const jobInput = {
    kind: 'delete_asset',
    targetId: 'as-1',
    attemptId: ATTEMPT_ID,
    gameId: GAME_ID,
    reason: 'replaced',
  };

  test('schema validates a pending job and rejects unknown kinds/statuses', () => {
    const job = new VideoCleanupJob({
      ...jobInput,
      deployment: 'test:tsw_2026_test',
      nextAttemptAt: NOW,
    });
    expect(job.validateSync()).toBeUndefined();
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
    expect(job.leaseOwner).toBeNull();
    expect(job.lastError).toBeNull();
    expect(job.outcome).toBeNull();
    expect(
      new VideoCleanupJob({ ...jobInput, kind: 'purge', deployment: 'd' }).validateSync().errors
        .kind
    ).toBeDefined();
    expect(
      new VideoCleanupJob({ ...jobInput, status: 'running', deployment: 'd' }).validateSync().errors
        .status
    ).toBeDefined();
    expect(VideoCleanupJob.schema.path('outcome').enumValues).toEqual([
      'cancelled',
      'completed',
      'expired',
      'gone',
      'deleted',
      null,
    ]);
  });

  test('{kind, targetId} is unique so enqueue is idempotent', () => {
    const unique = VideoCleanupJob.schema
      .indexes()
      .find(([fields]) => Object.keys(fields).join() === 'kind,targetId');
    expect(unique[1]).toMatchObject({ unique: true });
  });

  test('enqueueCleanupJob resets a failed job to pending first', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValueOnce({ _id: JOB_ID, status: 'pending' });

    const job = await videoRepository.enqueueCleanupJob({ ...jobInput, now: NOW });

    expect(job).toEqual({ _id: JOB_ID, status: 'pending' });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    // Scoped to this deployment like claims (E3): a restored/copied database
    // never resets another deployment's job.
    expect(filter).toEqual({
      kind: 'delete_asset',
      targetId: 'as-1',
      status: 'failed',
      deployment: 'test:tsw_2026_test',
    });
    expect(update).toEqual({
      $set: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: NOW,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    expect(options).toMatchObject({ new: true, runValidators: true, lean: true });
  });

  test('enqueueCleanupJob inserts with $setOnInsert only — a done/pending job is left untouched', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: JOB_ID, status: 'done' });

    const job = await videoRepository.enqueueCleanupJob({ ...jobInput, now: NOW });

    expect(job.status).toBe('done');
    const [filter, update, options] = findOneAndUpdate.mock.calls[1];
    expect(filter).toEqual({
      kind: 'delete_asset',
      targetId: 'as-1',
      deployment: 'test:tsw_2026_test',
    });
    expect(Object.keys(update)).toEqual(['$setOnInsert']);
    expect(update.$setOnInsert).toEqual({
      kind: 'delete_asset',
      targetId: 'as-1',
      attemptId: ATTEMPT_ID,
      gameId: GAME_ID,
      reason: 'replaced',
      deployment: 'test:tsw_2026_test',
      status: 'pending',
      attempts: 0,
      nextAttemptAt: NOW,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      outcome: null,
      completedAt: null,
    });
    expect(options).toMatchObject({ upsert: true, new: true, runValidators: true, lean: true });
  });

  test('enqueueCleanupJob survives a concurrent insert (E11000) by reading the winner', async () => {
    jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(duplicateKeyError());
    const findOne = jest
      .spyOn(VideoCleanupJob, 'findOne')
      .mockResolvedValue({ _id: JOB_ID, status: 'pending' });

    await expect(videoRepository.enqueueCleanupJob({ ...jobInput, now: NOW })).resolves.toEqual({
      _id: JOB_ID,
      status: 'pending',
    });
    expect(findOne).toHaveBeenCalledWith(
      { kind: 'delete_asset', targetId: 'as-1', deployment: 'test:tsw_2026_test' },
      null,
      { lean: true }
    );
  });

  test('enqueueCleanupJob throws when the target is held by another deployment (never adopts it)', async () => {
    jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(duplicateKeyError());
    jest.spyOn(VideoCleanupJob, 'findOne').mockResolvedValue(null);

    await expect(videoRepository.enqueueCleanupJob({ ...jobInput, now: NOW })).rejects.toThrow(
      /another deployment/
    );
  });

  test('enqueueCleanupJob re-checks once when the job failed between the two steps', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: JOB_ID, status: 'failed' })
      .mockResolvedValueOnce({ _id: JOB_ID, status: 'pending' });

    await expect(
      videoRepository.enqueueCleanupJob({ ...jobInput, now: NOW })
    ).resolves.toMatchObject({ status: 'pending' });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(findOneAndUpdate.mock.calls[2][0]).toMatchObject({ status: 'failed' });
  });

  test('enqueueCleanupJob propagates other errors so callers never report false success', async () => {
    jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('connection lost'));
    await expect(videoRepository.enqueueCleanupJob({ ...jobInput, now: NOW })).rejects.toThrow(
      'connection lost'
    );
  });

  test('enqueueCleanupJob rejects a job without a target or attempt (E3: never ownerless)', async () => {
    const findOneAndUpdate = jest.spyOn(VideoCleanupJob, 'findOneAndUpdate');
    await expect(videoRepository.enqueueCleanupJob({ ...jobInput, targetId: '' })).rejects.toThrow(
      /targetId/
    );
    await expect(
      videoRepository.enqueueCleanupJob({ ...jobInput, attemptId: null })
    ).rejects.toThrow(/attemptId/);
    await expect(
      videoRepository.enqueueCleanupJob({ ...jobInput, reason: undefined })
    ).rejects.toThrow(/reason/);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('claimDueCleanupJobs leases due or lease-expired jobs atomically, one per call, bounded', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValueOnce({ _id: 'j1' })
      .mockResolvedValueOnce({ _id: 'j2' })
      .mockResolvedValueOnce(null);

    const claimed = await videoRepository.claimDueCleanupJobs({
      now: NOW,
      limit: 10,
      leaseOwner: 'worker-a',
      leaseMs: 60_000,
    });

    expect(claimed).toEqual([{ _id: 'j1' }, { _id: 'j2' }]);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(3);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      deployment: 'test:tsw_2026_test',
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: NOW } },
        { status: 'leased', leaseExpiresAt: { $lte: NOW } },
      ],
    });
    expect(update).toEqual({
      $set: {
        status: 'leased',
        leaseOwner: 'worker-a',
        leaseExpiresAt: new Date(NOW.getTime() + 60_000),
      },
      $inc: { attempts: 1 },
    });
    expect(options).toMatchObject({
      sort: { nextAttemptAt: 1 },
      new: true,
      runValidators: true,
      lean: true,
    });
  });

  test('claimDueCleanupJobs stops at the limit and clamps it', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValue({ _id: 'j' });

    await videoRepository.claimDueCleanupJobs({
      now: NOW,
      limit: 2,
      leaseOwner: 'w',
      leaseMs: 1000,
    });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);

    findOneAndUpdate.mockClear();
    await videoRepository.claimDueCleanupJobs({
      now: NOW,
      limit: 10_000,
      leaseOwner: 'w',
      leaseMs: 1000,
    });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(50);
  });

  test('claimDueCleanupJobs requires a lease owner and a positive lease', async () => {
    await expect(
      videoRepository.claimDueCleanupJobs({ now: NOW, limit: 1, leaseOwner: '', leaseMs: 1 })
    ).rejects.toThrow(/leaseOwner/);
    await expect(
      videoRepository.claimDueCleanupJobs({ now: NOW, limit: 1, leaseOwner: 'w', leaseMs: 0 })
    ).rejects.toThrow(/leaseMs/);
  });

  test('completeCleanupJob only completes a job this worker still leases', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValue(null);

    await expect(
      videoRepository.completeCleanupJob({
        jobId: JOB_ID,
        leaseOwner: 'worker-a',
        outcome: 'gone',
        now: NOW,
      })
    ).resolves.toBeNull();

    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: JOB_ID, status: 'leased', leaseOwner: 'worker-a' });
    expect(update).toEqual({
      $set: {
        status: 'done',
        outcome: 'gone',
        completedAt: NOW,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
      },
    });
  });

  test('failCleanupJobAttempt reschedules a retryable failure', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValue({ _id: JOB_ID, status: 'pending' });
    const nextAttemptAt = new Date('2026-10-04T12:05:00.000Z');
    const error = Object.assign(new Error('Mux request failed (503)'), {
      name: 'MuxApiError',
      status: 503,
      retryable: true,
    });

    await videoRepository.failCleanupJobAttempt({
      jobId: JOB_ID,
      leaseOwner: 'worker-a',
      retryable: true,
      nextAttemptAt,
      error,
    });

    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: JOB_ID, status: 'leased', leaseOwner: 'worker-a' });
    expect(update).toEqual({
      $set: {
        status: 'pending',
        nextAttemptAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: 'MuxApiError 503: Mux request failed (503)',
      },
    });
  });

  test('failCleanupJobAttempt fails a non-retryable job (or one without a next time)', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoCleanupJob, 'findOneAndUpdate')
      .mockResolvedValue({ _id: JOB_ID, status: 'failed' });

    await videoRepository.failCleanupJobAttempt({
      jobId: JOB_ID,
      leaseOwner: 'w',
      retryable: false,
      nextAttemptAt: new Date(),
      error: new Error('secret-bearing message https://user:pass@host'),
    });
    await videoRepository.failCleanupJobAttempt({
      jobId: JOB_ID,
      leaseOwner: 'w',
      retryable: true,
      nextAttemptAt: null,
      error: 'max_attempts',
    });

    const first = findOneAndUpdate.mock.calls[0][1].$set;
    expect(first).toEqual({
      status: 'failed',
      nextAttemptAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: 'Error',
    });
    expect(findOneAndUpdate.mock.calls[1][1].$set).toMatchObject({
      status: 'failed',
      lastError: 'max_attempts',
    });
  });

  test('summarizeCleanupError keeps only non-secret, bounded detail', () => {
    const { summarizeCleanupError } = videoRepository;
    expect(summarizeCleanupError(new TypeError('token=abc'))).toBe('TypeError');
    expect(
      summarizeCleanupError(
        Object.assign(new Error('x'.repeat(1000)), { name: 'MuxApiError', status: null })
      )
    ).toHaveLength(300);
    expect(summarizeCleanupError('code_only')).toBe('code_only');
    expect(summarizeCleanupError(undefined)).toBe('unknown');
  });

  test('countPendingCleanupJobs counts outstanding work, optionally per game / with failed', async () => {
    const countDocuments = jest.spyOn(VideoCleanupJob, 'countDocuments').mockResolvedValue(3);

    await expect(videoRepository.countPendingCleanupJobs()).resolves.toBe(3);
    await videoRepository.countPendingCleanupJobs({ gameId: GAME_ID, includeFailed: true });

    expect(countDocuments.mock.calls[0][0]).toEqual({
      deployment: 'test:tsw_2026_test',
      status: { $in: ['pending', 'leased'] },
    });
    expect(countDocuments.mock.calls[1][0]).toEqual({
      deployment: 'test:tsw_2026_test',
      status: { $in: ['pending', 'leased', 'failed'] },
      gameId: GAME_ID,
    });
  });

  test('listDueCleanupJobs is a read-only preview of what a claim would lease (dry-run)', async () => {
    const find = jest.spyOn(VideoCleanupJob, 'find').mockResolvedValue([{ _id: JOB_ID }]);
    const findOneAndUpdate = jest.spyOn(VideoCleanupJob, 'findOneAndUpdate');

    await expect(videoRepository.listDueCleanupJobs({ now: NOW, limit: 500 })).resolves.toEqual([
      { _id: JOB_ID },
    ]);

    expect(find).toHaveBeenCalledWith(
      {
        deployment: 'test:tsw_2026_test',
        $or: [
          { status: 'pending', nextAttemptAt: { $lte: NOW } },
          { status: 'leased', leaseExpiresAt: { $lte: NOW } },
        ],
      },
      null,
      { sort: { nextAttemptAt: 1 }, limit: 50, lean: true }
    );
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('VideoWebhookEvent', () => {
  test('eventId is unique and receivedAt expires after ~30 days', () => {
    const indexes = VideoWebhookEvent.schema.indexes();
    const unique = indexes.find(([fields]) => Object.keys(fields).join() === 'eventId');
    const ttl = indexes.find(([fields]) => Object.keys(fields).join() === 'receivedAt');
    expect(unique[1]).toMatchObject({ unique: true });
    expect(ttl[1]).toMatchObject({ expireAfterSeconds: 30 * 24 * 60 * 60 });
    expect(
      new VideoWebhookEvent({ eventId: 'e', type: 'video.asset.ready' }).validateSync()
    ).toBeUndefined();
  });

  test('recordWebhookEventOnce → true the first time', async () => {
    const create = jest.spyOn(VideoWebhookEvent, 'create').mockResolvedValue({});
    await expect(
      videoRepository.recordWebhookEventOnce('evt-1', 'video.asset.ready')
    ).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith({ eventId: 'evt-1', type: 'video.asset.ready' });
  });

  test('recordWebhookEventOnce → false on a duplicate (E11000)', async () => {
    jest.spyOn(VideoWebhookEvent, 'create').mockRejectedValue(duplicateKeyError());
    await expect(
      videoRepository.recordWebhookEventOnce('evt-1', 'video.asset.ready')
    ).resolves.toBe(false);
  });

  test('recordWebhookEventOnce rethrows anything else (so the webhook 5xxs and Mux retries)', async () => {
    jest.spyOn(VideoWebhookEvent, 'create').mockRejectedValue(new Error('db down'));
    await expect(
      videoRepository.recordWebhookEventOnce('evt-1', 'video.asset.ready')
    ).rejects.toThrow('db down');
  });

  test('recordWebhookEventOnce requires an event id', async () => {
    await expect(videoRepository.recordWebhookEventOnce('', 'x')).rejects.toThrow(/eventId/);
  });

  test('releaseWebhookEvent deletes the record so a Mux retry reprocesses', async () => {
    const deleteOne = jest
      .spyOn(VideoWebhookEvent, 'deleteOne')
      .mockResolvedValue({ deletedCount: 1 });
    await expect(videoRepository.releaseWebhookEvent('evt-1')).resolves.toBe(true);
    expect(deleteOne).toHaveBeenCalledWith({ eventId: 'evt-1' });
  });
});

describe('quota counters (VideoQuotaCounter)', () => {
  const resource = { type: 'league', id: LEAGUE_ID };
  const limits = { maxConcurrentUploads: 1, maxStoredMinutes: 600, maxCreatesPerDay: 3 };

  test('schema: one counter per billing resource', () => {
    const unique = VideoQuotaCounter.schema
      .indexes()
      .find(([fields]) => Object.keys(fields).join() === 'resourceType,resourceId');
    expect(unique[1]).toMatchObject({ unique: true });
    const counter = new VideoQuotaCounter({ resourceType: 'league', resourceId: LEAGUE_ID });
    expect(counter.validateSync()).toBeUndefined();
    expect(counter.toObject()).toMatchObject({
      activeUploads: 0,
      reservedMinutes: 0,
      storedMinutes: 0,
      createsDay: null,
      createsToday: 0,
    });
  });

  function mockReserve(result) {
    const updateOne = jest.spyOn(VideoQuotaCounter, 'updateOne').mockResolvedValue({});
    const findOneAndUpdate = jest
      .spyOn(VideoQuotaCounter, 'findOneAndUpdate')
      .mockResolvedValue(result);
    return { updateOne, findOneAndUpdate };
  }

  test('reserveUploadSlot: bounded upsert, then ONE conditional pipeline update (E2/R2)', async () => {
    const { updateOne, findOneAndUpdate } = mockReserve({ activeUploads: 1 });

    const counter = await videoRepository.reserveUploadSlot({
      resource,
      limits,
      reservedMinutes: 180,
      now: NOW,
    });

    expect(counter).toEqual({ activeUploads: 1 });
    expect(updateOne).toHaveBeenCalledWith(
      { resourceType: 'league', resourceId: LEAGUE_ID },
      {
        $setOnInsert: {
          activeUploads: 0,
          reservedMinutes: 0,
          storedMinutes: 0,
          createsDay: null,
          createsToday: 0,
        },
      },
      { upsert: true }
    );
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, pipeline, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      resourceType: 'league',
      resourceId: LEAGUE_ID,
      activeUploads: { $lt: 1 },
      // A stored day that is unset or EARLIER than today counts as zero creates;
      // today or a LATER stored day (another instance's clock already crossed
      // midnight) must still have room — the day never moves backwards.
      $or: [
        { createsDay: null },
        { createsDay: { $lt: '2026-10-04' } },
        { createsToday: { $lt: 3 } },
      ],
      $expr: {
        $lte: [{ $add: ['$storedMinutes', '$reservedMinutes', 180] }, 600],
      },
    });
    // Day rollover is decided inside the same atomic update from the stored day.
    expect(pipeline).toEqual([
      {
        $set: {
          activeUploads: { $add: ['$activeUploads', 1] },
          reservedMinutes: { $add: ['$reservedMinutes', 180] },
          createsToday: {
            $cond: [{ $gte: ['$createsDay', '2026-10-04'] }, { $add: ['$createsToday', 1] }, 1],
          },
          createsDay: {
            $cond: [
              { $gt: ['$createsDay', '2026-10-04'] },
              '$createsDay',
              { $literal: '2026-10-04' },
            ],
          },
        },
      },
    ]);
    expect(options).toMatchObject({ new: true, lean: true });
  });

  test('reserveUploadSlot returns null when a limit would be exceeded', async () => {
    mockReserve(null);
    await expect(
      videoRepository.reserveUploadSlot({ resource, limits, reservedMinutes: 10, now: NOW })
    ).resolves.toBeNull();
  });

  test('reserveUploadSlot: the UTC calendar day drives the rollover', async () => {
    const { findOneAndUpdate } = mockReserve({});
    await videoRepository.reserveUploadSlot({
      resource,
      limits,
      reservedMinutes: 10,
      now: new Date('2026-10-04T23:59:59.999-01:00'),
    });
    const [filter, pipeline] = findOneAndUpdate.mock.calls[0];
    expect(filter.$or[1]).toEqual({ createsDay: { $lt: '2026-10-05' } });
    expect(pipeline[0].$set.createsDay.$cond[2]).toEqual({ $literal: '2026-10-05' });
  });

  test.each([
    ['no concurrent uploads allowed', { ...limits, maxConcurrentUploads: 0 }, 10],
    ['no creates allowed', { ...limits, maxCreatesPerDay: 0 }, 10],
    ['reservation alone exceeds the stored allowance', { ...limits, maxStoredMinutes: 5 }, 10],
  ])('reserveUploadSlot short-circuits to null: %s', async (_label, cappedLimits, minutes) => {
    const { updateOne, findOneAndUpdate } = mockReserve({});
    await expect(
      videoRepository.reserveUploadSlot({
        resource,
        limits: cappedLimits,
        reservedMinutes: minutes,
        now: NOW,
      })
    ).resolves.toBeNull();
    expect(updateOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('reserveUploadSlot tolerates a concurrent counter upsert (E11000)', async () => {
    jest.spyOn(VideoQuotaCounter, 'updateOne').mockRejectedValue(duplicateKeyError());
    jest.spyOn(VideoQuotaCounter, 'findOneAndUpdate').mockResolvedValue({ activeUploads: 1 });
    await expect(
      videoRepository.reserveUploadSlot({ resource, limits, reservedMinutes: 1, now: NOW })
    ).resolves.toEqual({ activeUploads: 1 });
  });

  test('reserveUploadSlot requires at least one reserved minute (RangeError, no query)', async () => {
    const { updateOne, findOneAndUpdate } = mockReserve({});
    await expect(
      videoRepository.reserveUploadSlot({ resource, limits, reservedMinutes: 0, now: NOW })
    ).rejects.toThrow(RangeError);
    await expect(
      videoRepository.reserveUploadSlot({ resource, limits, reservedMinutes: 0, now: NOW })
    ).rejects.toThrow(/reservedMinutes/);
    expect(updateOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('reserveUploadSlot rejects bad input (programmer errors)', async () => {
    await expect(
      videoRepository.reserveUploadSlot({ resource, limits, reservedMinutes: -1, now: NOW })
    ).rejects.toThrow(/reservedMinutes/);
    await expect(
      videoRepository.reserveUploadSlot({
        resource: { type: 'team', id: LEAGUE_ID },
        limits,
        reservedMinutes: 1,
        now: NOW,
      })
    ).rejects.toThrow(/resource/);
    await expect(
      videoRepository.reserveUploadSlot({
        resource,
        limits: { ...limits, maxStoredMinutes: 1.5 },
        reservedMinutes: 1,
        now: NOW,
      })
    ).rejects.toThrow(/maxStoredMinutes/);
  });

  // A fake counter document that evaluates exactly the filter and pipeline
  // the repository sends (MongoDB semantics for the operators used: query
  // comparisons only match the same BSON type; aggregation comparisons order
  // missing < null < numbers < strings; one $set stage reads the input doc).
  const bsonRank = (value) => {
    if (value === undefined) return 0;
    if (value === null) return 1;
    return typeof value === 'number' ? 2 : 3;
  };
  function compareBson(a, b) {
    const rank = bsonRank(a) - bsonRank(b);
    if (rank !== 0) return rank;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }
  const COMPARISONS = {
    $eq: (c) => c === 0,
    $gt: (c) => c > 0,
    $gte: (c) => c >= 0,
    $lt: (c) => c < 0,
    $lte: (c) => c <= 0,
  };
  function evalExpr(expr, doc) {
    if (typeof expr === 'string' && expr.startsWith('$')) return doc[expr.slice(1)];
    if (expr === null || typeof expr !== 'object') return expr;
    const [[operator, args]] = Object.entries(expr);
    if (operator === '$literal') return args;
    if (operator === '$add') return args.reduce((sum, arg) => sum + evalExpr(arg, doc), 0);
    if (operator === '$subtract') return evalExpr(args[0], doc) - evalExpr(args[1], doc);
    if (operator === '$max') return Math.max(...args.map((arg) => evalExpr(arg, doc)));
    if (operator === '$cond') {
      return evalExpr(args[0], doc) ? evalExpr(args[1], doc) : evalExpr(args[2], doc);
    }
    if (COMPARISONS[operator]) {
      return COMPARISONS[operator](compareBson(evalExpr(args[0], doc), evalExpr(args[1], doc)));
    }
    throw new Error(`evalExpr: unsupported ${operator}`);
  }
  function matchesQuery(filter, doc) {
    return Object.entries(filter).every(([key, condition]) => {
      if (key === '$or') return condition.some((branch) => matchesQuery(branch, doc));
      if (key === '$expr') return Boolean(evalExpr(condition, doc));
      const value = doc[key];
      if (condition === null) return value === null || value === undefined;
      if (typeof condition !== 'object') return String(value) === String(condition);
      return Object.entries(condition).every(([operator, operand]) => {
        if (operator === '$ne') return compareBson(value, operand) !== 0;
        if (bsonRank(value) !== bsonRank(operand)) return false; // type bracketing
        return COMPARISONS[operator](compareBson(value, operand));
      });
    });
  }
  function applyPipeline(pipeline, doc) {
    return pipeline.reduce((input, stage) => {
      const output = { ...input };
      for (const [field, expr] of Object.entries(stage.$set)) output[field] = evalExpr(expr, input);
      return output;
    }, doc);
  }
  function mockCounterStore(initial = {}) {
    const store = {
      resourceType: 'league',
      resourceId: LEAGUE_ID,
      activeUploads: 0,
      reservedMinutes: 0,
      storedMinutes: 0,
      createsDay: null,
      createsToday: 0,
      ...initial,
    };
    jest.spyOn(VideoQuotaCounter, 'updateOne').mockResolvedValue({});
    jest
      .spyOn(VideoQuotaCounter, 'findOneAndUpdate')
      .mockImplementation(async (filter, pipeline) => {
        await Promise.resolve();
        if (!matchesQuery(filter, store)) return null;
        Object.assign(store, applyPipeline(pipeline, store));
        return { ...store };
      });
    return store;
  }
  const reserve = (now = NOW) =>
    videoRepository.reserveUploadSlot({ resource, limits, reservedMinutes: 10, now });

  // Two creates racing for the last slot: the DB applies the conditional filter
  // atomically per document, so at most one update can match.
  test('two concurrent reservations at the limit leave exactly one winner', async () => {
    const store = mockCounterStore();

    const results = await Promise.all([
      videoRepository.reserveUploadSlot({ resource, limits, reservedMinutes: 100, now: NOW }),
      videoRepository.reserveUploadSlot({ resource, limits, reservedMinutes: 100, now: NOW }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(store.activeUploads).toBe(1);
    expect(store.reservedMinutes).toBe(100);
  });

  test('day rollover: a first create, a new day after a capped day, and the cap itself', async () => {
    const fresh = mockCounterStore();
    await expect(reserve()).resolves.toMatchObject({ createsDay: '2026-10-04', createsToday: 1 });
    expect(fresh.createsToday).toBe(1);
    jest.restoreAllMocks();

    const yesterdayCapped = mockCounterStore({ createsDay: '2026-10-03', createsToday: 3 });
    await expect(reserve()).resolves.toMatchObject({ createsDay: '2026-10-04', createsToday: 1 });
    expect(yesterdayCapped.createsToday).toBe(1);
    jest.restoreAllMocks();

    const todayCapped = mockCounterStore({ createsDay: '2026-10-04', createsToday: 3 });
    await expect(reserve()).resolves.toBeNull();
    expect(todayCapped).toMatchObject({ createsDay: '2026-10-04', createsToday: 3 });
  });

  test('day rollover never moves backwards across midnight (a lagging clock cannot reset the count)', async () => {
    // Another instance already counted creates for 2026-10-05; this request's
    // clock still says 2026-10-04. It counts against the stored day instead of
    // resetting it to its own older day.
    const store = mockCounterStore({ createsDay: '2026-10-05', createsToday: 1 });
    await expect(reserve()).resolves.toMatchObject({ createsDay: '2026-10-05', createsToday: 2 });
    expect(store).toMatchObject({ createsDay: '2026-10-05', createsToday: 2, activeUploads: 1 });
    jest.restoreAllMocks();

    const capped = mockCounterStore({ createsDay: '2026-10-05', createsToday: 3 });
    await expect(reserve()).resolves.toBeNull();
    expect(capped).toMatchObject({ createsDay: '2026-10-05', createsToday: 3, activeUploads: 0 });
  });

  test('releaseUploadSlot frees the slot and its reservation, never below zero', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoQuotaCounter, 'findOneAndUpdate')
      .mockResolvedValue({ activeUploads: 0 });

    await videoRepository.releaseUploadSlot({ resource, reservedMinutes: 180 });

    const [filter, pipeline, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ resourceType: 'league', resourceId: LEAGUE_ID });
    expect(pipeline).toEqual([
      {
        $set: {
          activeUploads: { $max: [0, { $subtract: ['$activeUploads', 1] }] },
          reservedMinutes: { $max: [0, { $subtract: ['$reservedMinutes', 180] }] },
        },
      },
    ]);
    expect(options).toMatchObject({ new: true, lean: true });
  });

  test('commitStoredMinutes converts the reservation into stored minutes in one update', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoQuotaCounter, 'findOneAndUpdate')
      .mockResolvedValue({ storedMinutes: 91 });

    await videoRepository.commitStoredMinutes({ resource, minutes: 91, reservedMinutes: 180 });

    const [filter, pipeline] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ resourceType: 'league', resourceId: LEAGUE_ID });
    expect(pipeline).toEqual([
      {
        $set: {
          activeUploads: { $max: [0, { $subtract: ['$activeUploads', 1] }] },
          reservedMinutes: { $max: [0, { $subtract: ['$reservedMinutes', 180] }] },
          storedMinutes: { $add: ['$storedMinutes', 91] },
        },
      },
    ]);
  });

  test('commitStoredMinutes refuses more minutes than were reserved (over-limit asset)', async () => {
    const findOneAndUpdate = jest.spyOn(VideoQuotaCounter, 'findOneAndUpdate');
    await expect(
      videoRepository.commitStoredMinutes({ resource, minutes: 181, reservedMinutes: 180 })
    ).rejects.toThrow(/reservedMinutes/);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('releaseStoredMinutes floors at zero', async () => {
    const findOneAndUpdate = jest
      .spyOn(VideoQuotaCounter, 'findOneAndUpdate')
      .mockResolvedValue({ storedMinutes: 0 });
    await videoRepository.releaseStoredMinutes({ resource, minutes: 91 });
    expect(findOneAndUpdate.mock.calls[0][1]).toEqual([
      { $set: { storedMinutes: { $max: [0, { $subtract: ['$storedMinutes', 91] }] } } },
    ]);
  });
});

// E1: Game.video is written only by conditional updates on video.* paths,
// scoped by _id + generation + identity + prior status, with runValidators,
// without a __v bump, and always persisting equivalentTimelines explicitly.
describe('conditional Game.video writes (E1)', () => {
  const VIDEO = {
    status: 'uploading',
    generationId: GENERATION_ID,
    uploadedByUserId: USER_ID,
    uploadStartedAt: NOW,
  };

  test('attachGameVideo onto a game without video filters on video: null', async () => {
    const findOneAndUpdate = jest
      .spyOn(Game, 'findOneAndUpdate')
      .mockResolvedValue({ _id: GAME_ID });

    const result = await videoRepository.attachGameVideo({
      gameId: GAME_ID,
      expectedGenerationId: null,
      video: VIDEO,
      now: 1_759_600_000_000,
    });

    expect(result).toEqual({ _id: GAME_ID });
    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: GAME_ID, video: null });
    expect(update).toEqual({
      $set: {
        video: {
          provider: 'mux',
          status: 'uploading',
          generationId: GENERATION_ID,
          version: 1_759_600_000_000,
          uploadId: null,
          assetId: null,
          playbackId: null,
          durationSeconds: null,
          errorMessage: null,
          uploadedByUserId: USER_ID,
          uploadStartedAt: NOW,
          readyAt: null,
          equivalentTimelines: [],
        },
      },
    });
    expect(update.$inc).toBeUndefined();
    expect(options).toEqual({ new: true, runValidators: true });
  });

  test('attachGameVideo replacing a video requires the expected generation in an allowed status', async () => {
    const findOneAndUpdate = jest.spyOn(Game, 'findOneAndUpdate').mockResolvedValue(null);

    const result = await videoRepository.attachGameVideo({
      gameId: GAME_ID,
      expectedGenerationId: 'old-generation',
      allowReplaceStatuses: ['ready', 'errored'],
      previousVersion: 1_759_600_000_500,
      video: { ...VIDEO, equivalentTimelines: ['youtube:dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ'] },
      now: 1_759_600_000_000,
    });

    expect(result).toBeNull();
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: GAME_ID,
      'video.generationId': 'old-generation',
      'video.status': { $in: ['ready', 'errored'] },
    });
    // Version stays unique across generations even when the clock is behind.
    expect(update.$set.video.version).toBe(1_759_600_000_501);
    expect(update.$set.video.equivalentTimelines).toEqual(['youtube:dQw4w9WgXcQ']);
  });

  test('attachGameVideo refuses a replace without allowed statuses, or a reused generation', async () => {
    const findOneAndUpdate = jest.spyOn(Game, 'findOneAndUpdate');
    await expect(
      videoRepository.attachGameVideo({
        gameId: GAME_ID,
        expectedGenerationId: 'old',
        video: VIDEO,
      })
    ).rejects.toThrow(/allowReplaceStatuses/);
    await expect(
      videoRepository.attachGameVideo({
        gameId: GAME_ID,
        expectedGenerationId: GENERATION_ID,
        allowReplaceStatuses: ['ready'],
        video: VIDEO,
      })
    ).rejects.toThrow(/generation/);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('updateGameVideo $sets only video.* paths, scoped by generation, identity and status', async () => {
    const findOneAndUpdate = jest
      .spyOn(Game, 'findOneAndUpdate')
      .mockResolvedValue({ _id: GAME_ID });

    await videoRepository.updateGameVideo({
      gameId: GAME_ID,
      generationId: GENERATION_ID,
      expectedStatuses: ['uploading', 'processing'],
      expectedUploadId: 'up-1',
      expectedAssetId: null,
      set: { status: 'processing', assetId: 'as-1' },
    });

    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: GAME_ID,
      'video.generationId': GENERATION_ID,
      'video.status': { $in: ['uploading', 'processing'] },
      'video.uploadId': 'up-1',
      'video.assetId': null,
    });
    expect(update).toEqual({
      $set: { 'video.status': 'processing', 'video.assetId': 'as-1' },
      $inc: { 'video.version': 1 },
      // Creates the list on a stored video that lacks it; no-op otherwise.
      $push: { 'video.equivalentTimelines': { $each: [] } },
    });
    expect(writtenPaths(update).every((path) => path.startsWith('video.'))).toBe(true);
    expect(options).toEqual({ new: true, runValidators: true });
  });

  test('updateGameVideo writes equivalentTimelines with $set when given (deduped)', async () => {
    const findOneAndUpdate = jest.spyOn(Game, 'findOneAndUpdate').mockResolvedValue(null);

    await expect(
      videoRepository.updateGameVideo({
        gameId: GAME_ID,
        generationId: GENERATION_ID,
        expectedStatuses: ['processing'],
        set: {
          status: 'ready',
          equivalentTimelines: ['youtube:a', 'mux:b', 'youtube:a'],
        },
      })
    ).resolves.toBeNull();

    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: GAME_ID,
      'video.generationId': GENERATION_ID,
      'video.status': { $in: ['processing'] },
    });
    expect(update).toEqual({
      $set: { 'video.status': 'ready', 'video.equivalentTimelines': ['youtube:a', 'mux:b'] },
      $inc: { 'video.version': 1 },
    });
  });

  test('updateGameVideo refuses immutable or unknown fields and empty expectations', async () => {
    const findOneAndUpdate = jest.spyOn(Game, 'findOneAndUpdate');
    for (const set of [{ generationId: 'x' }, { version: 3 }, { provider: 'mux' }, { foo: 1 }]) {
      await expect(
        videoRepository.updateGameVideo({
          gameId: GAME_ID,
          generationId: GENERATION_ID,
          expectedStatuses: ['ready'],
          set,
        })
      ).rejects.toThrow(/not writable/);
    }
    await expect(
      videoRepository.updateGameVideo({
        gameId: GAME_ID,
        generationId: GENERATION_ID,
        expectedStatuses: [],
        set: { status: 'ready' },
      })
    ).rejects.toThrow(/expectedStatuses/);
    await expect(
      videoRepository.updateGameVideo({
        gameId: GAME_ID,
        generationId: '',
        expectedStatuses: ['ready'],
        set: { status: 'ready' },
      })
    ).rejects.toThrow(/generationId/);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('detachGameVideo nulls video only for that generation and returns what was removed', async () => {
    const removed = { generationId: GENERATION_ID, uploadId: 'up-1', assetId: 'as-1' };
    const findOneAndUpdate = jest
      .spyOn(Game, 'findOneAndUpdate')
      .mockResolvedValueOnce({ _id: GAME_ID, video: removed })
      .mockResolvedValueOnce(null);

    await expect(
      videoRepository.detachGameVideo({ gameId: GAME_ID, generationId: GENERATION_ID })
    ).resolves.toEqual(removed);
    await expect(
      videoRepository.detachGameVideo({ gameId: GAME_ID, generationId: 'stale' })
    ).resolves.toBeNull();

    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: GAME_ID, 'video.generationId': GENERATION_ID });
    expect(update).toEqual({ $set: { video: null } });
    expect(options).toEqual({
      new: false,
      runValidators: true,
      projection: { video: 1 },
      lean: true,
    });
  });

  describe('cast update reaching the driver', () => {
    function stubDriver() {
      return jest.spyOn(Game.collection, 'findOneAndUpdate').mockResolvedValue(null);
    }

    test('attach persists the whole cast subdoc incl. equivalentTimelines, never __v', async () => {
      const driver = stubDriver();
      await videoRepository.attachGameVideo({
        gameId: GAME_ID,
        expectedGenerationId: null,
        video: VIDEO,
      });
      const [, update] = driver.mock.calls[0];
      expect(Array.isArray(update.$set.video.equivalentTimelines)).toBe(true);
      expect(update.$set.video.provider).toBe('mux');
      expect(writtenPaths(update)).not.toContain('__v');
      expect(update.$inc).toBeUndefined();
    });

    test('update never bumps __v and always touches equivalentTimelines', async () => {
      const driver = stubDriver();
      await videoRepository.updateGameVideo({
        gameId: GAME_ID,
        generationId: GENERATION_ID,
        expectedStatuses: ['processing'],
        set: { status: 'ready', durationSeconds: 90, readyAt: NOW },
      });
      const [, update] = driver.mock.calls[0];
      expect(update.$inc).toEqual({ 'video.version': 1 });
      expect(update.$push).toEqual({ 'video.equivalentTimelines': { $each: [] } });
      expect(writtenPaths(update)).not.toContain('__v');
    });

    test('runValidators rejects an invalid status on a conditional update', async () => {
      stubDriver();
      await expect(
        videoRepository.updateGameVideo({
          gameId: GAME_ID,
          generationId: GENERATION_ID,
          expectedStatuses: ['processing'],
          set: { status: 'deleted' },
        })
      ).rejects.toThrow(/video\.status/);
    });
  });
});

test('models are registered once under stable names', () => {
  expect(mongoose.model('VideoUploadAttempt')).toBe(VideoUploadAttempt);
  expect(mongoose.model('VideoCleanupJob')).toBe(VideoCleanupJob);
  expect(mongoose.model('VideoWebhookEvent')).toBe(VideoWebhookEvent);
  expect(mongoose.model('VideoQuotaCounter')).toBe(VideoQuotaCounter);
});

describe('isGameVideoGenerationReferenced (reconcile reference recheck, R3)', () => {
  test('is true only while the Game still carries that generation', async () => {
    const exists = jest
      .spyOn(Game, 'exists')
      .mockResolvedValueOnce({ _id: GAME_ID })
      .mockResolvedValueOnce(null);

    await expect(
      videoRepository.isGameVideoGenerationReferenced({
        gameId: GAME_ID,
        generationId: GENERATION_ID,
      })
    ).resolves.toBe(true);
    // Replaced, detached, or the game is gone.
    await expect(
      videoRepository.isGameVideoGenerationReferenced({
        gameId: GAME_ID,
        generationId: GENERATION_ID,
      })
    ).resolves.toBe(false);
    expect(exists).toHaveBeenCalledWith({ _id: GAME_ID, 'video.generationId': GENERATION_ID });
  });

  test('a failed database read propagates — never treated as "not referenced"', async () => {
    jest.spyOn(Game, 'exists').mockRejectedValue(new Error('connection lost'));
    await expect(
      videoRepository.isGameVideoGenerationReferenced({
        gameId: GAME_ID,
        generationId: GENERATION_ID,
      })
    ).rejects.toThrow('connection lost');
  });

  test('requires a generation id', async () => {
    const exists = jest.spyOn(Game, 'exists');
    await expect(
      videoRepository.isGameVideoGenerationReferenced({ gameId: GAME_ID, generationId: '' })
    ).rejects.toThrow(/generationId/);
    expect(exists).not.toHaveBeenCalled();
  });
});
