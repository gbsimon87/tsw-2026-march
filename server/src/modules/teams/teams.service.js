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
const { listGamesByTeamId } = require('../games/games.repository');

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

function buildPublicTeamSummary(games) {
  const includedGames = games.filter(
    (game) => game.status === 'completed' && isGamePubliclyViewable(game)
  );

  const totals = createEmptyTeamStatSummary();

  for (const game of includedGames) {
    for (const event of game.events) {
      applyEventToTeamStatSummary(totals, event.statType);
    }
  }

  return {
    gamesCount: includedGames.length,
    ...finalizeTeamStatSummary(totals),
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
    summary: buildPublicTeamSummary(games),
    games: games.map(sanitizePublicGame),
  };
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
  buildPublicTeamSummary,
  updateTeamForUser,
  addPlayerToTeam,
  updatePlayerOnTeam,
  deactivatePlayerOnTeam,
};
