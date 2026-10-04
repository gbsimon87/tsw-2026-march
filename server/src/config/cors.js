const { env } = require('./env');

const allowList = env.CLIENT_ORIGIN ? env.CLIENT_ORIGIN.split(',').map((v) => v.trim()) : [];

const isDev = env.NODE_ENV !== 'production';

// Shared by the CORS middleware and by callers that must validate a browser
// Origin themselves (e.g. Mux direct-upload `cors_origin`). A missing origin is
// NOT allowed here: non-browser callers are only waved through by the
// middleware, never by this predicate. Never returns true for `*`.
function isAllowedClientOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;

  // DEV: allow anything local
  if (isDev) {
    const isLocal =
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      /^http:\/\/192\.168\./.test(origin) ||
      /^http:\/\/10\./.test(origin);

    if (isLocal) return true;
  }

  // PROD: strict allowlist
  return allowList.includes(origin);
}

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser tools (Postman, server-to-server, etc.)
    if (!origin) return callback(null, true);

    if (isAllowedClientOrigin(origin)) return callback(null, true);

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // x-analytics-consent rides on every request once a visitor accepts
  // analytics; omitting it here fails the preflight and breaks every API call
  // for exactly the users who consented.
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'x-analytics-consent'],
  exposedHeaders: ['x-csrf-token'],
};

module.exports = {
  corsOptions,
  isAllowedClientOrigin,
};
