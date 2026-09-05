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
  updateUserOnboarding,
} = require('./auth.repository');
const {
  uploadImageBuffer,
  destroyImage,
  isCloudinaryConfigured,
} = require('../feed/cloudinary.client');
const { captureEventDetached, pseudonymousId } = require('../analytics/analytics.service');
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
const {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendGoogleAccountEmail,
} = require('../../services/email.service');

function sanitizeUser(user) {
  const onboardingStatus = user.onboarding?.status || 'completed';
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
    onboarding: {
      status: onboardingStatus,
      roles: user.onboarding?.roles || [],
      completedSteps: user.onboarding?.completedSteps || [],
    },
  };
}

function getPrimaryClientOrigin() {
  const [firstOrigin] = env.CLIENT_ORIGIN.split(',');
  return firstOrigin.trim();
}

function buildClientUrl(pathname, token) {
  return `${getPrimaryClientOrigin()}${pathname}?token=${encodeURIComponent(token)}`;
}

// Issues a fresh email_verification token and returns the link that consumes it.
// Prior unused tokens are invalidated first so an old link in an old inbox stops
// working the moment a new one is issued.
async function issueEmailVerification(user) {
  await invalidateTokensForUserByType(user._id, 'email_verification');

  const rawToken = generateRawToken();
  await createAuthToken({
    userId: user._id,
    type: 'email_verification',
    tokenHash: hashAuthToken(rawToken),
    expiresAt: buildTokenExpiry('email_verification'),
  });

  return buildClientUrl('/verify-email', rawToken);
}

async function issueAuthTokens(user, metadata, { isFirstLogin = false } = {}) {
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

  // NOT emitted here. issueAuthTokens is also called by refresh(), which
  // rotates tokens every ~15 minutes for an active user — firing here would
  // turn an engagement metric into a session-duration proxy. The two Google
  // steps would double-count for the same reason. Callers that represent a
  // real sign-in call captureLogin() instead.
  if (isFirstLogin) {
    captureLogin(user, { isFirstLogin: true });
  }

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(user),
  };
}

function captureLogin(user, { isFirstLogin = false } = {}) {
  captureEventDetached({
    distinctId: String(user._id),
    event: 'user_logged_in',
    properties: {
      auth_provider: user.authProvider || 'local',
      is_first_login: isFirstLogin,
    },
  });
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

async function register(input, metadata) {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    // A high rate here means returning users are landing on the register form
    // by mistake. Note this is the only reason currently captured: Zod rejects
    // malformed input in the controller before the service runs, so validation
    // failures never reach this point.
    captureEventDetached({
      distinctId: pseudonymousId(input.email),
      event: 'registration_failed',
      properties: { reason: 'email_in_use' },
    });
    throw new ApiError(409, 'Email is already in use');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await createUser({
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash,
    authProvider: 'local',
    emailVerified: false,
    roles: ['user'],
    onboarding: { status: 'not_started', roles: [], completedSteps: [] },
    // plan intentionally omitted — the schema default 'starter' applies (audit C1;
    // the User enum is canonical-only since T-26 and rejects legacy 'free').
  });

  captureEventDetached({
    distinctId: String(user._id),
    event: 'user_registered',
    properties: { auth_provider: 'local' },
  });

  // The token is persisted before the send is dispatched, so a dropped email
  // still leaves a valid link the user can obtain from /verify-email.
  const verifyUrl = await issueEmailVerification(user);
  sendWelcomeEmail({
    to: user.email,
    name: user.name,
    ctaUrl: verifyUrl,
    needsVerification: true,
  });

  // Sign the new user straight in rather than redirecting them to the login form
  // to re-enter the credentials they just chose. Same token path as login().
  return issueAuthTokens(user, metadata, { isFirstLogin: true });
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

  // After the session write, not before: a failed upsertSession returns a 500,
  // and recording a login that never happened would overstate the funnel.
  const tokens = await issueAuthTokens(user, metadata);
  captureLogin(user);

  return tokens;
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

async function updateOnboarding(userId, input) {
  const current = await findUserById(userId);
  if (!current) {
    throw new ApiError(404, 'User not found');
  }

  const onboarding = {
    status: input.status || current.onboarding?.status || 'in_progress',
    roles: input.roles || current.onboarding?.roles || [],
    completedSteps: input.completedSteps || current.onboarding?.completedSteps || [],
  };
  const updated = await updateUserOnboarding(userId, onboarding);
  return sanitizeUser(updated);
}

async function requestEmailVerification(email) {
  const user = await findUserByEmail(email);

  if (user && !user.emailVerified) {
    const verifyUrl = await issueEmailVerification(user);
    sendVerificationEmail({ to: user.email, name: user.name, verifyUrl });
  }

  // The same response whether or not the account exists, so this endpoint is
  // not an account-existence oracle.
  return {
    message: 'If an account exists for that email, a verification link has been sent.',
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
  } else if (user) {
    // A Google account has no password to reset. Without this the request is a
    // silent dead end; the response is unchanged, so only the true mailbox
    // owner learns anything.
    sendGoogleAccountEmail({
      to: user.email,
      name: user.name,
      loginUrl: `${getPrimaryClientOrigin()}/login`,
    });
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
// docs/auto-feed.md). Cached after first lookup since
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
  const { user, isNew } = await findOrCreateGoogleUser({
    googleId: googleProfile.id,
    email: googleProfile.email,
    name: googleProfile.name,
  });

  if (isNew) {
    captureEventDetached({
      distinctId: String(user._id),
      event: 'user_registered',
      properties: { auth_provider: 'google' },
    });
    sendWelcomeEmail({
      to: user.email,
      name: user.name,
      ctaUrl: `${getPrimaryClientOrigin()}/onboarding`,
      needsVerification: false,
    });
  }

  return issueAuthTokens(user, metadata, { isFirstLogin: isNew });
}

async function prepareGoogleExchange(googleProfile) {
  const { user, isNew } = await findOrCreateGoogleUser({
    googleId: googleProfile.id,
    email: googleProfile.email,
    name: googleProfile.name,
  });

  if (isNew) {
    captureEventDetached({
      distinctId: String(user._id),
      event: 'user_registered',
      properties: { auth_provider: 'google' },
    });
    sendWelcomeEmail({
      to: user.email,
      name: user.name,
      ctaUrl: `${getPrimaryClientOrigin()}/onboarding`,
      needsVerification: false,
    });
  }

  // Short-lived token so the client can exchange it for session cookies via a
  // credentialed fetch. Cookies set on a redirect (bounce) are blocked by Chrome
  // BTM and Safari ITP; a fetch-issued cookie is not.
  const exchangeToken = jwt.sign(
    { sub: String(user._id), type: 'google_exchange', isFirstLogin: isNew },
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

  // Captured here rather than in loginWithGoogle: the two are steps of one
  // sign-in, and this is the one that completes it. After the session write for
  // the same reason as login().
  const tokens = await issueAuthTokens(user, metadata);
  captureLogin(user, { isFirstLogin: payload.isFirstLogin === true });

  return tokens;
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
  updateOnboarding,
  getSystemUserId,
};
