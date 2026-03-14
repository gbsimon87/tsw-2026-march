const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const {
  summarizeEvents,
  createEmptyTeamStatSummary,
  applyEventToTeamStatSummary,
  finalizeTeamStatSummary,
} = require('../shared/statSummary');
const {
  createTeam,
  listTeamsByOwner,
  findTeamByIdAndOwner,
  findTeamById,
  saveTeam,
} = require('./teams.repository');
const { listGamesByTeamId, listCompletedGames } = require('../games/games.repository');
const { computeBoxScore } = require('../games/games.service');

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function sanitizeTeam(team) {
  return {
    id: String(team._id),
    name: team.name,
    ownerUserId: String(team.ownerUserId),
    players: team.players.map((player) => ({
      id: String(player._id),
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber ?? null,
      isActive: Boolean(player.isActive),
    })),
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

function ensureNoDuplicatePlayers(players) {
  const seen = new Set();
  for (const player of players) {
    const key = normalizeName(player.displayName);
    if (seen.has(key)) {
      throw new ApiError(400, `Duplicate player name: ${player.displayName}`);
    }
    seen.add(key);
  }
}

function computeTeamPoints(game) {
  return summarizeEvents(game.events).points;
}

function isGamePubliclyViewable(game) {
  const now = Date.now();
  const scheduledTime = game.scheduledAt ? new Date(game.scheduledAt).getTime() : null;
  const isFuture =
    typeof scheduledTime === 'number' && !Number.isNaN(scheduledTime) && scheduledTime > now;

  return !isFuture;
}

function sanitizePublicGame(game) {
  return {
    id: String(game._id),
    title: game.title,
    opponent: game.opponent ?? null,
    status: game.status,
    scheduledAt: game.scheduledAt ?? null,
    completedAt: game.completedAt ?? null,
    teamPoints: game.status === 'completed' ? computeTeamPoints(game) : null,
    isPubliclyViewable: isGamePubliclyViewable(game),
    createdAt: game.createdAt,
  };
}

function publicGameTimeValue(game) {
  const rawValue = game.scheduledAt || game.completedAt || game.createdAt || null;
  if (!rawValue) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = new Date(rawValue).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function sanitizePublicPlayer(player) {
  return {
    id: String(player._id),
    displayName: player.displayName,
    jerseyNumber: player.jerseyNumber ?? null,
  };
}

function findPlayerById(team, playerId) {
  if (typeof team.players?.id === 'function') {
    return team.players.id(playerId);
  }

  return (team.players || []).find((player) => String(player._id) === String(playerId)) || null;
}

function buildPublicTeamSummary(games, team) {
  const includedGames = games.filter(
    (game) => game.status === 'completed' && isGamePubliclyViewable(game)
  );
  const gamesCount = includedGames.length;

  const totals = createEmptyTeamStatSummary();

  for (const game of includedGames) {
    for (const event of game.events) {
      applyEventToTeamStatSummary(totals, event.statType);
    }
  }

  const boxScore = computeBoxScore(
    {
      events: includedGames.flatMap((game) => game.events || []),
    },
    team,
    { includeInactivePlayers: true }
  );

  const playerSummaries = boxScore.players.map((row) => ({
    ...row,
    gamesPlayed: gamesCount,
    pointsPerGame: gamesCount > 0 ? row.points / gamesCount : 0,
    assistsPerGame: gamesCount > 0 ? row.ast / gamesCount : 0,
    reboundsPerGame: gamesCount > 0 ? row.reb / gamesCount : 0,
  }));

  return {
    gamesCount,
    ...finalizeTeamStatSummary(totals),
    boxScore: {
      ...boxScore,
      players: playerSummaries,
    },
  };
}

function buildPublicPlayerGameRows(games, team, player) {
  return games
    .filter((game) => game.status === 'completed' && isGamePubliclyViewable(game))
    .map((game) => {
      const boxScore = computeBoxScore(game, team, { includeInactivePlayers: true });
      const playerRow = boxScore.players.find((row) => row.playerId === String(player._id)) || {
        playerId: String(player._id),
        displayName: player.displayName,
        ftm: 0,
        fta: 0,
        fg2m: 0,
        fg2a: 0,
        fg3m: 0,
        fg3a: 0,
        ast: 0,
        oreb: 0,
        dreb: 0,
        reb: 0,
        points: 0,
      };

      return {
        gameId: String(game._id),
        opponent: game.opponent ?? null,
        title: game.title,
        date: game.scheduledAt || game.completedAt || game.createdAt || null,
        scheduledAt: game.scheduledAt ?? null,
        completedAt: game.completedAt ?? null,
        createdAt: game.createdAt ?? null,
        stats: {
          ftm: playerRow.ftm,
          fta: playerRow.fta,
          fg2m: playerRow.fg2m,
          fg2a: playerRow.fg2a,
          fg3m: playerRow.fg3m,
          fg3a: playerRow.fg3a,
          ast: playerRow.ast,
          oreb: playerRow.oreb,
          dreb: playerRow.dreb,
          reb: playerRow.reb,
          points: playerRow.points,
        },
      };
    })
    .sort((gameA, gameB) => publicGameTimeValue(gameB) - publicGameTimeValue(gameA));
}

function buildPublicPlayerSummary(gameRows) {
  const totals = gameRows.reduce(
    (summary, game) => ({
      points: summary.points + game.stats.points,
      reb: summary.reb + game.stats.reb,
      ast: summary.ast + game.stats.ast,
    }),
    { points: 0, reb: 0, ast: 0 }
  );
  const gamesCount = gameRows.length;

  return {
    gamesCount,
    ...totals,
    pointsPerGame: gamesCount > 0 ? totals.points / gamesCount : 0,
    reboundsPerGame: gamesCount > 0 ? totals.reb / gamesCount : 0,
    assistsPerGame: gamesCount > 0 ? totals.ast / gamesCount : 0,
  };
}

async function createTeamForUser(userId, payload) {
  const players = (payload.players || []).map((player) => ({
    displayName: player.displayName.trim(),
    jerseyNumber: player.jerseyNumber,
    isActive: true,
  }));

  ensureNoDuplicatePlayers(players);

  const team = await createTeam({
    ownerUserId: userId,
    name: payload.name.trim(),
    players,
  });

  return sanitizeTeam(team);
}

async function listTeamsForUser(userId) {
  const teams = await listTeamsByOwner(userId);
  return teams.map(sanitizeTeam);
}

async function getTeamForUser(userId, teamId) {
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(404, 'Team not found');
  }

  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  return sanitizeTeam(team);
}

async function getPublicTeam(teamId) {
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(404, 'Team not found');
  }

  const team = await findTeamById(teamId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const games = await listGamesByTeamId(teamId);
  const players = team.players
    .filter((player) => Boolean(player.isActive))
    .sort((playerA, playerB) => {
      const aHasNumber = typeof playerA.jerseyNumber === 'number';
      const bHasNumber = typeof playerB.jerseyNumber === 'number';

      if (aHasNumber && bHasNumber && playerA.jerseyNumber !== playerB.jerseyNumber) {
        return playerA.jerseyNumber - playerB.jerseyNumber;
      }
      if (aHasNumber !== bHasNumber) {
        return aHasNumber ? -1 : 1;
      }
      return playerA.displayName.localeCompare(playerB.displayName);
    })
    .map((player) => ({
      id: String(player._id),
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber ?? null,
    }));

  return {
    team: {
      id: String(team._id),
      name: team.name,
      players,
    },
    summary: buildPublicTeamSummary(games, team),
    games: games.map(sanitizePublicGame),
  };
}

async function getPublicPlayer(teamId, playerId) {
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(404, 'Team not found');
  }

  const team = await findTeamById(teamId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const player = findPlayerById(team, playerId);
  if (!player) {
    throw new ApiError(404, 'Player not found');
  }

  const games = await listGamesByTeamId(teamId);
  const gameRows = buildPublicPlayerGameRows(games, team, player);

  return {
    team: {
      id: String(team._id),
      name: team.name,
    },
    player: sanitizePublicPlayer(player),
    summary: buildPublicPlayerSummary(gameRows),
    games: gameRows,
  };
}

async function listPublicExploreGames(limit = 10) {
  const games = await listCompletedGames();
  const selectedGames = [];
  const seenTeamIds = new Set();

  for (const game of games) {
    if (!isGamePubliclyViewable(game)) {
      continue;
    }

    const currentTeamId = String(game.teamId);
    if (seenTeamIds.has(currentTeamId)) {
      continue;
    }

    const team = await findTeamById(currentTeamId);
    if (!team) {
      continue;
    }

    seenTeamIds.add(currentTeamId);
    selectedGames.push({
      id: String(game._id),
      title: game.title,
      opponent: game.opponent ?? null,
      scheduledAt: game.scheduledAt ?? null,
      completedAt: game.completedAt ?? null,
      createdAt: game.createdAt ?? null,
      teamPoints: computeTeamPoints(game),
      team: {
        id: String(team._id),
        name: team.name,
      },
    });

    if (selectedGames.length >= limit) {
      break;
    }
  }

  return selectedGames;
}

async function updateTeamForUser(userId, teamId, payload) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  if (payload.name) {
    team.name = payload.name.trim();
  }

  await saveTeam(team);
  return sanitizeTeam(team);
}

async function addPlayerToTeam(userId, teamId, payload) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const targetName = normalizeName(payload.displayName);
  const duplicate = team.players.some(
    (player) => Boolean(player.isActive) && normalizeName(player.displayName) === targetName
  );

  if (duplicate) {
    throw new ApiError(400, 'Player display name already exists in team');
  }

  team.players.push({
    displayName: payload.displayName.trim(),
    jerseyNumber: payload.jerseyNumber,
    isActive: true,
  });

  await saveTeam(team);
  return sanitizeTeam(team);
}

async function updatePlayerOnTeam(userId, teamId, playerId, payload) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const player = team.players.id(playerId);
  if (!player) {
    throw new ApiError(404, 'Player not found');
  }

  if (payload.displayName) {
    const next = normalizeName(payload.displayName);
    const duplicate = team.players.some(
      (candidate) =>
        String(candidate._id) !== String(player._id) &&
        Boolean(candidate.isActive) &&
        normalizeName(candidate.displayName) === next
    );

    if (duplicate) {
      throw new ApiError(400, 'Player display name already exists in team');
    }

    player.displayName = payload.displayName.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'jerseyNumber')) {
    player.jerseyNumber = payload.jerseyNumber ?? undefined;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'isActive')) {
    player.isActive = payload.isActive;
  }

  await saveTeam(team);
  return sanitizeTeam(team);
}

async function deactivatePlayerOnTeam(userId, teamId, playerId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const player = team.players.id(playerId);
  if (!player) {
    throw new ApiError(404, 'Player not found');
  }

  player.isActive = false;
  await saveTeam(team);
  return sanitizeTeam(team);
}

module.exports = {
  createTeamForUser,
  listTeamsForUser,
  getTeamForUser,
  getPublicTeam,
  getPublicPlayer,
  listPublicExploreGames,
  buildPublicTeamSummary,
  buildPublicPlayerGameRows,
  buildPublicPlayerSummary,
  updateTeamForUser,
  addPlayerToTeam,
  updatePlayerOnTeam,
  deactivatePlayerOnTeam,
};
