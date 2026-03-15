const {
  createTeamSchema,
  updateTeamSchema,
  addPlayerSchema,
  updatePlayerSchema,
} = require('./teams.validation');
const teamsService = require('./teams.service');
const { ApiError } = require('../../utils/apiError');

function requireAuthUserId(req) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  return req.auth.userId;
}

async function create(req, res) {
  const userId = requireAuthUserId(req);
  const payload = createTeamSchema.parse(req.body);
  const team = await teamsService.createTeamForUser(userId, payload);
  res.status(201).json({ team });
}

async function list(req, res) {
  const userId = requireAuthUserId(req);
  const teams = await teamsService.listTeamsForUser(userId);
  res.status(200).json({ teams });
}

async function getById(req, res) {
  const userId = requireAuthUserId(req);
  const team = await teamsService.getTeamForUser(userId, req.params.teamId);
  res.status(200).json({ team });
}

async function getPublicById(req, res) {
  const result = await teamsService.getPublicTeam(req.params.teamId);
  res.status(200).json(result);
}

async function listPublicExploreGames(req, res) {
  const games = await teamsService.listPublicExploreGames();
  res.status(200).json({ games });
}

async function getPublicPlayerById(req, res) {
  const result = await teamsService.getPublicPlayer(req.params.teamId, req.params.playerId);
  res.status(200).json(result);
}

async function getEntitlements(req, res) {
  const userId = requireAuthUserId(req);
  const result = await teamsService.getEntitlementsForUser(userId, req.params.teamId);
  res.status(200).json(result);
}

async function update(req, res) {
  const userId = requireAuthUserId(req);
  const payload = updateTeamSchema.parse(req.body);
  const team = await teamsService.updateTeamForUser(userId, req.params.teamId, payload);
  res.status(200).json({ team });
}

async function addPlayer(req, res) {
  const userId = requireAuthUserId(req);
  const payload = addPlayerSchema.parse(req.body);
  const team = await teamsService.addPlayerToTeam(userId, req.params.teamId, payload);
  res.status(200).json({ team });
}

async function updatePlayer(req, res) {
  const userId = requireAuthUserId(req);
  const payload = updatePlayerSchema.parse(req.body);
  const team = await teamsService.updatePlayerOnTeam(
    userId,
    req.params.teamId,
    req.params.playerId,
    payload
  );
  res.status(200).json({ team });
}

async function removePlayer(req, res) {
  const userId = requireAuthUserId(req);
  const team = await teamsService.deactivatePlayerOnTeam(
    userId,
    req.params.teamId,
    req.params.playerId
  );
  res.status(200).json({ team });
}

module.exports = {
  create,
  list,
  getById,
  listPublicExploreGames,
  getPublicById,
  getPublicPlayerById,
  getEntitlements,
  update,
  addPlayer,
  updatePlayer,
  removePlayer,
};
