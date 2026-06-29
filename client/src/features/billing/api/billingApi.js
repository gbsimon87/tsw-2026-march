import { apiClient } from '../../../lib/apiClient';

export const billingApi = {
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
