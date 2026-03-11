const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    passwordHash: { type: String },
    googleId: { type: String, index: true },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    roles: { type: [String], default: ['user'] },
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
    expiresAt: { type: Date, required: true, index: true },
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
    expiresAt: { type: Date, required: true, index: true },
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

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  findOrCreateGoogleUser,
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
};
