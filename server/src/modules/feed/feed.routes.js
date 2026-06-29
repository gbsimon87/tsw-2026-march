const { Router } = require('express');
const multer = require('multer');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const { env } = require('../../config/env');
const controller = require('./feed.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.FEED_IMAGE_MAX_BYTES,
    files: 1,
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.FEED_VIDEO_MAX_BYTES,
    files: 1,
  },
});

const feedRouter = Router();

feedRouter.get('/', asyncHandler(controller.list));
feedRouter.get('/shareable/games', asyncHandler(controller.listShareableGames));
feedRouter.get('/shareable/players', asyncHandler(controller.listShareablePlayers));
feedRouter.get('/shareable/teams', asyncHandler(controller.listShareableTeams));

feedRouter.use(authMiddleware);
feedRouter.post('/image', upload.single('file'), asyncHandler(controller.createImage));
feedRouter.post('/video', videoUpload.single('file'), asyncHandler(controller.createVideo));
feedRouter.post('/game-card', asyncHandler(controller.createGameCard));
feedRouter.post('/player-card', asyncHandler(controller.createPlayerCard));
feedRouter.post('/team-card', asyncHandler(controller.createTeamCard));
feedRouter.post('/highlight-clip', asyncHandler(controller.createHighlightClip));
feedRouter.delete('/:postId', asyncHandler(controller.remove));

module.exports = {
  feedRouter,
};
