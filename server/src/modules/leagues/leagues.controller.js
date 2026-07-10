const {
  createLeagueSchema,
  updateLeagueSchema,
  createLeagueTeamSchema,
  updateLeagueTeamSchema,
  leaguePlayerSchema,
  updateLeaguePlayerSchema,
  addManagerSchema,
  updateMemberSchema,
  createJoinRequestSchema,
  createSeasonSchema,
} = require('./leagues.validation');
const leaguesService = require('./leagues.service');
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
  const payload = createLeagueSchema.parse(req.body);
  const league = await leaguesService.createLeagueForUser(userId, payload);
  res.status(201).json({ league });
}

async function list(req, res) {
  const userId = requireAuthUserId(req);
  // OPT-018: params validated for a consistent contract; this list merges
  // owned+member+managed leagues so it returns nextCursor:null (see service).
  paginationQuerySchema.parse(req.query);
  const { leagues, nextCursor } = await leaguesService.listLeaguesForUser(userId);
  res.status(200).json({ leagues, nextCursor });
}

async function getMyProfiles(req, res) {
  const userId = requireAuthUserId(req);
  const result = await leaguesService.getMyLeagueProfiles(userId);
  res.status(200).json(result);
}

async function listPublic(req, res) {
  // OPT-018: single-source public list → real keyset pagination.
  const options = paginationQuerySchema.parse(req.query);
  const { leagues, nextCursor } = await leaguesService.listPublicLeagues(options);
  res.status(200).json({ leagues, nextCursor });
}

async function getById(req, res) {
  const userId = requireAuthUserId(req);
  const league = await leaguesService.getLeagueForUser(
    userId,
    req.params.leagueId,
    req.query.seasonId || undefined
  );
  res.status(200).json({ league });
}

async function getPublicBySlug(req, res) {
  const league = await leaguesService.getPublicLeagueBySlug(
    req.params.leagueSlug,
    req.auth?.userId || null,
    req.query.seasonId || undefined
  );
  res.status(200).json({ league });
}

async function update(req, res) {
  const userId = requireAuthUserId(req);
  const payload = updateLeagueSchema.parse(req.body);
  const league = await leaguesService.updateLeagueForUser(userId, req.params.leagueId, payload);
  res.status(200).json({ league });
}

async function archive(req, res) {
  const userId = requireAuthUserId(req);
  const league = await leaguesService.archiveLeagueForUser(userId, req.params.leagueId);
  res.status(200).json({ league });
}

async function createTeam(req, res) {
  const userId = requireAuthUserId(req);
  const payload = createLeagueTeamSchema.parse(req.body);
  const team = await leaguesService.createLeagueTeamForLeague(userId, req.params.leagueId, payload);
  res.status(201).json({ team });
}

async function listTeams(req, res) {
  const userId = requireAuthUserId(req);
  const teams = await leaguesService.listTeamsForLeagueViewer(userId, req.params.leagueId);
  res.status(200).json({ teams });
}

async function getTeam(req, res) {
  const userId = requireAuthUserId(req);
  const team = await leaguesService.getLeagueTeamForUser(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId
  );
  res.status(200).json({ team });
}

async function getPublicTeam(req, res) {
  const result = await leaguesService.getPublicLeagueTeamBySlug(
    req.params.leagueSlug,
    req.params.teamSlug,
    req.auth?.userId || null,
    req.query.seasonId || undefined
  );
  res.status(200).json(result);
}

async function getPublicPlayer(req, res) {
  const result = await leaguesService.getPublicLeaguePlayerBySlug(
    req.params.leagueSlug,
    req.params.teamSlug,
    req.params.leaguePlayerId,
    req.auth?.userId || null
  );
  res.status(200).json(result);
}

async function updateTeam(req, res) {
  const userId = requireAuthUserId(req);
  const payload = updateLeagueTeamSchema.parse(req.body);
  const team = await leaguesService.updateLeagueTeamForLeague(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    payload
  );
  res.status(200).json({ team });
}

async function archiveTeam(req, res) {
  const userId = requireAuthUserId(req);
  const team = await leaguesService.archiveLeagueTeamForLeague(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId
  );
  res.status(200).json({ team });
}

async function uploadLeagueLogo(req, res) {
  const userId = requireAuthUserId(req);
  const league = await leaguesService.uploadLeagueLogo(userId, req.params.leagueId, req.file);
  res.status(200).json({ league });
}

async function removeLeagueLogo(req, res) {
  const userId = requireAuthUserId(req);
  const league = await leaguesService.removeLeagueLogo(userId, req.params.leagueId);
  res.status(200).json({ league });
}

async function uploadTeamLogo(req, res) {
  const userId = requireAuthUserId(req);
  const team = await leaguesService.uploadLeagueTeamLogo(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.file
  );
  res.status(200).json({ team });
}

async function removeTeamLogo(req, res) {
  const userId = requireAuthUserId(req);
  const team = await leaguesService.removeLeagueTeamLogo(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId
  );
  res.status(200).json({ team });
}

async function addPlayer(req, res) {
  const userId = requireAuthUserId(req);
  const payload = leaguePlayerSchema.parse(req.body);
  const player = await leaguesService.addPlayerToLeagueTeam(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    payload
  );
  res.status(201).json({ player });
}

async function updatePlayer(req, res) {
  const userId = requireAuthUserId(req);
  const payload = updateLeaguePlayerSchema.parse(req.body);
  const player = await leaguesService.updateLeaguePlayer(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.params.leaguePlayerId,
    payload
  );
  res.status(200).json({ player });
}

async function removePlayer(req, res) {
  const userId = requireAuthUserId(req);
  const player = await leaguesService.removeLeaguePlayer(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.params.leaguePlayerId
  );
  res.status(200).json({ player });
}

async function unclaimPlayer(req, res) {
  const userId = requireAuthUserId(req);
  const player = await leaguesService.unclaimLeaguePlayer(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.params.leaguePlayerId
  );
  res.status(200).json({ player });
}

async function listMembers(req, res) {
  const userId = requireAuthUserId(req);
  const members = await leaguesService.listLeagueMembersForTeam(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId
  );
  res.status(200).json({ members });
}

async function addManager(req, res) {
  const userId = requireAuthUserId(req);
  const payload = addManagerSchema.parse(req.body);
  const member = await leaguesService.addManagerByEmail(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    payload.email
  );
  res.status(200).json({ member });
}

async function updateMember(req, res) {
  const userId = requireAuthUserId(req);
  const payload = updateMemberSchema.parse(req.body);
  const member = await leaguesService.updateLeagueMember(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.params.memberId,
    payload
  );
  res.status(200).json({ member });
}

async function removeMember(req, res) {
  const userId = requireAuthUserId(req);
  const member = await leaguesService.removeLeagueMember(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.params.memberId
  );
  res.status(200).json({ member });
}

async function listLeagueManagers(req, res) {
  const userId = requireAuthUserId(req);
  const managers = await leaguesService.listLeagueManagersForLeague(userId, req.params.leagueId);
  res.status(200).json({ managers });
}

async function addLeagueManager(req, res) {
  const userId = requireAuthUserId(req);
  const payload = addManagerSchema.parse(req.body);
  const manager = await leaguesService.addLeagueManagerByEmail(
    userId,
    req.params.leagueId,
    payload.email
  );
  res.status(201).json({ manager });
}

async function removeLeagueManager(req, res) {
  const userId = requireAuthUserId(req);
  const manager = await leaguesService.removeLeagueManagerById(
    userId,
    req.params.leagueId,
    req.params.managerId
  );
  res.status(200).json({ manager });
}

async function createJoin(req, res) {
  const userId = requireAuthUserId(req);
  const payload = createJoinRequestSchema.parse(req.body);
  const request = await leaguesService.createJoinRequest(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    payload
  );
  res.status(201).json({ request });
}

async function listJoins(req, res) {
  const userId = requireAuthUserId(req);
  const requests = await leaguesService.listJoinRequests(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId
  );
  res.status(200).json({ requests });
}

async function approveJoin(req, res) {
  const userId = requireAuthUserId(req);
  const request = await leaguesService.approveJoinRequest(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.params.requestId
  );
  res.status(200).json({ request });
}

async function rejectJoin(req, res) {
  const userId = requireAuthUserId(req);
  const request = await leaguesService.rejectJoinRequest(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.params.requestId
  );
  res.status(200).json({ request });
}

async function cancelJoin(req, res) {
  const userId = requireAuthUserId(req);
  const request = await leaguesService.cancelJoinRequest(
    userId,
    req.params.leagueId,
    req.params.leagueTeamId,
    req.params.requestId
  );
  res.status(200).json({ request });
}

async function standings(req, res) {
  const userId = requireAuthUserId(req);
  const league = await leaguesService.getLeagueForUser(
    userId,
    req.params.leagueId,
    req.query.seasonId || undefined
  );
  const standings = league.standings || [];
  res.status(200).json({ standings });
}

async function publicStandings(req, res) {
  const league = await leaguesService.getPublicLeagueBySlug(
    req.params.leagueSlug,
    req.auth?.userId || null,
    req.query.seasonId || undefined
  );
  res.status(200).json({ standings: league.standings });
}

async function games(req, res) {
  const userId = requireAuthUserId(req);
  const league = await leaguesService.getLeagueForUser(
    userId,
    req.params.leagueId,
    req.query.seasonId || undefined
  );
  const games = league.games || [];
  res.status(200).json({ games });
}

async function publicGames(req, res) {
  const league = await leaguesService.getPublicLeagueBySlug(
    req.params.leagueSlug,
    req.auth?.userId || null,
    req.query.seasonId || undefined
  );
  res.status(200).json({ games: league.games });
}

async function getPublicLeaders(req, res) {
  const result = await leaguesService.getPublicLeagueLeaders(
    req.params.leagueSlug,
    10,
    req.auth?.userId || null,
    req.query.seasonId || undefined
  );
  res.status(200).json(result);
}

async function createSeasonHandler(req, res) {
  const userId = requireAuthUserId(req);
  const payload = createSeasonSchema.parse(req.body);
  const season = await leaguesService.createSeasonForLeague(userId, req.params.leagueId, payload);
  res.status(201).json({ season });
}

async function listSeasonsHandler(req, res) {
  const userId = requireAuthUserId(req);
  const seasons = await leaguesService.listSeasonsForLeague(userId, req.params.leagueId);
  res.status(200).json({ seasons });
}

async function completeSeasonHandler(req, res) {
  const userId = requireAuthUserId(req);
  const season = await leaguesService.completeSeasonForUser(
    userId,
    req.params.leagueId,
    req.params.seasonId
  );
  res.status(200).json({ season });
}

async function listPublicSeasonsHandler(req, res) {
  const seasons = await leaguesService.listPublicSeasonsForLeague(
    req.params.leagueSlug,
    req.auth?.userId || null
  );
  res.status(200).json({ seasons });
}

module.exports = {
  create,
  list,
  getMyProfiles,
  listPublic,
  getById,
  getPublicBySlug,
  update,
  archive,
  createTeam,
  listTeams,
  getTeam,
  getPublicTeam,
  getPublicPlayer,
  updateTeam,
  archiveTeam,
  uploadLeagueLogo,
  removeLeagueLogo,
  uploadTeamLogo,
  removeTeamLogo,
  addPlayer,
  updatePlayer,
  removePlayer,
  unclaimPlayer,
  listMembers,
  addManager,
  updateMember,
  removeMember,
  createJoin,
  listJoins,
  approveJoin,
  rejectJoin,
  cancelJoin,
  standings,
  publicStandings,
  games,
  publicGames,
  getPublicLeaders,
  listLeagueManagers,
  addLeagueManager,
  removeLeagueManager,
  createSeason: createSeasonHandler,
  listSeasons: listSeasonsHandler,
  completeSeason: completeSeasonHandler,
  listPublicSeasons: listPublicSeasonsHandler,
};
