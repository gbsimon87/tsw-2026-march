const mongoose = require('mongoose');

const instagramConnectionSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: ['instagram'], default: 'instagram', unique: true },
    externalAccountId: { type: String, required: true },
    username: { type: String, required: true },
    accountType: { type: String, default: null },
    encryptedAccessToken: { type: String, default: null, select: false },
    tokenKeyVersion: { type: String, required: true },
    tokenExpiresAt: { type: Date, default: null },
    grantedScopes: { type: [String], default: [] },
    status: { type: String, enum: ['connected', 'revoked'], default: 'connected' },
    connectedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    connectedAt: { type: Date, required: true },
    lastVerifiedAt: { type: Date, required: true },
    revokedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const instagramOAuthStateSchema = new mongoose.Schema(
  {
    stateHash: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

instagramOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const InstagramConnection =
  mongoose.models.InstagramConnection ||
  mongoose.model('InstagramConnection', instagramConnectionSchema);
const InstagramOAuthState =
  mongoose.models.InstagramOAuthState ||
  mongoose.model('InstagramOAuthState', instagramOAuthStateSchema);

async function createOAuthState(input) {
  return InstagramOAuthState.create(input);
}

async function consumeOAuthState({ stateHash, userId, sessionId, now = new Date() }) {
  return InstagramOAuthState.findOneAndUpdate(
    {
      stateHash,
      userId,
      sessionId,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { new: true }
  );
}

async function upsertConnection(input) {
  return InstagramConnection.findOneAndUpdate(
    { platform: 'instagram' },
    {
      $set: {
        ...input,
        platform: 'instagram',
        status: 'connected',
        revokedByUserId: null,
        revokedAt: null,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
}

async function findConnection({ includeToken = false } = {}) {
  const query = InstagramConnection.findOne({ platform: 'instagram' });
  if (includeToken) query.select('+encryptedAccessToken');
  return query;
}

async function revokeConnection({ userId, now = new Date() }) {
  return InstagramConnection.findOneAndUpdate(
    { platform: 'instagram', status: 'connected' },
    {
      $unset: {
        encryptedAccessToken: 1,
      },
      $set: {
        status: 'revoked',
        revokedByUserId: userId,
        revokedAt: now,
      },
    },
    { new: true, runValidators: false }
  );
}

async function updateConnectionVerification({ username, accountType, now = new Date() }) {
  return InstagramConnection.findOneAndUpdate(
    { platform: 'instagram', status: 'connected' },
    { $set: { username, accountType, lastVerifiedAt: now } },
    { new: true, runValidators: true }
  );
}

module.exports = {
  InstagramConnection,
  InstagramOAuthState,
  consumeOAuthState,
  createOAuthState,
  findConnection,
  revokeConnection,
  updateConnectionVerification,
  upsertConnection,
};
