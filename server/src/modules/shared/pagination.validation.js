const { z } = require('zod');
const { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require('../../utils/pagination');

// OPT-018: shared cursor/limit query validation for paginated list endpoints.
// `cursor` is a 24-hex ObjectId (the previous page's last `_id`); `limit` is
// coerced from the query string, bounded, and defaulted. Spread into a route's
// own query schema, e.g. `z.object({ ...paginationQueryShape, status: ... })`.
const paginationQueryShape = {
  cursor: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid cursor')
    .optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
};

const paginationQuerySchema = z.object(paginationQueryShape);

module.exports = {
  paginationQueryShape,
  paginationQuerySchema,
};
