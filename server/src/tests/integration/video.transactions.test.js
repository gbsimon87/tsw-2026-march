// Opt-in real transaction tests. Use an isolated replica-set database with a
// name ending in _test: MUX_TRANSACTION_TEST_URI=... pnpm --filter server exec
// jest --runInBand video.transactions.test.js. Default suites need no new DB.
const mongoose = require('mongoose');
const { Game } = require('../../modules/games/games.repository');
const repo = require('../../modules/video/video.repository');
const uri = process.env.MUX_TRANSACTION_TEST_URI;
const suite = uri ? describe : describe.skip;
suite('video settlement on a real MongoDB replica set', () => {
  let attempt;
  let game;
  let resource;
  let asset;
  beforeAll(async () => {
    if (!new URL(uri).pathname.endsWith('_test'))
      throw new Error('Transaction test database must end in _test');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid')
      throw new Error('Transaction tests require a replica set');
    await Promise.all([Game.init(), repo.VideoUploadAttempt.init(), repo.VideoQuotaCounter.init()]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    resource = { type: 'league', id: String(new mongoose.Types.ObjectId()) };
    game = await Game.create({
      ownerUserId: new mongoose.Types.ObjectId(),
      title: 'Mux test',
      gameContext: 'league',
      leagueId: resource.id,
      trackingMode: 'dual_team',
    });
    await repo.reserveUploadSlot({
      resource,
      limits: { maxStoredMinutes: 600, maxConcurrentUploads: 1, maxCreatesPerDay: 3 },
      reservedMinutes: 180,
    });
    attempt = await repo.createUploadAttempt({
      gameId: game._id,
      billingResource: resource,
      createdBy: game.ownerUserId,
      reservedMinutes: 180,
    });
    attempt = await repo.setUploadAttemptUploadId({
      attemptId: attempt._id,
      uploadId: `upload-${attempt._id}`,
    });
    asset = {
      id: `asset-${attempt._id}`,
      duration: 95,
      playback_ids: [{ id: 'signed', policy: 'signed' }],
    };
    attempt = await repo.transitionUploadAttempt({
      attemptId: attempt._id,
      fromStatuses: ['uploading'],
      toStatus: 'processing',
      set: { assetId: asset.id },
    });
    await repo.attachGameVideo({
      gameId: game._id,
      video: {
        generationId: attempt.generationId,
        uploadId: attempt.uploadId,
        assetId: asset.id,
        status: 'processing',
      },
    });
  });
  afterEach(async () => {
    await Promise.all([
      Game.deleteOne({ _id: game._id }),
      repo.VideoUploadAttempt.deleteOne({ _id: attempt._id }),
      repo.VideoQuotaCounter.deleteOne({ resourceType: resource.type, resourceId: resource.id }),
    ]);
  });
  const counter = () => repo.VideoQuotaCounter.findOne({ resourceId: resource.id }).lean();
  test('ready commits the game, owning attempt and verified minutes together', async () => {
    await repo.settleReadyGameVideo({ attempt, asset });
    expect((await Game.findById(game._id)).video.status).toBe('ready');
    expect(await repo.findUploadAttemptById(attempt._id)).toMatchObject({
      status: 'ready',
      storedMinutes: 2,
    });
    expect(await counter()).toMatchObject({
      activeUploads: 0,
      reservedMinutes: 0,
      storedMinutes: 2,
    });
    expect(await repo.settleReadyGameVideo({ attempt, asset })).toBeNull();
    expect((await counter()).storedMinutes).toBe(2);
  });
  test('a failed quota write rolls back ready publication and attempt settlement', async () => {
    await repo.VideoQuotaCounter.deleteOne({ resourceId: resource.id });
    await expect(repo.settleReadyGameVideo({ attempt, asset })).rejects.toThrow(
      'quota counter missing'
    );
    expect((await Game.findById(game._id)).video.status).toBe('processing');
    expect(await repo.findUploadAttemptById(attempt._id)).toMatchObject({
      status: 'processing',
      storedMinutes: 0,
    });
  });
  test('a retired attempt rolls back the earlier game update', async () => {
    await repo.transitionUploadAttempt({
      attemptId: attempt._id,
      fromStatuses: ['processing'],
      toStatus: 'cancelled',
    });
    await expect(repo.settleReadyGameVideo({ attempt, asset })).rejects.toThrow('attempt changed');
    expect((await Game.findById(game._id)).video.status).toBe('processing');
    expect((await counter()).activeUploads).toBe(1);
  });
  test('a ready/error race has one consistent outcome and releases the slot once', async () => {
    await Promise.all([
      repo.settleReadyGameVideo({ attempt, asset }),
      repo.settleFailedGameVideo({ attempt, status: 'errored', reason: 'provider_upload_failed' }),
    ]);
    const current = await repo.findUploadAttemptById(attempt._id);
    const storedGame = await Game.findById(game._id);
    const quota = await counter();
    expect(quota.activeUploads).toBe(0);
    expect(quota.reservedMinutes).toBe(0);
    if (current.status === 'ready') {
      expect(storedGame.video.status).toBe('ready');
      expect(quota.storedMinutes).toBe(2);
    } else {
      expect(current.status).toBe('errored');
      expect(storedGame.video).toBeNull();
      expect(quota.storedMinutes).toBe(0);
    }
  });
  test('an error read before ready cannot later detach ready media', async () => {
    await repo.settleReadyGameVideo({ attempt, asset });
    expect(
      await repo.settleFailedGameVideo({ attempt, status: 'errored', reason: 'late_error' })
    ).toBeNull();
    expect((await Game.findById(game._id)).video.status).toBe('ready');
    expect((await counter()).storedMinutes).toBe(2);
  });
  test('proven deletion refunds stored minutes exactly once', async () => {
    await repo.settleReadyGameVideo({ attempt, asset });
    await repo.settleFailedGameVideo({
      attempt,
      status: 'cancelled',
      reason: 'asset_deleted',
      allowReady: true,
    });
    expect(
      await repo.settleFailedGameVideo({
        attempt,
        status: 'cancelled',
        reason: 'asset_deleted',
        allowReady: true,
      })
    ).toBeNull();
    expect((await counter()).storedMinutes).toBe(0);
    expect((await Game.findById(game._id)).video).toBeNull();
  });
  test('an unrelated tracking save loaded before ready preserves provider fields', async () => {
    const stale = await Game.findById(game._id);
    await repo.settleReadyGameVideo({ attempt, asset });
    stale.title = 'Corrected title';
    await stale.save();
    expect((await Game.findById(game._id)).video.status).toBe('ready');
  });
});
