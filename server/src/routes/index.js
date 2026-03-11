const { Router } = require('express');
const { authRouter } = require('../modules/auth/auth.routes');
const { analyticsRouter } = require('../modules/analytics/analytics.routes');
const { healthRouter } = require('../modules/health/health.routes');

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/health', healthRouter);

module.exports = {
  apiRouter,
};
