const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const {
  createPost,
  listPosts,
  findPostById,
  deletePostById,
  deleteAutoPostsForGameIds,
  findAutoGameCardPost,
  findPostByHighlightEventId,
  findSharedEventIds,
  updatePostCardSnapshot,
  listGameCardPostsByGameId,
} = require('./feed.repository');
const {
  createGameCardPostSchema,
  createPlayerCardPostSchema,
  createTeamCardPostSchema,
  createHighlightClipPostSchema,
} = require('./feed.validation');
const {
  uploadImageBuffer,
  destroyImage,
  isCloudinaryConfigured,
  uploadVideoBuffer,
  destroyVideo,
} = require('./cloudinary.client');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');
const { transformCloudinaryUrl } = require('../shared/cloudinaryUrl');
const { findUserById, findUsersByIds } = require('../auth/auth.repository');
const { getSystemUserId } = require('../auth/auth.service');
const {
  findGameById,
  listCompletedGames,
  listLeagueGamesByLeagueId,
  listLeagueGameIdsByLeagueId,
} = require('../games/games.repository');
const { getPublicGame, canAccessGame, HIGHLIGHT_STAT_TYPES } = require('../games/games.service');
const {
  findLeaguePlayerById,
  findLeagueTeamById,
  listLeagueTeams,
  listLeaguePlayers,
} = require('../leagues/leagues.repository');
const {
  listPublicLeagues,
  isLeaguePublic,
  getPublicLeagueTeamById,
  getPublicLeaguePlayerById,
} = require('../leagues/leagues.service');
const { listTeams } = require('../teams/teams.repository');
const { getPublicPlayer, getPublicTeam } = require('../teams/teams.service');

function cloudinaryThumbnailUrl(publicId, resourceType) {
  if (!publicId || resourceType !== 'video') return null;
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return null;
  // Generate a JPEG thumbnail at the first second of the video.
  // f_auto lets Cloudinary serve WebP/AVIF to capable browsers (OPT-002 #4).
  return `https://res.cloudinary.com/${cloudName}/video/upload/so_1,f_auto,q_auto/${publicId}.jpg`;
}

// OPT-009: on-the-fly optimised video delivery. With eager_async the eager MP4
// may not exist yet at upload time, so we deliver the source through Cloudinary's
// f_auto,q_auto,vc_auto pipeline — it transcodes on first request and serves the
// best codec/quality for the client, and keeps working before AND after the eager
// MP4 lands. Falls back to the raw secure_url if the cloud name is unavailable.
function cloudinaryVideoPlaybackUrl(publicId, fallbackUrl) {
  if (!publicId) return fallbackUrl ?? null;
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return fallbackUrl ?? null;
  return `https://res.cloudinary.com/${cloudName}/video/upload/f_auto,q_auto,vc_auto/${publicId}.mp4`;
}

// OPT-009: await Cloudinary destroys and log failures instead of firing and
// forgetting (which silently leaked assets → quota creep). Returns true on
// success, false on failure — callers decide whether a failure is fatal.
async function destroyCloudinaryAsset(kind, publicId) {
  if (!publicId) return true;
  const destroy = kind === 'video' ? destroyVideo : destroyImage;
  try {
    const result = await destroy(publicId);
    if (result && result.result && result.result !== 'ok' && result.result !== 'not found') {
      logger.warn(
        { kind, publicId, result: result.result },
        'Cloudinary destroy did not return ok'
      );
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ err: error, kind, publicId }, 'Cloudinary destroy failed');
    return false;
  }
}

function sanitizeCaption(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function ensureObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
}

function isPubliclyViewableGame(game) {
  const now = Date.now();
  const scheduledTime = game.scheduledAt ? new Date(game.scheduledAt).getTime() : null;
  const isFuture =
    typeof scheduledTime === 'number' && !Number.isNaN(scheduledTime) && scheduledTime > now;

  return !isFuture;
}

function matchesQuery(text, query) {
  if (!query) {
    return true;
  }

  return String(text || '')
    .toLowerCase()
    .includes(query.toLowerCase());
}

async function resolveImagePayload(post) {
  return {
    image: {
      url: transformCloudinaryUrl(post.image.url),
      width: post.image.width ?? null,
      height: post.image.height ?? null,
    },
    video: null,
    gameCard: null,
    playerCard: null,
    teamCard: null,
  };
}

async function resolveVideoPayload(post) {
  return {
    image: null,
    video: {
      url: transformCloudinaryUrl(post.video.url),
      thumbnailUrl: transformCloudinaryUrl(post.video.thumbnailUrl ?? null),
      width: post.video.width ?? null,
      height: post.video.height ?? null,
      duration: post.video.duration ?? null,
    },
    gameCard: null,
    playerCard: null,
    teamCard: null,
  };
}

// OPT-017: pure builders for each card's denormalised display shape, given the
// full public-pipeline payload. Called both at post-creation time (to snapshot
// into the Post doc) and as the live-compute fallback when a snapshot is
// missing/stale — one source of truth for the shape either way.
function buildGameCardSnapshot(payload) {
  const isDualTeam = payload.game.trackingMode === 'dual_team';
  return {
    gameId: payload.game.id,
    gameUrl: `/games/${payload.game.id}`,
    teamId: payload.team?.id ?? null,
    teamName: isDualTeam
      ? `${payload.participants?.home?.displayName || 'Home'} vs ${payload.participants?.away?.displayName || 'Away'}`
      : (payload.team?.name ?? null),
    teamLogo: isDualTeam
      ? (payload.participants?.home?.logo ?? null)
      : (payload.team?.logo ?? null),
    teamColors: payload.team?.colors ?? [],
    opponent: isDualTeam ? null : payload.game.opponent,
    participants: isDualTeam ? payload.participants : null,
    // TSW-004: this was missing entirely — FullScreenGameCard/GameCardPost
    // read every score/stat field from gameCard.recap.*, so omitting it made
    // every persisted snapshot render 0-0 once a post used this cached path
    // instead of the live getPublicGame() pipeline (which already includes
    // recap). payload IS a getPublicGame() result, so this is already computed.
    recap: payload.recap,
  };
}

function buildPlayerCardSnapshot(payload) {
  // TSW-005: league payloads (getPublicLeaguePlayerById) use sanitizeLeaguePlayer's
  // shape — no `image` field, avatarUrl instead — while standalone payloads
  // (getPublicPlayer) use `image`. Normalise here so both feed the same snapshot shape.
  const isLeaguePlayer = Boolean(payload.player.leagueTeamId);
  const playerImage = (isLeaguePlayer ? payload.player.avatarUrl : payload.player.image) ?? null;
  const teamLogo = payload.team.logo ?? null;
  const imageFallback = playerImage ? 'player' : teamLogo ? 'team_logo' : 'placeholder';

  return {
    teamId: isLeaguePlayer ? null : payload.team.id,
    leagueTeamId: isLeaguePlayer ? payload.team.id : null,
    teamName: payload.team.name,
    playerId: isLeaguePlayer ? null : payload.player.id,
    leaguePlayerId: isLeaguePlayer ? payload.player.id : null,
    playerName: payload.player.displayName,
    jerseyNumber: payload.player.jerseyNumber ?? null,
    playerImage,
    teamLogo,
    teamColors: payload.team.colors ?? [],
    imageFallback,
    summary: {
      gamesCount: payload.summary.gamesCount,
      pointsPerGame: payload.summary.pointsPerGame,
      reboundsPerGame: payload.summary.reboundsPerGame,
      assistsPerGame: payload.summary.assistsPerGame,
    },
    playerUrl: isLeaguePlayer ? null : `/teams/${payload.team.id}/players/${payload.player.id}`,
  };
}

function buildTeamCardSnapshot(payload) {
  // TSW-005: sanitizeLeagueTeam's output has a leagueId field; standalone
  // getPublicTeam's team shape doesn't — used as the discriminator here.
  const isLeagueTeam = Boolean(payload.team.leagueId);

  return {
    teamId: isLeagueTeam ? null : payload.team.id,
    leagueTeamId: isLeagueTeam ? payload.team.id : null,
    teamName: payload.team.name,
    teamLogo: payload.team.logo ?? null,
    teamColors: payload.team.colors ?? [],
    summary: {
      gamesCount: payload.summary.gamesCount,
      points: payload.summary.points,
      fg2: payload.summary.fg2,
      fg3: payload.summary.fg3,
      ft: payload.summary.ft,
    },
    teamUrl: isLeagueTeam ? null : `/teams/${payload.team.id}`,
  };
}

// OPT-017: resolve a card's display snapshot, preferring the denormalised
// `cardSnapshot` (indexed doc field, no extra queries). On a miss (older posts
// created before this field existed) falls back to the live pipeline and
// persists the result — self-backfilling, same pattern as the OPT-010/011/013
// materialisations. `refresh: true` forces a live re-resolve + re-persist
// (the "slim refresh path for stale cards").
async function resolveGameCardPayload(post, { refresh = false } = {}) {
  if (!refresh && post.gameCard.cardSnapshot) {
    return { image: null, gameCard: post.gameCard.cardSnapshot, playerCard: null, teamCard: null };
  }

  let payload;
  try {
    payload = await getPublicGame(String(post.gameCard.gameId));
  } catch {
    return { image: null, gameCard: null, playerCard: null, teamCard: null };
  }
  const snapshot = buildGameCardSnapshot(payload);
  persistCardSnapshot(post, 'gameCard', snapshot);
  return { image: null, gameCard: snapshot, playerCard: null, teamCard: null };
}

async function resolvePlayerCardPayload(post, { refresh = false } = {}) {
  if (!refresh && post.playerCard.cardSnapshot) {
    return {
      image: null,
      gameCard: null,
      playerCard: post.playerCard.cardSnapshot,
      teamCard: null,
    };
  }

  const payload = post.playerCard.leaguePlayerId
    ? await getPublicLeaguePlayerById(String(post.playerCard.leaguePlayerId))
    : await getPublicPlayer(String(post.playerCard.teamId), String(post.playerCard.playerId));
  const snapshot = buildPlayerCardSnapshot(payload);
  persistCardSnapshot(post, 'playerCard', snapshot);
  return { image: null, gameCard: null, playerCard: snapshot, teamCard: null };
}

async function resolveTeamCardPayload(post, { refresh = false } = {}) {
  if (!refresh && post.teamCard.cardSnapshot) {
    return { image: null, gameCard: null, playerCard: null, teamCard: post.teamCard.cardSnapshot };
  }

  const payload = post.teamCard.leagueTeamId
    ? await getPublicLeagueTeamById(String(post.teamCard.leagueTeamId))
    : await getPublicTeam(String(post.teamCard.teamId));
  const snapshot = buildTeamCardSnapshot(payload);
  persistCardSnapshot(post, 'teamCard', snapshot);
  return { image: null, gameCard: null, playerCard: null, teamCard: snapshot };
}

// OPT-017: best-effort, non-blocking persist of a computed snapshot back onto
// the Post doc so the NEXT read hits the fast path. Never awaited by callers —
// a failed persist just means the next read re-resolves live again (identical
// to a permanent miss), so it's safe to fire-and-forget with logging.
function persistCardSnapshot(post, cardField, snapshot) {
  updatePostCardSnapshot(post._id, cardField, snapshot).catch((error) => {
    logger.warn(
      { err: error, postId: String(post._id), cardField },
      'Feed card snapshot persist failed'
    );
  });
}

// OPT-017: the slim refresh path for stale cards. A game_card's snapshot is
// taken once and never touched again by the read path — if the underlying
// game's score changes after being shared (finish, or an edit to a completed
// game), the shared card would show a stale score forever without this.
// Intended to be called from games.service.js's existing completion/edit
// triggers (post-response, non-blocking — matches the OPT-010/012/013 shape).
async function refreshGameCardPostsForGame(gameId) {
  const posts = await listGameCardPostsByGameId(gameId);
  await Promise.all(posts.map((post) => resolveGameCardPayload(post, { refresh: true })));
}

const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function isSafeYouTubeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host))
      return false;
    // Extract and validate the video ID so a crafted URL can't inject params.
    let id = null;
    if (host === 'youtu.be') {
      id = parsed.pathname.split('/').filter(Boolean)[0] || null;
    } else if (parsed.pathname === '/watch') {
      id = parsed.searchParams.get('v');
    } else if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/shorts/')) {
      id = parsed.pathname.split('/').filter(Boolean)[1] || null;
    }
    return Boolean(id && YOUTUBE_VIDEO_ID_RE.test(id));
  } catch {
    return false;
  }
}

function resolveHighlightClipPayload(post) {
  const clip = post.highlightClip;
  return {
    image: null,
    video: null,
    gameCard: null,
    playerCard: null,
    teamCard: null,
    highlightClip: {
      gameId: String(clip.gameId),
      eventId: clip.eventId,
      videoUrl: isSafeYouTubeUrl(clip.videoUrl) ? clip.videoUrl : null,
      videoTimestamp: clip.videoTimestamp,
      statType: clip.statType,
      playerId: clip.playerId ?? null,
      playerName: clip.playerName ?? null,
      gameTitle: clip.gameTitle ?? null,
    },
  };
}

async function resolvePostPayload(post) {
  if (post.type === 'image') {
    return resolveImagePayload(post);
  }

  if (post.type === 'video') {
    return resolveVideoPayload(post);
  }

  if (post.type === 'game_card') {
    return resolveGameCardPayload(post);
  }

  if (post.type === 'player_card') {
    return resolvePlayerCardPayload(post);
  }

  if (post.type === 'team_card') {
    return resolveTeamCardPayload(post);
  }

  if (post.type === 'highlight_clip') {
    return resolveHighlightClipPayload(post);
  }

  throw new ApiError(400, 'Unsupported post type');
}

// OPT-017: accepts an optional pre-fetched `creator` so batch hydration
// (listFeedPosts) can resolve every post's creator with one `$in` query
// instead of one `findUserById` per post. Single-post call sites (create,
// delete) omit it and get the original one-query-per-call behaviour.
async function sanitizePost(post, viewerUserId = null, { creator: prefetchedCreator } = {}) {
  const creator = prefetchedCreator ?? (await findUserById(post.creatorUserId));
  if (!creator) {
    return null;
  }

  try {
    const payload = await resolvePostPayload(post);
    return {
      id: String(post._id),
      type: post.type,
      caption: post.caption ?? null,
      createdAt: post.createdAt,
      creator: {
        id: String(creator._id),
        name: creator.name,
        avatarUrl: transformCloudinaryUrl(creator.avatar?.url ?? null),
      },
      canDelete: Boolean(viewerUserId && String(viewerUserId) === String(post.creatorUserId)),
      ...payload,
    };
  } catch {
    return null;
  }
}

async function listFeedPosts(viewerUserId, options = {}) {
  const limit = Math.min(options.limit || 20, 50);
  if (options.cursor) {
    ensureObjectId(options.cursor, 'cursor');
  }
  const rawPosts = await listPosts({ limit: limit + 10, cursor: options.cursor || null });

  // OPT-017: batch every post's creator with one $in instead of one
  // findUserById per post (was the single biggest query multiplier on this
  // page — one extra round-trip per post regardless of type).
  const creatorsById = new Map(
    (await findUsersByIds(rawPosts.map((post) => post.creatorUserId))).map((user) => [
      String(user._id),
      user,
    ])
  );

  const resolved = [];
  let lastResolvedRaw = null;
  let hitLimit = false;

  for (const post of rawPosts) {
    const creator = creatorsById.get(String(post.creatorUserId));
    const sanitized = creator
      ? await sanitizePost(post, viewerUserId, { creator })
      : await sanitizePost(post, viewerUserId);
    if (sanitized) {
      resolved.push(sanitized);
      lastResolvedRaw = post;
    }
    if (resolved.length >= limit) {
      hitLimit = true;
      break;
    }
  }

  // Only emit a cursor when we hit the limit mid-batch, meaning there are
  // likely more posts. If we consumed the whole batch without hitting the
  // limit there is nothing left to page through.
  const nextCursor = hitLimit && lastResolvedRaw ? String(lastResolvedRaw._id) : null;

  return {
    posts: resolved,
    nextCursor,
  };
}

async function createImagePostForUser(userId, file, caption) {
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!isCloudinaryConfigured()) {
    throw new ApiError(500, 'Cloudinary is not configured');
  }

  if (!file) {
    throw new ApiError(400, 'Image file is required');
  }

  if (file.size > env.FEED_IMAGE_MAX_BYTES) {
    throw new ApiError(400, 'Image exceeds upload size limit');
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    throw new ApiError(400, 'Unsupported image type');
  }

  const upload = await uploadImageBuffer(file);

  const post = await createPost({
    creatorUserId: userId,
    type: 'image',
    caption: sanitizeCaption(caption),
    image: {
      url: upload.secure_url,
      publicId: upload.public_id,
      width: upload.width ?? null,
      height: upload.height ?? null,
      mimeType: file.mimetype,
    },
  });

  return sanitizePost(post, userId);
}

async function createVideoPostForUser(userId, file, caption) {
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!isCloudinaryConfigured()) {
    throw new ApiError(500, 'Cloudinary is not configured');
  }

  if (!file) {
    throw new ApiError(400, 'Video file is required');
  }

  if (file.size > env.FEED_VIDEO_MAX_BYTES) {
    throw new ApiError(400, 'Video exceeds upload size limit');
  }

  const allowed = ['video/mp4', 'video/quicktime', 'video/webm'];
  if (!allowed.includes(file.mimetype)) {
    throw new ApiError(400, 'Unsupported video type');
  }

  const upload = await uploadVideoBuffer(file);

  if (upload.duration != null && upload.duration > env.FEED_VIDEO_MAX_DURATION_SECONDS) {
    // OPT-009: await the cleanup so a failed destroy is logged (not leaked).
    await destroyCloudinaryAsset('video', upload.public_id);
    throw new ApiError(
      422,
      `Video must be ${env.FEED_VIDEO_MAX_DURATION_SECONDS} seconds or shorter`
    );
  }

  // OPT-009: with async eager transcode the eager MP4 usually isn't ready yet,
  // so deliver via the on-the-fly f_auto,q_auto,vc_auto pipeline (works before &
  // after the eager MP4 lands). Prefer the eager URL if it's already present.
  // The stored URL is permanent, and with eager_async the response's eager
  // entry still carries the (deterministic) derived URL but with
  // status:'processing' — requesting it mid-transcode 423s. Only trust the
  // eager URL when it's actually ready (verification fix, 2026-07-06).
  const eagerEntry = upload.eager?.[0];
  const eagerReady = Boolean(eagerEntry?.secure_url) && eagerEntry.status !== 'processing';
  const playbackUrl = eagerReady
    ? eagerEntry.secure_url
    : cloudinaryVideoPlaybackUrl(upload.public_id, upload.secure_url);
  const thumbnailUrl = cloudinaryThumbnailUrl(upload.public_id, upload.resource_type);

  const post = await createPost({
    creatorUserId: userId,
    type: 'video',
    caption: sanitizeCaption(caption),
    video: {
      url: playbackUrl,
      publicId: upload.public_id,
      width: upload.width ?? null,
      height: upload.height ?? null,
      duration: upload.duration ?? null,
      thumbnailUrl,
      mimeType: 'video/mp4',
    },
  });

  return sanitizePost(post, userId);
}

async function createGameCardPostForUser(userId, input) {
  const payload = createGameCardPostSchema.parse(input);
  ensureObjectId(payload.gameId, 'game id');

  const game = await findGameById(payload.gameId);
  if (!game || !isPubliclyViewableGame(game)) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.gameContext === 'league' && !(await isLeaguePublic(game.leagueId))) {
    throw new ApiError(404, 'Game not found');
  }

  const trackedLeagueTeamId =
    game.gameContext === 'league'
      ? game.trackedLeagueTeamId || game.homeLeagueTeamId || game.awayLeagueTeamId || null
      : null;

  const post = await createPost({
    creatorUserId: userId,
    type: 'game_card',
    caption: sanitizeCaption(payload.caption),
    gameCard: {
      gameId: payload.gameId,
      teamId: game.teamId || null,
      leagueTeamId: trackedLeagueTeamId,
    },
  });

  return sanitizePost(post, userId);
}

async function createPlayerCardPostForUser(userId, input) {
  const payload = createPlayerCardPostSchema.parse(input);
  const isLeaguePlayer = Boolean(payload.leagueTeamId && payload.leaguePlayerId);

  if (isLeaguePlayer) {
    ensureObjectId(payload.leagueTeamId, 'league team id');
    ensureObjectId(payload.leaguePlayerId, 'league player id');

    const leagueTeam = await findLeagueTeamById(payload.leagueTeamId);
    if (!leagueTeam || !(await isLeaguePublic(leagueTeam.leagueId))) {
      throw new ApiError(404, 'League player not found');
    }

    // OPT-017: reused for the denormalised snapshot below, same pattern as
    // the standalone path.
    const publicPayload = await getPublicLeaguePlayerById(payload.leaguePlayerId);

    const post = await createPost({
      creatorUserId: userId,
      type: 'player_card',
      caption: sanitizeCaption(payload.caption),
      playerCard: {
        leagueTeamId: payload.leagueTeamId,
        leaguePlayerId: payload.leaguePlayerId,
        cardSnapshot: buildPlayerCardSnapshot(publicPayload),
      },
    });

    return sanitizePost(post, userId);
  }

  ensureObjectId(payload.teamId, 'team id');
  ensureObjectId(payload.playerId, 'player id');

  // OPT-017: this pipeline call is also the source for the denormalised
  // snapshot below — reused instead of discarded and re-resolved a moment
  // later inside sanitizePost.
  const publicPayload = await getPublicPlayer(payload.teamId, payload.playerId);

  const post = await createPost({
    creatorUserId: userId,
    type: 'player_card',
    caption: sanitizeCaption(payload.caption),
    playerCard: {
      teamId: payload.teamId,
      playerId: payload.playerId,
      cardSnapshot: buildPlayerCardSnapshot(publicPayload),
    },
  });

  return sanitizePost(post, userId);
}

async function createTeamCardPostForUser(userId, input) {
  const payload = createTeamCardPostSchema.parse(input);
  const isLeagueTeam = Boolean(payload.leagueTeamId);

  if (isLeagueTeam) {
    ensureObjectId(payload.leagueTeamId, 'league team id');

    const leagueTeam = await findLeagueTeamById(payload.leagueTeamId);
    if (!leagueTeam || !(await isLeaguePublic(leagueTeam.leagueId))) {
      throw new ApiError(404, 'League team not found');
    }

    const publicPayload = await getPublicLeagueTeamById(payload.leagueTeamId);

    const post = await createPost({
      creatorUserId: userId,
      type: 'team_card',
      caption: sanitizeCaption(payload.caption),
      teamCard: {
        leagueTeamId: payload.leagueTeamId,
        cardSnapshot: buildTeamCardSnapshot(publicPayload),
      },
    });

    return sanitizePost(post, userId);
  }

  ensureObjectId(payload.teamId, 'team id');

  const publicPayload = await getPublicTeam(payload.teamId);

  const post = await createPost({
    creatorUserId: userId,
    type: 'team_card',
    caption: sanitizeCaption(payload.caption),
    teamCard: {
      teamId: payload.teamId,
      cardSnapshot: buildTeamCardSnapshot(publicPayload),
    },
  });

  return sanitizePost(post, userId);
}

async function deletePostForUser(userId, postId) {
  const post = await findPostById(postId);
  if (!post) {
    throw new ApiError(404, 'Post not found');
  }

  if (String(post.creatorUserId) !== String(userId)) {
    throw new ApiError(403, 'You can only delete your own posts');
  }

  await deletePostById(postId);

  // OPT-009: await the asset cleanup and log any failure. The post row is
  // already gone, so a failed destroy is logged (surfacing the orphan) rather
  // than failing the delete — but it is no longer silently swallowed.
  if (post.type === 'image' && post.image?.publicId) {
    await destroyCloudinaryAsset('image', post.image.publicId);
  }

  if (post.type === 'video' && post.video?.publicId) {
    await destroyCloudinaryAsset('video', post.video.publicId);
  }

  return { deleted: true };
}

// TSW-005 (widened): any public league's games/teams/players are searchable
// and shareable by any user, not just members of that league — matches how
// standalone teams/games are already globally searchable. Membership is no
// longer required to search or to create a card post.
async function listAllPublicLeagues() {
  const { leagues } = await listPublicLeagues();
  return leagues;
}

async function listShareableGames(userId, query = {}) {
  const [games, teams, publicLeagues] = await Promise.all([
    listCompletedGames(),
    listTeams(),
    listAllPublicLeagues(),
  ]);
  const teamsById = new Map(teams.map((team) => [String(team._id), team]));

  const standaloneResults = games
    .filter((game) => isPubliclyViewableGame(game))
    .filter((game) => matchesQuery(game.opponent || game.title, query.q))
    .map((game) => ({
      id: String(game._id),
      source: 'standalone',
      title: game.title,
      opponent: game.opponent ?? null,
      team: teamsById.has(String(game.teamId))
        ? {
            id: String(teamsById.get(String(game.teamId))._id),
            name: teamsById.get(String(game.teamId)).name,
          }
        : null,
    }))
    .filter((game) => game.team);

  const leagueGamesByLeague = await Promise.all(
    publicLeagues.map((league) => listLeagueGamesByLeagueId(league.id))
  );
  const leagueTeamsByLeague = await Promise.all(
    publicLeagues.map((league) => listLeagueTeams(league.id))
  );
  const leagueResults = publicLeagues.flatMap((league, index) => {
    const leagueTeamsById = new Map(
      leagueTeamsByLeague[index].map((team) => [String(team._id), team])
    );
    return leagueGamesByLeague[index]
      .filter((game) => game.status === 'completed' && isPubliclyViewableGame(game))
      .filter((game) => matchesQuery(game.title, query.q))
      .map((game) => {
        const trackedTeamId =
          game.trackedLeagueTeamId || game.homeLeagueTeamId || game.awayLeagueTeamId;
        const trackedTeam = leagueTeamsById.get(String(trackedTeamId));
        return {
          id: String(game._id),
          source: 'league',
          leagueId: league.id,
          title: game.title,
          opponent: null,
          team: trackedTeam
            ? { leagueTeamId: String(trackedTeam._id), name: trackedTeam.name }
            : null,
        };
      })
      .filter((game) => game.team);
  });

  return [...standaloneResults, ...leagueResults].slice(0, query.limit || 10);
}

async function listShareableTeams(userId, query = {}) {
  const [teams, publicLeagues] = await Promise.all([listTeams(), listAllPublicLeagues()]);

  const standaloneResults = teams
    .filter((team) => matchesQuery(team.name, query.q))
    .map((team) => ({
      id: String(team._id),
      source: 'standalone',
      name: team.name,
    }));

  const leagueTeamsByLeague = await Promise.all(
    publicLeagues.map((league) => listLeagueTeams(league.id))
  );
  const leagueResults = publicLeagues.flatMap((league, index) =>
    leagueTeamsByLeague[index]
      .filter((team) => team.status === 'active')
      .filter((team) => matchesQuery(team.name, query.q))
      .map((team) => ({
        id: String(team._id),
        source: 'league',
        leagueId: league.id,
        leagueTeamId: String(team._id),
        name: team.name,
      }))
  );

  return [...standaloneResults, ...leagueResults].slice(0, query.limit || 10);
}

async function listShareablePlayers(userId, query = {}) {
  const [teams, publicLeagues] = await Promise.all([listTeams(), listAllPublicLeagues()]);
  const standaloneResults = [];

  for (const team of teams) {
    for (const player of team.players || []) {
      if (!player.isActive) {
        continue;
      }
      const label = `${player.displayName} ${team.name}`;
      if (!matchesQuery(label, query.q)) {
        continue;
      }

      standaloneResults.push({
        id: String(player._id),
        source: 'standalone',
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        team: {
          id: String(team._id),
          name: team.name,
        },
      });
    }
  }

  const leagueTeamsByLeague = await Promise.all(
    publicLeagues.map((league) => listLeagueTeams(league.id))
  );
  const leaguePlayersByTeam = await Promise.all(
    leagueTeamsByLeague.flat().map((team) => listLeaguePlayers(team._id))
  );
  const leagueTeamsFlat = leagueTeamsByLeague.flat();
  const leagueResults = leagueTeamsFlat.flatMap((team, index) =>
    leaguePlayersByTeam[index]
      .filter((player) => player.isActive)
      .filter((player) => matchesQuery(`${player.displayName} ${team.name}`, query.q))
      .map((player) => ({
        id: String(player._id),
        source: 'league',
        leaguePlayerId: String(player._id),
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        team: {
          leagueTeamId: String(team._id),
          name: team.name,
        },
      }))
  );

  return [...standaloneResults, ...leagueResults].slice(0, query.limit || 10);
}

async function listDiscoverablePlayers(query = {}) {
  const [teams, publicLeagues] = await Promise.all([listTeams(), listAllPublicLeagues()]);
  const standaloneResults = [];

  for (const team of teams) {
    for (const player of team.players || []) {
      if (!player.isActive) {
        continue;
      }

      const label = `${player.displayName} ${team.name}`;
      if (!matchesQuery(label, query.q)) {
        continue;
      }

      standaloneResults.push({
        id: String(player._id),
        source: 'standalone',
        sourceLabel: 'Public team',
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
        profileHref: `/teams/${String(team._id)}/players/${String(player._id)}`,
        team: {
          id: String(team._id),
          name: team.name,
          profileHref: `/teams/${String(team._id)}`,
        },
        league: null,
      });
    }
  }

  const leagueTeamsByLeague = await Promise.all(
    publicLeagues.map((league) => listLeagueTeams(league.id))
  );
  const leagueTeamEntries = publicLeagues.flatMap((league, leagueIndex) =>
    leagueTeamsByLeague[leagueIndex]
      .filter((team) => team.status === 'active')
      .map((team) => ({ league, team }))
  );
  const leaguePlayersByTeam = await Promise.all(
    leagueTeamEntries.map(({ team }) => listLeaguePlayers(team._id))
  );
  const leagueResults = leagueTeamEntries.flatMap(({ league, team }, index) =>
    leaguePlayersByTeam[index]
      .filter((player) => player.isActive)
      .filter((player) =>
        matchesQuery(`${player.displayName} ${team.name} ${league.name}`, query.q)
      )
      .map((player) => ({
        id: String(player._id),
        source: 'league',
        sourceLabel: 'Public league',
        leaguePlayerId: String(player._id),
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
        profileHref: `/league/${league.slug}/teams/${team.slug}/players/${String(player._id)}`,
        team: {
          leagueTeamId: String(team._id),
          name: team.name,
          profileHref: `/league/${league.slug}/teams/${team.slug}`,
        },
        league: {
          id: league.id,
          name: league.name,
          slug: league.slug,
          profileHref: `/league/${league.slug}`,
        },
      }))
  );

  return [...standaloneResults, ...leagueResults]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, query.limit || 48);
}

function findSnapshotPlayer(game, playerId) {
  const playerIdStr = String(playerId);
  for (const roster of [game.rosterSnapshot, game.homeRosterSnapshot, game.awayRosterSnapshot]) {
    if (!Array.isArray(roster)) continue;
    const found = roster.find((p) => String(p._id) === playerIdStr);
    if (found) return found;
  }
  return null;
}

async function assertCanShareHighlightClip(userId, game, event) {
  if (await canAccessGame(userId, game)) return;

  if (!event.playerId) {
    throw new ApiError(403, 'You do not have permission to share this clip');
  }

  const snapshotPlayer = findSnapshotPlayer(game, event.playerId);
  if (!snapshotPlayer) {
    throw new ApiError(403, 'You do not have permission to share this clip');
  }

  if (snapshotPlayer.leaguePlayerId) {
    const leaguePlayer = await findLeaguePlayerById(snapshotPlayer.leaguePlayerId);
    if (leaguePlayer && String(leaguePlayer.claimedByUserId) === String(userId)) return;
  }

  // Fall through to snapshot claimedByUserId as a secondary check — covers cases
  // where the snapshot has a direct claim but leaguePlayerId is also set.
  if (snapshotPlayer.claimedByUserId && String(snapshotPlayer.claimedByUserId) === String(userId)) {
    return;
  }

  throw new ApiError(403, 'You do not have permission to share this clip');
}

async function createHighlightClipPostForUser(userId, input) {
  if (!userId) throw new ApiError(401, 'Unauthorized');

  const payload = createHighlightClipPostSchema.parse(input);
  ensureObjectId(payload.gameId, 'game id');

  const game = await findGameById(payload.gameId);
  if (!game) throw new ApiError(404, 'Game not found');
  if (!game.videoUrl) throw new ApiError(400, 'This game has no video linked');

  const event = (game.events || []).find((ev) => String(ev._id) === payload.eventId);
  if (!event) throw new ApiError(404, 'Event not found');
  if (typeof event.videoTimestamp !== 'number') {
    throw new ApiError(400, 'This event has no video timestamp');
  }
  if (!HIGHLIGHT_STAT_TYPES.has(event.statType)) {
    throw new ApiError(400, 'This event type cannot be shared as a highlight');
  }

  await assertCanShareHighlightClip(userId, game, event);

  const existing = await findPostByHighlightEventId(payload.eventId);
  if (existing) throw new ApiError(409, 'This clip has already been shared to the Pulse');

  const snapshotPlayer = event.playerId ? findSnapshotPlayer(game, event.playerId) : null;

  const post = await createPost({
    creatorUserId: userId,
    type: 'highlight_clip',
    caption: sanitizeCaption(payload.caption),
    highlightClip: {
      gameId: payload.gameId,
      eventId: payload.eventId,
      videoUrl: game.videoUrl,
      videoTimestamp: event.videoTimestamp,
      statType: event.statType,
      playerId: event.playerId ? String(event.playerId) : null,
      playerName: snapshotPlayer?.displayName ?? null,
      gameTitle: game.title ?? null,
    },
  });

  return sanitizePost(post, userId);
}

// Auto Feed Generation (docs/auto-feed-generation/000-TRACKER.md): creates the
// system-authored game-card for a finalised public-league game. Mirrors
// createGameCardPostForUser but skips the billing gate (the system user is
// not a paying customer) and marks gameCard.auto so the partial unique index
// on {gameCard.gameId, gameCard.auto:true} guarantees at most one per game.
async function autoCreateGameCardPost(systemUserId, game) {
  const existing = await findAutoGameCardPost(game._id);
  if (existing) return existing;

  const trackedLeagueTeamId =
    game.gameContext === 'league'
      ? game.trackedLeagueTeamId || game.homeLeagueTeamId || game.awayLeagueTeamId || null
      : null;

  try {
    return await createPost({
      creatorUserId: systemUserId,
      type: 'game_card',
      caption: null,
      gameCard: {
        gameId: game._id,
        teamId: game.teamId || null,
        leagueTeamId: trackedLeagueTeamId,
        auto: true,
      },
    });
  } catch (error) {
    // E11000 from a concurrent finalise/retry racing this same game — another
    // call already created the auto card, so treat it as a no-op, not a failure.
    if (error?.code === 11000) {
      return findAutoGameCardPost(game._id);
    }
    throw error;
  }
}

// Per-game cap on auto-generated highlight clips so one video-rich game can't
// flood the feed. Priority favors made shots (most exciting) over misses/
// assists/steals. See docs/auto-feed-generation/000-TRACKER.md (B3).
const AUTO_HIGHLIGHT_CAP = 5;
const AUTO_HIGHLIGHT_PRIORITY = [
  'FG3_MADE',
  'FG2_MADE',
  'AST',
  'STL',
  'BLK',
  'FT_MADE',
  'FG3_MISS',
  'FG2_MISS',
  'FT_MISS',
];

function rankAutoHighlightEvents(events) {
  return [...events].sort((a, b) => {
    const rankA = AUTO_HIGHLIGHT_PRIORITY.indexOf(a.statType);
    const rankB = AUTO_HIGHLIGHT_PRIORITY.indexOf(b.statType);
    return rankA - rankB;
  });
}

// Auto Feed Generation: system-authored highlight_clip posts for a finalised
// game's video-eligible events. No-op if the game has no linked video. Reuses
// the same eligibility rule as manual highlight sharing (HIGHLIGHT_STAT_TYPES +
// numeric videoTimestamp) and the existing findSharedEventIds dedup so events
// already shared manually are never duplicated. Caps per game and logs when
// capped rather than silently truncating.
async function autoCreateHighlightClipPosts(systemUserId, game) {
  if (!game.videoUrl) return { created: 0, skipped: 0, capped: false };

  const eligibleEvents = (game.events || []).filter(
    (ev) => HIGHLIGHT_STAT_TYPES.has(ev.statType) && typeof ev.videoTimestamp === 'number'
  );
  if (eligibleEvents.length === 0) return { created: 0, skipped: 0, capped: false };

  const eventIds = eligibleEvents.map((ev) => String(ev._id));
  const alreadySharedIds = new Set(await findSharedEventIds(eventIds));
  const unsharedEvents = eligibleEvents.filter((ev) => !alreadySharedIds.has(String(ev._id)));

  const ranked = rankAutoHighlightEvents(unsharedEvents);
  const capped = ranked.length > AUTO_HIGHLIGHT_CAP;
  const toCreate = ranked.slice(0, AUTO_HIGHLIGHT_CAP);

  if (capped) {
    logger.info(
      { gameId: String(game._id), eligible: ranked.length, cap: AUTO_HIGHLIGHT_CAP },
      'Auto feed: highlight clip generation capped for this game'
    );
  }

  let created = 0;
  let skipped = 0;

  for (const event of toCreate) {
    const snapshotPlayer = event.playerId ? findSnapshotPlayer(game, event.playerId) : null;
    try {
      await createPost({
        creatorUserId: systemUserId,
        type: 'highlight_clip',
        caption: null,
        highlightClip: {
          gameId: game._id,
          eventId: String(event._id),
          videoUrl: game.videoUrl,
          videoTimestamp: event.videoTimestamp,
          statType: event.statType,
          playerId: event.playerId ? String(event.playerId) : null,
          playerName: snapshotPlayer?.displayName ?? null,
          gameTitle: game.title ?? null,
        },
      });
      created += 1;
    } catch (error) {
      // E11000 on the unique highlightClip.eventId index — already shared
      // (manually or by a concurrent auto-publish run). Not a failure.
      if (error?.code === 11000) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { created, skipped, capped };
}

// Auto Feed Generation entry point (docs/auto-feed-generation/000-TRACKER.md):
// invoked post-response from games.service.js#scheduleAutoFeedForGame after a
// game finishes. This is the SINGLE enforcement point for the public-league
// restriction — private leagues and standalone games are never published,
// using the same isLeaguePublic gate the manual share paths already use.
async function autoPublishForFinalizedGame(gameId) {
  const game = await findGameById(gameId);
  if (!game || game.status !== 'completed') return;

  if (game.gameContext !== 'league' || !(await isLeaguePublic(game.leagueId))) {
    return;
  }

  const systemUserId = await getSystemUserId();
  const gameCardPost = await autoCreateGameCardPost(systemUserId, game);
  const highlightResult = await autoCreateHighlightClipPosts(systemUserId, game);

  logger.info(
    {
      gameId: String(gameId),
      leagueId: String(game.leagueId),
      gameCardPostId: gameCardPost ? String(gameCardPost._id) : null,
      highlightClipsCreated: highlightResult.created,
      highlightClipsSkipped: highlightResult.skipped,
      highlightClipsCapped: highlightResult.capped,
    },
    'Auto feed: publish complete for finalised public-league game'
  );
}

// Auto Feed Generation (B2, docs/auto-feed-generation/000-TRACKER.md): reverse
// (delete) auto-generated posts for a league that just flipped from public to
// private. Only removes system-authored auto content — a user's own manual
// game_card/highlight_clip shares for that league's games are left alone.
// Called from leagues.service.js#updateLeagueForUser; a feed failure here
// should not block the league update itself, so callers should treat this as
// best-effort (see the try/catch at the call site).
async function reverseAutoPostsForLeague(leagueId) {
  const gameIds = await listLeagueGameIdsByLeagueId(leagueId);
  if (gameIds.length === 0) return { deletedCount: 0 };

  const systemUserId = await getSystemUserId();
  return deleteAutoPostsForGameIds(gameIds, systemUserId);
}

module.exports = {
  listFeedPosts,
  createImagePostForUser,
  createVideoPostForUser,
  createGameCardPostForUser,
  createPlayerCardPostForUser,
  createTeamCardPostForUser,
  createHighlightClipPostForUser,
  deletePostForUser,
  listShareableGames,
  listShareablePlayers,
  listShareableTeams,
  listDiscoverablePlayers,
  sanitizePost,
  refreshGameCardPostsForGame,
  // TSW-004/TSW-005: exported for direct unit testing of the snapshot shapes.
  buildGameCardSnapshot,
  buildPlayerCardSnapshot,
  buildTeamCardSnapshot,
  // Auto Feed Generation (docs/auto-feed-generation/000-TRACKER.md).
  autoPublishForFinalizedGame,
  autoCreateGameCardPost,
  autoCreateHighlightClipPosts,
  reverseAutoPostsForLeague,
};
