const { Router } = require('express');
const multer = require('multer');
const { env } = require('../../../config/env');
const {
  authMiddleware,
  platformOperatorMiddleware,
} = require('../../../middleware/auth.middleware');
const { asyncHandler } = require('../../../utils/asyncHandler');
const controller = require('./instagram.controller');

const instagramRouter = Router();
const socialImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FEED_IMAGE_MAX_BYTES, files: 1 },
});

instagramRouter.use(authMiddleware, platformOperatorMiddleware);
instagramRouter.get('/status', asyncHandler(controller.status));
instagramRouter.post('/oauth/start', asyncHandler(controller.startOAuth));
instagramRouter.get('/oauth/callback', asyncHandler(controller.oauthCallback));
instagramRouter.post('/verify', asyncHandler(controller.verify));
instagramRouter.post('/token/refresh', asyncHandler(controller.refreshToken));
instagramRouter.delete('/connection', asyncHandler(controller.disconnect));
instagramRouter.get('/posts', asyncHandler(controller.listSocialPosts));
instagramRouter.post(
  '/posts',
  socialImageUpload.single('file'),
  asyncHandler(controller.createSocialPost)
);
instagramRouter.post('/posts/:postId/ready', asyncHandler(controller.markSocialPostReady));
instagramRouter.post('/posts/:postId/approve', asyncHandler(controller.approveSocialPost));
instagramRouter.post('/posts/:postId/queue', asyncHandler(controller.queueSocialPost));
instagramRouter.post('/posts/:postId/cancel', asyncHandler(controller.cancelSocialPost));

module.exports = { instagramRouter };
