const { z } = require('zod');

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// League-wide export path params.
const leagueExportParamsSchema = z.object({
  leagueId: objectIdSchema,
  seasonId: objectIdSchema,
});

// Team-scoped export path params.
const teamExportParamsSchema = z.object({
  leagueId: objectIdSchema,
  leagueTeamId: objectIdSchema,
  seasonId: objectIdSchema,
});

// Which section(s) the league export includes. `all` (the default) bundles them.
const leagueDatasetSchema = z
  .enum(['standings', 'leaders', 'players', 'games', 'gamelogs', 'all'])
  .default('all');

const leagueExportQuerySchema = z.object({
  dataset: leagueDatasetSchema,
});

module.exports = {
  objectIdSchema,
  leagueExportParamsSchema,
  teamExportParamsSchema,
  leagueDatasetSchema,
  leagueExportQuerySchema,
};
