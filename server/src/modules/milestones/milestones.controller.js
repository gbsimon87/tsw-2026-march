const { listPlayerMilestonesQuerySchema } = require('./milestones.validation');
const { listMilestonesForLeaguePlayer } = require('./milestones.service');

async function listForLeaguePlayer(req, res) {
  const query = listPlayerMilestonesQuerySchema.parse(req.query);
  const result = await listMilestonesForLeaguePlayer(req.params.leaguePlayerId, {
    limit: query.limit,
    cursor: query.cursor,
  });
  res.json(result);
}

module.exports = { listForLeaguePlayer };
