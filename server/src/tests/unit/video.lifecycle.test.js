jest.mock('../../config/logger', () => ({ logger: require('pino')({ level: 'silent' }) }));
jest.mock('../../modules/video/video.repository');
jest.mock('../../modules/video/video.cleanup', () => ({
  kickCleanup: jest.fn(),
  verifyMuxEnvironment: jest.fn(async () => ({ verified: true })),
}));
jest.mock('../../modules/games/games.repository', () => ({ findGameById: jest.fn() }));
jest.mock('../../modules/feed/feed.service', () => ({ autoPublishForFinalizedGame: jest.fn() }));
jest.mock('../../modules/video/mux.client', () => ({
  isMuxConfigured: jest.fn(() => true),
  getDirectUpload: jest.fn(),
  getAsset: jest.fn(),
  MuxApiError: jest.requireActual('../../modules/video/mux.client').MuxApiError,
}));
const repo = require('../../modules/video/video.repository');
const mux = require('../../modules/video/mux.client');
const { env } = require('../../config/env');
const { findGameById } = require('../../modules/games/games.repository');
const { autoPublishForFinalizedGame } = require('../../modules/feed/feed.service');
const {
  handleMuxWebhookEvent,
  reconcileVideoLifecycle,
} = require('../../modules/video/video.lifecycle');
const GAME = '64b7f0c2a1b2c3d4e5f60718';
const attempt = {
  _id: '64b7f0c2a1b2c3d4e5f60719',
  gameId: GAME,
  generationId: 'generation',
  uploadId: 'upload',
  deployment: 'test',
  status: 'uploading',
  reservedMinutes: 180,
};
const asset = {
  id: 'asset',
  upload_id: 'upload',
  duration: 100,
  resolution_tier: '1080p',
  playback_ids: [{ id: 'playback', policy: 'signed' }],
};
const ready = (data = {}) => ({
  id: 'event',
  type: 'video.asset.ready',
  data: { ...asset, ...data },
});
const oldAutoFeed = env.AUTO_FEED_ENABLED;
beforeEach(() => {
  jest.clearAllMocks();
  env.AUTO_FEED_ENABLED = false;
  repo.getVideoDeployment.mockReturnValue('test');
  repo.hasProcessedWebhookEvent.mockResolvedValue(false);
  repo.findUploadAttemptByUploadId.mockResolvedValue({ ...attempt });
  repo.findUploadAttemptByAssetId.mockResolvedValue({ ...attempt, assetId: 'asset' });
  repo.transitionUploadAttempt.mockImplementation(async ({ toStatus, set = {} }) => ({
    ...attempt,
    ...set,
    status: toStatus,
  }));
  repo.settleReadyGameVideo.mockResolvedValue({ _id: GAME, video: { status: 'ready' } });
  repo.settleFailedGameVideo.mockResolvedValue(attempt);
  repo.updateGameVideo.mockResolvedValue({ _id: GAME });
  repo.findUploadAttemptById.mockResolvedValue({ ...attempt, assetId: 'asset' });
  repo.listStaleUploadAttempts.mockResolvedValue([]);
});
afterAll(() => {
  env.AUTO_FEED_ENABLED = oldAutoFeed;
});

test('ready-before-created records ownership, settles atomically, then marks completion', async () => {
  await expect(handleMuxWebhookEvent(ready())).resolves.toMatchObject({ reason: 'ready' });
  expect(repo.transitionUploadAttempt).toHaveBeenCalledWith(
    expect.objectContaining({ expectedAssetId: null, set: { assetId: 'asset' } })
  );
  expect(repo.settleReadyGameVideo).toHaveBeenCalledWith(
    expect.objectContaining({ asset, attempt: expect.objectContaining({ assetId: 'asset' }) })
  );
  expect(repo.recordWebhookEventOnce.mock.invocationCallOrder[0]).toBeGreaterThan(
    repo.settleReadyGameVideo.mock.invocationCallOrder[0]
  );
});
test('failed settlement is retriable and never marked completed', async () => {
  repo.settleReadyGameVideo.mockRejectedValue(new Error('db unavailable'));
  await expect(handleMuxWebhookEvent(ready())).rejects.toThrow('db unavailable');
  expect(repo.recordWebhookEventOnce).not.toHaveBeenCalled();
});
test('duplicate completed event has no further side effects', async () => {
  repo.hasProcessedWebhookEvent.mockResolvedValue(true);
  expect(await handleMuxWebhookEvent(ready())).toMatchObject({ reason: 'duplicate' });
  expect(repo.findUploadAttemptByUploadId).not.toHaveBeenCalled();
});
test('unsupported types are allowlisted before payload or ownership reads', async () => {
  expect(await handleMuxWebhookEvent({ type: 'video.asset.track.ready' })).toMatchObject({
    reason: 'unsupported_event',
  });
  expect(repo.findUploadAttemptByUploadId).not.toHaveBeenCalled();
});
test.each([
  ['unknown upload', null],
  ['another deployment', { ...attempt, deployment: 'production' }],
  ['different asset', { ...attempt, assetId: 'old-asset' }],
])('%s never deletes or publishes provider media', async (_label, owner) => {
  repo.findUploadAttemptByUploadId.mockResolvedValue(owner);
  expect(await handleMuxWebhookEvent(ready())).toMatchObject({ reason: 'ownership_not_proven' });
  expect(repo.enqueueCleanupJob).not.toHaveBeenCalled();
  expect(repo.settleReadyGameVideo).not.toHaveBeenCalled();
});
test('passthrough alone never proves ownership', async () => {
  repo.findUploadAttemptByUploadId.mockResolvedValue(null);
  await handleMuxWebhookEvent(ready({ passthrough: GAME }));
  expect(repo.enqueueCleanupJob).not.toHaveBeenCalled();
});
test('late ready on a cancelled attempt queues durable deletion without resurrection', async () => {
  repo.findUploadAttemptByUploadId.mockResolvedValue({
    ...attempt,
    status: 'cancelled',
    assetId: 'asset',
  });
  expect(await handleMuxWebhookEvent(ready())).toMatchObject({ reason: 'late_asset' });
  expect(repo.enqueueCleanupJob).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'delete_asset', targetId: 'asset' })
  );
  expect(repo.settleReadyGameVideo).not.toHaveBeenCalled();
});
test('late error after ready cannot detach ready video', async () => {
  repo.findUploadAttemptByUploadId.mockResolvedValue({
    ...attempt,
    status: 'ready',
    assetId: 'asset',
  });
  await handleMuxWebhookEvent({ ...ready(), type: 'video.asset.errored' });
  expect(repo.settleFailedGameVideo).not.toHaveBeenCalled();
});
test('error racing ready uses a conditional settlement and does not report a discard', async () => {
  repo.settleFailedGameVideo.mockResolvedValue(null);
  expect(await handleMuxWebhookEvent({ ...ready(), type: 'video.asset.errored' })).toMatchObject({
    reason: 'stale_event',
  });
  expect(repo.settleFailedGameVideo).toHaveBeenCalledWith(
    expect.objectContaining({ allowReady: false })
  );
});
test.each([
  ['duration_limit', { duration: 10801 }],
  ['invalid_duration', { duration: 0 }],
  ['unverified_resolution', { resolution_tier: undefined }],
  ['resolution_limit', { resolution_tier: '2160p' }],
  ['missing_signed_playback', { playback_ids: [] }],
  [
    'public_playback',
    { playback_ids: [...asset.playback_ids, { id: 'public', policy: 'public' }] },
  ],
])(
  'verified ingest rejects %s before publication and enqueues before settlement',
  async (reason, data) => {
    expect(await handleMuxWebhookEvent(ready(data))).toMatchObject({ reason });
    expect(repo.settleReadyGameVideo).not.toHaveBeenCalled();
    expect(repo.enqueueCleanupJob.mock.invocationCallOrder[0]).toBeLessThan(
      repo.settleFailedGameVideo.mock.invocationCallOrder[0]
    );
  }
);
test('deleted events resolve ownership by asset without upload_id', async () => {
  await handleMuxWebhookEvent({
    id: 'deleted-event',
    type: 'video.asset.deleted',
    data: { id: 'asset' },
  });
  expect(repo.findUploadAttemptByAssetId).toHaveBeenCalledWith('asset');
  expect(repo.settleFailedGameVideo).toHaveBeenCalledWith(
    expect.objectContaining({ allowReady: true, status: 'cancelled' })
  );
});
test('same-recording upload carries only its server-recorded timeline', async () => {
  repo.findUploadAttemptByUploadId.mockResolvedValue({
    ...attempt,
    assetId: 'asset',
    sameRecording: true,
    previousTimelineId: 'youtube:abcdef',
  });
  await handleMuxWebhookEvent(ready());
  expect(repo.settleReadyGameVideo).toHaveBeenCalledWith(
    expect.objectContaining({ equivalentTimelines: ['youtube:abcdef'] })
  );
});
test('same-recording upload carries the whole recorded equivalence chain (V8)', async () => {
  repo.findUploadAttemptByUploadId.mockResolvedValue({
    ...attempt,
    assetId: 'asset',
    sameRecording: true,
    previousTimelineId: 'mux:gen-1',
    previousTimelineIds: ['mux:gen-1', 'youtube:abcdef'],
  });
  await handleMuxWebhookEvent(ready());
  expect(repo.settleReadyGameVideo).toHaveBeenCalledWith(
    expect.objectContaining({ equivalentTimelines: ['mux:gen-1', 'youtube:abcdef'] })
  );
});
test('late upload publication failure retries without marking webhook completion', async () => {
  env.AUTO_FEED_ENABLED = true;
  autoPublishForFinalizedGame
    .mockRejectedValueOnce(new Error('feed db failed'))
    .mockResolvedValueOnce();
  await expect(handleMuxWebhookEvent(ready())).rejects.toThrow('feed db failed');
  expect(repo.recordWebhookEventOnce).not.toHaveBeenCalled();
  repo.settleReadyGameVideo.mockResolvedValue(null);
  repo.findUploadAttemptById.mockResolvedValue({ ...attempt, status: 'ready', assetId: 'asset' });
  findGameById.mockResolvedValue({
    video: { generationId: attempt.generationId, assetId: 'asset', status: 'ready' },
  });
  await handleMuxWebhookEvent(ready());
  expect(autoPublishForFinalizedGame).toHaveBeenCalledTimes(2);
});
test('missed ready webhook is recovered for an attached processing upload', async () => {
  repo.listStaleUploadAttempts.mockResolvedValue([
    { ...attempt, status: 'processing', assetId: 'asset' },
  ]);
  mux.getAsset.mockResolvedValue({ ...asset, status: 'ready' });
  expect(await reconcileVideoLifecycle()).toMatchObject({ recovered: 1, errors: 0 });
  expect(repo.settleReadyGameVideo).toHaveBeenCalled();
  expect(repo.recordWebhookEventOnce).not.toHaveBeenCalled();
});
test('recovery dry-run makes no provider calls or writes', async () => {
  repo.listStaleUploadAttempts.mockResolvedValue([attempt]);
  await reconcileVideoLifecycle({ dryRun: true });
  expect(mux.getAsset).not.toHaveBeenCalled();
  expect(mux.getDirectUpload).not.toHaveBeenCalled();
  expect(repo.transitionUploadAttempt).not.toHaveBeenCalled();
});
// V6: a 404 from the wrong Mux environment must not discard real attempts.
test('recovery does nothing while the Mux environment is unverified', async () => {
  const { verifyMuxEnvironment } = require('../../modules/video/video.cleanup');
  verifyMuxEnvironment.mockResolvedValueOnce({ verified: false });
  repo.listStaleUploadAttempts.mockResolvedValue([attempt]);

  expect(await reconcileVideoLifecycle()).toMatchObject({
    skipped: 'mux_environment_unverified',
    recovered: 0,
  });
  expect(mux.getDirectUpload).not.toHaveBeenCalled();
  expect(repo.settleFailedGameVideo).not.toHaveBeenCalled();
});
test('recovery refuses mismatched provider identity', async () => {
  repo.listStaleUploadAttempts.mockResolvedValue([attempt]);
  mux.getDirectUpload.mockResolvedValue({ id: 'someone-elses-upload', asset_id: 'asset' });
  expect(await reconcileVideoLifecycle()).toMatchObject({ errors: 1, recovered: 0 });
  expect(repo.settleReadyGameVideo).not.toHaveBeenCalled();
  expect(repo.enqueueCleanupJob).not.toHaveBeenCalled();
});
