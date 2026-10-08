const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware, optionalAuthMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./scrimmages.controller');
const { noStoreMiddleware } = require('../../middleware/noStore.middleware');
const scrimmagesRouter = Router();
scrimmagesRouter.use(noStoreMiddleware);
scrimmagesRouter.get('/', optionalAuthMiddleware, asyncHandler(controller.list));
scrimmagesRouter.get('/managed', authMiddleware, asyncHandler(controller.managed));
scrimmagesRouter.get('/my-profiles', authMiddleware, asyncHandler(controller.profiles));
scrimmagesRouter.get('/:scrimmageId', optionalAuthMiddleware, asyncHandler(controller.detail));
scrimmagesRouter.get(
  '/:scrimmageId/players/:playerId',
  optionalAuthMiddleware,
  asyncHandler(controller.playerProfile)
);
scrimmagesRouter.get(
  '/:scrimmageId/sessions/:sessionId',
  optionalAuthMiddleware,
  asyncHandler(controller.sessionDetail)
);
scrimmagesRouter.use(authMiddleware);
scrimmagesRouter.post('/', asyncHandler(controller.create));
scrimmagesRouter.patch('/:scrimmageId', asyncHandler(controller.update));
scrimmagesRouter.post('/:scrimmageId/players', asyncHandler(controller.addPlayer));
scrimmagesRouter.get('/:scrimmageId/import-options', asyncHandler(controller.importOptions));
scrimmagesRouter.patch('/:scrimmageId/players/:playerId', asyncHandler(controller.updatePlayer));
scrimmagesRouter.post('/:scrimmageId/seasons', asyncHandler(controller.resetSeason));
scrimmagesRouter.post('/:scrimmageId/join', asyncHandler(controller.join));
scrimmagesRouter.get('/:scrimmageId/join-requests', asyncHandler(controller.requests));
scrimmagesRouter.patch('/:scrimmageId/join-requests/:requestId', asyncHandler(controller.review));
scrimmagesRouter.post('/:scrimmageId/sessions', asyncHandler(controller.createSession));
scrimmagesRouter.patch(
  '/:scrimmageId/sessions/:sessionId/assignments',
  asyncHandler(controller.editAssignments)
);
scrimmagesRouter.post(
  '/:scrimmageId/sessions/:sessionId/terms',
  asyncHandler(controller.acceptSession)
);
scrimmagesRouter.post('/:scrimmageId/sessions/:sessionId/games', asyncHandler(controller.newGame));
scrimmagesRouter.post(
  '/:scrimmageId/sessions/:sessionId/finish',
  asyncHandler(controller.finishSession)
);
scrimmagesRouter.post(
  '/:scrimmageId/sessions/:sessionId/publish',
  asyncHandler(controller.publishSession)
);
scrimmagesRouter.post(
  '/:scrimmageId/players/:playerId/merge',
  asyncHandler(controller.mergePlayers)
);
module.exports = { scrimmagesRouter };
