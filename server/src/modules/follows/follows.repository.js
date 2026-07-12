const mongoose = require('mongoose');
const { applyIdCursor } = require('../../utils/pagination');

// Follow System. Follows are account-level: one follow edge per
// (follower, target). The schema is polymorphic: `targetType` selects which
// kind of entity `targetId` points at. v1.5 (2026-07-12) widened the enum from
// ['user'] to also cover 'league' and 'leagueTeam' — an additive change with no
// migration (existing 'user' rows are untouched). `targetId` intentionally has
// no `ref` because it is polymorphic. Standalone `Team` is deliberately absent
// (no public surface / visibility model yet). See docs/follow-system-teams-leagues/.
const followSchema = new mongoose.Schema(
  {
    followerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['user', 'league', 'leagueTeam'],
      required: true,
      default: 'user',
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

// Dedupe guard: at most one follow per (follower, target). The unique index is
// what makes follow idempotent — a repeat insert throws a duplicate-key error
// the service treats as "already following".
followSchema.index({ followerUserId: 1, targetType: 1, targetId: 1 }, { unique: true });
// Keyset listing of a user's follows (newest first), paginated on _id.
followSchema.index({ followerUserId: 1, _id: -1 });

const Follow = mongoose.models.Follow || mongoose.model('Follow', followSchema);

// Idempotent create: upsert so a repeat follow is a no-op rather than a
// duplicate-key error. `setOnInsert` keeps the original createdAt intact.
async function createFollow({ followerUserId, targetType, targetId }) {
  return Follow.findOneAndUpdate(
    { followerUserId, targetType, targetId },
    { $setOnInsert: { followerUserId, targetType, targetId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function deleteFollow({ followerUserId, targetType, targetId }) {
  return Follow.deleteOne({ followerUserId, targetType, targetId });
}

async function findFollow({ followerUserId, targetType, targetId }) {
  return Follow.findOne({ followerUserId, targetType, targetId });
}

async function listFollowingByUser(followerUserId, { targetType = 'user', limit, cursor } = {}) {
  const query = applyIdCursor({ followerUserId, targetType }, cursor);
  const cursorQuery = Follow.find(query).sort({ _id: -1 });
  if (limit) {
    return cursorQuery.limit(limit + 1);
  }
  return cursorQuery;
}

// Which of `targetIds` does `followerUserId` currently follow? Returns a Set of
// stringified target ids for cheap membership checks by the caller.
async function findFollowedTargetIds(followerUserId, { targetType = 'user', targetIds = [] } = {}) {
  if (!targetIds.length) return new Set();
  const rows = await Follow.find({
    followerUserId,
    targetType,
    targetId: { $in: targetIds },
  }).select('targetId');
  return new Set(rows.map((row) => String(row.targetId)));
}

module.exports = {
  Follow,
  createFollow,
  deleteFollow,
  findFollow,
  listFollowingByUser,
  findFollowedTargetIds,
};
