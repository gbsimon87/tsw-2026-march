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
const { summarizeEvents } = require('../shared/statSummary');
const { getBillingSummary, getTeamEntitlements } = require('../billing/billing.service');
const { buildGameRecap } = require('./gameRecap.service');

function sanitizeEvent(event) {
  return {
    id: String(event._id),
    playerId: event.playerId ? String(event.playerId) : null,
    relatedPlayerId: event.relatedPlayerId ? String(event.relatedPlayerId) : null,
    statType: event.statType,
    zoneId: event.zoneId ?? null,
    x: event.x ?? null,
    y: event.y ?? null,
    occurredAt: event.occurredAt,
  };
}

function sanitizeLogo(logo) {
  if (!logo?.url) {
    return null;
  }

  return {
    url: logo.url,
    width: logo.width ?? null,
    height: logo.height ?? null,
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
    startingLineupPlayerIds: Array.isArray(game.startingLineupPlayerIds)
      ? game.startingLineupPlayerIds.map(String)
      : [],
    currentLineupPlayerIds: Array.isArray(game.currentLineupPlayerIds)
      ? game.currentLineupPlayerIds.map(String)
      : [],
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
    ast: 0,
    oreb: 0,
    dreb: 0,
    stl: 0,
    tov: 0,
    foul: 0,
    reb: 0,
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
    return;
  }

  if (statType === STAT_TYPES.AST) {
    row.ast += 1;
    return;
  }

  if (statType === STAT_TYPES.OREB) {
    row.oreb += 1;
    row.reb += 1;
    return;
  }

  if (statType === STAT_TYPES.DREB) {
    row.dreb += 1;
    row.reb += 1;
    return;
  }

  if (
    statType === STAT_TYPES.OPP_REB ||
    statType === STAT_TYPES.SUB_IN ||
    statType === STAT_TYPES.SUB_OUT
  ) {
    return;
  }

  if (statType === STAT_TYPES.STL) {
    row.stl += 1;
    return;
  }

  if (statType === STAT_TYPES.TOV) {
    row.tov += 1;
    return;
  }

  if (statType === STAT_TYPES.FOUL) {
    row.foul += 1;
  }
}

function isOpponentEvent(statType) {
  return (
    statType === STAT_TYPES.OPP_FT_MADE ||
    statType === STAT_TYPES.OPP_FG2_MADE ||
    statType === STAT_TYPES.OPP_FG3_MADE ||
    statType === STAT_TYPES.OPP_REB
  );
}

function recalculateCurrentLineup(game) {
  let lineup = Array.isArray(game.startingLineupPlayerIds)
    ? game.startingLineupPlayerIds.map(String)
    : [];

  for (const event of game.events) {
    if (event.statType === STAT_TYPES.SUB_OUT && event.playerId) {
      lineup = lineup.filter((id) => id !== String(event.playerId));
      continue;
    }

    if (event.statType === STAT_TYPES.SUB_IN && event.playerId) {
      const playerId = String(event.playerId);
      if (!lineup.includes(playerId)) {
        lineup.push(playerId);
      }
    }
  }

  game.currentLineupPlayerIds = lineup;
}

function validateLineupPlayers(team, playerIds) {
  const uniquePlayerIds = [...new Set(playerIds.map(String))];
  if (uniquePlayerIds.length !== 5) {
    throw new ApiError(400, 'Starting lineup must include exactly 5 unique players');
  }

  for (const playerId of uniquePlayerIds) {
    const player = team.players.id(playerId);
    if (!player || !player.isActive) {
      throw new ApiError(400, 'Starting lineup must use active team players');
    }
  }

  return uniquePlayerIds;
}

function buildGameSummary(game) {
  const summary = summarizeEvents(game.events);
  return {
    teamPoints: summary.points,
    opponentPoints: summary.opponentPoints || 0,
    hasOpponentScore: (summary.opponentPoints || 0) > 0,
  };
}

function computeBoxScore(game, team, options = {}) {
  const basePlayers = options.includeInactivePlayers
    ? team.players
    : team.players.filter((player) => player.isActive);
  const map = new Map(
    basePlayers.map((player) => [
      String(player._id),
      emptyStats(String(player._id), player.displayName),
    ])
  );

  for (const event of game.events) {
    if (isOpponentEvent(event.statType)) {
      continue;
    }

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
  const summary = summarizeEvents(game.events);

  return {
    players,
    teamTotals: {
      ftm: summary.ft.made,
      fta: summary.ft.attempts,
      fg2m: summary.fg2.made,
      fg2a: summary.fg2.attempts,
      fg3m: summary.fg3.made,
      fg3a: summary.fg3.attempts,
      ast: players.reduce((total, row) => total + row.ast, 0),
      oreb: players.reduce((total, row) => total + row.oreb, 0),
      dreb: players.reduce((total, row) => total + row.dreb, 0),
      stl: players.reduce((total, row) => total + row.stl, 0),
      tov: players.reduce((total, row) => total + row.tov, 0),
      foul: players.reduce((total, row) => total + row.foul, 0),
      reb: players.reduce((total, row) => total + row.reb, 0),
      points: summary.points,
    },
    opponentTotals: {
      points: summary.opponentPoints || 0,
    },
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
      logo: sanitizeLogo(team.logo),
      billing: getBillingSummary(team),
      entitlements: getTeamEntitlements(team),
      players: team.players.map((player) => ({
        id: String(player._id),
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        isActive: Boolean(player.isActive),
      })),
    },
    boxScore: computeBoxScore(game, team),
    teamEntitlements: getTeamEntitlements(team),
    recap: buildGameRecap(game, team, computeBoxScore(game, team)),
    gameSummary: buildGameSummary(game),
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
      logo: sanitizeLogo(team.logo),
      billing: getBillingSummary(team),
      entitlements: getTeamEntitlements(team),
      players: team.players.map((player) => ({
        id: String(player._id),
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        isActive: Boolean(player.isActive),
      })),
    },
    boxScore: computeBoxScore(game, team),
    teamEntitlements: getTeamEntitlements(team),
    recap: buildGameRecap(game, team, computeBoxScore(game, team)),
    gameSummary: buildGameSummary(game),
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
  if (payload.playerId) {
    const player = team.players.id(payload.playerId);

    if (!player || !player.isActive) {
      throw new ApiError(400, 'Player is not active on this team');
    }
  }

  if (
    payload.statType === STAT_TYPES.AST ||
    payload.statType === STAT_TYPES.OREB ||
    payload.statType === STAT_TYPES.DREB ||
    payload.statType === STAT_TYPES.STL ||
    payload.statType === STAT_TYPES.TOV ||
    payload.statType === STAT_TYPES.FOUL
  ) {
    const lineupIds = (game.currentLineupPlayerIds || []).map(String);
    if (payload.playerId && lineupIds.length > 0 && !lineupIds.includes(String(payload.playerId))) {
      throw new ApiError(400, 'Player is not currently on the court');
    }
  }

  if (payload.statType === STAT_TYPES.SUB_OUT || payload.statType === STAT_TYPES.SUB_IN) {
    const lineupIds = (game.currentLineupPlayerIds || []).map(String);
    if (lineupIds.length !== 5 && payload.statType === STAT_TYPES.SUB_OUT) {
      throw new ApiError(400, 'Set starting five before making substitutions');
    }

    if (payload.statType === STAT_TYPES.SUB_OUT) {
      if (!payload.playerId || !lineupIds.includes(String(payload.playerId))) {
        throw new ApiError(400, 'Outgoing player is not currently on the court');
      }
      game.currentLineupPlayerIds = lineupIds.filter((id) => id !== String(payload.playerId));
    }

    if (payload.statType === STAT_TYPES.SUB_IN) {
      if (!payload.playerId) {
        throw new ApiError(400, 'Incoming player is required');
      }
      if (lineupIds.includes(String(payload.playerId))) {
        throw new ApiError(400, 'Incoming player is already on the court');
      }
      game.currentLineupPlayerIds = [...lineupIds, String(payload.playerId)];
    }
  }

  game.events.push({
    ...(payload.playerId ? { playerId: payload.playerId } : {}),
    ...(payload.relatedPlayerId ? { relatedPlayerId: payload.relatedPlayerId } : {}),
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
    gameSummary: buildGameSummary(game),
  };
}

async function setGameLineup(userId, gameId, playerIds) {
  const game = await findGameByIdAndOwner(gameId, userId);
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.status !== 'in_progress') {
    throw new ApiError(400, 'Cannot change lineup on a completed game');
  }

  const team = await assertTeamOwnership(userId, game.teamId);
  const validIds = validateLineupPlayers(team, playerIds);

  game.startingLineupPlayerIds = validIds;
  game.currentLineupPlayerIds = validIds;
  await saveGame(game);

  return {
    game: sanitizeGame(game),
    boxScore: computeBoxScore(game, team),
    gameSummary: buildGameSummary(game),
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
  recalculateCurrentLineup(game);
  await saveGame(game);

  const team = await assertTeamOwnership(userId, game.teamId);
  return {
    game: sanitizeGame(game),
    boxScore: computeBoxScore(game, team),
    gameSummary: buildGameSummary(game),
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
    gameSummary: buildGameSummary(game),
  };
}

module.exports = {
  createGameForUser,
  listGamesForUser,
  getGameForUser,
  getPublicGame,
  appendEventForUser,
  setGameLineup,
  removeEventForUser,
  finishGameForUser,
  computeBoxScore,
  buildGameSummary,
};
