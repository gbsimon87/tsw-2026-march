const followsService = require('./follows.service');
const { ApiError } = require('../../utils/apiError');
const { followingQuerySchema, followStatusQuerySchema } = require('./follows.validation');

function requireAuthUserId(req) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  return req.auth.userId;
}

async function follow(req, res) {
  const userId = requireAuthUserId(req);
  const { targetType, targetId } = req.params;
  const result = await followsService.followTarget(userId, targetType, targetId);
  res.status(201).json({ follow: result });
}

async function unfollow(req, res) {
  const userId = requireAuthUserId(req);
  const { targetType, targetId } = req.params;
  const result = await followsService.unfollowTarget(userId, targetType, targetId);
  res.status(200).json(result);
}

async function listFollowing(req, res) {
  const userId = requireAuthUserId(req);
  const options = followingQuerySchema.parse(req.query);
  const { following, nextCursor } = await followsService.listFollowing(userId, options);
  res.status(200).json({ following, nextCursor });
}

async function status(req, res) {
  const userId = requireAuthUserId(req);
  const { targetType, targetIds } = followStatusQuerySchema.parse(req.query);
  const { statuses } = await followsService.getFollowStatuses(userId, targetType, targetIds);
  res.status(200).json({ statuses });
}

module.exports = {
  follow,
  unfollow,
  listFollowing,
  status,
};
