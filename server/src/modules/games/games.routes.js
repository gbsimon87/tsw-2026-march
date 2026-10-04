const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware, optionalAuthMiddleware } = require('../../middleware/auth.middleware');
const { publicCacheMiddleware } = require('../../middleware/publicCache.middleware');
const { noStoreMiddleware } = require('../../middleware/noStore.middleware');
const { videoUploadLimiter } = require('../../middleware/rateLimit.middleware');
const controller = require('./games.controller');
const videoController = require('../video/video.controller');

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
// Mux game video (R2): upload URLs and (T6) playback tokens are bearer
// credentials — every /video response is private, no-store, errors included,
// so this runs before authentication.
gamesRouter.use('/:gameId/video', noStoreMiddleware);
gamesRouter.use(authMiddleware);
gamesRouter.post('/', asyncHandler(controller.create));
gamesRouter.get('/', asyncHandler(controller.list));
gamesRouter.patch('/:gameId', asyncHandler(controller.update));
gamesRouter.post('/:gameId/lineup', asyncHandler(controller.setLineup));
gamesRouter.patch('/:gameId/clock', asyncHandler(controller.updateClock));
gamesRouter.post('/:gameId/roster', asyncHandler(controller.addRosterPlayer));
gamesRouter.post('/:gameId/events', asyncHandler(controller.appendEvent));
gamesRouter.post(
  '/:gameId/events/:eventId/insert-before',
  asyncHandler(controller.insertEventBefore)
);
gamesRouter.patch('/:gameId/events/:eventId', asyncHandler(controller.updateEvent));
gamesRouter.delete('/:gameId/events/:eventId', asyncHandler(controller.removeEvent));
gamesRouter.post('/:gameId/finish', asyncHandler(controller.finish));
gamesRouter.delete('/:gameId', asyncHandler(controller.deleteGame));
// E5: the per-user upload limiter must run after authMiddleware (keyed by req.auth.userId).
gamesRouter.post(
  '/:gameId/video/uploads',
  videoUploadLimiter,
  asyncHandler(videoController.createUpload)
);
gamesRouter.delete('/:gameId/video/uploads/:attemptId', asyncHandler(videoController.cancelUpload));
gamesRouter.delete('/:gameId/video', asyncHandler(videoController.remove));

module.exports = {
  gamesRouter,
};
