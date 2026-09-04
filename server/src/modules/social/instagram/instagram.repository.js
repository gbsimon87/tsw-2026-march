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
    tokenObtainedAt: { type: Date, default: null },
    lastTokenRefreshedAt: { type: Date, default: null },
    lastTokenRefreshedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastTokenRefreshAttemptAt: { type: Date, default: null },
    lastTokenRefreshAttemptedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastTokenRefreshFailureAt: { type: Date, default: null },
    lastTokenRefreshErrorCode: { type: String, default: null },
    tokenRefreshLeaseId: { type: String, default: null, select: false },
    tokenRefreshLeaseUntil: { type: Date, default: null, select: false },
    tokenKeyRotatedAt: { type: Date, default: null },
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
      $unset: {
        lastTokenRefreshedAt: 1,
        lastTokenRefreshedByUserId: 1,
        lastTokenRefreshAttemptAt: 1,
        lastTokenRefreshAttemptedByUserId: 1,
        lastTokenRefreshFailureAt: 1,
        lastTokenRefreshErrorCode: 1,
        tokenRefreshLeaseId: 1,
        tokenRefreshLeaseUntil: 1,
        tokenKeyRotatedAt: 1,
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

async function claimTokenRefresh({ leaseId, userId, now = new Date(), leaseUntil }) {
  return InstagramConnection.findOneAndUpdate(
    {
      platform: 'instagram',
      status: 'connected',
      $or: [
        { tokenRefreshLeaseUntil: null },
        { tokenRefreshLeaseUntil: { $exists: false } },
        { tokenRefreshLeaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        lastTokenRefreshAttemptAt: now,
        lastTokenRefreshAttemptedByUserId: userId,
        tokenRefreshLeaseId: leaseId,
        tokenRefreshLeaseUntil: leaseUntil,
      },
    },
    { new: true, runValidators: true }
  ).select('+encryptedAccessToken +tokenRefreshLeaseId +tokenRefreshLeaseUntil');
}

async function completeTokenRefresh({
  leaseId,
  encryptedAccessToken,
  tokenKeyVersion,
  tokenExpiresAt,
  userId,
  now = new Date(),
}) {
  return InstagramConnection.findOneAndUpdate(
    { platform: 'instagram', status: 'connected', tokenRefreshLeaseId: leaseId },
    {
      $set: {
        encryptedAccessToken,
        tokenKeyVersion,
        tokenExpiresAt,
        tokenObtainedAt: now,
        lastTokenRefreshedAt: now,
        lastTokenRefreshedByUserId: userId,
      },
      $unset: {
        lastTokenRefreshFailureAt: 1,
        lastTokenRefreshErrorCode: 1,
        tokenRefreshLeaseId: 1,
        tokenRefreshLeaseUntil: 1,
      },
    },
    { new: true, runValidators: true }
  );
}

async function failTokenRefresh({ leaseId, errorCode, now = new Date() }) {
  return InstagramConnection.findOneAndUpdate(
    { platform: 'instagram', status: 'connected', tokenRefreshLeaseId: leaseId },
    {
      $set: { lastTokenRefreshFailureAt: now, lastTokenRefreshErrorCode: errorCode },
      $unset: { tokenRefreshLeaseId: 1, tokenRefreshLeaseUntil: 1 },
    },
    { new: true, runValidators: true }
  );
}

async function rotateConnectionToken({
  expectedEncryptedAccessToken,
  expectedKeyVersion,
  encryptedAccessToken,
  tokenKeyVersion,
  now = new Date(),
}) {
  return InstagramConnection.findOneAndUpdate(
    {
      platform: 'instagram',
      status: 'connected',
      encryptedAccessToken: expectedEncryptedAccessToken,
      tokenKeyVersion: expectedKeyVersion,
    },
    { $set: { encryptedAccessToken, tokenKeyVersion, tokenKeyRotatedAt: now } },
    { new: true, runValidators: true }
  );
}

module.exports = {
  InstagramConnection,
  InstagramOAuthState,
  claimTokenRefresh,
  completeTokenRefresh,
  consumeOAuthState,
  createOAuthState,
  failTokenRefresh,
  findConnection,
  revokeConnection,
  rotateConnectionToken,
  updateConnectionVerification,
  upsertConnection,
};
