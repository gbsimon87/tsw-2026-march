const {
  createTeamSchema,
  updateTeamSchema,
  addPlayerSchema,
  updatePlayerSchema,
} = require('./teams.validation');
const teamsService = require('./teams.service');
const { ApiError } = require('../../utils/apiError');
const { paginationQuerySchema } = require('../shared/pagination.validation');

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
  // OPT-018: validated cursor/limit; response keeps `teams` + adds nextCursor.
  const options = paginationQuerySchema.parse(req.query);
  const { teams, nextCursor } = await teamsService.listTeamsForUser(userId, options);
  res.status(200).json({ teams, nextCursor });
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

async function listPublicTeams(req, res) {
  const teams = await teamsService.listPublicTeams();
  res.status(200).json({ teams });
}

async function getPublicPlayerById(req, res) {
  const result = await teamsService.getPublicPlayer(req.params.teamId, req.params.playerId);
  res.status(200).json(result);
}

async function getPublicOpponentBySlug(req, res) {
  const result = await teamsService.getPublicOpponentBySlug(req.params.opponentSlug);
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

async function uploadLogo(req, res) {
  const userId = requireAuthUserId(req);
  const team = await teamsService.uploadLogoForTeam(userId, req.params.teamId, req.file);
  res.status(200).json({ team });
}

async function removeLogo(req, res) {
  const userId = requireAuthUserId(req);
  const team = await teamsService.removeLogoFromTeam(userId, req.params.teamId);
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

async function requestPlayerClaim(req, res) {
  const userId = requireAuthUserId(req);
  const request = await teamsService.requestStandalonePlayerClaim(
    userId,
    req.params.teamId,
    req.params.playerId
  );
  res.status(201).json({ request });
}

async function listPlayerClaimRequests(req, res) {
  const userId = requireAuthUserId(req);
  const requests = await teamsService.listStandalonePlayerClaimRequests(userId, req.params.teamId);
  res.status(200).json({ requests });
}

async function approvePlayerClaim(req, res) {
  const userId = requireAuthUserId(req);
  const request = await teamsService.reviewStandalonePlayerClaim(
    userId,
    req.params.teamId,
    req.params.requestId,
    'approved'
  );
  res.status(200).json({ request });
}

async function rejectPlayerClaim(req, res) {
  const userId = requireAuthUserId(req);
  const request = await teamsService.reviewStandalonePlayerClaim(
    userId,
    req.params.teamId,
    req.params.requestId,
    'rejected'
  );
  res.status(200).json({ request });
}

async function getMyPlayerProfiles(req, res) {
  const userId = requireAuthUserId(req);
  const profiles = await teamsService.getMyStandalonePlayerProfiles(userId);
  res.status(200).json({ profiles });
}

module.exports = {
  create,
  list,
  getById,
  listPublicExploreGames,
  listPublicTeams,
  getPublicById,
  getPublicPlayerById,
  getPublicOpponentBySlug,
  getEntitlements,
  update,
  uploadLogo,
  removeLogo,
  addPlayer,
  updatePlayer,
  removePlayer,
  requestPlayerClaim,
  listPlayerClaimRequests,
  approvePlayerClaim,
  rejectPlayerClaim,
  getMyPlayerProfiles,
};
