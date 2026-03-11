const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./games.controller');

const gamesRouter = Router();

gamesRouter.use(authMiddleware);
gamesRouter.post('/', asyncHandler(controller.create));
gamesRouter.get('/', asyncHandler(controller.list));
gamesRouter.get('/:gameId', asyncHandler(controller.getById));
gamesRouter.post('/:gameId/events', asyncHandler(controller.appendEvent));
gamesRouter.delete('/:gameId/events/:eventId', asyncHandler(controller.removeEvent));
gamesRouter.post('/:gameId/finish', asyncHandler(controller.finish));

module.exports = {
  gamesRouter,
};
