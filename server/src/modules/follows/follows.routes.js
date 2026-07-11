const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./follows.controller');

const followsRouter = Router();

// User Follow System v1. Every route is auth-gated — only signed-in users can
// follow, and the follower identity always comes from req.auth.userId (never
// the client). POST/DELETE additionally require the app-wide CSRF token.
followsRouter.use(authMiddleware);

followsRouter.get('/following', asyncHandler(controller.listFollowing));
followsRouter.get('/status', asyncHandler(controller.status));
followsRouter.post('/users/:userId', asyncHandler(controller.follow));
followsRouter.delete('/users/:userId', asyncHandler(controller.unfollow));

module.exports = {
  followsRouter,
};
