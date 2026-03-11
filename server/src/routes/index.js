const { Router } = require('express');
const { authRouter } = require('../modules/auth/auth.routes');
const { analyticsRouter } = require('../modules/analytics/analytics.routes');
const { healthRouter } = require('../modules/health/health.routes');
const { teamsRouter } = require('../modules/teams/teams.routes');
const { gamesRouter } = require('../modules/games/games.routes');

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/teams', teamsRouter);
apiRouter.use('/games', gamesRouter);

module.exports = {
  apiRouter,
};
