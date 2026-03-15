const { z } = require('zod');

const teamCheckoutSchema = z.object({
  teamId: z.string().min(1),
});

module.exports = {
  teamCheckoutSchema,
};
