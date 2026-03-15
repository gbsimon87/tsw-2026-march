const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./billing.controller');

const billingRouter = Router();
const billingWebhookRouter = Router();

billingWebhookRouter.post('/', asyncHandler(controller.handleWebhook));

billingRouter.use(authMiddleware);
billingRouter.post('/checkout-session', asyncHandler(controller.createCheckoutSession));
billingRouter.post('/customer-portal', asyncHandler(controller.createCustomerPortalSession));

module.exports = {
  billingRouter,
  billingWebhookRouter,
};
