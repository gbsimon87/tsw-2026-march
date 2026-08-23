const { Router } = require('express');
const {
  authMiddleware,
  platformOperatorMiddleware,
} = require('../../../middleware/auth.middleware');
const { asyncHandler } = require('../../../utils/asyncHandler');
const controller = require('./instagram.controller');

const instagramRouter = Router();

instagramRouter.use(authMiddleware, platformOperatorMiddleware);
instagramRouter.get('/status', asyncHandler(controller.status));
instagramRouter.post('/oauth/start', asyncHandler(controller.startOAuth));
instagramRouter.get('/oauth/callback', asyncHandler(controller.oauthCallback));
instagramRouter.post('/verify', asyncHandler(controller.verify));
instagramRouter.delete('/connection', asyncHandler(controller.disconnect));

module.exports = { instagramRouter };
