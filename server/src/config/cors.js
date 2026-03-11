const { env } = require('./env');

const allowList = env.CLIENT_ORIGIN.split(',').map((value) => value.trim());

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowList.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
};

module.exports = {
  corsOptions,
};
