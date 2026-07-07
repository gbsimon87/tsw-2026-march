// OPT-019: cache anonymous public GETs at the CDN/browser layer.
//
// Public routes return the same materialised (post-OPT-010/011) payload for
// every anonymous viewer, so they are safe to cache. The critical constraint
// is that we must NEVER emit `Cache-Control: public` for a request that
// carries auth — some public routers run `optionalAuthMiddleware` and a
// handler (e.g. league public-player) personalises on `req.auth`, so a shared
// cache could otherwise serve one viewer's personalised body to everyone.
//
// We therefore skip caching whenever an auth token is present (cookie or
// bearer), only touch GET/HEAD, and add `Vary: Cookie, Authorization` so any
// intermediary keys the anonymous entry separately from an authed request.

const PUBLIC_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=300';
const CACHEABLE_METHODS = new Set(['GET', 'HEAD']);

function hasAuthToken(req) {
  const authorization = req.headers.authorization || '';
  const hasBearer = authorization.startsWith('Bearer ');
  const hasCookie = Boolean(req.cookies && req.cookies.accessToken);
  return hasBearer || hasCookie;
}

// True when this request will receive `Cache-Control: public` — i.e. a safe
// method with no auth. Exposed so the CSRF middleware can avoid stamping a
// per-request `Set-Cookie` on a response we intend a shared cache to store
// (a cached Set-Cookie would replay one visitor's CSRF token to everyone).
function isPubliclyCacheableRequest(req) {
  return CACHEABLE_METHODS.has(req.method) && !hasAuthToken(req);
}

function publicCacheMiddleware(req, res, next) {
  // Even when we don't set a max-age, tell shared caches that the response
  // varies by credentials — this prevents an anonymous cached entry from ever
  // being reused for an authenticated request.
  res.setHeader('Vary', 'Cookie, Authorization');

  if (isPubliclyCacheableRequest(req)) {
    res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  } else {
    // Authenticated (or non-idempotent) request: force revalidation and never
    // let a shared cache store this personalised/mutating response.
    res.setHeader('Cache-Control', 'private, no-cache');
  }

  next();
}

module.exports = {
  publicCacheMiddleware,
  isPubliclyCacheableRequest,
  PUBLIC_CACHE_CONTROL,
};
