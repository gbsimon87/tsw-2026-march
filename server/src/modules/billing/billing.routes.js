const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const { checkoutLimiter } = require('../../middleware/rateLimit.middleware');
const controller = require('./billing.controller');

const billingRouter = Router();
const billingWebhookRouter = Router();

billingWebhookRouter.post('/', asyncHandler(controller.handleWebhook));

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
