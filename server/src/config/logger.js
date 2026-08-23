const pino = require('pino');
const { env } = require('./env');

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  serializers: {
    req(request) {
      if (request.url?.startsWith('/api/v1/social/instagram/oauth/callback')) {
        return { ...request, url: request.url.split('?')[0] };
      }
      return request;
    },
  },
});

module.exports = {
  logger,
};
