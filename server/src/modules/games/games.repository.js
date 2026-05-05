const mongoose = require('mongoose');
const { STAT_TYPES, SHOT_ZONE_IDS, TEAM_SIDES } = require('../shared/stats.constants');

const participantSchema = new mongoose.Schema(
  {
    side: { type: String, enum: [TEAM_SIDES.HOME, TEAM_SIDES.AWAY], required: true },
    participantType: { type: String, enum: ['team', 'league_team'], required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    leagueTeamId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
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
    teamSide: {
      type: String,
      enum: [TEAM_SIDES.HOME, TEAM_SIDES.AWAY],
      required: false,
      index: true,
    },
    relatedTeamSide: {
      type: String,
      enum: [TEAM_SIDES.HOME, TEAM_SIDES.AWAY],
      required: false,
    },
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
    homeLeagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      default: null,
      index: true,
    },
    awayLeagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      default: null,
      index: true,
    },
    trackedLeagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      default: null,
      index: true,
    },
    homeTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null, index: true },
    awayTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null, index: true },
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
  },
  { timestamps: true }
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
  return Game.find({ status: 'completed' }).sort({
    scheduledAt: -1,
    completedAt: -1,
    createdAt: -1,
  });
}

async function listLeagueGamesByLeagueId(leagueId) {
  return Game.find({ gameContext: 'league', leagueId }).sort({
    scheduledAt: -1,
    completedAt: -1,
    createdAt: -1,
  });
}

async function findGameByLeagueIdAndId(leagueId, gameId) {
  return Game.findOne({ _id: gameId, leagueId, gameContext: 'league' });
}

async function saveGame(game) {
  return game.save();
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
  listLeagueGamesByLeagueId,
  findGameByLeagueIdAndId,
  saveGame,
};
