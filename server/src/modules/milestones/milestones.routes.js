const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const controller = require('./milestones.controller');

const publicMilestonesRouter = Router();

publicMilestonesRouter.get(
  '/players/:leaguePlayerId',
  asyncHandler(controller.listForLeaguePlayer)
);

module.exports = { publicMilestonesRouter };
