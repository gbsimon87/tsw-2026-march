const { Router } = require('express');
const multer = require('multer');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const { env } = require('../../config/env');
const controller = require('./leagues.controller');

const leaguesRouter = Router();
const publicLeaguesRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.TEAM_LOGO_MAX_BYTES,
    files: 1,
  },
});

publicLeaguesRouter.get('/', asyncHandler(controller.listPublic));
publicLeaguesRouter.get('/:leagueSlug/standings', asyncHandler(controller.publicStandings));
publicLeaguesRouter.get('/:leagueSlug/games', asyncHandler(controller.publicGames));
publicLeaguesRouter.get(
  '/:leagueSlug/teams/:teamSlug/players/:leaguePlayerId',
  asyncHandler(controller.getPublicPlayer)
);
publicLeaguesRouter.get('/:leagueSlug/teams/:teamSlug', asyncHandler(controller.getPublicTeam));
publicLeaguesRouter.get('/:leagueSlug', asyncHandler(controller.getPublicBySlug));

leaguesRouter.use(authMiddleware);
leaguesRouter.post('/', asyncHandler(controller.create));
leaguesRouter.get('/', asyncHandler(controller.list));
leaguesRouter.get('/:leagueId', asyncHandler(controller.getById));
leaguesRouter.patch('/:leagueId', asyncHandler(controller.update));
leaguesRouter.post('/:leagueId/archive', asyncHandler(controller.archive));
leaguesRouter.get('/:leagueId/standings', asyncHandler(controller.standings));
leaguesRouter.get('/:leagueId/games', asyncHandler(controller.games));
leaguesRouter.post(
  '/:leagueId/logo',
  upload.single('logo'),
  asyncHandler(controller.uploadLeagueLogo)
);
leaguesRouter.delete('/:leagueId/logo', asyncHandler(controller.removeLeagueLogo));
leaguesRouter.post('/:leagueId/teams', asyncHandler(controller.createTeam));
leaguesRouter.get('/:leagueId/teams', asyncHandler(controller.listTeams));
leaguesRouter.get('/:leagueId/teams/:leagueTeamId', asyncHandler(controller.getTeam));
leaguesRouter.patch('/:leagueId/teams/:leagueTeamId', asyncHandler(controller.updateTeam));
leaguesRouter.post('/:leagueId/teams/:leagueTeamId/archive', asyncHandler(controller.archiveTeam));
leaguesRouter.post(
  '/:leagueId/teams/:leagueTeamId/logo',
  upload.single('logo'),
  asyncHandler(controller.uploadTeamLogo)
);
leaguesRouter.delete(
  '/:leagueId/teams/:leagueTeamId/logo',
  asyncHandler(controller.removeTeamLogo)
);
leaguesRouter.post('/:leagueId/teams/:leagueTeamId/players', asyncHandler(controller.addPlayer));
leaguesRouter.patch(
  '/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId',
  asyncHandler(controller.updatePlayer)
);
leaguesRouter.delete(
  '/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId',
  asyncHandler(controller.removePlayer)
);
leaguesRouter.post(
  '/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId/unclaim',
  asyncHandler(controller.unclaimPlayer)
);
leaguesRouter.get('/:leagueId/teams/:leagueTeamId/members', asyncHandler(controller.listMembers));
leaguesRouter.post('/:leagueId/teams/:leagueTeamId/managers', asyncHandler(controller.addManager));
leaguesRouter.patch(
  '/:leagueId/teams/:leagueTeamId/members/:memberId',
  asyncHandler(controller.updateMember)
);
leaguesRouter.delete(
  '/:leagueId/teams/:leagueTeamId/members/:memberId',
  asyncHandler(controller.removeMember)
);
leaguesRouter.post(
  '/:leagueId/teams/:leagueTeamId/join-requests',
  asyncHandler(controller.createJoin)
);
leaguesRouter.get(
  '/:leagueId/teams/:leagueTeamId/join-requests',
  asyncHandler(controller.listJoins)
);
leaguesRouter.post(
  '/:leagueId/teams/:leagueTeamId/join-requests/:requestId/approve',
  asyncHandler(controller.approveJoin)
);
leaguesRouter.post(
  '/:leagueId/teams/:leagueTeamId/join-requests/:requestId/reject',
  asyncHandler(controller.rejectJoin)
);
leaguesRouter.post(
  '/:leagueId/teams/:leagueTeamId/join-requests/:requestId/cancel',
  asyncHandler(controller.cancelJoin)
);

module.exports = {
  leaguesRouter,
  publicLeaguesRouter,
};
