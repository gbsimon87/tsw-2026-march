const { z } = require('zod');
const { SHOT_ZONE_IDS, STAT_TYPES } = require('../shared/stats.constants');

const createGameSchema = z.object({
  teamId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  opponent: z.string().trim().min(1).max(120).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const statTypeSchema = z.enum([
  STAT_TYPES.FT_MADE,
  STAT_TYPES.FT_MISS,
  STAT_TYPES.FG2_MADE,
  STAT_TYPES.FG2_MISS,
  STAT_TYPES.FG3_MADE,
  STAT_TYPES.FG3_MISS,
  STAT_TYPES.OPP_FT_MADE,
  STAT_TYPES.OPP_FG2_MADE,
  STAT_TYPES.OPP_FG3_MADE,
  STAT_TYPES.AST,
  STAT_TYPES.OREB,
  STAT_TYPES.DREB,
  STAT_TYPES.STL,
  STAT_TYPES.TOV,
  STAT_TYPES.FOUL,
]);

const zoneIdSchema = z.enum([
  SHOT_ZONE_IDS.PAINT,
  SHOT_ZONE_IDS.MID_RANGE_LEFT,
  SHOT_ZONE_IDS.MID_RANGE_RIGHT,
  SHOT_ZONE_IDS.TOP_KEY,
  SHOT_ZONE_IDS.CORNER_LEFT_3,
  SHOT_ZONE_IDS.WING_LEFT_3,
  SHOT_ZONE_IDS.WING_RIGHT_3,
  SHOT_ZONE_IDS.CORNER_RIGHT_3,
  SHOT_ZONE_IDS.BACKCOURT,
  SHOT_ZONE_IDS.FREE_THROW_LINE,
]);

const trackedShotStatTypeSchema = z.enum([
  STAT_TYPES.FT_MADE,
  STAT_TYPES.FT_MISS,
  STAT_TYPES.FG2_MADE,
  STAT_TYPES.FG2_MISS,
  STAT_TYPES.FG3_MADE,
  STAT_TYPES.FG3_MISS,
]);

const nonShotStatTypeSchema = z.enum([
  STAT_TYPES.AST,
  STAT_TYPES.OREB,
  STAT_TYPES.DREB,
  STAT_TYPES.STL,
  STAT_TYPES.TOV,
  STAT_TYPES.FOUL,
]);

const opponentStatTypeSchema = z.enum([
  STAT_TYPES.OPP_FT_MADE,
  STAT_TYPES.OPP_FG2_MADE,
  STAT_TYPES.OPP_FG3_MADE,
]);

const baseEventSchema = z.object({
  playerId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
});

const appendTrackedShotEventSchema = baseEventSchema.extend({
  statType: trackedShotStatTypeSchema,
  zoneId: zoneIdSchema,
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

const appendNonShotEventSchema = baseEventSchema.extend({
  statType: nonShotStatTypeSchema,
});

const appendOpponentEventSchema = z.object({
  statType: opponentStatTypeSchema,
  occurredAt: z.string().datetime().optional(),
});

const appendEventSchema = z.union([
  appendTrackedShotEventSchema,
  appendNonShotEventSchema,
  appendOpponentEventSchema,
]);

module.exports = {
  createGameSchema,
  appendEventSchema,
  statTypeSchema,
};
