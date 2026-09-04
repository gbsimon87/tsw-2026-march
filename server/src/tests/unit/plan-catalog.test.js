jest.mock('../../config/env', () => ({
  env: {
    STRIPE_PRICE_ID_ADDITIONAL_TEAM: 'price_additional_team',
    STRIPE_PRICE_ID_LEAGUE: 'price_league',
    STRIPE_PRICE_ID_LEAGUE_PLUS: 'price_league_plus',
  },
}));

const {
  FEATURES,
  PLANS,
  getPlan,
  entitlementsForPlan,
  normalizePlanId,
  resolvePriceId,
  planForPriceId,
  trialDaysFor,
  getDisplayCatalog,
} = require('../../modules/billing/plan-catalog');

describe('capacity pricing catalog', () => {
  it('defines the four canonical plans', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['league', 'league_plus', 'starter', 'team_extra']);
    expect(getPlan('team_extra')).toMatchObject({ scope: 'team' });
    expect(getPlan('league')).toMatchObject({ limits: { maxLeagueTeams: 10 } });
    expect(getPlan('league_plus')).toMatchObject({ limits: { maxLeagueTeams: 24 } });
  });

  it('gives every current team feature to free and paid teams', () => {
    const free = entitlementsForPlan('starter');
    const additional = entitlementsForPlan('team_extra');
    for (const key of [
      'canTrackStats',
      'canViewBoxScore',
      'canViewReplay',
      'canViewShotMaps',
      'canViewHighlightClips',
      'canViewFullHistory',
      'canExportCsv',
    ]) {
      expect(free[key]).toBe(true);
      expect(additional[key]).toBe(true);
    }
    expect(free.canManageLeague).toBe(false);
    expect(additional.canManageLeague).toBe(false);
  });

  it('gives both paid League tiers management plus all team features', () => {
    for (const planId of ['league', 'league_plus']) {
      const entitlements = entitlementsForPlan(planId);
      expect(entitlements.canManageLeague).toBe(true);
      expect(entitlements.canViewReplay).toBe(true);
      expect(entitlements.canExportCsv).toBe(true);
    }
  });

  it('always returns every feature key as a boolean', () => {
    const entitlements = entitlementsForPlan('starter');
    for (const key of Object.values(FEATURES)) {
      expect(typeof entitlements[key]).toBe('boolean');
    }
  });

  it('normalizes legacy team plan names to team_extra', () => {
    for (const legacy of ['pro', 'team', 'team_pro', 'team_extra']) {
      expect(normalizePlanId('team', legacy)).toBe('team_extra');
    }
    expect(normalizePlanId('league', 'pro')).toBe('league');
    expect(normalizePlanId('league', 'league_plus')).toBe('league_plus');
    expect(normalizePlanId('team', 'unknown')).toBe('starter');
  });

  it('resolves and reverse-resolves all three monthly Stripe prices', () => {
    const expected = {
      team_extra: 'price_additional_team',
      league: 'price_league',
      league_plus: 'price_league_plus',
    };
    for (const [planId, priceId] of Object.entries(expected)) {
      expect(resolvePriceId(planId, 'monthly')).toBe(priceId);
      expect(planForPriceId(priceId)).toEqual({ planId, interval: 'monthly' });
    }
    expect(resolvePriceId('starter', 'monthly')).toBeUndefined();
    expect(planForPriceId('price_unknown')).toBeNull();
  });

  it('applies trials only to League plans', () => {
    expect(trialDaysFor('team_extra', 'monthly')).toBe(0);
    expect(trialDaysFor('league', 'monthly')).toBe(14);
    expect(trialDaysFor('league_plus', 'monthly')).toBe(14);
  });

  it('serves display data without secret price IDs or env names', () => {
    const catalog = getDisplayCatalog();
    expect(catalog.map((plan) => plan.id).sort()).toEqual([
      'league',
      'league_plus',
      'starter',
      'team_extra',
    ]);
    expect(catalog.find((plan) => plan.id === 'team_extra').intervals.monthly.display).toBe(
      '£5/mo per additional team'
    );
    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain('price_');
    expect(serialized).not.toContain('STRIPE_PRICE_ID');
  });
});
