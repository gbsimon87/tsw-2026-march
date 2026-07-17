import { apiClient } from '../../../lib/apiClient';

export const billingApi = {
  // Public served plan catalog (price-ID-free). Source of truth for pricing copy.
  getCatalog() {
    return apiClient.get('/billing/catalog');
  },
  createTeamCheckoutSession(teamId, interval = 'monthly') {
    return apiClient.post('/billing/team-checkout', { teamId, interval });
  },
  createLeagueCheckoutSession(interval = 'monthly') {
    return apiClient.post('/billing/league-checkout', { interval });
  },
  createCustomerPortalSession({ teamId, leagueId } = {}) {
    return apiClient.post('/billing/customer-portal', { teamId, leagueId });
  },
  // Legacy alias — kept for backward compatibility
  createCheckoutSession(teamId) {
    return apiClient.post('/billing/checkout-session', { teamId });
  },
};
