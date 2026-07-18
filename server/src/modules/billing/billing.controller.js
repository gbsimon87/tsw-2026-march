const { ApiError } = require('../../utils/apiError');
const {
  teamCheckoutSchema,
  leagueCheckoutSchema,
  customerPortalSchema,
} = require('./billing.validation');
const billingService = require('./billing.service');
const { getDisplayCatalog } = require('./plan-catalog');

// Public: the price-ID-free plan catalog the client pricing page renders from.
async function getCatalog(req, res) {
  // Audit M12: static config — let shared caches and the browser hold it briefly
  // instead of refetching on every pricing-page visit.
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).json({ plans: getDisplayCatalog() });
}

function requireAuthUserId(req) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  return req.auth.userId;
}

async function createCheckoutSession(req, res) {
  const userId = requireAuthUserId(req);
  const payload = teamCheckoutSchema.parse(req.body);
  const result = await billingService.createTeamCheckoutSession(
    userId,
    payload.teamId,
    payload.interval
  );
  res.status(200).json(result);
}

async function createTeamCheckoutSession(req, res) {
  const userId = requireAuthUserId(req);
  const payload = teamCheckoutSchema.parse(req.body);
  const result = await billingService.createTeamCheckoutSession(
    userId,
    payload.teamId,
    payload.interval
  );
  res.status(200).json(result);
}

async function createLeagueCheckoutSession(req, res) {
  const userId = requireAuthUserId(req);
  const payload = leagueCheckoutSchema.parse(req.body);
  const result = await billingService.createLeagueCheckoutSession(userId, payload.interval);
  res.status(200).json(result);
}

async function createCustomerPortalSession(req, res) {
  const userId = requireAuthUserId(req);
  const payload = customerPortalSchema.parse(req.body);

  let result;
  if (payload.leagueId) {
    result = await billingService.createLeaguePortalSession(userId, payload.leagueId);
  } else {
    result = await billingService.createTeamPortalSession(userId, payload.teamId);
  }

  res.status(200).json(result);
}

async function handleWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  if (!signature) throw new ApiError(400, 'Missing stripe-signature header');
  const rawBody = req.body;
  const result = await billingService.handleWebhookEvent(signature, rawBody);
  res.status(200).json(result);
}

module.exports = {
  getCatalog,
  createCheckoutSession,
  createTeamCheckoutSession,
  createLeagueCheckoutSession,
  createCustomerPortalSession,
  handleWebhook,
};
