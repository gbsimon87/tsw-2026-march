const Tokens = require('csrf');
const { csrfSecretCookieOptions, csrfTokenCookieOptions } = require('../config/cookie');
const { ApiError } = require('../utils/apiError');
const { env } = require('../config/env');
const { isPubliclyCacheableRequest } = require('./publicCache.middleware');

const tokens = new Tokens();
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const allowedOrigins = new Set(env.CLIENT_ORIGIN.split(',').map((o) => o.trim()));

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
  // OPT-019: an anonymous safe-method request may be served from a shared
  // cache. Emitting a per-request CSRF Set-Cookie on such a response would let
  // a CDN cache and replay one visitor's token to everyone — and a CSRF token
  // is only ever *needed* on a state-changing (non-safe) request, which is
  // never anonymous-safe. So we skip token emission entirely here. The client
  // refreshes its token from the response header of its next non-public
  // request (login/me/etc.), and the Origin-header fallback in csrfProtection
  // still covers cross-site mutations. This keeps public GETs Set-Cookie-free
  // and therefore genuinely CDN-cacheable.
  if (isPubliclyCacheableRequest(req) && !req.cookies._csrfSecret) {
    next();
    return;
  }

  const secret = getOrCreateSecret(req, res);
  const token = tokens.create(secret);
  res.cookie('XSRF-TOKEN', token, csrfTokenCookieOptions());
  res.set('x-csrf-token', token);
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

  if (secret && token && tokens.verify(secret, token)) {
    next();
    return;
  }

  // Fallback for cross-site deployments where browsers with third-party cookie
  // restrictions (Safari ITP, Chrome Privacy Sandbox) block the _csrfSecret cookie.
  // Validating Origin provides equivalent CSRF protection because browsers cannot
  // spoof the Origin header on credentialed cross-site requests.
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    next();
    return;
  }

  next(new ApiError(403, 'Invalid CSRF token'));
}

module.exports = {
  attachCsrfToken,
  csrfProtection,
};
