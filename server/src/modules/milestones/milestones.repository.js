const mongoose = require('mongoose');
const { MILESTONE_FAMILIES, MILESTONE_TIERS } = require('./milestones.catalog');

// Player Milestones (docs/player-milestones.md §6). Append-only ledger of
// milestones a player has earned. Idempotency is a property of the dedupeKey
// unique index, NOT of application logic — re-running detection for a game is
// always safe, which is what lets finalize retries, post-completion edits and
// the backfill script all share one code path.
const playerMilestoneSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', default: null },
    // `user:<id>` when the roster row is claimed, else `player:<id>`. See
    // spec §3 — LeaguePlayer.leagueTeamId never changes, so a claimed user id
    // is the only thread linking a player's rows across teams in a league.
    careerKey: { type: String, required: true, index: true },
    leaguePlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaguePlayer',
      required: true,
    },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: true,
    },
    // Denormalised so the unified /players/:userId profile can read every
    // milestone for a user without first resolving their LeaguePlayer rows.
    claimedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    milestoneKey: { type: String, required: true },
    family: { type: String, enum: Object.values(MILESTONE_FAMILIES), required: true },
    tier: { type: String, enum: Object.values(MILESTONE_TIERS), required: true },
    statKey: { type: String, default: null },
    value: { type: Number, default: null },
    label: { type: String, default: null },
    // Persisted so the feed cap can rank a game's milestones without
    // re-running the catalog. Lower is rarer; 99 means profile-tier.
    rarityRank: { type: Number, default: 99 },
    sourceGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    achievedAt: { type: Date, required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    dedupeKey: { type: String, required: true },
  },
  { timestamps: true }
);

playerMilestoneSchema.index({ dedupeKey: 1 }, { unique: true });
playerMilestoneSchema.index({ leaguePlayerId: 1, achievedAt: -1 });
playerMilestoneSchema.index({ claimedByUserId: 1, achievedAt: -1 });
playerMilestoneSchema.index({ sourceGameId: 1 });

const PlayerMilestone =
  mongoose.models.PlayerMilestone || mongoose.model('PlayerMilestone', playerMilestoneSchema);

// One string carries the whole idempotency rule, so a single unique index
// covers both once-per-career milestones and repeatable per-game feats.
function buildDedupeKey({ careerKey, milestoneKey, family, sourceGameId }) {
  if (family === MILESTONE_FAMILIES.SINGLE_GAME_FEAT) {
    return `${careerKey}|${milestoneKey}|${String(sourceGameId)}`;
  }
  return `${careerKey}|${milestoneKey}`;
}

// Unordered insert so one duplicate does not abort the batch. E11000 means the
// milestone was already awarded — expected on any re-run, never a failure.
async function insertMilestones(docs) {
  if (!docs || docs.length === 0) return [];
  try {
    return await PlayerMilestone.insertMany(docs, { ordered: false, rawResult: false });
  } catch (error) {
    if (error?.code === 11000 || error?.writeErrors) {
      return error.insertedDocs || [];
    }
    throw error;
  }
}

function listMilestonesByLeaguePlayerIds(leaguePlayerIds, { limit = 5 } = {}) {
  return PlayerMilestone.find({ leaguePlayerId: { $in: leaguePlayerIds } })
    .sort({ achievedAt: -1 })
    .limit(limit)
    .lean();
}

function countMilestonesByLeaguePlayerIds(leaguePlayerIds) {
  return PlayerMilestone.countDocuments({ leaguePlayerId: { $in: leaguePlayerIds } });
}

function listMilestonesByCareerKey(careerKey, { limit = 20, cursor = null } = {}) {
  const query = { careerKey };
  if (cursor) {
    query._id = { $lt: cursor };
  }
  return PlayerMilestone.find(query).sort({ _id: -1 }).limit(limit).lean();
}

function listMilestonesByCareerKeys(careerKeys) {
  return PlayerMilestone.find({ careerKey: { $in: careerKeys } })
    .sort({ achievedAt: -1 })
    .lean();
}

function listMilestonesBySourceGameId(gameId) {
  return PlayerMilestone.find({ sourceGameId: gameId }).lean();
}

async function deleteMilestonesByIds(ids) {
  if (!ids || ids.length === 0) return { deletedCount: 0 };
  return PlayerMilestone.deleteMany({ _id: { $in: ids } });
}

async function updateMilestoneCareerKey(id, careerKey, dedupeKey) {
  await PlayerMilestone.updateOne({ _id: id }, { $set: { careerKey, dedupeKey } });
}

async function setMilestonePostId(id, postId) {
  await PlayerMilestone.updateOne({ _id: id }, { $set: { postId } });
}

module.exports = {
  PlayerMilestone,
  buildDedupeKey,
  insertMilestones,
  listMilestonesByLeaguePlayerIds,
  countMilestonesByLeaguePlayerIds,
  listMilestonesByCareerKey,
  listMilestonesByCareerKeys,
  listMilestonesBySourceGameId,
  deleteMilestonesByIds,
  updateMilestoneCareerKey,
  setMilestonePostId,
};
