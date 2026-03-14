const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const { findTeamByIdAndOwner } = require('../teams/teams.repository');
const {
  createGame,
  listGamesByOwner,
  findGameByIdAndOwner,
  findGameById,
  saveGame,
} = require('./games.repository');
const { STAT_TYPES } = require('../shared/stats.constants');

function sanitizeEvent(event) {
  return {
    id: String(event._id),
    playerId: String(event.playerId),
    statType: event.statType,
    zoneId: event.zoneId,
    x: event.x ?? null,
    y: event.y ?? null,
    occurredAt: event.occurredAt,
  };
}

function sanitizeGame(game, options = {}) {
  return {
    id: String(game._id),
    ...(options.includeOwnerUserId ? { ownerUserId: String(game.ownerUserId) } : {}),
    teamId: String(game.teamId),
    title: game.title,
    opponent: game.opponent ?? null,
    status: game.status,
    scheduledAt: game.scheduledAt ?? null,
    completedAt: game.completedAt ?? null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    events: game.events.map(sanitizeEvent),
  };
}

function emptyStats(playerId, displayName) {
  return {
    playerId,
    displayName,
    ftm: 0,
    fta: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    points: 0,
  };
}

function applyEventToRow(row, statType) {
  if (statType === STAT_TYPES.FT_MADE) {
    row.ftm += 1;
    row.fta += 1;
    row.points += 1;
    return;
  }

  if (statType === STAT_TYPES.FT_MISS) {
    row.fta += 1;
    return;
  }

  if (statType === STAT_TYPES.FG2_MADE) {
    row.fg2m += 1;
    row.fg2a += 1;
    row.points += 2;
    return;
  }

  if (statType === STAT_TYPES.FG2_MISS) {
    row.fg2a += 1;
    return;
  }

  if (statType === STAT_TYPES.FG3_MADE) {
    row.fg3m += 1;
    row.fg3a += 1;
    row.points += 3;
    return;
  }

  if (statType === STAT_TYPES.FG3_MISS) {
    row.fg3a += 1;
  }
}

function computeTotals(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.ftm += row.ftm;
      acc.fta += row.fta;
      acc.fg2m += row.fg2m;
      acc.fg2a += row.fg2a;
      acc.fg3m += row.fg3m;
      acc.fg3a += row.fg3a;
      acc.points += row.points;
      return acc;
    },
    { ftm: 0, fta: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, points: 0 }
  );
}

function computeBoxScore(game, team) {
  const activePlayers = team.players.filter((player) => player.isActive);
  const map = new Map(
    activePlayers.map((player) => [
      String(player._id),
      emptyStats(String(player._id), player.displayName),
    ])
  );

  for (const event of game.events) {
    const key = String(event.playerId);
    if (!map.has(key)) {
      const fallbackName = `Unknown (${key.slice(-6)})`;
      map.set(key, emptyStats(key, fallbackName));
    }

    applyEventToRow(map.get(key), event.statType);
  }

  const players = Array.from(map.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  return {
    players,
    teamTotals: computeTotals(players),
  };
}

async function assertTeamOwnership(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  return team;
}

async function createGameForUser(userId, payload) {
  if (!mongoose.Types.ObjectId.isValid(payload.teamId)) {
    throw new ApiError(400, 'Invalid team id');
  }

  await assertTeamOwnership(userId, payload.teamId);

  const game = await createGame({
    ownerUserId: userId,
    teamId: payload.teamId,
    title: payload.title.trim(),
    opponent: payload.opponent?.trim() ? payload.opponent.trim() : undefined,
    scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
    status: 'in_progress',
  });

  return sanitizeGame(game);
}

async function listGamesForUser(userId, filter = {}) {
  const games = await listGamesByOwner(userId, filter);
  return games.map((game) => ({
    id: String(game._id),
    teamId: String(game.teamId),
    title: game.title,
    opponent: game.opponent ?? null,
    status: game.status,
    scheduledAt: game.scheduledAt ?? null,
    completedAt: game.completedAt ?? null,
    eventCount: game.events.length,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  }));
}

async function getGameForUser(userId, gameId) {
  if (!mongoose.Types.ObjectId.isValid(gameId)) {
    throw new ApiError(404, 'Game not found');
  }

  const game = await findGameByIdAndOwner(gameId, userId);
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const team = await assertTeamOwnership(userId, game.teamId);

  return {
    game: sanitizeGame(game, { includeOwnerUserId: true }),
    team: {
      id: String(team._id),
      name: team.name,
      players: team.players.map((player) => ({
        id: String(player._id),
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        isActive: Boolean(player.isActive),
      })),
    },
    boxScore: computeBoxScore(game, team),
  };
}

async function getPublicGame(gameId) {
  if (!mongoose.Types.ObjectId.isValid(gameId)) {
    throw new ApiError(404, 'Game not found');
  }

  const game = await findGameById(gameId);
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const team = await assertTeamOwnership(game.ownerUserId, game.teamId);

  return {
    game: sanitizeGame(game),
    team: {
      id: String(team._id),
      name: team.name,
      players: team.players.map((player) => ({
        id: String(player._id),
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        isActive: Boolean(player.isActive),
      })),
    },
    boxScore: computeBoxScore(game, team),
  };
}

async function appendEventForUser(userId, gameId, payload) {
  const game = await findGameByIdAndOwner(gameId, userId);
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.status !== 'in_progress') {
    throw new ApiError(400, 'Cannot track events on a completed game');
  }

  const team = await assertTeamOwnership(userId, game.teamId);
  const player = team.players.id(payload.playerId);

  if (!player || !player.isActive) {
    throw new ApiError(400, 'Player is not active on this team');
  }

  game.events.push({
    playerId: payload.playerId,
    statType: payload.statType,
    zoneId: payload.zoneId,
    x: payload.x,
    y: payload.y,
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
  });

  await saveGame(game);

  return {
    game: sanitizeGame(game),
    boxScore: computeBoxScore(game, team),
  };
}

async function removeEventForUser(userId, gameId, eventId) {
  const game = await findGameByIdAndOwner(gameId, userId);
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const event = game.events.id(eventId);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }

  event.deleteOne();
  await saveGame(game);

  const team = await assertTeamOwnership(userId, game.teamId);
  return {
    game: sanitizeGame(game),
    boxScore: computeBoxScore(game, team),
  };
}

async function finishGameForUser(userId, gameId) {
  const game = await findGameByIdAndOwner(gameId, userId);
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.status === 'completed') {
    throw new ApiError(400, 'Game is already completed');
  }

  game.status = 'completed';
  game.completedAt = new Date();
  await saveGame(game);

  const team = await assertTeamOwnership(userId, game.teamId);

  return {
    game: sanitizeGame(game),
    boxScore: computeBoxScore(game, team),
  };
}

module.exports = {
  createGameForUser,
  listGamesForUser,
  getGameForUser,
  getPublicGame,
  appendEventForUser,
  removeEventForUser,
  finishGameForUser,
  computeBoxScore,
};
