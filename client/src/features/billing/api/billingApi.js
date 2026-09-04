import { apiClient } from '../../../lib/apiClient';

export const billingApi = {
  // Public served plan catalog (price-ID-free). Source of truth for pricing copy.
  getCatalog() {
    return apiClient.get('/billing/catalog');
  },
  createTeamCheckoutSession(teamId) {
    return apiClient.post('/billing/team-checkout', { teamId });
  },
  createLeagueCheckoutSession(planId = 'league', leagueId) {
    return apiClient.post('/billing/league-checkout', { planId, leagueId });
  },
  createCustomerPortalSession({ teamId, leagueId } = {}) {
    return apiClient.post('/billing/customer-portal', { teamId, leagueId });
  },
  getCheckoutStatus(sessionId) {
    return apiClient.get(`/billing/checkout-status?sessionId=${encodeURIComponent(sessionId)}`);
  },
  changeLeaguePlan(leagueId, planId) {
    return apiClient.post('/billing/league-plan-change', { leagueId, planId });
  },
  chooseFreeTeam(teamId) {
    return apiClient.post('/billing/free-team', { teamId });
  },
};
