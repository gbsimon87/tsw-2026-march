const { z } = require('zod');

const teamCheckoutSchema = z.object({
  teamId: z.string().min(1),
  interval: z.enum(['monthly', 'season']).default('monthly'),
});

const leagueCheckoutSchema = z.object({
  interval: z.enum(['monthly', 'season']).default('monthly'),
});

const customerPortalSchema = z
  .object({
    teamId: z.string().min(1).optional(),
    leagueId: z.string().min(1).optional(),
  })
  .refine((data) => data.teamId || data.leagueId, {
    message: 'Either teamId or leagueId is required',
  })
  .refine((data) => !(data.teamId && data.leagueId), {
    message: 'Provide either teamId or leagueId, not both',
  });

module.exports = {
  teamCheckoutSchema,
  leagueCheckoutSchema,
  customerPortalSchema,
};
