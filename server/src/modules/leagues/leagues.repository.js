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

const leagueSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true, index: true },
    description: { type: String, trim: true, default: null },
    seasonLabel: { type: String, trim: true, default: null },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    isPublic: { type: Boolean, default: true },
    logo: { type: logoSchema, default: null },
    plan: { type: String, enum: ['free', 'pro', 'league'], default: 'free' },
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
    cancelAtPeriodEnd: { type: Boolean, default: false },
    trialEnd: { type: Date, default: null },
    billingEmail: { type: String, default: null },
    processedWebhookEventIds: { type: [String], default: [] },
    lastWebhookEventId: { type: String, default: null },
  },
  { timestamps: true }
);

leagueSchema.index({ ownerUserId: 1, status: 1 });

const leagueTeamSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    logo: { type: logoSchema, default: null },
    colors: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  },
  { timestamps: true }
);

leagueTeamSchema.index({ leagueId: 1, slug: 1 }, { unique: true });

const leaguePlayerSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: true,
      index: true,
    },
    displayName: { type: String, required: true, trim: true },
    jerseyNumber: { type: Number, default: null },
    position: { type: String, enum: ['PG', 'SG', 'SF', 'PF', 'C'], default: null },
    isActive: { type: Boolean, default: true },
    claimedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

const leagueTeamMemberSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['manager', 'helper', 'player'], required: true },
    leaguePlayerId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaguePlayer', default: null },
    status: { type: String, enum: ['active', 'removed'], default: 'active', index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

leagueTeamMemberSchema.index({ leagueTeamId: 1, userId: 1, status: 1 });

const leagueJoinRequestSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: true,
      index: true,
    },
    requesterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedRole: { type: String, enum: ['player', 'helper', 'team_manager'], required: true },
    requestedLeaguePlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaguePlayer',
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'canceled'],
      default: 'pending',
      index: true,
    },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

leagueJoinRequestSchema.index({ leagueTeamId: 1, requesterUserId: 1, status: 1 });

const leagueManagerSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'removed'], default: 'active', index: true },
  },
  { timestamps: true }
);

leagueManagerSchema.index({ leagueId: 1, userId: 1, status: 1 });

// OPT-010: materialised league standings. One doc per league; `rows` is the
// pre-computed standings array (same shape the live compute returns). Read path
// is an indexed findOne; write path is the recompute hook. Kept deliberately
// loose (Mixed rows) so the compute code stays the single source of truth for
// the row shape.
const leagueStandingsSchema = new mongoose.Schema(
  {
    leagueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'League',
      required: true,
      unique: true,
      index: true,
    },
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

// OPT-011: materialised per-player league aggregates. One doc per
// (leagueId, leagueTeamId, leaguePlayerId) — raw accumulated totals only
// (gamesCount + the OPT-006 player-stat-line fields). Per-game ppg/fantasy/DPOY
// scores are derived at READ time from these raw totals (roadmap: "keeps
// weight-tuning without recompute"), so tuning a formula never requires a
// recompute pass — only the raw box-score totals are persisted here.
const leaguePlayerStatsSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: true,
      index: true,
    },
    leaguePlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaguePlayer',
      required: true,
      index: true,
    },
    displayName: { type: String, default: null },
    gamesCount: { type: Number, default: 0 },
    ftm: { type: Number, default: 0 },
    fta: { type: Number, default: 0 },
    fg2m: { type: Number, default: 0 },
    fg2a: { type: Number, default: 0 },
    fg3m: { type: Number, default: 0 },
    fg3a: { type: Number, default: 0 },
    ast: { type: Number, default: 0 },
    oreb: { type: Number, default: 0 },
    dreb: { type: Number, default: 0 },
    reb: { type: Number, default: 0 },
    stl: { type: Number, default: 0 },
    blk: { type: Number, default: 0 },
    tov: { type: Number, default: 0 },
    foul: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
  },
  { timestamps: true }
);

leaguePlayerStatsSchema.index(
  { leagueId: 1, leagueTeamId: 1, leaguePlayerId: 1 },
  { unique: true }
);

const League = mongoose.models.League || mongoose.model('League', leagueSchema);
const LeagueTeam = mongoose.models.LeagueTeam || mongoose.model('LeagueTeam', leagueTeamSchema);
const LeaguePlayer =
  mongoose.models.LeaguePlayer || mongoose.model('LeaguePlayer', leaguePlayerSchema);
const LeagueTeamMember =
  mongoose.models.LeagueTeamMember || mongoose.model('LeagueTeamMember', leagueTeamMemberSchema);
const LeagueJoinRequest =
  mongoose.models.LeagueJoinRequest || mongoose.model('LeagueJoinRequest', leagueJoinRequestSchema);
const LeagueManager =
  mongoose.models.LeagueManager || mongoose.model('LeagueManager', leagueManagerSchema);
const LeagueStandings =
  mongoose.models.LeagueStandings || mongoose.model('LeagueStandings', leagueStandingsSchema);
const LeaguePlayerStats =
  mongoose.models.LeaguePlayerStats || mongoose.model('LeaguePlayerStats', leaguePlayerStatsSchema);

function createLeague(input) {
  return League.create(input);
}

function listLeaguesByOwner(ownerUserId) {
  return League.find({ ownerUserId }).sort({ createdAt: -1 });
}

function findLeaguesByOwner(ownerUserId) {
  return listLeaguesByOwner(ownerUserId);
}

function listPublicLeagues({ limit, cursor } = {}) {
  // OPT-018: single-source list → clean keyset pagination when a limit is
  // supplied. Without one, returns every public league (legacy behaviour).
  if (limit) {
    return League.find(applyIdCursor({ isPublic: true, status: 'active' }, cursor))
      .sort({ _id: -1 })
      .limit(limit + 1);
  }
  return League.find({ isPublic: true, status: 'active' }).sort({ createdAt: -1 });
}

function findLeagueById(leagueId) {
  return League.findById(leagueId);
}

function findLeagueByIdAndOwner(leagueId, ownerUserId) {
  return League.findOne({ _id: leagueId, ownerUserId });
}

function findLeagueBySlug(slug) {
  return League.findOne({ slug });
}

function listLeaguesByIds(leagueIds) {
  return League.find({ _id: { $in: leagueIds } }).sort({ createdAt: -1 });
}

function saveLeague(league) {
  return league.save();
}

// OPT-020: atomically claim a Stripe webhook event for a league. Returns the
// (updated) league if this caller won the claim, or null if the event was
// already processed / the league wasn't found (via filter).
function claimLeagueWebhookEvent(filter, eventId) {
  return claimWebhookEvent(League, filter, eventId);
}

function createLeagueTeam(input) {
  return LeagueTeam.create(input);
}

function listLeagueTeams(leagueId) {
  return LeagueTeam.find({ leagueId }).sort({ createdAt: 1 });
}

function findLeagueTeamById(leagueTeamId) {
  return LeagueTeam.findById(leagueTeamId);
}

function findLeagueTeamByIdAndLeague(leagueTeamId, leagueId) {
  return LeagueTeam.findOne({ _id: leagueTeamId, leagueId });
}

function findLeagueTeamByLeagueAndSlug(leagueId, slug) {
  return LeagueTeam.findOne({ leagueId, slug });
}

function saveLeagueTeam(leagueTeam) {
  return leagueTeam.save();
}

function createLeaguePlayer(input) {
  return LeaguePlayer.create(input);
}

function findLeaguePlayerById(leaguePlayerId) {
  return LeaguePlayer.findById(leaguePlayerId);
}

function findLeaguePlayerByIdAndTeam(leaguePlayerId, leagueTeamId) {
  return LeaguePlayer.findOne({ _id: leaguePlayerId, leagueTeamId });
}

function listLeaguePlayers(leagueTeamId) {
  return LeaguePlayer.find({ leagueTeamId }).sort({ createdAt: 1 });
}

function listLeaguePlayersByClaimedUser(userId) {
  return LeaguePlayer.find({ claimedByUserId: userId }).sort({ createdAt: -1 });
}

function listLeagueTeamsByIds(ids) {
  return LeagueTeam.find({ _id: { $in: ids } });
}

function saveLeaguePlayer(leaguePlayer) {
  return leaguePlayer.save();
}

function createLeagueTeamMember(input) {
  return LeagueTeamMember.create(input);
}

function findActiveLeagueTeamMember(leagueTeamId, userId) {
  return LeagueTeamMember.findOne({ leagueTeamId, userId, status: 'active' });
}

function findLeagueTeamMemberById(memberId) {
  return LeagueTeamMember.findById(memberId);
}

function listLeagueTeamMembers(leagueTeamId) {
  return LeagueTeamMember.find({ leagueTeamId, status: 'active' }).sort({ createdAt: 1 });
}

function listLeagueTeamManagersByLeague(leagueId) {
  return LeagueTeamMember.find({ leagueId, role: 'manager', status: 'active' }).sort({
    createdAt: 1,
  });
}

function listLeagueMembershipsForUser(userId) {
  return LeagueTeamMember.find({ userId, status: 'active' }).sort({ createdAt: -1 });
}

function saveLeagueTeamMember(member) {
  return member.save();
}

function createLeagueJoinRequest(input) {
  return LeagueJoinRequest.create(input);
}

function findLeagueJoinRequestById(requestId) {
  return LeagueJoinRequest.findById(requestId);
}

function findPendingLeagueJoinRequest(leagueTeamId, requesterUserId, requestedRole) {
  return LeagueJoinRequest.findOne({
    leagueTeamId,
    requesterUserId,
    status: 'pending',
    ...(requestedRole ? { requestedRole } : {}),
  });
}

function listLeagueJoinRequests(leagueTeamId) {
  return LeagueJoinRequest.find({ leagueTeamId }).sort({ createdAt: -1 });
}

function saveLeagueJoinRequest(request) {
  return request.save();
}

function createLeagueManager(input) {
  return LeagueManager.create(input);
}

function findLeagueManagerById(managerId) {
  return LeagueManager.findById(managerId);
}

function findActiveLeagueManager(leagueId, userId) {
  return LeagueManager.findOne({ leagueId, userId, status: 'active' });
}

function listLeagueManagersByLeague(leagueId) {
  return LeagueManager.find({ leagueId, status: 'active' }).sort({ createdAt: 1 });
}

function listLeaguesByManager(userId) {
  return LeagueManager.find({ userId, status: 'active' }).sort({ createdAt: -1 });
}

function saveLeagueManager(manager) {
  return manager.save();
}

// OPT-010: materialised standings read/write.
function findLeagueStandings(leagueId) {
  return LeagueStandings.findOne({ leagueId });
}

function upsertLeagueStandings(leagueId, rows) {
  return LeagueStandings.findOneAndUpdate(
    { leagueId },
    { $set: { rows } },
    { new: true, upsert: true }
  );
}

function deleteLeagueStandings(leagueId) {
  return LeagueStandings.deleteOne({ leagueId });
}

// OPT-011: materialised per-player league stats read/write.
function listLeaguePlayerStats(leagueId) {
  return LeaguePlayerStats.find({ leagueId }).lean();
}

// Full replace: delete every row for the league, then insert the fresh set.
// Simpler and just as correct as diffing, and this only ever runs on the
// post-response recompute path (never blocks a request).
async function replaceLeaguePlayerStats(leagueId, rows) {
  await LeaguePlayerStats.deleteMany({ leagueId });
  if (rows.length === 0) {
    return [];
  }
  return LeaguePlayerStats.insertMany(
    rows.map((row) => ({ ...row, leagueId })),
    { ordered: false }
  );
}

function deleteLeaguePlayerStats(leagueId) {
  return LeaguePlayerStats.deleteMany({ leagueId });
}

module.exports = {
  League,
  LeagueTeam,
  LeaguePlayer,
  LeagueTeamMember,
  LeagueManager,
  LeagueJoinRequest,
  LeagueStandings,
  findLeagueStandings,
  upsertLeagueStandings,
  deleteLeagueStandings,
  LeaguePlayerStats,
  listLeaguePlayerStats,
  replaceLeaguePlayerStats,
  deleteLeaguePlayerStats,
  createLeague,
  listLeaguesByOwner,
  listPublicLeagues,
  findLeagueById,
  findLeagueByIdAndOwner,
  findLeaguesByOwner,
  findLeagueBySlug,
  listLeaguesByIds,
  saveLeague,
  claimLeagueWebhookEvent,
  createLeagueTeam,
  listLeagueTeams,
  findLeagueTeamById,
  findLeagueTeamByIdAndLeague,
  findLeagueTeamByLeagueAndSlug,
  saveLeagueTeam,
  createLeaguePlayer,
  findLeaguePlayerById,
  findLeaguePlayerByIdAndTeam,
  listLeaguePlayers,
  listLeaguePlayersByClaimedUser,
  listLeagueTeamsByIds,
  saveLeaguePlayer,
  createLeagueTeamMember,
  findActiveLeagueTeamMember,
  findLeagueTeamMemberById,
  listLeagueTeamMembers,
  listLeagueTeamManagersByLeague,
  listLeagueMembershipsForUser,
  saveLeagueTeamMember,
  createLeagueJoinRequest,
  findLeagueJoinRequestById,
  findPendingLeagueJoinRequest,
  listLeagueJoinRequests,
  saveLeagueJoinRequest,
  createLeagueManager,
  findLeagueManagerById,
  findActiveLeagueManager,
  listLeagueManagersByLeague,
  listLeaguesByManager,
  saveLeagueManager,
};
