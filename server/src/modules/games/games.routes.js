const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./games.controller');

const gamesRouter = Router();

gamesRouter.get('/:gameId', asyncHandler(controller.getPublicById));
gamesRouter.use(authMiddleware);
gamesRouter.post('/', asyncHandler(controller.create));
gamesRouter.get('/', asyncHandler(controller.list));
gamesRouter.patch('/:gameId', asyncHandler(controller.update));
gamesRouter.post('/:gameId/lineup', asyncHandler(controller.setLineup));
gamesRouter.post('/:gameId/events', asyncHandler(controller.appendEvent));
gamesRouter.post(
  '/:gameId/events/:eventId/insert-before',
  asyncHandler(controller.insertEventBefore)
);
gamesRouter.delete('/:gameId/events/:eventId', asyncHandler(controller.removeEvent));
gamesRouter.post('/:gameId/finish', asyncHandler(controller.finish));
gamesRouter.delete('/:gameId', asyncHandler(controller.deleteGame));

module.exports = {
  gamesRouter,
};
