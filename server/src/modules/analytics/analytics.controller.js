const { z } = require('zod');
const analyticsService = require('./analytics.service');

const analyticsSchema = z.object({
  event: z.string().min(1),
  // OPT-024: kept optional so existing client payloads that still send it
  // don't fail validation, but it is never trusted — see below.
  distinctId: z.string().min(1).optional(),
  properties: z.record(z.any()).optional(),
});

async function capture(req, res) {
  const payload = analyticsSchema.parse(req.body);
  // OPT-024: this route requires authMiddleware, so every caller has a stable
  // req.auth.userId. Bind distinctId to it rather than trusting whatever the
  // client sent — otherwise a client bug (or a malicious client) could report
  // events under an arbitrary distinctId, and an authenticated user's events
  // wouldn't reliably merge with their own history.
  const result = await analyticsService.captureEvent({
    ...payload,
    distinctId: req.auth.userId,
  });
  res.status(200).json(result);
}

module.exports = {
  capture,
};
