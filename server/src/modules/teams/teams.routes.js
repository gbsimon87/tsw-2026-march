const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./teams.controller');

const teamsRouter = Router();
const publicTeamsRouter = Router();

publicTeamsRouter.get('/:teamId', asyncHandler(controller.getPublicById));
teamsRouter.use(authMiddleware);
teamsRouter.post('/', asyncHandler(controller.create));
teamsRouter.get('/', asyncHandler(controller.list));
teamsRouter.get('/:teamId', asyncHandler(controller.getById));
teamsRouter.patch('/:teamId', asyncHandler(controller.update));
teamsRouter.post('/:teamId/players', asyncHandler(controller.addPlayer));
teamsRouter.patch('/:teamId/players/:playerId', asyncHandler(controller.updatePlayer));
teamsRouter.delete('/:teamId/players/:playerId', asyncHandler(controller.removePlayer));

module.exports = {
  teamsRouter,
  publicTeamsRouter,
};
