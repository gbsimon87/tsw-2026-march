const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const { createPost, listPosts, findPostById, deletePostById } = require('./feed.repository');
const {
  createGameCardPostSchema,
  createPlayerCardPostSchema,
  createTeamCardPostSchema,
} = require('./feed.validation');
const { uploadImageBuffer, destroyImage, isCloudinaryConfigured } = require('./cloudinary.client');
const { env } = require('../../config/env');
const { findUserById } = require('../auth/auth.repository');
const { findGameById, listCompletedGames } = require('../games/games.repository');
const { getPublicGame } = require('../games/games.service');
const { listTeams } = require('../teams/teams.repository');
const { getPublicPlayer, getPublicTeam } = require('../teams/teams.service');

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
      url: post.image.url,
      width: post.image.width ?? null,
      height: post.image.height ?? null,
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

async function resolvePostPayload(post) {
  if (post.type === 'image') {
    return resolveImagePayload(post);
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

  for (const post of rawPosts) {
    const sanitized = await sanitizePost(post, viewerUserId);
    if (sanitized) {
      resolved.push(sanitized);
    }
    if (resolved.length >= limit) {
      break;
    }
  }

  const nextCursor =
    rawPosts.length > 0 && rawPosts.length >= limit
      ? String(rawPosts[rawPosts.length - 1]._id)
      : null;

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

module.exports = {
  listFeedPosts,
  createImagePostForUser,
  createGameCardPostForUser,
  createPlayerCardPostForUser,
  createTeamCardPostForUser,
  deletePostForUser,
  listShareableGames,
  listShareablePlayers,
  listShareableTeams,
  sanitizePost,
};
