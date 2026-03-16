const { Router } = require('express');
const multer = require('multer');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const { env } = require('../../config/env');
const controller = require('./teams.controller');

const teamsRouter = Router();
const publicTeamsRouter = Router();
const publicOpponentsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.TEAM_LOGO_MAX_BYTES,
    files: 1,
  },
});

publicTeamsRouter.get('/explore', asyncHandler(controller.listPublicExploreGames));
publicTeamsRouter.get('/:teamId/players/:playerId', asyncHandler(controller.getPublicPlayerById));
publicTeamsRouter.get('/:teamId', asyncHandler(controller.getPublicById));
publicOpponentsRouter.get('/:opponentSlug', asyncHandler(controller.getPublicOpponentBySlug));
teamsRouter.use(authMiddleware);
teamsRouter.post('/', asyncHandler(controller.create));
teamsRouter.get('/', asyncHandler(controller.list));
teamsRouter.get('/:teamId', asyncHandler(controller.getById));
teamsRouter.get('/:teamId/entitlements', asyncHandler(controller.getEntitlements));
teamsRouter.patch('/:teamId', asyncHandler(controller.update));
teamsRouter.post('/:teamId/logo', upload.single('logo'), asyncHandler(controller.uploadLogo));
teamsRouter.delete('/:teamId/logo', asyncHandler(controller.removeLogo));
teamsRouter.post('/:teamId/players', asyncHandler(controller.addPlayer));
teamsRouter.patch('/:teamId/players/:playerId', asyncHandler(controller.updatePlayer));
teamsRouter.delete('/:teamId/players/:playerId', asyncHandler(controller.removePlayer));

module.exports = {
  teamsRouter,
  publicTeamsRouter,
  publicOpponentsRouter,
};
