const { ApiError } = require('../../utils/apiError');
const { findGameById } = require('../games/games.repository');
const {
  getGameVideoProvider,
  buildClipWindow,
  isEventOnCurrentTimeline,
} = require('../shared/gameVideo');
const { resolveFullGamePlaybackAccess, resolveClipPlaybackAccess } = require('./video.policy');
const { signPlaybackToken, MUX_AUDIENCE } = require('./mux.tokens');
const { isMuxConfigured } = require('./mux.client');

const FULL_GAME_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const CLIP_TOKEN_TTL_SECONDS = 60 * 60;

async function getGameVideoPlayback({ userId = null, gameId, eventId = null, now = Date.now() }) {
  const game = await findGameById(gameId);
  const access = eventId
    ? await resolveClipPlaybackAccess({ userId, game, eventId })
    : await resolveFullGamePlaybackAccess({ userId, game });
  if (!access.allowed)
    throw new ApiError(access.status, access.status === 401 ? 'Unauthorized' : 'Video unavailable');
  const provider = getGameVideoProvider(game);
  if (!provider) throw new ApiError(404, 'Video unavailable');
  const event = eventId ? game.events.find((ev) => String(ev._id) === String(eventId)) : null;
  const clip =
    eventId && event && isEventOnCurrentTimeline(game, event)
      ? buildClipWindow(
          event.videoTimestamp,
          provider === 'mux' ? game.video.durationSeconds : null
        )
      : null;
  if (eventId && !clip) throw new ApiError(422, 'Video unavailable');
  if (provider === 'youtube')
    return { provider, videoUrl: game.videoUrl, ...(clip ? { clip } : {}) };
  if (!isMuxConfigured()) throw new ApiError(404, 'Video unavailable');
  const ttlSeconds = clip ? CLIP_TOKEN_TTL_SECONDS : FULL_GAME_TOKEN_TTL_SECONDS;
  const playbackId = game.video.playbackId;
  const sign = (audience, claims = {}) =>
    signPlaybackToken({ playbackId, audience, ttlSeconds, claims, now });
  return {
    provider,
    playbackId,
    clip,
    expiresAt: new Date((Math.floor(now / 1000) + ttlSeconds) * 1000).toISOString(),
    // V21: lets clients time renewal from receipt, immune to device clock skew.
    expiresInSeconds: ttlSeconds,
    tokens: {
      playback: sign(
        MUX_AUDIENCE.video,
        clip ? { asset_start_time: clip.startSeconds, asset_end_time: clip.endSeconds } : {}
      ),
      thumbnail: sign(MUX_AUDIENCE.thumbnail, clip ? { time: event.videoTimestamp } : {}),
      storyboard: clip ? null : sign(MUX_AUDIENCE.storyboard),
    },
  };
}
module.exports = { getGameVideoPlayback, FULL_GAME_TOKEN_TTL_SECONDS, CLIP_TOKEN_TTL_SECONDS };
