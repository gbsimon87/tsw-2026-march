const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./follows.controller');

const followsRouter = Router();

// Follow System. Every route is auth-gated — only signed-in users can follow,
// and the follower identity always comes from req.auth.userId (never the
// client). POST/DELETE additionally require the app-wide CSRF token.
followsRouter.use(authMiddleware);

followsRouter.get('/following', asyncHandler(controller.listFollowing));
followsRouter.get('/status', asyncHandler(controller.status));

// Back-compat alias for the original users-only routes (v1). Kept so any cached
// client bundle keeps working during rollout; remove in a later cleanup PR once
// confirmed unused. Must be registered BEFORE the generic :targetType routes so
// the literal /users path wins over the param match.
function withUserTarget(req, _res, next) {
  req.params.targetType = 'user';
  req.params.targetId = req.params.userId;
  next();
}
followsRouter.post('/users/:userId', withUserTarget, asyncHandler(controller.follow));
followsRouter.delete('/users/:userId', withUserTarget, asyncHandler(controller.unfollow));

// Generic polymorphic routes: /follows/:targetType/:targetId. The targetType is
// validated inside the service (400 on unknown type).
followsRouter.post('/:targetType/:targetId', asyncHandler(controller.follow));
followsRouter.delete('/:targetType/:targetId', asyncHandler(controller.unfollow));

module.exports = {
  followsRouter,
};
