// Guard against the "mock hides a missing export" gap (same failure mode as
// follows.dependency-contract.test.js). billing.service.test.js mocks stripe and
// the repositories, so it can't catch billing.service importing a symbol that the
// entitlements resolver or plan catalog fails to export. These assertions require
// the REAL modules (no mocks) and check the exact contract the billing module and
// its Phase-4 consumers depend on.
const catalog = require('../../modules/billing/plan-catalog');
const entitlements = require('../../modules/billing/entitlements.service');
const billingService = require('../../modules/billing/billing.service');

describe('billing module dependency contract', () => {
  test('plan-catalog exports its full public API', () => {
    for (const fn of [
      'getPlan',
      'entitlementsForPlan',
      'normalizePlanId',
      'resolvePriceId',
      'planForPriceId',
      'trialDaysFor',
      'getDisplayCatalog',
    ]) {
      expect(typeof catalog[fn]).toBe('function');
    }
    expect(catalog.FEATURES).toBeTruthy();
    expect(catalog.PLANS).toBeTruthy();
  });

  test('entitlements.service exports the resolver API consumers import', () => {
    for (const fn of [
      'resolveEntitlements',
      'resolveForTeam',
      'resolveForLeague',
      'resolveForLeagueTeam',
      'resolveForUser',
      'createRequestCache',
    ]) {
      expect(typeof entitlements[fn]).toBe('function');
    }
  });

  test('billing.service loads with the real resolver and keeps its public API', () => {
    // Requiring billing.service with real deps would throw at load if the resolver
    // symbols it imports (resolveForTeam/resolveForLeague) were missing.
    for (const fn of [
      'isTeamActive',
      'isLeagueActive',
      'getTeamEntitlements',
      'getLeagueEntitlements',
      'handleWebhookEvent',
      'createTeamCheckoutSession',
      'createLeagueCheckoutSession',
    ]) {
      expect(typeof billingService[fn]).toBe('function');
    }
  });
});
