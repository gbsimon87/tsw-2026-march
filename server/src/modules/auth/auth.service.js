const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  createUser,
  findUserByEmail,
  findUserById,
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
  updateUserAvatar,
} = require('./auth.repository');
const {
  uploadImageBuffer,
  destroyImage,
  isCloudinaryConfigured,
} = require('../feed/cloudinary.client');
const { ApiError } = require('../../utils/apiError');
const { env } = require('../../config/env');
const { transformCloudinaryUrl } = require('../shared/cloudinaryUrl');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../../services/token.service');
const { createSessionPayload, hashRefreshToken } = require('../../services/session.service');
const {
  generateRawToken,
  hashAuthToken,
  buildTokenExpiry,
} = require('../../services/authToken.service');
const { sendPasswordResetEmail } = require('../../services/email.service');

function sanitizeUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    // Canonical resolver-derived cache (Phase 6). The dead User.league* mirror path
    // (getUserLeagueBillingSummary/getUserLeagueEntitlements) was removed — league
    // billing lives on the League doc; user-level league state is not stored.
    plan: user.plan || 'starter',
    roles: user.roles,
    emailVerified: Boolean(user.emailVerified),
    authProvider: user.authProvider,
    avatarUrl: transformCloudinaryUrl(user.avatar?.url || null),
  };
}

function getPrimaryClientOrigin() {
  const [firstOrigin] = env.CLIENT_ORIGIN.split(',');
  return firstOrigin.trim();
}

function buildClientUrl(pathname, token) {
  return `${getPrimaryClientOrigin()}${pathname}?token=${encodeURIComponent(token)}`;
}

async function issueAuthTokens(user, metadata) {
  const payload = createSessionPayload(user._id);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const refreshTokenHash = hashRefreshToken(refreshToken);

  await upsertSession({
    userId: user._id,
    sessionId: payload.sid,
    refreshTokenHash,
    userAgent: metadata.userAgent,
    ip: metadata.ip,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(user),
  };
}

async function issuePasswordReset(user) {
  await invalidateTokensForUserByType(user._id, 'password_reset');

  const rawToken = generateRawToken();
  await createAuthToken({
    userId: user._id,
    type: 'password_reset',
    tokenHash: hashAuthToken(rawToken),
    expiresAt: buildTokenExpiry('password_reset'),
  });

  // OPT-020: fire-and-forget — the reset token is already persisted; delivery
  // runs off the request path so Resend latency/failures don't block the caller.
  sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl: buildClientUrl('/reset-password', rawToken),
  });
}

async function register(input) {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new ApiError(409, 'Email is already in use');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await createUser({
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash,
    authProvider: 'local',
    emailVerified: true,
    roles: ['user'],
    // plan intentionally omitted — the schema default 'starter' applies (audit C1;
    // the User enum is canonical-only since T-26 and rejects legacy 'free').
  });

  return {
    user: sanitizeUser(user),
    message: 'Registration successful. You can now sign in.',
    verificationUrl: null,
  };
}

async function login(input, metadata) {
  const user = await findUserByEmail(input.email);
  if (!user || !user.passwordHash || user.authProvider === 'system') {
    throw new ApiError(401, 'Invalid credentials');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  return issueAuthTokens(user, metadata);
}

async function refresh(refreshToken, metadata) {
  if (!refreshToken) {
    throw new ApiError(401, 'Missing refresh token');
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const session = await findSessionById(payload.sid);
  if (!session) {
    throw new ApiError(401, 'Session not found');
  }

  if (session.refreshTokenHash !== hashRefreshToken(refreshToken)) {
    await deleteSessionById(payload.sid);
    throw new ApiError(401, 'Session token mismatch');
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    throw new ApiError(401, 'User not found');
  }

  await deleteSessionById(payload.sid);
  return issueAuthTokens(user, metadata);
}

async function logout(refreshToken) {
  if (!refreshToken) {
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    await deleteSessionById(payload.sid);
  } catch {
    // Ignore invalid tokens on logout.
  }
}

async function getCurrentUser(userId) {
  const user = await findUserById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return sanitizeUser(user);
}

async function requestEmailVerification(email) {
  void email;

  return {
    message: 'If an account exists for that email, a verification link has been sent.',
    verificationUrl: null,
  };
}

async function verifyEmail(token) {
  const tokenHash = hashAuthToken(token);
  const tokenDoc = await findAuthTokenByHashAndType(tokenHash, 'email_verification');

  if (!tokenDoc) {
    throw new ApiError(400, 'Verification token is invalid or expired');
  }

  await markAuthTokenUsed(tokenDoc._id);
  await markEmailVerified(tokenDoc.userId);
  await invalidateTokensForUserByType(tokenDoc.userId, 'email_verification');

  return {
    message: 'Email verified. You can now sign in.',
  };
}

async function forgotPassword(email) {
  const user = await findUserByEmail(email);

  if (user && user.passwordHash) {
    await issuePasswordReset(user);
  }

  return {
    message: 'If an account exists for that email, a reset link has been sent.',
  };
}

async function resetPassword(token, newPassword) {
  const tokenHash = hashAuthToken(token);
  const tokenDoc = await findAuthTokenByHashAndType(tokenHash, 'password_reset');

  if (!tokenDoc) {
    throw new ApiError(400, 'Reset token is invalid or expired');
  }

  const user = await findUserById(tokenDoc.userId);
  if (!user || !user.passwordHash) {
    throw new ApiError(400, 'Reset token is invalid or expired');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await updateUserPassword(user._id, passwordHash);
  await markAuthTokenUsed(tokenDoc._id);
  await invalidateTokensForUserByType(user._id, 'password_reset');
  await deleteSessionsByUserId(user._id);

  return {
    message: 'Password reset successful. Please sign in again.',
  };
}

let cachedSystemUserId = null;

// Reserved author for auto-generated feed content (see
// docs/auto-feed-generation/000-TRACKER.md). Cached after first lookup since
// the system user never changes for the lifetime of the process.
async function getSystemUserId() {
  if (cachedSystemUserId) {
    return cachedSystemUserId;
  }

  const user = await findOrCreateSystemUser();
  cachedSystemUserId = String(user._id);
  return cachedSystemUserId;
}

async function loginWithGoogle(googleProfile, metadata) {
  const user = await findOrCreateGoogleUser({
    googleId: googleProfile.id,
    email: googleProfile.email,
    name: googleProfile.name,
  });

  return issueAuthTokens(user, metadata);
}

async function prepareGoogleExchange(googleProfile) {
  const user = await findOrCreateGoogleUser({
    googleId: googleProfile.id,
    email: googleProfile.email,
    name: googleProfile.name,
  });

  // Short-lived token so the client can exchange it for session cookies via a
  // credentialed fetch. Cookies set on a redirect (bounce) are blocked by Chrome
  // BTM and Safari ITP; a fetch-issued cookie is not.
  const exchangeToken = jwt.sign(
    { sub: String(user._id), type: 'google_exchange' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '60s' }
  );

  return exchangeToken;
}

const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function uploadUserAvatar(userId, file) {
  if (!isCloudinaryConfigured()) {
    throw new ApiError(503, 'Image uploads are not configured');
  }

  if (!AVATAR_MIME_TYPES.has(file.mimetype)) {
    throw new ApiError(400, 'Avatar must be a JPEG, PNG, or WebP image');
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const oldPublicId = user.avatar?.publicId || null;
  const result = await uploadImageBuffer(file);
  await updateUserAvatar(userId, { url: result.secure_url, publicId: result.public_id });

  if (oldPublicId) {
    await destroyImage(oldPublicId).catch(() => null);
  }

  const updated = await findUserById(userId);
  return sanitizeUser(updated);
}

async function exchangeGoogleOAuthToken(exchangeToken, metadata) {
  let payload;
  try {
    payload = jwt.verify(exchangeToken, env.JWT_ACCESS_SECRET);
  } catch {
    throw new ApiError(401, 'Exchange token is invalid or expired');
  }

  if (payload.type !== 'google_exchange') {
    throw new ApiError(401, 'Invalid token type');
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    throw new ApiError(401, 'User not found');
  }

  return issueAuthTokens(user, metadata);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getCurrentUser,
  requestEmailVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
  loginWithGoogle,
  prepareGoogleExchange,
  exchangeGoogleOAuthToken,
  uploadUserAvatar,
  getSystemUserId,
};
