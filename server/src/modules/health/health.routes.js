const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { health } = require('./health.controller');

const healthRouter = Router();

healthRouter.get('/', asyncHandler(health));

module.exports = {
  healthRouter,
};
