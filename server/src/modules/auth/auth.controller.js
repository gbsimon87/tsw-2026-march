const {
  registerSchema,
  loginSchema,
  requestVerificationSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('./auth.validation');
const authService = require('./auth.service');
const { accessCookieOptions, refreshCookieOptions } = require('../../config/cookie');
const { env } = require('../../config/env');
const { ApiError } = require('../../utils/apiError');

function primaryClientOrigin() {
  return env.CLIENT_ORIGIN.split(',')[0].trim();
}

function metadata(req) {
  return {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, accessCookieOptions());
  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
}

function clearAuthCookies(res) {
  const accessOptions = accessCookieOptions();
  const refreshOptions = refreshCookieOptions();

  res.clearCookie('accessToken', {
    httpOnly: accessOptions.httpOnly,
    secure: accessOptions.secure,
    sameSite: accessOptions.sameSite,
    domain: accessOptions.domain,
    path: accessOptions.path,
  });

  res.clearCookie('refreshToken', {
    httpOnly: refreshOptions.httpOnly,
    secure: refreshOptions.secure,
    sameSite: refreshOptions.sameSite,
    domain: refreshOptions.domain,
    path: refreshOptions.path,
  });
}

async function register(req, res) {
  const payload = registerSchema.parse(req.body);
  const result = await authService.register(payload);
  res.status(201).json(result);
}

async function login(req, res) {
  const payload = loginSchema.parse(req.body);
  const result = await authService.login(payload, metadata(req));
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(200).json({ user: result.user });
}

async function refresh(req, res) {
  const result = await authService.refresh(req.cookies.refreshToken, metadata(req));
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(200).json({ user: result.user });
}

async function logout(req, res) {
  await authService.logout(req.cookies.refreshToken);
  clearAuthCookies(res);
  res.status(200).json({ success: true });
}

async function me(req, res) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const user = await authService.getCurrentUser(req.auth.userId);
  res.status(200).json({ user });
}

async function requestVerification(req, res) {
  const payload = requestVerificationSchema.parse(req.body);
  const result = await authService.requestEmailVerification(payload.email);
  res.status(200).json(result);
}

async function verifyEmail(req, res) {
  const payload = verifyEmailSchema.parse(req.body);
  const result = await authService.verifyEmail(payload.token);
  res.status(200).json(result);
}

async function forgotPassword(req, res) {
  const payload = forgotPasswordSchema.parse(req.body);
  const result = await authService.forgotPassword(payload.email);
  res.status(200).json(result);
}

async function resetPassword(req, res) {
  const payload = resetPasswordSchema.parse(req.body);
  const result = await authService.resetPassword(payload.token, payload.newPassword);
  clearAuthCookies(res);
  res.status(200).json(result);
}

async function googleCallback(req, res) {
  if (!req.user) {
    throw new ApiError(401, 'Google authentication failed');
  }

  // Do not set cookies on the redirect response — browsers with bounce-tracking
  // protection (Chrome BTM, Safari ITP) strip cookies set during redirect chains.
  // Instead issue a short-lived exchange token; the client redeems it via a
  // credentialed fetch which browsers always honour.
  const exchangeToken = await authService.prepareGoogleExchange(req.user);
  res.redirect(
    `${primaryClientOrigin()}/auth/google/complete?token=${encodeURIComponent(exchangeToken)}`
  );
}

async function googleExchange(req, res) {
  const { token } = req.body;
  if (!token) {
    throw new ApiError(400, 'Missing exchange token');
  }

  const result = await authService.exchangeGoogleOAuthToken(token, metadata(req));
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(200).json({ user: result.user });
}

async function uploadAvatar(req, res) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }

  const user = await authService.uploadUserAvatar(req.auth.userId, req.file);
  res.status(200).json({ user });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  requestVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
  googleCallback,
  googleExchange,
  uploadAvatar,
};
