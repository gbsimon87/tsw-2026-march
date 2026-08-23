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

// Audit M2: full required Stripe config once the secret key is set — price IDs
// plus the webhook secret and success/cancel URLs.
const FULL_STRIPE = {
  ...PRICE_IDS,
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
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
    delete partial.STRIPE_PRICE_ID_TEAM_SEASON;
    const result = envSchema.safeParse(baseEnv({ STRIPE_SECRET_KEY: 'sk_test_123', ...partial }));
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => i.message).join(' ');
    expect(messages).toContain('STRIPE_PRICE_ID_TEAM_SEASON');
  });

  it('rejects billing enabled when the webhook secret or redirect URLs are missing (audit M2)', () => {
    for (const key of ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SUCCESS_URL', 'STRIPE_CANCEL_URL']) {
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

describe('env schema — Instagram publishing', () => {
  test('defaults to disabled without Instagram credentials', () => {
    const result = envSchema.parse(baseEnv());

    expect(result.INSTAGRAM_PUBLISHING_ENABLED).toBe(false);
    expect(result.INSTAGRAM_GRAPH_API_BASE_URL).toBe('https://graph.instagram.com');
    expect(result.INSTAGRAM_REQUEST_TIMEOUT_MS).toBe(10000);
  });

  test('accepts a complete enabled configuration', () => {
    const result = envSchema.safeParse(
      baseEnv({
        INSTAGRAM_PUBLISHING_ENABLED: 'true',
        INSTAGRAM_GRAPH_API_VERSION: 'v23.0',
        INSTAGRAM_USER_ID: '17841400000000000',
        INSTAGRAM_ACCESS_TOKEN: 'test-access-token',
      })
    );

    expect(result.success).toBe(true);
  });

  test('rejects an enabled integration with missing credentials', () => {
    const result = envSchema.safeParse(
      baseEnv({
        INSTAGRAM_PUBLISHING_ENABLED: 'true',
        INSTAGRAM_GRAPH_API_VERSION: 'v23.0',
      })
    );

    expect(result.success).toBe(false);
    const messages = result.error.issues.map((issue) => issue.message).join(' ');
    expect(messages).toContain('INSTAGRAM_USER_ID');
    expect(messages).toContain('INSTAGRAM_ACCESS_TOKEN');
  });

  test('rejects an unversioned Graph API value', () => {
    const result = envSchema.safeParse(
      baseEnv({
        INSTAGRAM_GRAPH_API_VERSION: 'latest',
      })
    );

    expect(result.success).toBe(false);
  });
});

describe('env schema — Instagram OAuth', () => {
  const fullOAuth = {
    INSTAGRAM_OAUTH_ENABLED: 'true',
    INSTAGRAM_GRAPH_API_VERSION: 'v23.0',
    INSTAGRAM_APP_ID: '1234567890',
    INSTAGRAM_APP_SECRET: 'app-secret',
    INSTAGRAM_OAUTH_REDIRECT_URL: 'http://localhost:4000/api/v1/social/instagram/oauth/callback',
    INSTAGRAM_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
  };

  test('defaults to disabled independently of publishing', () => {
    expect(envSchema.parse(baseEnv()).INSTAGRAM_OAUTH_ENABLED).toBe(false);
  });

  test('accepts complete OAuth configuration', () => {
    expect(envSchema.safeParse(baseEnv(fullOAuth)).success).toBe(true);
  });

  test('rejects enabled OAuth with missing app or encryption configuration', () => {
    for (const key of [
      'INSTAGRAM_APP_ID',
      'INSTAGRAM_APP_SECRET',
      'INSTAGRAM_OAUTH_REDIRECT_URL',
      'INSTAGRAM_TOKEN_ENCRYPTION_KEY',
    ]) {
      const partial = { ...fullOAuth };
      delete partial[key];
      const result = envSchema.safeParse(baseEnv(partial));
      expect(result.success).toBe(false);
      expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain(key);
    }
  });

  test('requires a 32-byte hexadecimal encryption key', () => {
    const result = envSchema.safeParse(
      baseEnv({ INSTAGRAM_TOKEN_ENCRYPTION_KEY: 'not-a-valid-key' })
    );
    expect(result.success).toBe(false);
  });
});
