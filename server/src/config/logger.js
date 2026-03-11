const pino = require('pino');
const { env } = require('./env');

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

module.exports = {
  logger,
};
