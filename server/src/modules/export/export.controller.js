const exportService = require('./export.service');
const { sendCsv } = require('../../utils/csv');
const { ApiError } = require('../../utils/apiError');
const {
  leagueExportParamsSchema,
  teamExportParamsSchema,
  leagueExportQuerySchema,
} = require('./export.validation');

function requireAuthUserId(req) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  return req.auth.userId;
}

async function exportMySporty(req, res) {
  const userId = requireAuthUserId(req);
  const { filename, csv } = await exportService.buildMySportyCsv(userId);
  sendCsv(res, filename, csv);
}

async function exportLeague(req, res) {
  const userId = requireAuthUserId(req);
  const { leagueId, seasonId } = leagueExportParamsSchema.parse(req.params);
  const { dataset } = leagueExportQuerySchema.parse(req.query);
  const { filename, csv } = await exportService.buildLeagueCsv(userId, leagueId, seasonId, dataset);
  sendCsv(res, filename, csv);
}

async function exportTeam(req, res) {
  const userId = requireAuthUserId(req);
  const { leagueId, leagueTeamId, seasonId } = teamExportParamsSchema.parse(req.params);
  const { filename, csv } = await exportService.buildTeamCsv(
    userId,
    leagueId,
    leagueTeamId,
    seasonId
  );
  sendCsv(res, filename, csv);
}

module.exports = {
  exportMySporty,
  exportLeague,
  exportTeam,
};
