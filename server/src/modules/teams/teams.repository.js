const mongoose = require('mongoose');
const { claimWebhookEvent } = require('../../utils/webhookIdempotency');
const { applyIdCursor } = require('../../utils/pagination');

const logoSchema = new mongoose.Schema(
  {
    url: { type: String, default: null },
    publicId: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    mimeType: { type: String, default: null },
  },
  { _id: false }
);

const homeVenueSchema = new mongoose.Schema(
  {
    arenaName: { type: String, trim: true, default: null },
    addressLine1: { type: String, trim: true, default: null },
    addressLine2: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    postalCode: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true },
    jerseyNumber: { type: Number },
    position: { type: String, enum: ['PG', 'SG', 'SF', 'PF', 'C'], default: null },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const teamSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    logo: { type: logoSchema, default: null },
    colors: { type: [String], default: [] },
    homeVenue: { type: homeVenueSchema, default: null },
    players: { type: [playerSchema], default: [] },
    plan: { type: String, enum: ['free', 'pro', 'team'], default: 'free' },
    // How this team's plan is granted. 'stripe' = billed via Stripe (webhooks own it);
    // 'manual'/'comp' = granted outside Stripe (webhooks skip these). See T-10.
    billingSource: { type: String, enum: ['stripe', 'manual', 'comp'], default: 'stripe' },
    subscriptionStatus: {
      type: String,
      enum: ['inactive', 'trialing', 'active', 'past_due', 'canceled'],
      default: 'inactive',
    },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    stripePriceId: { type: String, default: null },
    billingInterval: { type: String, enum: ['monthly', 'season', null], default: null },
    currentPeriodEnd: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    billingEmail: { type: String, default: null },
    lastWebhookEventId: { type: String, default: null },
    processedWebhookEventIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

teamSchema.index({ ownerUserId: 1, name: 1 });

// OPT-013: materialised standalone-team season summary. One doc per team;
// `summary` is the pre-computed object `buildPublicTeamSummary` returns
// (gamesCount, stat totals, boxScore). Mixed because that compute function
// stays the single source of truth for the shape. Read path is an indexed
// findOne; write path is the recompute hook (mirrors OPT-010's leaguestandings).
const teamSeasonSummarySchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      unique: true,
      index: true,
    },
    summary: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const Team = mongoose.models.Team || mongoose.model('Team', teamSchema);
const TeamSeasonSummary =
  mongoose.models.TeamSeasonSummary || mongoose.model('TeamSeasonSummary', teamSeasonSummarySchema);

async function createTeam(input) {
  return Team.create(input);
}

async function listTeamsByOwner(ownerUserId, { limit, cursor } = {}) {
  // OPT-018: paginate only when a limit is supplied (the /teams endpoint);
  // internal callers omit it and get every team, unchanged.
  if (limit) {
    return Team.find(applyIdCursor({ ownerUserId }, cursor))
      .sort({ _id: -1 })
      .limit(limit + 1);
  }
  return Team.find({ ownerUserId }).sort({ createdAt: -1 });
}

async function findTeamByIdAndOwner(teamId, ownerUserId) {
  return Team.findOne({ _id: teamId, ownerUserId });
}

async function findTeamById(teamId) {
  return Team.findById(teamId);
}

async function listTeams() {
  return Team.find().sort({ createdAt: -1 });
}

async function saveTeam(team) {
  return team.save();
}

// OPT-020: atomically claim a Stripe webhook event for a team. Returns the
// (updated) team if this caller won the claim, or null if the event was
// already processed / the team wasn't found. Callers apply their effect only
// on a non-null result.
function claimTeamWebhookEvent(teamId, eventId) {
  return claimWebhookEvent(Team, { _id: teamId }, eventId);
}

// OPT-013: materialised team season summary read/write.
function findTeamSeasonSummary(teamId) {
  return TeamSeasonSummary.findOne({ teamId });
}

function upsertTeamSeasonSummary(teamId, summary) {
  return TeamSeasonSummary.findOneAndUpdate(
    { teamId },
    { $set: { summary } },
    { new: true, upsert: true }
  );
}

function deleteTeamSeasonSummary(teamId) {
  return TeamSeasonSummary.deleteOne({ teamId });
}

module.exports = {
  Team,
  createTeam,
  listTeamsByOwner,
  findTeamByIdAndOwner,
  findTeamById,
  listTeams,
  saveTeam,
  claimTeamWebhookEvent,
  TeamSeasonSummary,
  findTeamSeasonSummary,
  upsertTeamSeasonSummary,
  deleteTeamSeasonSummary,
};
