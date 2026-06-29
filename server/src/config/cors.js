const { env } = require('./env');

const allowList = env.CLIENT_ORIGIN ? env.CLIENT_ORIGIN.split(',').map((v) => v.trim()) : [];

const isDev = env.NODE_ENV !== 'production';

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser tools (Postman, server-to-server, etc.)
    if (!origin) return callback(null, true);

    // DEV: allow anything local
    if (isDev) {
      const isLocal =
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        /^http:\/\/192\.168\./.test(origin) ||
        /^http:\/\/10\./.test(origin);

      if (isLocal) return callback(null, true);
    }

    // PROD: strict allowlist
    if (allowList.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  exposedHeaders: ['x-csrf-token'],
};

module.exports = {
  corsOptions,
};
