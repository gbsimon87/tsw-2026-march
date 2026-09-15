const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./feed.controller');

const feedRouter = Router();

feedRouter.get('/', asyncHandler(controller.list));
feedRouter.get('/discoverable/players', asyncHandler(controller.listDiscoverablePlayers));
feedRouter.get('/shareable/games', asyncHandler(controller.listShareableGames));
feedRouter.get('/shareable/players', asyncHandler(controller.listShareablePlayers));
feedRouter.get('/shareable/teams', asyncHandler(controller.listShareableTeams));
// Public: the export guard's answer for one post, read when a share surface
// opens. See getPostMarketing in feed.service.js.
feedRouter.get('/:postId/marketing', asyncHandler(controller.postMarketing));

feedRouter.use(authMiddleware);
// Safety hold, 2026-09-11: fail before parsing multipart data. These routes stay
// explicit so existing clients receive a clear policy error instead of a 404.
feedRouter.post('/image', asyncHandler(controller.rejectMediaUpload));
feedRouter.post('/video', asyncHandler(controller.rejectMediaUpload));
feedRouter.post('/game-card', asyncHandler(controller.createGameCard));
feedRouter.post('/player-card', asyncHandler(controller.createPlayerCard));
feedRouter.post('/player-game-card', asyncHandler(controller.createPlayerGameCard));
feedRouter.post('/team-card', asyncHandler(controller.createTeamCard));
feedRouter.post('/highlight-clip', asyncHandler(controller.createHighlightClip));
feedRouter.delete('/:postId', asyncHandler(controller.remove));

module.exports = {
  feedRouter,
};
