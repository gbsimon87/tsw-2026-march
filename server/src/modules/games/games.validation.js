const { z } = require('zod');
const { SHOT_ZONE_IDS, STAT_TYPES, TEAM_SIDES } = require('../shared/stats.constants');

function isSupportedYouTubeUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      return url.pathname.split('/').filter(Boolean).length > 0;
    }

    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        return Boolean(url.searchParams.get('v'));
      }

      if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/').filter(Boolean).length >= 2;
      }
    }

    return false;
  } catch {
    return false;
  }
}

const youtubeUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(isSupportedYouTubeUrl, 'Video URL must be a valid YouTube link');

const standaloneGameSchema = z.object({
  teamId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  opponent: z.string().trim().min(1).max(120).optional(),
  scheduledAt: z.string().datetime().optional(),
  videoUrl: youtubeUrlSchema.optional(),
});

const standaloneDualGameSchema = z.object({
  gameContext: z.literal('standalone').optional(),
  trackingMode: z.literal('dual_team'),
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  initialActiveSide: z.enum([TEAM_SIDES.HOME, TEAM_SIDES.AWAY]).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  scheduledAt: z.string().datetime().optional(),
  videoUrl: youtubeUrlSchema.optional(),
});

const leagueGameSchema = z.object({
  gameContext: z.literal('league'),
  leagueId: z.string().min(1),
  homeLeagueTeamId: z.string().min(1),
  awayLeagueTeamId: z.string().min(1),
  trackedLeagueTeamId: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  scheduledAt: z.string().datetime().optional(),
  videoUrl: youtubeUrlSchema.optional(),
});

const leagueDualGameSchema = z.object({
  gameContext: z.literal('league'),
  trackingMode: z.literal('dual_team'),
  leagueId: z.string().min(1),
  homeLeagueTeamId: z.string().min(1),
  awayLeagueTeamId: z.string().min(1),
  initialActiveSide: z.enum([TEAM_SIDES.HOME, TEAM_SIDES.AWAY]).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  scheduledAt: z.string().datetime().optional(),
  videoUrl: youtubeUrlSchema.optional(),
});

const createGameSchema = z.union([
  standaloneGameSchema,
  standaloneDualGameSchema,
  leagueGameSchema,
  leagueDualGameSchema,
]);

const updateGameSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    opponent: z.string().trim().min(1).max(120).nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    videoUrl: youtubeUrlSchema.nullable().optional(),
    initialActiveSide: z.enum([TEAM_SIDES.HOME, TEAM_SIDES.AWAY]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
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
  STAT_TYPES.OPP_REB,
  STAT_TYPES.AST,
  STAT_TYPES.OREB,
  STAT_TYPES.DREB,
  STAT_TYPES.STL,
  STAT_TYPES.TOV,
  STAT_TYPES.FOUL,
  STAT_TYPES.SUB_IN,
  STAT_TYPES.SUB_OUT,
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

const substitutionStatTypeSchema = z.enum([STAT_TYPES.SUB_IN, STAT_TYPES.SUB_OUT]);

const opponentStatTypeSchema = z.enum([
  STAT_TYPES.OPP_FT_MADE,
  STAT_TYPES.OPP_FG2_MADE,
  STAT_TYPES.OPP_FG3_MADE,
  STAT_TYPES.OPP_REB,
]);

const baseEventSchema = z.object({
  playerId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  teamSide: z.enum([TEAM_SIDES.HOME, TEAM_SIDES.AWAY]).optional(),
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

const appendSubstitutionEventSchema = baseEventSchema.extend({
  statType: substitutionStatTypeSchema,
  relatedPlayerId: z.string().min(1).optional(),
  relatedTeamSide: z.enum([TEAM_SIDES.HOME, TEAM_SIDES.AWAY]).optional(),
});

const appendOpponentEventSchema = z.object({
  statType: opponentStatTypeSchema,
  occurredAt: z.string().datetime().optional(),
});

const appendEventSchema = z.union([
  appendTrackedShotEventSchema,
  appendNonShotEventSchema,
  appendSubstitutionEventSchema,
  appendOpponentEventSchema,
]);

const setLineupSchema = z.object({
  playerIds: z.array(z.string().min(1)).length(5),
  teamSide: z.enum([TEAM_SIDES.HOME, TEAM_SIDES.AWAY]).optional(),
});

module.exports = {
  createGameSchema,
  updateGameSchema,
  appendEventSchema,
  setLineupSchema,
  statTypeSchema,
};
