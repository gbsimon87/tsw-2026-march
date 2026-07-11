const { z } = require('zod');
const { paginationQueryShape } = require('../shared/pagination.validation');

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');

// GET /follows/following — keyset-paginated list of the current user's follows.
const followingQuerySchema = z.object(paginationQueryShape);

// GET /follows/status?userIds=a,b,c — batch "am I following?" for follow
// buttons. Accepts a comma-separated list of user ids, capped at 50.
const followStatusQuerySchema = z.object({
  userIds: z
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
  followingQuerySchema,
  followStatusQuerySchema,
};
