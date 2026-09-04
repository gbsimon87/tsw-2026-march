const { z } = require('zod');

const teamCheckoutSchema = z
  .object({
    teamId: z.string().min(1),
  })
  .strict();

const leagueCheckoutSchema = z
  .object({
    planId: z.enum(['league', 'league_plus']).default('league'),
    leagueId: z.string().min(1).optional(),
  })
  .strict();

const leaguePlanChangeSchema = z
  .object({
    leagueId: z.string().min(1),
    planId: z.enum(['league', 'league_plus']),
  })
  .strict();

const chooseFreeTeamSchema = z.object({ teamId: z.string().min(1) }).strict();

const customerPortalSchema = z
  .object({
    teamId: z.string().min(1).optional(),
    leagueId: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => data.teamId || data.leagueId, {
    message: 'Either teamId or leagueId is required',
  })
  .refine((data) => !(data.teamId && data.leagueId), {
    message: 'Provide either teamId or leagueId, not both',
  });

const checkoutStatusSchema = z.object({
  sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/, 'Invalid Checkout Session ID'),
});

module.exports = {
  teamCheckoutSchema,
  leagueCheckoutSchema,
  leaguePlanChangeSchema,
  chooseFreeTeamSchema,
  customerPortalSchema,
  checkoutStatusSchema,
};
