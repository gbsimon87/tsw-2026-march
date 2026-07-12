const { z } = require('zod');
const { paginationQueryShape } = require('../shared/pagination.validation');

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');

const targetTypeSchema = z.enum(['user', 'league', 'leagueTeam']);

// GET /follows/following?targetType=… — keyset-paginated list of the current
// user's follows of one type (the client fires one query per section).
const followingQuerySchema = z.object({
  ...paginationQueryShape,
  targetType: targetTypeSchema.optional(),
});

// GET /follows/status?targetType=…&targetIds=a,b,c — batch "am I following?" for
// follow buttons. Accepts a comma-separated list of ids, capped at 50.
const followStatusQuerySchema = z.object({
  targetType: targetTypeSchema,
  targetIds: z
    .string()
    .trim()
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    .pipe(z.array(objectIdSchema).max(50, 'Too many ids (max 50)')),
});

module.exports = {
  objectIdSchema,
  targetTypeSchema,
  followingQuerySchema,
  followStatusQuerySchema,
};
