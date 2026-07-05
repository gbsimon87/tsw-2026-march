const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const {
  createPost,
  listPosts,
  findPostById,
  deletePostById,
  findPostByHighlightEventId,
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
const { transformCloudinaryUrl } = require('../shared/cloudinaryUrl');
const { findUserById } = require('../auth/auth.repository');
const { findGameById, listCompletedGames } = require('../games/games.repository');
const { getPublicGame, canAccessGame, HIGHLIGHT_STAT_TYPES } = require('../games/games.service');
const { findLeaguePlayerById } = require('../leagues/leagues.repository');
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

async function resolveGameCardPayload(post) {
  let payload;
  try {
    payload = await getPublicGame(String(post.gameCard.gameId));
  } catch {
    return { image: null, gameCard: null, playerCard: null, teamCard: null };
  }
  const isDualTeam = payload.game.trackingMode === 'dual_team';

  return {
    image: null,
    gameCard: {
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
      recap: payload.recap,
    },
    playerCard: null,
    teamCard: null,
  };
}

async function resolvePlayerCardPayload(post) {
  const payload = await getPublicPlayer(
    String(post.playerCard.teamId),
    String(post.playerCard.playerId)
  );
  const playerImage = payload.player.image ?? null;
  const teamLogo = payload.team.logo ?? null;
  const imageFallback = playerImage ? 'player' : teamLogo ? 'team_logo' : 'placeholder';

  return {
    image: null,
    gameCard: null,
    playerCard: {
      teamId: payload.team.id,
      teamName: payload.team.name,
      playerId: payload.player.id,
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
      playerUrl: `/teams/${payload.team.id}/players/${payload.player.id}`,
    },
    teamCard: null,
  };
}

async function resolveTeamCardPayload(post) {
  const payload = await getPublicTeam(String(post.teamCard.teamId));

  return {
    image: null,
    gameCard: null,
    playerCard: null,
    teamCard: {
      teamId: payload.team.id,
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
      teamUrl: `/teams/${payload.team.id}`,
    },
  };
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

async function sanitizePost(post, viewerUserId = null) {
  const creator = await findUserById(post.creatorUserId);
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
  const resolved = [];
  let lastResolvedRaw = null;
  let hitLimit = false;

  for (const post of rawPosts) {
    const sanitized = await sanitizePost(post, viewerUserId);
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
    destroyVideo(upload.public_id).catch(() => null);
    throw new ApiError(
      422,
      `Video must be ${env.FEED_VIDEO_MAX_DURATION_SECONDS} seconds or shorter`
    );
  }

  // Prefer the eager MP4 URL for consistent playback, fall back to original
  const playbackUrl = upload.eager?.[0]?.secure_url ?? upload.secure_url;
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

  const post = await createPost({
    creatorUserId: userId,
    type: 'game_card',
    caption: sanitizeCaption(payload.caption),
    gameCard: {
      gameId: payload.gameId,
      teamId: game.teamId || null,
    },
  });

  return sanitizePost(post, userId);
}

async function createPlayerCardPostForUser(userId, input) {
  const payload = createPlayerCardPostSchema.parse(input);
  ensureObjectId(payload.teamId, 'team id');
  ensureObjectId(payload.playerId, 'player id');

  await getPublicPlayer(payload.teamId, payload.playerId);

  const post = await createPost({
    creatorUserId: userId,
    type: 'player_card',
    caption: sanitizeCaption(payload.caption),
    playerCard: {
      teamId: payload.teamId,
      playerId: payload.playerId,
    },
  });

  return sanitizePost(post, userId);
}

async function createTeamCardPostForUser(userId, input) {
  const payload = createTeamCardPostSchema.parse(input);
  ensureObjectId(payload.teamId, 'team id');

  await getPublicTeam(payload.teamId);

  const post = await createPost({
    creatorUserId: userId,
    type: 'team_card',
    caption: sanitizeCaption(payload.caption),
    teamCard: {
      teamId: payload.teamId,
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

  if (post.type === 'image' && post.image?.publicId) {
    destroyImage(post.image.publicId).catch(() => null);
  }

  if (post.type === 'video' && post.video?.publicId) {
    destroyVideo(post.video.publicId).catch(() => null);
  }

  return { deleted: true };
}

async function listShareableGames(query = {}) {
  const games = await listCompletedGames();
  const teams = await listTeams();
  const teamsById = new Map(teams.map((team) => [String(team._id), team]));

  return games
    .filter((game) => isPubliclyViewableGame(game))
    .filter((game) => matchesQuery(game.opponent || game.title, query.q))
    .slice(0, query.limit || 10)
    .map((game) => ({
      id: String(game._id),
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
}

async function listShareableTeams(query = {}) {
  const teams = await listTeams();

  return teams
    .filter((team) => matchesQuery(team.name, query.q))
    .slice(0, query.limit || 10)
    .map((team) => ({
      id: String(team._id),
      name: team.name,
    }));
}

async function listShareablePlayers(query = {}) {
  const teams = await listTeams();
  const players = [];

  for (const team of teams) {
    for (const player of team.players || []) {
      if (!player.isActive) {
        continue;
      }
      const label = `${player.displayName} ${team.name}`;
      if (!matchesQuery(label, query.q)) {
        continue;
      }

      players.push({
        id: String(player._id),
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        team: {
          id: String(team._id),
          name: team.name,
        },
      });
    }
  }

  return players.slice(0, query.limit || 10);
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
  sanitizePost,
};
