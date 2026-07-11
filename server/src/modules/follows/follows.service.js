const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const { buildCursorPage } = require('../../utils/pagination');
const { transformCloudinaryUrl } = require('../shared/cloudinaryUrl');
const { findUserById, findUsersByIds } = require('../auth/auth.repository');
const { assembleLeagueProfilesForUser } = require('../leagues/leagues.service');
const {
  createFollow,
  deleteFollow,
  listFollowingByUser,
  findFollowedTargetIds,
} = require('./follows.repository');

const USER_TARGET = 'user';

function assertValidUserId(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(404, 'User not found');
  }
}

// A user has a public profile if they own at least one claimed league-player
// in a *public* league — the same condition getPublicUserProfiles uses to
// decide whether GET /public/players/:userId returns 200 or 404. Reusing the
// shared assembler keeps the "does /players/:userId exist?" answer in one place.
async function userHasPublicProfile(userId) {
  const profiles = await assembleLeagueProfilesForUser(userId);
  return profiles.some((profile) => profile.league?.isPublic === true);
}

async function followUser(followerUserId, targetUserId) {
  assertValidUserId(targetUserId);

  if (String(followerUserId) === String(targetUserId)) {
    throw new ApiError(400, 'You cannot follow yourself');
  }

  const target = await findUserById(targetUserId);
  if (!target) {
    throw new ApiError(404, 'User not found');
  }

  // Idempotent: the repository upserts, so re-following is a no-op success.
  await createFollow({
    followerUserId,
    targetType: USER_TARGET,
    targetId: targetUserId,
  });

  return { targetUserId: String(targetUserId), isFollowing: true };
}

async function unfollowUser(followerUserId, targetUserId) {
  assertValidUserId(targetUserId);

  // Idempotent: deleting a non-existent follow is a success.
  await deleteFollow({
    followerUserId,
    targetType: USER_TARGET,
    targetId: targetUserId,
  });

  return { targetUserId: String(targetUserId), isFollowing: false };
}

async function listFollowing(followerUserId, options = {}) {
  const rows = await listFollowingByUser(followerUserId, {
    targetType: USER_TARGET,
    limit: options.limit,
    cursor: options.cursor,
  });

  const { items, nextCursor } = options.limit
    ? buildCursorPage(rows, options.limit)
    : { items: rows, nextCursor: null };

  // Batch-hydrate the followed users (no N+1). A follow is durable: if the
  // account was deleted it simply drops out of the hydrated list.
  const targetIds = items.map((row) => String(row.targetId));
  const users = await findUsersByIds(targetIds);
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  const following = [];
  for (const row of items) {
    const user = usersById.get(String(row.targetId));
    if (!user) continue;

    // Durable follow (decision D5): show a minimal card even when the user has
    // no public profile right now — profileHref just degrades to null.
    const hasPublicProfile = await userHasPublicProfile(user._id);
    following.push({
      userId: String(user._id),
      name: user.name,
      avatarUrl: transformCloudinaryUrl(user.avatar?.url || null),
      hasPublicProfile,
      profileHref: hasPublicProfile ? `/players/${String(user._id)}` : null,
    });
  }

  return { following, nextCursor };
}

async function getFollowStatuses(followerUserId, targetUserIds = []) {
  const uniqueIds = [...new Set(targetUserIds.map(String))];
  const followedSet = await findFollowedTargetIds(followerUserId, {
    targetType: USER_TARGET,
    targetIds: uniqueIds,
  });

  const statuses = {};
  for (const id of uniqueIds) {
    statuses[id] = followedSet.has(id);
  }
  return { statuses };
}

module.exports = {
  followUser,
  unfollowUser,
  listFollowing,
  getFollowStatuses,
  userHasPublicProfile,
};
