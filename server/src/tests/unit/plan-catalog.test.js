// Plan catalog — the single source of truth for plans, prices, and entitlements.
// See docs/pricing-overhaul/05-architecture.md §1 and 03-feature-packaging.md.

jest.mock('../../config/env', () => ({
  env: {
    STRIPE_PRICE_ID_TEAM_MONTHLY: 'price_team_monthly',
    STRIPE_PRICE_ID_TEAM_SEASON: 'price_team_season',
    STRIPE_PRICE_ID_LEAGUE_MONTHLY: 'price_league_monthly',
    STRIPE_PRICE_ID_LEAGUE_SEASON: 'price_league_season',
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

describe('plan-catalog: FEATURES + PLANS', () => {
  it('defines the three canonical plans', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['league', 'starter', 'team_pro']);
  });

  it('FEATURES contains the entitlement keys used across the app', () => {
    expect(Object.values(FEATURES)).toEqual(
      expect.arrayContaining([
        'canTrackStats',
        'canViewBoxScore',
        'canViewReplay',
        'canViewShotMaps',
        'canViewHighlightClips',
        'canViewFullHistory',
        'canExportCsv',
        'canRichPlayerProfiles',
        'canManageLeague',
      ])
    );
  });
});

describe('plan-catalog: getPlan', () => {
  it('returns the plan config for a known id', () => {
    expect(getPlan('team_pro')).toMatchObject({ id: 'team_pro', scope: 'team' });
  });

  it('returns null for an unknown id', () => {
    expect(getPlan('nope')).toBeNull();
  });
});

describe('plan-catalog: entitlementsForPlan', () => {
  it('starter grants only the free core; premium keys are false', () => {
    const ent = entitlementsForPlan('starter');
    expect(ent.canTrackStats).toBe(true);
    expect(ent.canViewBoxScore).toBe(true);
    expect(ent.canViewReplay).toBe(false);
    expect(ent.canExportCsv).toBe(false);
    expect(ent.canManageLeague).toBe(false);
  });

  it('team_pro grants all team premium features but not league management', () => {
    const ent = entitlementsForPlan('team_pro');
    expect(ent.canTrackStats).toBe(true);
    expect(ent.canViewReplay).toBe(true);
    expect(ent.canViewShotMaps).toBe(true);
    expect(ent.canViewHighlightClips).toBe(true);
    expect(ent.canViewFullHistory).toBe(true);
    expect(ent.canExportCsv).toBe(true);
    expect(ent.canRichPlayerProfiles).toBe(true);
    expect(ent.canManageLeague).toBe(false);
  });

  it('league grants management AND bundles all team_pro entitlements', () => {
    const ent = entitlementsForPlan('league');
    expect(ent.canManageLeague).toBe(true);
    // bundled from team_pro:
    expect(ent.canViewReplay).toBe(true);
    expect(ent.canViewShotMaps).toBe(true);
    expect(ent.canExportCsv).toBe(true);
    expect(ent.canTrackStats).toBe(true);
  });

  it('every FEATURES key is present as a boolean (absent defaults to false)', () => {
    const ent = entitlementsForPlan('starter');
    for (const key of Object.values(FEATURES)) {
      expect(typeof ent[key]).toBe('boolean');
    }
  });

  it('returns all-false for an unknown/invalid plan', () => {
    const ent = entitlementsForPlan('nope');
    expect(Object.values(ent).every((v) => v === false)).toBe(true);
  });
});

describe('plan-catalog: normalizePlanId (legacy shim)', () => {
  it('maps free/empty to starter for either scope', () => {
    expect(normalizePlanId('team', 'free')).toBe('starter');
    expect(normalizePlanId('team', '')).toBe('starter');
    expect(normalizePlanId('team', null)).toBe('starter');
    expect(normalizePlanId('league', 'free')).toBe('starter');
  });

  it('maps legacy pro and team to team_pro in team scope', () => {
    expect(normalizePlanId('team', 'pro')).toBe('team_pro');
    expect(normalizePlanId('team', 'team')).toBe('team_pro');
    expect(normalizePlanId('team', 'team_pro')).toBe('team_pro');
  });

  it('maps legacy pro and league to league in league scope', () => {
    expect(normalizePlanId('league', 'pro')).toBe('league');
    expect(normalizePlanId('league', 'league')).toBe('league');
  });

  it('falls back to starter for an unknown value', () => {
    expect(normalizePlanId('team', 'mystery')).toBe('starter');
  });
});

describe('plan-catalog: resolvePriceId', () => {
  it('resolves the env price id per plan + interval', () => {
    expect(resolvePriceId('team_pro', 'monthly')).toBe('price_team_monthly');
    expect(resolvePriceId('team_pro', 'season')).toBe('price_team_season');
    expect(resolvePriceId('league', 'monthly')).toBe('price_league_monthly');
    expect(resolvePriceId('league', 'season')).toBe('price_league_season');
  });

  it('returns undefined for a plan with no prices (starter) or unknown', () => {
    expect(resolvePriceId('starter', 'monthly')).toBeUndefined();
    expect(resolvePriceId('nope', 'monthly')).toBeUndefined();
  });
});

describe('plan-catalog: planForPriceId (reverse lookup)', () => {
  it('round-trips every priced plan/interval', () => {
    for (const planId of ['team_pro', 'league']) {
      for (const interval of ['monthly', 'season']) {
        const priceId = resolvePriceId(planId, interval);
        expect(planForPriceId(priceId)).toEqual({ planId, interval });
      }
    }
  });

  it('returns null for an unknown price id', () => {
    expect(planForPriceId('price_unknown')).toBeNull();
    expect(planForPriceId(undefined)).toBeNull();
  });
});

describe('plan-catalog: trialDaysFor', () => {
  it('returns the configured trial length for paid plans', () => {
    expect(trialDaysFor('team_pro', 'monthly')).toBe(14);
    expect(trialDaysFor('league', 'season')).toBe(14);
  });

  it('returns 0 for starter / unknown', () => {
    expect(trialDaysFor('starter', 'monthly')).toBe(0);
    expect(trialDaysFor('nope', 'monthly')).toBe(0);
  });
});

describe('plan-catalog: getDisplayCatalog', () => {
  it('lists all three plans with display info', () => {
    const catalog = getDisplayCatalog();
    const ids = catalog.map((p) => p.id).sort();
    expect(ids).toEqual(['league', 'starter', 'team_pro']);
  });

  it('never leaks price IDs or env var names to the client projection', () => {
    const serialized = JSON.stringify(getDisplayCatalog());
    expect(serialized).not.toContain('price_');
    expect(serialized).not.toContain('priceIdEnv');
    expect(serialized).not.toContain('STRIPE_PRICE_ID');
  });

  it('carries display prices and feature lists', () => {
    const teamPro = getDisplayCatalog().find((p) => p.id === 'team_pro');
    expect(teamPro.intervals.monthly.display).toBe('$9/mo');
    expect(teamPro.intervals.season.display).toBe('$79/yr');
    expect(Array.isArray(teamPro.features)).toBe(true);
    expect(teamPro.features.length).toBeGreaterThan(0);
  });
});
