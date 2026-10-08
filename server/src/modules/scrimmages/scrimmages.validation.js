const { z } = require('zod');
const { isSupportedYouTubeUrl } = require('../games/games.validation');
const id = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ID');
const name = z.string().trim().min(1).max(120);
const mvpRules = z.object({
  missPenalty: z.number().min(0).max(10),
  turnoverPenalty: z.number().min(0).max(10),
  winBonus: z.number().min(0).max(10),
  lossPenalty: z.number().min(0).max(10),
  weeklyMinGames: z.number().int().min(1).max(100),
  seasonMinGames: z.number().int().min(1).max(1000),
  seasonMinWeeks: z.number().int().min(1).max(100),
});
const termsText = z.string().trim().min(1).max(20000);
const create = z.object({
  name,
  isPublic: z.boolean().default(true),
  termsText,
  termsScope: z.enum(['series', 'weekly']).default('series'),
  seasonLabel: name.default('Season 1'),
  mvpRules: mvpRules.optional(),
});
const update = z.object({
  name: name.optional(),
  isPublic: z.boolean().optional(),
  termsText: termsText.optional(),
  termsScope: z.enum(['series', 'weekly']).optional(),
  managerEmails: z.array(z.string().trim().toLowerCase().email()).max(20).optional(),
});
const player = z
  .object({
    displayName: name,
    leaguePlayerId: id.optional(),
    sourceTeamId: id.optional(),
    sourcePlayerId: id.optional(),
  })
  .refine(
    (p) =>
      Boolean(p.sourceTeamId) === Boolean(p.sourcePlayerId) &&
      !(p.leaguePlayerId && p.sourcePlayerId),
    'Select one player source'
  );
const updatePlayer = z.object({ displayName: name.optional(), isActive: z.boolean().optional() });
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
      new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
    'Invalid date'
  );
const assignments = z
  .array(
    z.object({
      playerId: id,
      color: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .transform((v) => v.toLowerCase()),
    })
  )
  .max(200);
const session = z.object({
  label: name,
  date,
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .refine(isSupportedYouTubeUrl, 'Use a YouTube URL')
    .optional(),
  assignments,
  scoringRules: z
    .object({
      insideArc: z.number().int().min(1).max(3),
      outsideArc: z.number().int().min(1).max(4),
    })
    .optional(),
  regulationSeconds: z.number().int().min(60).max(3600).optional(),
  overtimeSeconds: z.number().int().min(60).max(3600).optional(),
  termsText: termsText.optional(),
});
const roster = z
  .array(z.object({ playerId: id, jerseyNumber: z.number().int().min(0).max(999).nullable() }))
  .min(1)
  .max(5);
const game = z.object({
  requestId: z.string().uuid(),
  homeColor: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((v) => v.toLowerCase()),
  awayColor: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((v) => v.toLowerCase()),
  homePlayers: roster,
  awayPlayers: roster,
  videoStartTimestamp: z.number().min(0).max(86400).default(0),
  previousGameId: id.optional(),
});
const accept = z.object({
  termsVersion: z.string().length(64),
  signedName: name,
  accepted: z.literal(true),
});
const join = accept.extend({ displayName: name, playerId: id });
const review = z.object({ status: z.enum(['approved', 'rejected']) });
const season = z.object({ label: name, mvpRules: mvpRules.optional() });
module.exports = {
  id,
  create,
  update,
  player,
  updatePlayer,
  mergePlayers: z.object({ toPlayerId: id, confirmed: z.literal(true) }),
  session,
  assignments,
  game,
  accept,
  join,
  review,
  season,
};
