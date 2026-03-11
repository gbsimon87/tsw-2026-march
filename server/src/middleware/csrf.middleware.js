const Tokens = require('csrf');
const { csrfSecretCookieOptions, csrfTokenCookieOptions } = require('../config/cookie');
const { ApiError } = require('../utils/apiError');

const tokens = new Tokens();
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getOrCreateSecret(req, res) {
  const existing = req.cookies._csrfSecret;
  if (existing) {
    return existing;
  }

  const created = tokens.secretSync();
  res.cookie('_csrfSecret', created, csrfSecretCookieOptions());
  return created;
}

function attachCsrfToken(req, res, next) {
  const secret = getOrCreateSecret(req, res);
  const token = tokens.create(secret);
  res.cookie('XSRF-TOKEN', token, csrfTokenCookieOptions());
  next();
}

function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.path.endsWith('/auth/google/callback')) {
    next();
    return;
  }

  const secret = req.cookies._csrfSecret;
  const token = req.headers['x-csrf-token'];

  if (!secret || !token || !tokens.verify(secret, token)) {
    next(new ApiError(403, 'Invalid CSRF token'));
    return;
  }

  next();
}

module.exports = {
  attachCsrfToken,
  csrfProtection,
};
