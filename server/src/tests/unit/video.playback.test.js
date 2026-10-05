jest.mock('../../modules/games/games.repository', () => ({ findGameById: jest.fn() }));
jest.mock('../../modules/video/video.policy', () => ({
  resolveFullGamePlaybackAccess: jest.fn(),
  resolveClipPlaybackAccess: jest.fn(),
}));
jest.mock('../../modules/video/mux.client', () => ({ isMuxConfigured: jest.fn(() => true) }));
jest.mock('../../modules/video/mux.tokens', () => ({
  MUX_AUDIENCE: { video: 'v', thumbnail: 't', storyboard: 's' },
  signPlaybackToken: jest.fn(({ audience }) => `token-${audience}`),
}));
const { findGameById } = require('../../modules/games/games.repository');
const policy = require('../../modules/video/video.policy');
const { signPlaybackToken } = require('../../modules/video/mux.tokens');
const { getGameVideoPlayback } = require('../../modules/video/video.playback');
const NOW = Date.parse('2026-10-05T12:00:00Z');
const EVENT = '64b7f0c2a1b2c3d4e5f60719';
const game = () => ({
  _id: '64b7f0c2a1b2c3d4e5f60718',
  video: {
    provider: 'mux',
    status: 'ready',
    playbackId: 'playback',
    durationSeconds: 500,
    generationId: 'generation',
  },
  events: [{ _id: EVENT, videoTimestamp: 100, videoTimelineId: 'mux:generation' }],
});
const get = (options = {}) =>
  getGameVideoPlayback({ gameId: game()._id, userId: 'manager', now: NOW, ...options });
beforeEach(() => {
  jest.clearAllMocks();
  findGameById.mockResolvedValue(game());
  policy.resolveFullGamePlaybackAccess.mockResolvedValue({ allowed: true });
  policy.resolveClipPlaybackAccess.mockResolvedValue({ allowed: true });
});
test.each([401, 404, 403])('full-game policy denial %s happens before signing', async (status) => {
  policy.resolveFullGamePlaybackAccess.mockResolvedValue({ allowed: false, status });
  await expect(get()).rejects.toMatchObject({ statusCode: status });
  expect(signPlaybackToken).not.toHaveBeenCalled();
});
test('full-game playback gets distinct audiences and a 12-hour expiry', async () => {
  const result = await get();
  expect(result).toEqual({
    provider: 'mux',
    playbackId: 'playback',
    clip: null,
    expiresAt: '2026-10-06T00:00:00.000Z',
    // V21: clients time renewal from receipt, not their own (possibly skewed) clock.
    expiresInSeconds: 43200,
    tokens: { playback: 'token-v', thumbnail: 'token-t', storyboard: 'token-s' },
  });
  expect(signPlaybackToken).toHaveBeenCalledWith(
    expect.objectContaining({ audience: 'v', ttlSeconds: 43200, claims: {} })
  );
});
test('clip signing bounds the HLS window, fixes the thumbnail frame and omits full-game storyboards', async () => {
  const result = await get({ eventId: EVENT, userId: null });
  expect(result).toMatchObject({
    clip: { startSeconds: 95, endSeconds: 105 },
    expiresAt: '2026-10-05T13:00:00.000Z',
    expiresInSeconds: 3600,
    tokens: { storyboard: null },
  });
  expect(signPlaybackToken).toHaveBeenCalledWith(
    expect.objectContaining({
      audience: 'v',
      claims: { asset_start_time: 95, asset_end_time: 105 },
      ttlSeconds: 3600,
    })
  );
  expect(signPlaybackToken).toHaveBeenCalledWith(
    expect.objectContaining({ audience: 't', claims: { time: 100 } })
  );
  expect(policy.resolveClipPlaybackAccess).toHaveBeenCalledWith(
    expect.objectContaining({ userId: null, eventId: EVENT })
  );
});
test.each([
  { videoTimestamp: 501 },
  { videoTimestamp: -1 },
  { videoTimestamp: NaN },
  { videoTimelineId: 'mux:older-recording' },
  { videoTimestamp: null },
])('unplayable timestamp/timeline returns 422 without tokens: %j', async (patch) => {
  const g = game();
  Object.assign(g.events[0], patch);
  findGameById.mockResolvedValue(g);
  await expect(get({ eventId: EVENT })).rejects.toMatchObject({ statusCode: 422 });
  expect(signPlaybackToken).not.toHaveBeenCalled();
});
test('clip policy denial cannot fall through to full-game access', async () => {
  policy.resolveClipPlaybackAccess.mockResolvedValue({ allowed: false, status: 401 });
  await expect(get({ eventId: EVENT, userId: null })).rejects.toMatchObject({ statusCode: 401 });
  expect(policy.resolveFullGamePlaybackAccess).not.toHaveBeenCalled();
  expect(signPlaybackToken).not.toHaveBeenCalled();
});
test('in-progress video returns unavailable', async () => {
  const g = game();
  g.video.status = 'processing';
  findGameById.mockResolvedValue(g);
  await expect(get()).rejects.toMatchObject({ statusCode: 404 });
});
test('YouTube full-game fallback remains available to an authorized viewer', async () => {
  findGameById.mockResolvedValue({
    ...game(),
    video: null,
    videoUrl: 'https://youtu.be/abcdef12345',
  });
  expect(await get()).toEqual({ provider: 'youtube', videoUrl: 'https://youtu.be/abcdef12345' });
  expect(signPlaybackToken).not.toHaveBeenCalled();
});
