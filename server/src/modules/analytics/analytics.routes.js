const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./analytics.controller');

const analyticsRouter = Router();

analyticsRouter.post('/event', authMiddleware, asyncHandler(controller.capture));

module.exports = {
  analyticsRouter,
};
