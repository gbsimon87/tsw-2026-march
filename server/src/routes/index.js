const { Router } = require('express');
const { authRouter } = require('../modules/auth/auth.routes');
const { contactRouter } = require('../modules/contact/contact.routes');
const { contactLimiter } = require('../middleware/rateLimit.middleware');
const { publicCacheMiddleware } = require('../middleware/publicCache.middleware');
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
const {
  leaguesRouter,
  publicLeaguesRouter,
  publicPlayersRouter,
} = require('../modules/leagues/leagues.routes');

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/contact', contactLimiter, contactRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/billing', billingRouter);
apiRouter.use('/feed', feedRouter);
apiRouter.use('/health', healthRouter);
// OPT-019: anonymous public GETs are identical for every viewer post-
// materialisation; cache them at the browser/CDN layer. The middleware is a
// no-op (private, no-cache) whenever auth is present, so personalised public
// handlers (e.g. league public-player) are never cached.
apiRouter.use('/public/opponents', publicCacheMiddleware, publicOpponentsRouter);
apiRouter.use('/public/leagues', publicCacheMiddleware, publicLeaguesRouter);
apiRouter.use('/public/teams', publicCacheMiddleware, publicTeamsRouter);
apiRouter.use('/public/players', publicCacheMiddleware, publicPlayersRouter);
apiRouter.use('/leagues', leaguesRouter);
apiRouter.use('/teams', teamsRouter);
apiRouter.use('/games', gamesRouter);

module.exports = {
  apiRouter,
};
