/**
 * We-ball Saturday regression test.
 *
 * The production league has plan: 'pro', subscriptionStatus: 'active', and all
 * Stripe fields null. It was set up manually before the Stripe billing system
 * existed. This test ensures that every billing change keeps this legacy record
 * working correctly.
 */

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeagueById: jest.fn(),
  findLeagueBySlug: jest.fn(),
  findLeagueByIdAndOwner: jest.fn(),
  listLeaguesByOwner: jest.fn(),
  saveLeague: jest.fn(async (l) => l),
  listLeagueTeams: jest.fn(() => []),
  createLeague: jest.fn(),
  listLeaguesByIds: jest.fn(() => []),
  LeagueManager: { exists: jest.fn() },
  LeagueTeamMember: { exists: jest.fn() },
  League: { findOne: jest.fn() },
  findActiveLeagueManager: jest.fn(),
}));

jest.mock('../../modules/teams/teams.repository', () => ({
  findTeamById: jest.fn(),
  findTeamByIdAndOwner: jest.fn(),
  Team: { exists: jest.fn() },
}));

jest.mock('../../config/env', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_123',
    STRIPE_PRICE_ID_TEAM_MONTHLY: 'price_team_monthly',
    STRIPE_PRICE_ID_TEAM_SEASON: 'price_team_season',
    STRIPE_PRICE_ID_LEAGUE_MONTHLY: 'price_league_monthly',
    STRIPE_PRICE_ID_LEAGUE_SEASON: 'price_league_season',
    STRIPE_SUCCESS_URL: 'http://localhost:5173/billing/success',
    STRIPE_CANCEL_URL: 'http://localhost:5173/billing/cancel',
  },
}));

const {
  isLeagueActive,
  getLeagueEntitlements,
  getLeagueBillingSummary,
} = require('../../modules/billing/billing.service');

// Mirrors the production We-ball Saturday document exactly:
// manually set plan + status, no Stripe fields attached.
function buildWeballLeague(overrides = {}) {
  return {
    _id: 'weball-league-id',
    ownerUserId: 'weball-owner-id',
    name: 'We-ball Saturday',
    slug: 'we-ball-saturday',
    plan: 'pro',
    subscriptionStatus: 'active',
    // All Stripe fields are null — no subscription attached
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingEmail: null,
    billingInterval: null,
    trialEnd: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    processedWebhookEventIds: [],
    lastWebhookEventId: null,
    ...overrides,
  };
}

describe('We-ball Saturday backward compatibility', () => {
  const league = buildWeballLeague();

  test('31.1 seeded League doc has plan: pro, subscriptionStatus: active, all Stripe fields null', () => {
    expect(league.plan).toBe('pro');
    expect(league.subscriptionStatus).toBe('active');
    expect(league.stripeCustomerId).toBeNull();
    expect(league.stripeSubscriptionId).toBeNull();
    expect(league.stripePriceId).toBeNull();
    expect(league.billingEmail).toBeNull();
    expect(league.trialEnd).toBeNull();
  });

  test('31.2 isLeagueActive returns true for plan=pro subscriptionStatus=active', () => {
    expect(isLeagueActive(league)).toBe(true);
  });

  test('31.3 getLeagueEntitlements returns all true', () => {
    const entitlements = getLeagueEntitlements(league);
    expect(entitlements.canManageLeague).toBe(true);
    expect(entitlements.canTrackStats).toBe(true);
    expect(entitlements.canViewReplay).toBe(true);
    expect(entitlements.canViewShotMaps).toBe(true);
    expect(entitlements.canViewHighlightClips).toBe(true);
  });

  test('31.4 getLeagueBillingSummary exposes only safe fields (no Stripe IDs)', () => {
    const summary = getLeagueBillingSummary(league);
    expect(summary.plan).toBe('pro');
    expect(summary.subscriptionStatus).toBe('active');
    expect(summary).not.toHaveProperty('stripeCustomerId');
    expect(summary).not.toHaveProperty('stripeSubscriptionId');
    expect(summary).not.toHaveProperty('stripePriceId');
    expect(summary).not.toHaveProperty('billingEmail');
    expect(summary).not.toHaveProperty('processedWebhookEventIds');
    expect(summary).not.toHaveProperty('lastWebhookEventId');
  });

  test('31.5 plan field remains pro after reading through billing functions (not mutated)', () => {
    const leagueCopy = buildWeballLeague();
    isLeagueActive(leagueCopy);
    getLeagueEntitlements(leagueCopy);
    getLeagueBillingSummary(leagueCopy);
    expect(leagueCopy.plan).toBe('pro');
  });

  test('31.6 subscriptionStatus remains active after reading through billing functions', () => {
    const leagueCopy = buildWeballLeague();
    isLeagueActive(leagueCopy);
    getLeagueEntitlements(leagueCopy);
    getLeagueBillingSummary(leagueCopy);
    expect(leagueCopy.subscriptionStatus).toBe('active');
  });

  test('31.7 isLeagueActive returns true for both active and trialing statuses', () => {
    expect(isLeagueActive(buildWeballLeague({ subscriptionStatus: 'active' }))).toBe(true);
    expect(isLeagueActive(buildWeballLeague({ subscriptionStatus: 'trialing' }))).toBe(true);
  });

  test('isLeagueActive returns false for free plan (sanity check)', () => {
    expect(
      isLeagueActive(buildWeballLeague({ plan: 'free', subscriptionStatus: 'inactive' }))
    ).toBe(false);
  });

  test('isLeagueActive returns false for pro plan with canceled status', () => {
    expect(isLeagueActive(buildWeballLeague({ subscriptionStatus: 'canceled' }))).toBe(false);
  });

  test('isLeagueActive returns true for plan=league (new Stripe-backed plan)', () => {
    expect(
      isLeagueActive(buildWeballLeague({ plan: 'league', subscriptionStatus: 'trialing' }))
    ).toBe(true);
  });
});
