// T-07: the env schema must fail fast on a partially-configured billing setup and
// must no longer carry the retired STRIPE_PRICE_ID_PRO_MONTHLY. Requiring the real
// env module is safe here — setupEnv.js provides the required base vars and leaves
// Stripe unset, so boot validation passes without triggering the new refinement.
const { envSchema } = require('../../config/env');

const PRICE_IDS = {
  STRIPE_PRICE_ID_TEAM_MONTHLY: 'price_team_monthly',
  STRIPE_PRICE_ID_TEAM_SEASON: 'price_team_season',
  STRIPE_PRICE_ID_LEAGUE_MONTHLY: 'price_league_monthly',
  STRIPE_PRICE_ID_LEAGUE_SEASON: 'price_league_season',
};

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    CLIENT_ORIGIN: 'http://localhost:5173',
    MONGO_URI: 'mongodb://127.0.0.1:27017/tsw_test',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    ...overrides,
  };
}

describe('env schema — Stripe price-ID completeness (T-07)', () => {
  it('exposes the schema for validation', () => {
    expect(envSchema).toBeTruthy();
    expect(typeof envSchema.safeParse).toBe('function');
  });

  it('accepts billing enabled with all four price IDs present', () => {
    const result = envSchema.safeParse(baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123', ...PRICE_IDS }));
    expect(result.success).toBe(true);
  });

  it('rejects billing enabled when a price ID is missing', () => {
    const partial = { ...PRICE_IDS };
    delete partial.STRIPE_PRICE_ID_TEAM_SEASON;
    const result = envSchema.safeParse(baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123', ...partial }));
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => i.message).join(' ');
    expect(messages).toContain('STRIPE_PRICE_ID_TEAM_SEASON');
  });

  it('allows billing disabled (no secret key) with no price IDs', () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
  });

  it('no longer carries the retired STRIPE_PRICE_ID_PRO_MONTHLY', () => {
    const result = envSchema.safeParse(
      baseEnv({ STRIPE_PRICE_ID_PRO_MONTHLY: 'price_legacy_pro' })
    );
    expect(result.success).toBe(true);
    expect(result.data.STRIPE_PRICE_ID_PRO_MONTHLY).toBeUndefined();
  });
});
