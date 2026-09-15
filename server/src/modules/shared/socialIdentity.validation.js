const { z } = require('zod');

const {
  AGE_CATEGORIES,
  HANDLE_MAX_LENGTH,
  MARKETING_STATUSES,
  isValidHandle,
} = require('./socialIdentity');

// Social backlog rank 9. Shared by leagues.validation.js and
// teams.validation.js so a handle is accepted on exactly the same terms
// wherever it is recorded.
//
// The stored value never carries '@' but the field accepts one, because that is
// how people copy a handle. Length is checked against the trimmed, '@'-stripped
// form in isValidHandle; the outer max is only a guard on absurd input.
function handleSchema(network) {
  return z
    .string()
    .trim()
    .max(HANDLE_MAX_LENGTH[network] + 1)
    .nullable()
    .optional()
    .refine((value) => isValidHandle(value, network), {
      message: `Use only letters, numbers, periods and underscores (max ${HANDLE_MAX_LENGTH[network]})`,
    });
}

const marketingFields = {
  // 'unrecorded' is offered so an operator can withdraw a record back to
  // nothing, not only flip it to 'declined'.
  marketingStatus: z.enum(MARKETING_STATUSES).optional(),
  marketingNote: z.string().trim().max(280).nullable().optional(),
};

// A league team records handles but never permission: the league above it is
// the party that grants it, and resolveMarketingPermission reads only the
// league's record. Accepting a status here would store a field nothing
// consults, so the boundary rejects it instead of dropping it quietly.
const socialHandlesUpdateSchema = z
  .object({
    instagramHandle: handleSchema('instagram'),
    tiktokHandle: handleSchema('tiktok'),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one social field is required',
  });

const socialIdentityUpdateSchema = z
  .object({
    instagramHandle: handleSchema('instagram'),
    tiktokHandle: handleSchema('tiktok'),
    ...marketingFields,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one social field is required',
  });

const playerSocialIdentityUpdateSchema = z
  .object({
    instagramHandle: handleSchema('instagram'),
    tiktokHandle: handleSchema('tiktok'),
    ...marketingFields,
    ageCategory: z.enum(AGE_CATEGORIES).optional(),
    // A boolean, not a date: the server stamps when the record was made, and
    // false clears it. A client-chosen consent date is not evidence.
    guardianConsent: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one social field is required',
  });

module.exports = {
  playerSocialIdentityUpdateSchema,
  socialHandlesUpdateSchema,
  socialIdentityUpdateSchema,
};
