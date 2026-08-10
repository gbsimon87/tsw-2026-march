const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const { checkoutLimiter } = require('../../middleware/rateLimit.middleware');
const controller = require('./billing.controller');

const billingRouter = Router();
const billingWebhookRouter = Router();

billingWebhookRouter.post('/', asyncHandler(controller.handleWebhook));

// Public — the served plan catalog for the client pricing page. Registered BEFORE
// the auth gate below so it needs no authentication (no price IDs are exposed).
billingRouter.get('/catalog', asyncHandler(controller.getCatalog));

billingRouter.use(authMiddleware);

// Legacy route — kept for backward compatibility
billingRouter.post(
  '/checkout-session',
  checkoutLimiter,
  asyncHandler(controller.createCheckoutSession)
);

// New routes
billingRouter.post(
  '/team-checkout',
  checkoutLimiter,
  asyncHandler(controller.createTeamCheckoutSession)
);
billingRouter.post(
  '/league-checkout',
  checkoutLimiter,
  asyncHandler(controller.createLeagueCheckoutSession)
);
billingRouter.post(
  '/customer-portal',
  checkoutLimiter,
  asyncHandler(controller.createCustomerPortalSession)
);

module.exports = {
  billingRouter,
  billingWebhookRouter,
};
