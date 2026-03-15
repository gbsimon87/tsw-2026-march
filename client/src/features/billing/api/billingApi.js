import { apiClient } from '../../../lib/apiClient';

export const billingApi = {
  createCheckoutSession(teamId) {
    return apiClient.post('/billing/checkout-session', { teamId });
  },
  createCustomerPortalSession(teamId) {
    return apiClient.post('/billing/customer-portal', { teamId });
  },
};
