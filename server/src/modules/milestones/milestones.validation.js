const { z } = require('zod');

const listPlayerMilestonesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().trim().min(1).optional(),
});

module.exports = { listPlayerMilestonesQuerySchema };
