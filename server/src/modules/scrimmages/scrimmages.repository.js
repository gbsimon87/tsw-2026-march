const mongoose = require('mongoose');
const { Schema } = mongoose;
const oid = Schema.Types.ObjectId;

const mvpRulesSchema = new Schema(
  {
    missPenalty: { type: Number, default: 1, min: 0 },
    turnoverPenalty: { type: Number, default: 2, min: 0 },
    winBonus: { type: Number, default: 2, min: 0 },
    lossPenalty: { type: Number, default: 1, min: 0 },
    weeklyMinGames: { type: Number, default: 3, min: 1 },
    seasonMinGames: { type: Number, default: 6, min: 1 },
    seasonMinWeeks: { type: Number, default: 2, min: 1 },
  },
  { _id: false }
);
const termsSchema = new Schema(
  {
    text: { type: String, default: '', maxlength: 20000 },
    version: { type: String, required: true },
  },
  { _id: false }
);
const seasonSchema = new Schema({
  label: { type: String, required: true },
  mvpRules: { type: mvpRulesSchema, default: () => ({}) },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
});
const scrimmageSchema = new Schema(
  {
    ownerUserId: { type: oid, required: true, index: true },
    managerUserIds: { type: [oid], default: [] },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    isPublic: { type: Boolean, default: true },
    terms: { type: termsSchema, required: true },
    termsScope: { type: String, enum: ['series', 'weekly'], default: 'series' },
    seasons: { type: [seasonSchema], default: [] },
    activeSeasonId: { type: oid, required: true },
    playerMerges: {
      type: [
        new Schema(
          {
            fromPlayerId: { type: oid, required: true },
            toPlayerId: { type: oid, required: true },
            mergedAt: { type: Date, required: true },
            mergedByUserId: { type: oid, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    setupLeaseKey: { type: String, default: null },
    setupLeaseUntil: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true }
);
const poolPlayerSchema = new Schema(
  {
    scrimmageId: { type: oid, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    leaguePlayerId: { type: oid, default: null },
    sourceTeamId: { type: oid, default: null },
    sourcePlayerId: { type: oid, default: null },
    userId: { type: oid, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);
poolPlayerSchema.index({ scrimmageId: 1, isActive: 1 });
poolPlayerSchema.index(
  { scrimmageId: 1, leaguePlayerId: 1 },
  {
    unique: true,
    partialFilterExpression: { leaguePlayerId: { $type: 'objectId' } },
  }
);
poolPlayerSchema.index(
  { scrimmageId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $type: 'objectId' } },
  }
);
poolPlayerSchema.index(
  { scrimmageId: 1, sourcePlayerId: 1 },
  { unique: true, partialFilterExpression: { sourcePlayerId: { $type: 'objectId' } } }
);
const assignmentSchema = new Schema(
  {
    playerId: { type: oid, required: true },
    displayName: { type: String, required: true },
    color: { type: String, required: true },
  },
  { _id: false }
);
const sessionSchema = new Schema(
  {
    scrimmageId: { type: oid, required: true },
    seasonId: { type: oid, required: true },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    date: { type: String, required: true },
    videoUrl: { type: String, default: null },
    terms: { type: termsSchema, required: true },
    termsScope: { type: String, enum: ['series', 'weekly'], required: true },
    status: { type: String, enum: ['open', 'completed'], default: 'open' },
    publishedAt: { type: Date, default: null },
    publishedByUserId: { type: oid, default: null },
    assignments: { type: [assignmentSchema], default: [] },
    scoringRules: {
      type: new Schema(
        {
          insideArc: { type: Number, default: 1, min: 1, max: 3 },
          outsideArc: { type: Number, default: 2, min: 1, max: 4 },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    regulationSeconds: { type: Number, default: 240, min: 60, max: 3600 },
    overtimeSeconds: { type: Number, default: 240, min: 60, max: 3600 },
    gameCreationKey: { type: String, default: null },
    gameCreationLeaseUntil: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true }
);
sessionSchema.index({ scrimmageId: 1, seasonId: 1, date: -1 });
const acceptanceSchema = new Schema({
  scrimmageId: { type: oid, required: true },
  sessionId: { type: oid, default: null },
  userId: { type: oid, required: true },
  termsVersion: { type: String, required: true },
  termsText: { type: String, required: true },
  signedName: { type: String, required: true },
  acceptedAt: { type: Date, default: Date.now },
});
acceptanceSchema.index(
  { scrimmageId: 1, sessionId: 1, userId: 1, termsVersion: 1 },
  { unique: true }
);
const joinRequestSchema = new Schema(
  {
    scrimmageId: { type: oid, required: true },
    userId: { type: oid, required: true },
    playerId: { type: oid, default: null },
    displayName: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    acceptanceId: { type: oid, required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);
joinRequestSchema.index({ scrimmageId: 1, userId: 1 }, { unique: true });

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}
module.exports = {
  Scrimmage: model('Scrimmage', scrimmageSchema),
  ScrimmagePlayer: model('ScrimmagePlayer', poolPlayerSchema),
  ScrimmageSession: model('ScrimmageSession', sessionSchema),
  ScrimmageAcceptance: model('ScrimmageAcceptance', acceptanceSchema),
  ScrimmageJoinRequest: model('ScrimmageJoinRequest', joinRequestSchema),
};
