// Responses that carry bearer credentials (Mux direct-upload URLs, playback
// tokens) must never be stored by a browser, proxy or CDN (plan R2). Mounted
// ahead of authentication so error responses on these paths carry it too.
const NO_STORE_CACHE_CONTROL = 'private, no-store';

function noStoreMiddleware(_req, res, next) {
  res.set('Cache-Control', NO_STORE_CACHE_CONTROL);
  next();
}

module.exports = {
  NO_STORE_CACHE_CONTROL,
  noStoreMiddleware,
};
