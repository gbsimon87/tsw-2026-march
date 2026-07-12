const mongoose = require('mongoose');

// A League Season scopes games/standings/stats to a bounded competitive
// period. Rosters (LeagueTeam/LeaguePlayer/LeagueTeamMember/LeagueManager)
// deliberately do NOT reference seasonId — they carry over across seasons
// automatically (see docs/league-seasons/000-SEASONS-TRACKER.md decision #4).
const seasonSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// At most one active season per league at a time. leagueId/status also each
// carry a single-field index (declared inline above) for general lookups —
// this compound index only covers active docs, so it doesn't replace those.
seasonSchema.index(
  { leagueId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

const Season = mongoose.models.Season || mongoose.model('Season', seasonSchema);

function createSeason(input) {
  return Season.create(input);
}

function findSeasonById(seasonId) {
  return Season.findById(seasonId);
}

function findSeasonByIdAndLeague(seasonId, leagueId) {
  return Season.findOne({ _id: seasonId, leagueId });
}

function listSeasonsByLeague(leagueId) {
  return Season.find({ leagueId }).sort({ createdAt: -1 });
}

function saveSeason(season) {
  return season.save();
}

module.exports = {
  Season,
  createSeason,
  findSeasonById,
  findSeasonByIdAndLeague,
  listSeasonsByLeague,
  saveSeason,
};
