const { z } = require('zod');

const playerPositionSchema = z.enum(['PG', 'SG', 'SF', 'PF', 'C']);
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color');
const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : ''))
  .optional();

const homeVenueSchema = z
  .object({
    arenaName: optionalTrimmedString,
    addressLine1: optionalTrimmedString,
    addressLine2: optionalTrimmedString,
    city: optionalTrimmedString,
    state: optionalTrimmedString,
    postalCode: optionalTrimmedString,
    country: optionalTrimmedString,
  })
  .transform((value) => {
    const normalized = {
      arenaName: value.arenaName || '',
      addressLine1: value.addressLine1 || '',
      addressLine2: value.addressLine2 || '',
      city: value.city || '',
      state: value.state || '',
      postalCode: value.postalCode || '',
      country: value.country || '',
    };
    const hasAnyValue = Object.values(normalized).some(Boolean);

    if (!hasAnyValue) {
      return undefined;
    }

    return normalized;
  })
  .superRefine((value, ctx) => {
    if (!value) {
      return;
    }

    for (const field of ['arenaName', 'addressLine1', 'city', 'state', 'postalCode', 'country']) {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} is required`,
          path: [field],
        });
      }
    }
  });

const playerSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  jerseyNumber: z.number().int().min(0).max(999).optional(),
  position: playerPositionSchema.optional(),
});

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  players: z.array(playerSchema).max(30).optional(),
  colors: z.array(hexColorSchema).max(3).optional(),
  homeVenue: homeVenueSchema.optional(),
});

const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    colors: z.array(hexColorSchema).max(3).optional(),
    homeVenue: homeVenueSchema.optional(),
    removeLogo: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const addPlayerSchema = playerSchema;

const updatePlayerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
    position: playerPositionSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

module.exports = {
  createTeamSchema,
  updateTeamSchema,
  addPlayerSchema,
  updatePlayerSchema,
  playerPositionSchema,
};
