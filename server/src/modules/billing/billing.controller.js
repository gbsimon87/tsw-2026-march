const { ApiError } = require('../../utils/apiError');
const { teamCheckoutSchema } = require('./billing.validation');
const billingService = require('./billing.service');

function requireAuthUserId(req) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  return req.auth.userId;
}

async function createCheckoutSession(req, res) {
  const userId = requireAuthUserId(req);
  const payload = teamCheckoutSchema.parse(req.body);
  const result = await billingService.createCheckoutSession(userId, payload.teamId);
  res.status(200).json(result);
}

async function createCustomerPortalSession(req, res) {
  const userId = requireAuthUserId(req);
  const payload = teamCheckoutSchema.parse(req.body);
  const result = await billingService.createCustomerPortalSession(userId, payload.teamId);
  res.status(200).json(result);
}

async function handleWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  const rawBody = req.body;
  const result = await billingService.handleWebhookEvent(signature, rawBody);
  res.status(200).json(result);
}

module.exports = {
  createCheckoutSession,
  createCustomerPortalSession,
  handleWebhook,
};
