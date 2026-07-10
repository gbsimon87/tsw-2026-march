const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    passwordHash: { type: String },
    googleId: { type: String, index: true },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    authProvider: { type: String, enum: ['local', 'google', 'system'], default: 'local' },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    leaguePlan: { type: String, enum: ['free', 'pro'], default: 'free' },
    leagueSubscriptionStatus: {
      type: String,
      enum: ['inactive', 'trialing', 'active', 'past_due', 'canceled'],
      default: 'inactive',
    },
    leagueCurrentPeriodEnd: { type: Date, default: null },
    leagueCancelAtPeriodEnd: { type: Boolean, default: false },
    leagueStripeCustomerId: { type: String, default: null },
    leagueStripeSubscriptionId: { type: String, default: null },
    leagueStripePriceId: { type: String, default: null },
    roles: { type: [String], default: ['user'] },
    avatar: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
    },
  },
  {
    timestamps: true,
  }
);

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    refreshTokenHash: { type: String, required: true },
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

const authTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['email_verification', 'password_reset'],
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authTokenSchema.index({ userId: 1, type: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
const AuthToken = mongoose.models.AuthToken || mongoose.model('AuthToken', authTokenSchema);
async function createUser(input) {
  return User.create(input);
}

async function findUserByEmail(email) {
  return User.findOne({ email: email.toLowerCase() });
}

async function findUserById(id) {
  return User.findById(id);
}

// OPT-017: batch creator lookup for feed hydration (was N sequential
// findUserById calls, one per post).
async function findUsersByIds(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
  if (uniqueIds.length === 0) return [];
  return User.find({ _id: { $in: uniqueIds } });
}

async function findOrCreateGoogleUser({ googleId, email, name }) {
  let user = await User.findOne({ googleId });
  if (user) {
    return user;
  }

  user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.googleId = googleId;
    user.authProvider = 'google';
    user.emailVerified = true;
    user.emailVerifiedAt = user.emailVerifiedAt || new Date();
    if (!user.name) {
      user.name = name;
    }
    await user.save();
    return user;
  }

  return User.create({
    googleId,
    email: email.toLowerCase(),
    name,
    authProvider: 'google',
    emailVerified: true,
    emailVerifiedAt: new Date(),
    roles: ['user'],
  });
}

const SYSTEM_USER_EMAIL = 'system@tsw.internal';
const SYSTEM_USER_NAME = 'TSW';

// Reserved account that authors auto-generated feed content (see
// docs/auto-feed-generation/000-TRACKER.md). Has no passwordHash and
// authProvider:'system', so auth.service#login rejects it even without the
// explicit guard there.
async function findOrCreateSystemUser() {
  let user = await User.findOne({ authProvider: 'system' });
  if (user) {
    return user;
  }

  return User.create({
    email: SYSTEM_USER_EMAIL,
    name: SYSTEM_USER_NAME,
    authProvider: 'system',
    emailVerified: false,
    roles: ['system'],
  });
}

async function upsertSession(input) {
  return Session.findOneAndUpdate(
    { sessionId: input.sessionId },
    {
      $set: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        userAgent: input.userAgent,
        ip: input.ip,
        expiresAt: input.expiresAt,
      },
    },
    { upsert: true, new: true }
  );
}

async function findSessionById(sessionId) {
  return Session.findOne({ sessionId });
}

async function deleteSessionById(sessionId) {
  return Session.deleteOne({ sessionId });
}

async function deleteSessionsByUserId(userId) {
  return Session.deleteMany({ userId });
}

async function createAuthToken(input) {
  return AuthToken.create(input);
}

async function findAuthTokenByHashAndType(tokenHash, type) {
  return AuthToken.findOne({ tokenHash, type, usedAt: null, expiresAt: { $gt: new Date() } });
}

async function invalidateTokensForUserByType(userId, type) {
  return AuthToken.updateMany(
    {
      userId,
      type,
      usedAt: null,
    },
    {
      $set: {
        usedAt: new Date(),
      },
    }
  );
}

async function markAuthTokenUsed(tokenId) {
  return AuthToken.findByIdAndUpdate(tokenId, { $set: { usedAt: new Date() } }, { new: true });
}

async function markEmailVerified(userId) {
  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    },
    { new: true }
  );
}

async function updateUserPassword(userId, passwordHash) {
  return User.findByIdAndUpdate(userId, { $set: { passwordHash } }, { new: true });
}

async function updateUserPlan(userId, plan) {
  return User.findByIdAndUpdate(userId, { $set: { plan } }, { new: true });
}

async function updateUserAvatar(userId, avatarData) {
  return User.findByIdAndUpdate(userId, { $set: { avatar: avatarData } }, { new: true });
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  findUsersByIds,
  findOrCreateGoogleUser,
  findOrCreateSystemUser,
  upsertSession,
  findSessionById,
  deleteSessionById,
  deleteSessionsByUserId,
  createAuthToken,
  findAuthTokenByHashAndType,
  invalidateTokensForUserByType,
  markAuthTokenUsed,
  markEmailVerified,
  updateUserPassword,
  updateUserPlan,
  updateUserAvatar,
};
