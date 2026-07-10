const mongoose = require('mongoose');
const { STAT_TYPES, SHOT_ZONE_IDS, TEAM_SIDES } = require('../shared/stats.constants');
const { applyIdCursor } = require('../../utils/pagination');

const participantSchema = new mongoose.Schema(
  {
    side: { type: String, enum: [TEAM_SIDES.HOME, TEAM_SIDES.AWAY], required: true },
    participantType: { type: String, enum: ['team', 'league_team'], required: true },
    // OPT-007: no query ever filters on homeParticipant.teamId/leagueTeamId (or
    // the away side) — dropped the per-field index; it only cost writes.
    teamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    leagueTeamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // OPT-022: this field was always written at game-creation time
    // (games.service.js sets `slug: context.homeTeam.slug`) but Mongoose
    // silently drops unknown fields on save, so it was never actually
    // persisted — every read fell through to a per-request
    // `findLeagueTeamById` backfill lookup in `resolveDualGameParticipants`.
    // Declaring it here makes it persist for real; see
    // scripts/backfill-participant-slug.js for pre-existing games.
    slug: { type: String, default: null },
    displayName: { type: String, required: true, trim: true },
    logo: {
      type: new mongoose.Schema(
        {
          url: { type: String, default: null },
          width: { type: Number, default: null },
          height: { type: Number, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    colors: { type: [String], default: [] },
    billingSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    entitlementsSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const shotEventSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, required: false },
    statType: {
      type: String,
      enum: [
        STAT_TYPES.FT_MADE,
        STAT_TYPES.FT_MISS,
        STAT_TYPES.FG2_MADE,
        STAT_TYPES.FG2_MISS,
        STAT_TYPES.FG3_MADE,
        STAT_TYPES.FG3_MISS,
        STAT_TYPES.OPP_FT_MADE,
        STAT_TYPES.OPP_FG2_MADE,
        STAT_TYPES.OPP_FG3_MADE,
        STAT_TYPES.OPP_REB,
        STAT_TYPES.AST,
        STAT_TYPES.OREB,
        STAT_TYPES.DREB,
        STAT_TYPES.STL,
        STAT_TYPES.BLK,
        STAT_TYPES.TOV,
        STAT_TYPES.FOUL,
        STAT_TYPES.SUB_IN,
        STAT_TYPES.SUB_OUT,
      ],
      required: true,
    },
    zoneId: {
      type: String,
      enum: [
        SHOT_ZONE_IDS.PAINT,
        SHOT_ZONE_IDS.MID_RANGE_LEFT,
        SHOT_ZONE_IDS.MID_RANGE_RIGHT,
        SHOT_ZONE_IDS.TOP_KEY,
        SHOT_ZONE_IDS.CORNER_LEFT_3,
        SHOT_ZONE_IDS.WING_LEFT_3,
        SHOT_ZONE_IDS.WING_RIGHT_3,
        SHOT_ZONE_IDS.CORNER_RIGHT_3,
        SHOT_ZONE_IDS.BACKCOURT,
        SHOT_ZONE_IDS.FREE_THROW_LINE,
      ],
    },
    x: { type: Number, min: 0, max: 100 },
    y: { type: Number, min: 0, max: 100 },
    relatedPlayerId: { type: mongoose.Schema.Types.ObjectId, required: false },
    // OPT-007: was `index: true` — a multikey index on an embedded-array field,
    // meaning every event push rewrote an index entry for it. No query anywhere
    // filters on events.teamSide (per-event team is always derived in app code
    // from the event's position/relatedPlayerId context); dropped.
    teamSide: {
      type: String,
      enum: [TEAM_SIDES.HOME, TEAM_SIDES.AWAY],
      required: false,
    },
    relatedTeamSide: {
      type: String,
      enum: [TEAM_SIDES.HOME, TEAM_SIDES.AWAY],
      required: false,
    },
    videoTimestamp: { type: Number, min: 0, required: false },
    occurredAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const rosterSnapshotPlayerSchema = new mongoose.Schema(
  {
    leaguePlayerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceType: { type: String, enum: ['team_player', 'league_player'], default: null },
    sourcePlayerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    displayName: { type: String, required: true, trim: true },
    jerseyNumber: { type: Number, default: null },
    position: {
      type: String,
      enum: ['PG', 'SG', 'SF', 'PF', 'C'],
      default: null,
    },
    claimedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isClaimed: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const aiSummarySchema = new mongoose.Schema(
  {
    text: { type: String, trim: true, default: null },
    source: { type: String, enum: ['ai', 'fallback'], default: 'fallback' },
    provider: { type: String, trim: true, default: null },
    model: { type: String, trim: true, default: null },
    generatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const gameSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: false, index: true },
    gameContext: {
      type: String,
      enum: ['standalone', 'league'],
      default: 'standalone',
      index: true,
    },
    trackingMode: {
      type: String,
      enum: ['one_sided', 'dual_team'],
      default: 'one_sided',
      index: true,
    },
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', default: null, index: true },
    // Null for standalone games and for league games created before the
    // Season feature shipped (see docs/league-seasons/000-SEASONS-TRACKER.md).
    // New league games always have this set, resolved server-side from
    // League.currentSeasonId — never client-supplied.
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', default: null, index: true },
    // OPT-007: dropped `index: true` on homeLeagueTeamId/awayLeagueTeamId/
    // homeTeamId/awayTeamId — each already starts a compound index below
    // ({field:1, createdAt:-1}), which fully covers any field-only query.
    // The standalone single-field index was pure redundant write cost.
    homeLeagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      default: null,
    },
    awayLeagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      default: null,
    },
    trackedLeagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      default: null,
      index: true,
    },
    homeTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    awayTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    initialActiveSide: {
      type: String,
      enum: [TEAM_SIDES.HOME, TEAM_SIDES.AWAY],
      default: TEAM_SIDES.HOME,
    },
    homeParticipant: { type: participantSchema, default: null },
    awayParticipant: { type: participantSchema, default: null },
    title: { type: String, required: true, trim: true },
    opponent: { type: String, trim: true, default: null },
    videoUrl: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
      index: true,
    },
    startingLineupPlayerIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    currentLineupPlayerIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    homeStartingLineupPlayerIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    homeCurrentLineupPlayerIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    awayStartingLineupPlayerIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    awayCurrentLineupPlayerIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    scheduledAt: { type: Date },
    completedAt: { type: Date },
    rosterSnapshot: { type: [rosterSnapshotPlayerSchema], default: [] },
    homeRosterSnapshot: { type: [rosterSnapshotPlayerSchema], default: [] },
    awayRosterSnapshot: { type: [rosterSnapshotPlayerSchema], default: [] },
    events: { type: [shotEventSchema], default: [] },
    // OPT-008: denormalised score + event count so list endpoints don't have to
    // load and sum the full events array. finalScore is frozen on completion and
    // refreshed on edits to completed games; eventCount is maintained on
    // append/delete. Both are null/absent for pre-existing games (compute-on-read
    // fallback covers those until backfilled).
    finalScore: {
      type: new mongoose.Schema(
        {
          home: { type: Number, default: 0 },
          away: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: null,
    },
    eventCount: { type: Number, default: null },
    // OPT-012: frozen box score + game summary, computed once at completion (and
    // refreshed on edits to completed games) instead of replaying the full
    // events array on every read. Mixed because the shape differs by
    // trackingMode (dual_team: {home,away}; one_sided: {players, teamTotals})
    // — the compute code in games.service.js stays the single source of truth
    // for the shape. Null/absent for in-progress and pre-existing games
    // (live-compute fallback covers those). recap/highlights intentionally NOT
    // frozen — they embed live player display names, so freezing would let
    // those go stale; see OPT-012's completion notes for the scope decision.
    boxScore: { type: mongoose.Schema.Types.Mixed, default: null },
    gameSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    aiSummary: { type: aiSummarySchema, default: null },
    aiSummaryGenerationLockId: { type: String, default: null, index: true },
    aiSummaryGenerationLockedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    // OPT-015: reject a save whose loaded version no longer matches the
    // stored version instead of silently clobbering a concurrent co-tracker's
    // event. Mongoose checks `__v` on save() and throws VersionError if it
    // was bumped by another write since this doc was loaded — this is the
    // "updatedAt-based optimistic concurrency check" the task asks for
    // (Mongoose's built-in version key is the standard idiom for exactly this
    // and needs no hand-rolled findOneAndUpdate filter across every mutable
    // field on this document).
    optimisticConcurrency: true,
  }
);

gameSchema.index({ ownerUserId: 1, teamId: 1, createdAt: -1 });
gameSchema.index({ homeTeamId: 1, createdAt: -1 });
gameSchema.index({ awayTeamId: 1, createdAt: -1 });
gameSchema.index({ homeLeagueTeamId: 1, createdAt: -1 });
gameSchema.index({ awayLeagueTeamId: 1, createdAt: -1 });

const Game = mongoose.models.Game || mongoose.model('Game', gameSchema);

async function createGame(input) {
  return Game.create(input);
}

async function listGamesByOwner(ownerUserId, filter = {}) {
  const query = { ownerUserId };

  if (filter.teamId) {
    query.teamId = filter.teamId;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  // OPT-018: keyset pagination. When a limit is supplied, page on `_id` desc
  // (same newest-first order as before) and over-fetch by one so the service
  // can derive nextCursor. No limit → legacy unbounded behaviour (internal
  // callers that need every row).
  if (filter.limit) {
    return Game.find(applyIdCursor(query, filter.cursor))
      .sort({ _id: -1 })
      .limit(filter.limit + 1);
  }

  return Game.find(query).sort({ createdAt: -1 });
}

async function findGameByIdAndOwner(gameId, ownerUserId) {
  return Game.findOne({ _id: gameId, ownerUserId });
}

async function findGameById(gameId) {
  return Game.findById(gameId);
}

async function listGamesByTeamId(teamId) {
  return Game.find({ teamId }).sort({ scheduledAt: -1, completedAt: -1, createdAt: -1 });
}

async function listGamesByStandaloneParticipantTeamId(teamId) {
  return Game.find({
    trackingMode: 'dual_team',
    $or: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
  }).sort({ scheduledAt: -1, completedAt: -1, createdAt: -1 });
}

async function listGamesByLeagueParticipantTeamId(leagueTeamId) {
  return Game.find({
    trackingMode: 'dual_team',
    $or: [{ homeLeagueTeamId: leagueTeamId }, { awayLeagueTeamId: leagueTeamId }],
  }).sort({ scheduledAt: -1, completedAt: -1, createdAt: -1 });
}

async function listCompletedGames() {
  // OPT-022: sole caller (feed.service.js listShareableGames) only filters/maps
  // plain fields, never saves — safe to skip document hydration.
  return Game.find({ status: 'completed' })
    .sort({
      scheduledAt: -1,
      completedAt: -1,
      createdAt: -1,
    })
    .lean();
}

// OPT-004: Optimized for public endpoints — no events, limited results
async function listPublicCompletedGames(limit = 100) {
  // OPT-022: all 3 callers (teams.service.js) only read plain fields (opponent
  // matching, computeTeamPoints via summarizeEvents(game.events), display
  // projection) and never save — safe to skip document hydration.
  return Game.find({ status: 'completed' })
    .select('-events -rosterSnapshot -boxScore')
    .lean()
    .sort({
      scheduledAt: -1,
      completedAt: -1,
      createdAt: -1,
    })
    .limit(limit);
}

// seasonId undefined preserves pre-Season "all games ever" behavior; pass
// null explicitly to match only legacy (pre-migration) games.
async function listLeagueGamesByLeagueId(leagueId, seasonId) {
  return Game.find({
    gameContext: 'league',
    leagueId,
    ...(seasonId !== undefined ? { seasonId } : {}),
  }).sort({
    scheduledAt: -1,
    completedAt: -1,
    createdAt: -1,
  });
}

async function findGameByLeagueIdAndId(leagueId, gameId) {
  return Game.findOne({ _id: gameId, leagueId, gameContext: 'league' });
}

// Auto Feed Generation (docs/auto-feed-generation/000-TRACKER.md): lean id-only
// lookup used when a league flips private, to find which games' auto-posts
// need reversing — avoids loading full Game docs (events etc.) for a cleanup
// pass that only needs ids.
async function listLeagueGameIdsByLeagueId(leagueId) {
  const games = await Game.find({ gameContext: 'league', leagueId }, { _id: 1 }).lean();
  return games.map((g) => g._id);
}

async function saveGame(game) {
  return game.save();
}

// OPT-020: a summary-generation lock is reclaimable once it's older than
// AI_SUMMARY_LOCK_TTL_MS. Without a TTL, a process that crashed (or an OpenAI
// call that hung) between claim and save would leave the lock set forever and
// no later finish/retry could ever generate the summary. `now` is injectable
// for deterministic tests.
const AI_SUMMARY_LOCK_TTL_MS = 2 * 60 * 1000;

async function claimGameSummaryGeneration(gameId, lockId, now = new Date()) {
  const staleThreshold = new Date(now.getTime() - AI_SUMMARY_LOCK_TTL_MS);
  return Game.findOneAndUpdate(
    {
      _id: gameId,
      gameContext: 'league',
      // Claimable when unlocked OR the existing lock has gone stale.
      $and: [
        {
          $or: [
            { aiSummaryGenerationLockId: null },
            { aiSummaryGenerationLockedAt: null },
            { aiSummaryGenerationLockedAt: { $lt: staleThreshold } },
          ],
        },
        {
          $or: [{ aiSummary: null }, { 'aiSummary.text': null }, { 'aiSummary.text': '' }],
        },
      ],
    },
    {
      $set: {
        aiSummaryGenerationLockId: lockId,
        aiSummaryGenerationLockedAt: now,
      },
    },
    { new: true }
  );
}

// OPT-020: release the lock without writing a summary — used when generation
// fails, so a later attempt can immediately re-claim instead of waiting out the
// TTL. Gated on lockId so we only clear a lock we still own.
async function releaseGameSummaryLock(gameId, lockId) {
  return Game.findOneAndUpdate(
    { _id: gameId, aiSummaryGenerationLockId: lockId },
    { $set: { aiSummaryGenerationLockId: null, aiSummaryGenerationLockedAt: null } },
    { new: true }
  );
}

async function saveGameSummary(gameId, lockId, summary) {
  return Game.findOneAndUpdate(
    {
      _id: gameId,
      aiSummaryGenerationLockId: lockId,
    },
    {
      $set: {
        aiSummary: summary,
      },
      $unset: {
        aiSummaryGenerationLockId: '',
        aiSummaryGenerationLockedAt: '',
      },
    },
    { new: true }
  );
}

module.exports = {
  createGame,
  listGamesByOwner,
  findGameByIdAndOwner,
  findGameById,
  listGamesByTeamId,
  listGamesByStandaloneParticipantTeamId,
  listGamesByLeagueParticipantTeamId,
  listCompletedGames,
  listPublicCompletedGames,
  listLeagueGamesByLeagueId,
  listLeagueGameIdsByLeagueId,
  findGameByLeagueIdAndId,
  saveGame,
  claimGameSummaryGeneration,
  releaseGameSummaryLock,
  saveGameSummary,
  AI_SUMMARY_LOCK_TTL_MS,
};
