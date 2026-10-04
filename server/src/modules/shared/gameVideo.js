// Mux game video (docs/media-provider-analysis.md §6; plan
// docs/superpowers/plans/2026-10-04-mux-game-video.md, Task 2 + rulings P6/E1).
// The single source of truth for "which video does this game play" and "which
// recording does this event's videoTimestamp belong to".
//
// Provider rule: a READY Mux asset with a signed playback id and a verified,
// finite, positive duration wins over a YouTube link, so a league can upload
// over a game it previously linked. Anything less falls back to YouTube.
//
// Timeline rule (P6): every event timestamp is bound to the recording it was
// taken against — `mux:<generationId>` or `youtube:<videoId>`. A highlight is
// playable only while its timeline is the current one, or one the current Mux
// video was declared equivalent to ("same recording"). Replacing a video never
// silently re-points old timestamps at a different recording.
const crypto = require('crypto');
const { extractYouTubeVideoId } = require('./youtube');

const GAME_VIDEO_STATUSES = ['uploading', 'processing', 'ready', 'errored'];
const HIGHLIGHT_CLIP_BUFFER_SECONDS = 5;

// One per upload attempt. Scopes every conditional video.* write (E1) and
// names the Mux timeline. Server-only: never serialised to clients.
function createGameVideoGenerationId() {
  return crypto.randomBytes(16).toString('hex');
}

// `video.version` is the non-secret value clients key playback queries on
// (R6). A new generation starts here; every later conditional write within the
// generation does `$inc: { 'video.version': 1 }`. Seeding from the clock keeps
// it unique across generations even after `video` was removed (null) and the
// previous value is gone, so a client never reuses a stale cached token.
function nextGameVideoVersion(previousVersion, now = Date.now()) {
  const floor = Number.isInteger(previousVersion) ? previousVersion + 1 : 0;
  return Math.max(Math.trunc(now), floor);
}

function isPlayableMuxVideo(video) {
  return (
    video?.provider === 'mux' &&
    video.status === 'ready' &&
    Boolean(video.playbackId) &&
    Number.isFinite(video.durationSeconds) &&
    video.durationSeconds > 0
  );
}

// → 'mux' | 'youtube' | null
function getGameVideoProvider(game) {
  if (isPlayableMuxVideo(game?.video)) return 'mux';
  if (game?.videoUrl) return 'youtube';
  return null;
}

function hasGameVideo(game) {
  return getGameVideoProvider(game) !== null;
}

// Client-safe projection. Status plus the non-secret version only — Mux
// upload/asset/playback ids and the generation id never leave the server;
// clients get playback through the token endpoint.
// → { provider, status, durationSeconds, errorMessage, version } | null
function sanitizeGameVideo(video, { includePremiumMedia = true } = {}) {
  if (!video || !includePremiumMedia) return null;
  return {
    provider: video.provider,
    status: video.status,
    durationSeconds: video.durationSeconds ?? null,
    errorMessage: video.errorMessage ?? null,
    version: video.version ?? null,
  };
}

// → { startSeconds, endSeconds } | null
function buildClipWindow(videoTimestamp, durationSeconds) {
  if (!Number.isFinite(videoTimestamp) || videoTimestamp < 0) return null;
  const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
  if (hasDuration && videoTimestamp > durationSeconds) return null;
  const startSeconds = Math.max(0, videoTimestamp - HIGHLIGHT_CLIP_BUFFER_SECONDS);
  const paddedEnd = videoTimestamp + HIGHLIGHT_CLIP_BUFFER_SECONDS;
  const endSeconds = hasDuration ? Math.min(durationSeconds, paddedEnd) : paddedEnd;
  return endSeconds > startSeconds ? { startSeconds, endSeconds } : null;
}

function youTubeTimelineId(videoUrl) {
  const videoId = extractYouTubeVideoId(videoUrl);
  return videoId ? `youtube:${videoId}` : null;
}

// The timeline a timestamp captured right now belongs to. Stamped onto events
// by games.service on append/update; never accepted from a client.
// → 'mux:<generationId>' | 'youtube:<videoId>' | null
function getCurrentVideoTimelineId(game) {
  const provider = getGameVideoProvider(game);
  if (provider === 'mux') {
    return game.video.generationId ? `mux:${game.video.generationId}` : null;
  }
  if (provider === 'youtube') return youTubeTimelineId(game.videoUrl);
  return null;
}

// Every timeline whose timestamps play on the current video: the current one
// first, then (for a playable Mux video only) the timelines it was declared
// the same recording as. A transitive "same recording" replacement should
// copy this whole list onto the new generation's equivalentTimelines.
// → string[]
function getCurrentTimelineIds(game) {
  const current = getCurrentVideoTimelineId(game);
  if (!current) return [];
  const ids = [current];
  if (current.startsWith('mux:')) {
    for (const id of game.video.equivalentTimelines || []) {
      if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

// An event's own binding, or — for events written before bindings existed —
// the current YouTube link's timeline, which is what those timestamps were
// always played against. No timestamp, no timeline.
// → string | null
function resolveEventTimelineId(game, event) {
  if (typeof event?.videoTimestamp !== 'number') return null;
  if (typeof event.videoTimelineId === 'string' && event.videoTimelineId) {
    return event.videoTimelineId;
  }
  return game?.videoUrl ? youTubeTimelineId(game.videoUrl) : null;
}

function isEventOnCurrentTimeline(game, event) {
  const eventTimelineId = resolveEventTimelineId(game, event);
  return Boolean(eventTimelineId) && getCurrentTimelineIds(game).includes(eventTimelineId);
}

// Per-event highlight playback fields. When the event's timestamp belongs to
// the current (or an equivalent) recording it plays on the current provider;
// otherwise the highlight is unavailable ("Video unavailable").
// → { videoAvailable: true, videoProvider: 'mux', videoUrl: null }
//   | { videoAvailable: true, videoProvider: 'youtube', videoUrl: string }
//   | { videoAvailable: false, videoProvider: null, videoUrl: null }
function buildHighlightVideoFields(game, event) {
  if (!isEventOnCurrentTimeline(game, event)) {
    return { videoAvailable: false, videoProvider: null, videoUrl: null };
  }
  const videoProvider = getGameVideoProvider(game);
  return {
    videoAvailable: true,
    videoProvider,
    videoUrl: videoProvider === 'youtube' ? game.videoUrl : null,
  };
}

module.exports = {
  GAME_VIDEO_STATUSES,
  HIGHLIGHT_CLIP_BUFFER_SECONDS,
  createGameVideoGenerationId,
  nextGameVideoVersion,
  getGameVideoProvider,
  hasGameVideo,
  sanitizeGameVideo,
  buildClipWindow,
  getCurrentVideoTimelineId,
  getCurrentTimelineIds,
  resolveEventTimelineId,
  isEventOnCurrentTimeline,
  buildHighlightVideoFields,
};
