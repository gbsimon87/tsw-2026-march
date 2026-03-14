const mongoose = require('mongoose');
const { STAT_TYPES, SHOT_ZONE_IDS } = require('../shared/stats.constants');

const shotEventSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    statType: {
      type: String,
      enum: [
        STAT_TYPES.FT_MADE,
        STAT_TYPES.FT_MISS,
        STAT_TYPES.FG2_MADE,
        STAT_TYPES.FG2_MISS,
        STAT_TYPES.FG3_MADE,
        STAT_TYPES.FG3_MISS,
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
      required: true,
    },
    x: { type: Number, min: 0, max: 100 },
    y: { type: Number, min: 0, max: 100 },
    occurredAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const gameSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    title: { type: String, required: true, trim: true },
    opponent: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
      index: true,
    },
    scheduledAt: { type: Date },
    completedAt: { type: Date },
    events: { type: [shotEventSchema], default: [] },
  },
  { timestamps: true }
);

gameSchema.index({ ownerUserId: 1, teamId: 1, createdAt: -1 });

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

async function saveGame(game) {
  return game.save();
}

module.exports = {
  createGame,
  listGamesByOwner,
  findGameByIdAndOwner,
  findGameById,
  listGamesByTeamId,
  saveGame,
};
