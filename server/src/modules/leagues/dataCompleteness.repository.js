const mongoose = require('mongoose');

// A dismissal records an admin's judgement that a flagged issue is fine. It is
// scoped to a season, so next season every check runs fresh without anyone
// having to clean up.
const leagueDataIssueDismissalSchema = new mongoose.Schema(
  {
    leagueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'League',
      required: true,
      index: true,
    },
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Season',
      required: true,
      index: true,
    },
    // Stable identity of the flagged item, `<checkType>:<targetId>`. Contains no
    // mutable data — a rescheduled game keeps the same key, so the dismissal
    // survives, which is what the admin meant.
    issueKey: { type: String, required: true, trim: true, maxlength: 200 },
    dismissedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

leagueDataIssueDismissalSchema.index({ leagueId: 1, seasonId: 1, issueKey: 1 }, { unique: true });

const LeagueDataIssueDismissal =
  mongoose.models.LeagueDataIssueDismissal ||
  mongoose.model('LeagueDataIssueDismissal', leagueDataIssueDismissalSchema);

async function listDismissals(leagueId, seasonId) {
  return LeagueDataIssueDismissal.find({ leagueId, seasonId }).lean();
}

async function upsertDismissal({ leagueId, seasonId, issueKey, dismissedByUserId, note }) {
  return LeagueDataIssueDismissal.findOneAndUpdate(
    { leagueId, seasonId, issueKey },
    { $set: { dismissedByUserId, note: note ?? null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function deleteDismissal(leagueId, seasonId, issueKey) {
  const result = await LeagueDataIssueDismissal.deleteOne({ leagueId, seasonId, issueKey });
  return result?.deletedCount ?? 0;
}

module.exports = {
  LeagueDataIssueDismissal,
  listDismissals,
  upsertDismissal,
  deleteDismissal,
};
