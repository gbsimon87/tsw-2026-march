const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const pinoHttp = require('pino-http');
const { logger } = require('./config/logger');
const { corsOptions } = require('./config/cors');
const { configureGoogleOAuth } = require('./modules/auth/oauth.google');
const { apiRouter } = require('./routes');
const { billingWebhookRouter } = require('./modules/billing/billing.routes');
const { attachCsrfToken, csrfProtection } = require('./middleware/csrf.middleware');
const { requestIdMiddleware } = require('./middleware/requestId.middleware');
const { apiRateLimiter } = require('./middleware/rateLimit.middleware');
const { errorMiddleware } = require('./middleware/error.middleware');
const { notFoundMiddleware } = require('./middleware/notFound.middleware');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      customProps: (request) => ({
        requestId: request.requestId,
      }),
    })
  );

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(
    '/api/v1/billing/webhooks',
    express.raw({ type: 'application/json' }),
    billingWebhookRouter
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(passport.initialize());
  configureGoogleOAuth(passport);

  app.use(attachCsrfToken);
  app.use(csrfProtection);
  app.use('/api', apiRateLimiter);
  app.use('/api/v1', apiRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

module.exports = {
  createApp,
};
