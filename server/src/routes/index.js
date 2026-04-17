const { Router } = require('express');
const { authRouter } = require('../modules/auth/auth.routes');
const { analyticsRouter } = require('../modules/analytics/analytics.routes');
const { billingRouter } = require('../modules/billing/billing.routes');
const { feedRouter } = require('../modules/feed/feed.routes');
const { healthRouter } = require('../modules/health/health.routes');
const {
  teamsRouter,
  publicTeamsRouter,
  publicOpponentsRouter,
} = require('../modules/teams/teams.routes');
const { gamesRouter } = require('../modules/games/games.routes');
const { leaguesRouter, publicLeaguesRouter } = require('../modules/leagues/leagues.routes');

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/billing', billingRouter);
apiRouter.use('/feed', feedRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/public/opponents', publicOpponentsRouter);
apiRouter.use('/public/leagues', publicLeaguesRouter);
apiRouter.use('/public/teams', publicTeamsRouter);
apiRouter.use('/leagues', leaguesRouter);
apiRouter.use('/teams', teamsRouter);
apiRouter.use('/games', gamesRouter);

module.exports = {
  apiRouter,
};
