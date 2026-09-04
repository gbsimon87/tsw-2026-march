// T-07: the env schema must fail fast on a partially-configured billing setup and
// must no longer carry the retired STRIPE_PRICE_ID_PRO_MONTHLY. Requiring the real
// env module is safe here — setupEnv.js provides the required base vars and leaves
// Stripe unset, so boot validation passes without triggering the new refinement.
const { envSchema } = require('../../config/env');

const PRICE_IDS = {
  STRIPE_PRICE_ID_ADDITIONAL_TEAM: 'price_additional_team',
  STRIPE_PRICE_ID_LEAGUE: 'price_league',
  STRIPE_PRICE_ID_LEAGUE_PLUS: 'price_league_plus',
};

// Audit M2: full required Stripe config once the secret key is set — price IDs
// plus the webhook secret and success/cancel URLs.
const FULL_STRIPE = {
  ...PRICE_IDS,
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_tsw_locked_down',
  STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID: 'bpc_tsw_upgrade_only',
  STRIPE_SUCCESS_URL: 'http://localhost:5173/billing/success',
  STRIPE_CANCEL_URL: 'http://localhost:5173/billing/cancel',
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

  it('accepts billing enabled with the full Stripe config present', () => {
    const result = envSchema.safeParse(
      baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123', ...FULL_STRIPE })
    );
    expect(result.success).toBe(true);
  });

  it('rejects billing enabled when a price ID is missing', () => {
    const partial = { ...FULL_STRIPE };
    delete partial.STRIPE_PRICE_ID_LEAGUE_PLUS;
    const result = envSchema.safeParse(baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123', ...partial }));
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => i.message).join(' ');
    expect(messages).toContain('STRIPE_PRICE_ID_LEAGUE_PLUS');
  });

  it('rejects billing enabled when the webhook secret or redirect URLs are missing (audit M2)', () => {
    for (const key of [
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PORTAL_CONFIGURATION_ID',
      'STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID',
      'STRIPE_SUCCESS_URL',
      'STRIPE_CANCEL_URL',
    ]) {
      const partial = { ...FULL_STRIPE };
      delete partial[key];
      const result = envSchema.safeParse(baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123', ...partial }));
      expect(result.success).toBe(false);
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toContain(key);
    }
  });

  it('allows billing disabled (no secret key) with no price IDs', () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
  });

  it('allows local development to start while the new Stripe catalog is incomplete', () => {
    const result = envSchema.safeParse(
      baseEnv({
        NODE_ENV: 'development',
        APP_ENV: 'development',
        STRIPE_SECRET_KEY: 'sk_test_legacy_local',
        STRIPE_WEBHOOK_SECRET: 'whsec_legacy_local',
        STRIPE_SUCCESS_URL: 'http://localhost:5173/billing/success',
        STRIPE_CANCEL_URL: 'http://localhost:5173/billing/cancel',
      })
    );

    expect(result.success).toBe(true);
  });

  it('keeps deployed development strict even though APP_ENV is development', () => {
    const result = envSchema.safeParse(
      baseEnv({
        NODE_ENV: 'production',
        APP_ENV: 'development',
        STRIPE_SECRET_KEY: 'rk_test_deployed_dev',
      })
    );

    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain(
      'STRIPE_PRICE_ID_ADDITIONAL_TEAM'
    );
  });

  it('rejects duplicate price IDs', () => {
    const result = envSchema.safeParse(
      baseEnv({
        STRIPE_SECRET_KEY: 'sk_test_123',
        ...FULL_STRIPE,
        STRIPE_PRICE_ID_LEAGUE: PRICE_IDS.STRIPE_PRICE_ID_ADDITIONAL_TEAM,
      })
    );
    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain(
      'different price ID'
    );
  });

  it('rejects live keys in development and test keys in production', () => {
    expect(
      envSchema.safeParse(
        baseEnv({ APP_ENV: 'development', STRIPE_SECRET_KEY: 'sk_live_123', ...FULL_STRIPE })
      ).success
    ).toBe(false);
    expect(
      envSchema.safeParse(
        baseEnv({ APP_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_123', ...FULL_STRIPE })
      ).success
    ).toBe(false);
  });

  it('rejects redirect URLs on a different origin', () => {
    const result = envSchema.safeParse(
      baseEnv({
        STRIPE_SECRET_KEY: 'sk_test_123',
        ...FULL_STRIPE,
        STRIPE_SUCCESS_URL: 'https://evil.example/billing/success',
      })
    );
    expect(result.success).toBe(false);
  });

  it('accepts redirect URLs matching one of multiple comma-separated client origins', () => {
    const result = envSchema.safeParse(
      baseEnv({
        CLIENT_ORIGIN:
          'https://dev.thesportyway.com,https://tsw-2026-march-client-dev.onrender.com',
        STRIPE_SECRET_KEY: 'sk_test_123',
        ...FULL_STRIPE,
        STRIPE_SUCCESS_URL: 'https://dev.thesportyway.com/billing/success',
        STRIPE_CANCEL_URL: 'https://dev.thesportyway.com/billing/cancel',
      })
    );

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

describe('env schema — analytics deployment identity', () => {
  it('defaults PostHog ingestion to the EU project host', () => {
    const result = envSchema.safeParse(baseEnv());

    expect(result.success).toBe(true);
    expect(result.data.POSTHOG_HOST).toBe('https://eu.i.posthog.com');
  });

  it('accepts an explicit app environment independently of NODE_ENV', () => {
    const result = envSchema.safeParse(baseEnv({ NODE_ENV: 'production', APP_ENV: 'development' }));

    expect(result.success).toBe(true);
    expect(result.data.APP_ENV).toBe('development');
  });

  it('rejects an unknown app environment', () => {
    const result = envSchema.safeParse(baseEnv({ APP_ENV: 'staging' }));

    expect(result.success).toBe(false);
  });
});

describe('AUTO_FEED_MILESTONES_ENABLED', () => {
  test('defaults to false when unset', () => {
    expect(envSchema.parse(baseEnv()).AUTO_FEED_MILESTONES_ENABLED).toBe(false);
  });

  test('is true only for the exact string "true"', () => {
    expect(
      envSchema.parse(baseEnv({ AUTO_FEED_MILESTONES_ENABLED: 'true' }))
        .AUTO_FEED_MILESTONES_ENABLED
    ).toBe(true);
    expect(
      envSchema.parse(baseEnv({ AUTO_FEED_MILESTONES_ENABLED: '1' })).AUTO_FEED_MILESTONES_ENABLED
    ).toBe(false);
  });
});
