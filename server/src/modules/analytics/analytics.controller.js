const { z } = require('zod');
const analyticsService = require('./analytics.service');

const analyticsSchema = z.object({
  event: z.string().min(1),
  distinctId: z.string().min(1),
  properties: z.record(z.any()).optional(),
});

async function capture(req, res) {
  const payload = analyticsSchema.parse(req.body);
  const result = await analyticsService.captureEvent(payload);
  res.status(200).json(result);
}

module.exports = {
  capture,
};
