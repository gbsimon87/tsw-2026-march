const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware, optionalAuthMiddleware } = require('../../middleware/auth.middleware');
const { publicCacheMiddleware } = require('../../middleware/publicCache.middleware');
const controller = require('./games.controller');

const gamesRouter = Router();

// OPT-019: this is the one anonymously-readable game route (optional auth). It
// personalises on req.auth, so publicCacheMiddleware only emits public caching
// headers when no auth token is present. Weak ETags (Express default) give
// anonymous viewers conditional revalidation on completed-game detail.
gamesRouter.get(
  '/:gameId',
  optionalAuthMiddleware,
  publicCacheMiddleware,
  asyncHandler(controller.getPublicById)
);
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
gamesRouter.patch('/:gameId/events/:eventId', asyncHandler(controller.updateEvent));
gamesRouter.delete('/:gameId/events/:eventId', asyncHandler(controller.removeEvent));
gamesRouter.post('/:gameId/finish', asyncHandler(controller.finish));
gamesRouter.delete('/:gameId', asyncHandler(controller.deleteGame));

module.exports = {
  gamesRouter,
};
