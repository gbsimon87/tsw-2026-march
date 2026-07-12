const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./export.controller');

const exportRouter = Router();

exportRouter.use(authMiddleware);

// A signed-in user exports their own stats across every claimed profile.
exportRouter.get('/my-sporty', asyncHandler(controller.exportMySporty));

// League owner / manager exports league-wide data for a season.
exportRouter.get('/leagues/:leagueId/season/:seasonId', asyncHandler(controller.exportLeague));

// Team manager (or league owner/manager) exports a single team's data.
exportRouter.get(
  '/leagues/:leagueId/teams/:leagueTeamId/season/:seasonId',
  asyncHandler(controller.exportTeam)
);

module.exports = {
  exportRouter,
};
