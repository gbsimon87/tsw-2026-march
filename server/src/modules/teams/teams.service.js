const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const {
  createTeam,
  listTeamsByOwner,
  findTeamByIdAndOwner,
  saveTeam,
} = require('./teams.repository');

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
  addPlayerToTeam,
  updatePlayerOnTeam,
  deactivatePlayerOnTeam,
};
