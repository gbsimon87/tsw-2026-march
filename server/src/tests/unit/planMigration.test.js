// T-24: the plan-enum migration's pure value-map. Deterministic legacy→canonical,
// We-ball detection, user map, and the lossy rollback inverse. (Self-healing via
// planForPriceId is covered by plan-catalog.test.js; here stripePriceId is unset so
// the deterministic path runs.)
const {
  isWeballLeague,
  resolveTargetPlan,
  resolveBillingSource,
  mapUserPlan,
  rollbackPlan,
} = require('../../scripts/lib/planMigration');

describe('planMigration.resolveTargetPlan (deterministic map)', () => {
  it('maps legacy team plans to team_extra / starter', () => {
    expect(resolveTargetPlan('team', { plan: 'pro' })).toBe('team_extra');
    expect(resolveTargetPlan('team', { plan: 'team' })).toBe('team_extra');
    expect(resolveTargetPlan('team', { plan: 'free' })).toBe('starter');
    expect(resolveTargetPlan('team', { plan: undefined })).toBe('starter');
  });

  it('maps legacy league plans to league / starter', () => {
    expect(resolveTargetPlan('league', { plan: 'pro' })).toBe('league');
    expect(resolveTargetPlan('league', { plan: 'league' })).toBe('league');
    expect(resolveTargetPlan('league', { plan: 'free' })).toBe('starter');
  });

  it('is idempotent on already-canonical values', () => {
    expect(resolveTargetPlan('team', { plan: 'team_pro' })).toBe('team_extra');
    expect(resolveTargetPlan('team', { plan: 'starter' })).toBe('starter');
    expect(resolveTargetPlan('league', { plan: 'league' })).toBe('league');
  });
});

describe('planMigration.isWeballLeague / resolveBillingSource', () => {
  it('detects We-ball Saturday by slug or name', () => {
    expect(isWeballLeague({ slug: 'we-ball-saturday' })).toBe(true);
    expect(isWeballLeague({ name: 'We-ball Saturday' })).toBe(true);
    expect(isWeballLeague({ slug: 'city-league', name: 'City League' })).toBe(false);
  });

  it('sets billingSource comp for We-ball, stripe otherwise', () => {
    expect(resolveBillingSource('league', { slug: 'we-ball-saturday' })).toBe('comp');
    expect(resolveBillingSource('league', { slug: 'city-league' })).toBe('stripe');
    expect(resolveBillingSource('team', { plan: 'team_pro' })).toBe('stripe');
  });

  it('preserves an already-set non-stripe billingSource for non-Weball docs', () => {
    expect(resolveBillingSource('team', { billingSource: 'manual' })).toBe('manual');
  });
});

describe('planMigration.mapUserPlan', () => {
  it('maps every legacy user billing cache to starter', () => {
    expect(mapUserPlan('pro')).toBe('starter');
    expect(mapUserPlan('free')).toBe('starter');
    expect(mapUserPlan('team_pro')).toBe('starter');
  });
});

describe('planMigration.rollbackPlan (lossy inverse)', () => {
  it('restores a representative legacy value per scope', () => {
    expect(rollbackPlan('team', 'starter')).toBe('free');
    expect(rollbackPlan('team', 'team_pro')).toBe('team');
    expect(rollbackPlan('team', 'team_extra')).toBe('team');
    expect(rollbackPlan('league', 'team_pro')).toBe('pro');
    expect(rollbackPlan('league', 'league')).toBe('league');
  });

  // Audit H4: the pre-tightening User enum was ['free','pro'] — 'team' was never a
  // valid user plan, so the user scope needs its own inverse.
  it('rolls a user team_pro back to pro (never team)', () => {
    expect(rollbackPlan('user', 'team_pro')).toBe('pro');
    expect(rollbackPlan('user', 'starter')).toBe('free');
  });
});

describe('planMigration.resolveTargetPlan (self-heal safety, audit M6)', () => {
  it('throws when stripePriceId is set but matches no configured price id', () => {
    // A Stripe-backed doc whose price id the loaded env does not recognize means
    // the wrong ENV_FILE is loaded — silently falling back could downgrade a payer.
    expect(() =>
      resolveTargetPlan('team', { plan: 'pro', stripePriceId: 'price_unknown_123' })
    ).toThrow(/price_unknown_123/);
  });
});
