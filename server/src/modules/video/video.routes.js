const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { noStoreMiddleware } = require('../../middleware/noStore.middleware');
const controller = require('./video.controller');
const videoWebhookRouter = Router();
videoWebhookRouter.post('/mux', noStoreMiddleware, asyncHandler(controller.webhook));
module.exports = { videoWebhookRouter };
