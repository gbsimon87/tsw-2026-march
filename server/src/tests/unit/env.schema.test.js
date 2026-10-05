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

  it('rejects partial deployed Stripe config even when the secret key is missing', () => {
    const result = envSchema.safeParse(
      baseEnv({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        STRIPE_PRICE_ID_LEAGUE: 'price_league',
      })
    );

    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain(
      'STRIPE_SECRET_KEY'
    );
  });

  it('requires an explicit deployment identity when deployed Stripe is enabled', () => {
    const result = envSchema.safeParse(
      baseEnv({
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://thesportyway.com',
        STRIPE_SECRET_KEY: 'rk_live_123',
        ...FULL_STRIPE,
        STRIPE_SUCCESS_URL: 'https://thesportyway.com/billing/success',
        STRIPE_CANCEL_URL: 'https://thesportyway.com/billing/cancel',
      })
    );

    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain('APP_ENV');
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

  it('requires exact HTTPS billing redirect routes in deployed environments', () => {
    const result = envSchema.safeParse(
      baseEnv({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        CLIENT_ORIGIN: 'https://thesportyway.com',
        STRIPE_SECRET_KEY: 'rk_live_123',
        ...FULL_STRIPE,
        STRIPE_SUCCESS_URL: 'http://thesportyway.com/wrong?checkout=done',
        STRIPE_CANCEL_URL: 'https://thesportyway.com/billing/cancel#fragment',
      })
    );

    expect(result.success).toBe(false);
    const messages = result.error.issues.map((issue) => issue.message).join(' ');
    expect(messages).toContain('exact /billing/success path');
    expect(messages).toContain('exact /billing/cancel path');
    expect(messages).toContain('must use HTTPS');
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

  it('keeps analytics disabled unless explicitly enabled', () => {
    expect(envSchema.parse(baseEnv()).ENABLE_ANALYTICS).toBe(false);
  });

  it('requires a complete EU analytics configuration when enabled', () => {
    const incomplete = envSchema.safeParse(baseEnv({ ENABLE_ANALYTICS: 'true' }));
    expect(incomplete.success).toBe(false);

    const complete = envSchema.safeParse(
      baseEnv({
        ENABLE_ANALYTICS: 'true',
        APP_ENV: 'development',
        APP_VERSION: 'test-build',
        POSTHOG_KEY: 'phc_test_key',
        POSTHOG_HOST: 'https://eu.i.posthog.com',
      })
    );
    expect(complete.success).toBe(true);
  });

  it('rejects personal API keys and the US host', () => {
    const result = envSchema.safeParse(
      baseEnv({
        ENABLE_ANALYTICS: 'true',
        APP_ENV: 'development',
        APP_VERSION: 'test-build',
        POSTHOG_KEY: 'phx_personal_key',
        POSTHOG_HOST: 'https://us.i.posthog.com',
      })
    );
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
    expect(messages).toContain('complete OAuth configuration or legacy Instagram credentials');
  });

  test('accepts publishing with the encrypted OAuth configuration', () => {
    const result = envSchema.safeParse(
      baseEnv({
        INSTAGRAM_PUBLISHING_ENABLED: 'true',
        INSTAGRAM_OAUTH_ENABLED: 'true',
        INSTAGRAM_GRAPH_API_VERSION: 'v23.0',
        INSTAGRAM_APP_ID: '1234567890',
        INSTAGRAM_APP_SECRET: 'app-secret',
        INSTAGRAM_OAUTH_REDIRECT_URL:
          'https://dev-api.thesportyway.com/api/v1/social/instagram/oauth/callback',
        INSTAGRAM_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
      })
    );

    expect(result.success).toBe(true);
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

  test('requires previous encryption key and version together during rotation', () => {
    const missingVersion = envSchema.safeParse(
      baseEnv({ INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY: 'cd'.repeat(32) })
    );
    const missingKey = envSchema.safeParse(baseEnv({ INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION: 'v1' }));
    expect(missingVersion.success).toBe(false);
    expect(missingKey.success).toBe(false);
  });

  test('requires current and previous key versions to differ', () => {
    const result = envSchema.safeParse(
      baseEnv({
        INSTAGRAM_TOKEN_KEY_VERSION: 'v2',
        INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION: 'v2',
        INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY: 'cd'.repeat(32),
      })
    );
    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain('must differ');
  });
});

describe('Mux video config', () => {
  const crypto = require('node:crypto');
  // Real key generated at test time. Never commit a PEM literal; the
  // pre-commit secret scanner rejects one.
  const validKey = (type = 'pkcs1') =>
    Buffer.from(
      crypto
        .generateKeyPairSync('rsa', { modulusLength: 2048 })
        .privateKey.export({ type, format: 'pem' })
    ).toString('base64');

  const FULL_MUX = {
    MUX_TOKEN_ID: 'token-id',
    MUX_TOKEN_SECRET: 'token-secret',
    MUX_WEBHOOK_SECRET: 'webhook-secret',
    MUX_SIGNING_KEY_ID: 'signing-key-id',
    MUX_SIGNING_PRIVATE_KEY: validKey(),
  };

  test('boots with no Mux config (video hosting off)', () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
    expect(result.data.MUX_MAX_RESOLUTION_TIER).toBe('1080p');
    expect(result.data.MUX_UPLOADS_ENABLED).toBe(false);
    expect(result.data.MUX_PUBLIC_CLIPS_ENABLED).toBe(false);
  });

  test('boots with the full Mux config (pkcs1 and pkcs8 keys)', () => {
    expect(envSchema.safeParse(baseEnv(FULL_MUX)).success).toBe(true);
    expect(
      envSchema.safeParse(baseEnv({ ...FULL_MUX, MUX_SIGNING_PRIVATE_KEY: validKey('pkcs8') }))
        .success
    ).toBe(true);
  });

  test('rejects a partial Mux config and names every missing key', () => {
    const result = envSchema.safeParse(baseEnv({ MUX_TOKEN_ID: 'token-id' }));
    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining([
        'MUX_TOKEN_SECRET',
        'MUX_WEBHOOK_SECRET',
        'MUX_SIGNING_KEY_ID',
        'MUX_SIGNING_PRIVATE_KEY',
      ])
    );
  });

  test('rejects an unsupported resolution tier', () => {
    const result = envSchema.safeParse(baseEnv({ ...FULL_MUX, MUX_MAX_RESOLUTION_TIER: '2160p' }));
    expect(result.success).toBe(false);
  });

  // V5: Mux's max_resolution_tier accepts only 1080p/1440p/2160p, so a 720p
  // setting would make every direct-upload create fail with a 400.
  test('rejects 720p, which Mux does not accept as an ingest cap', () => {
    const result = envSchema.safeParse(baseEnv({ ...FULL_MUX, MUX_MAX_RESOLUTION_TIER: '720p' }));
    expect(result.success).toBe(false);
  });

  // V6: the video deployment label (APP_ENV, else NODE_ENV, plus DB name)
  // scopes cleanup ownership; production must not fall back to NODE_ENV.
  test('requires APP_ENV in production when Mux is configured', () => {
    const result = envSchema.safeParse(baseEnv({ ...FULL_MUX, NODE_ENV: 'production' }));
    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.path[0])).toContain('APP_ENV');
    expect(
      envSchema.safeParse(baseEnv({ ...FULL_MUX, NODE_ENV: 'production', APP_ENV: 'production' }))
        .success
    ).toBe(true);
  });

  // V18: an empty `MUX_*=` line (a common template leftover) means "off".
  test('treats blank Mux values as unset', () => {
    const blank = Object.fromEntries(Object.keys(FULL_MUX).map((key) => [key, '']));
    const result = envSchema.safeParse(baseEnv({ ...blank, MUX_MAX_RESOLUTION_TIER: '' }));
    expect(result.success).toBe(true);
    expect(result.data.MUX_TOKEN_ID).toBeUndefined();
    expect(result.data.MUX_MAX_RESOLUTION_TIER).toBe('1080p');
  });

  // V18: Mux signs RS256 tokens, so a valid non-RSA key fails at signing.
  test('rejects a non-RSA signing key', () => {
    const ec = Buffer.from(
      crypto
        .generateKeyPairSync('ec', { namedCurve: 'P-256' })
        .privateKey.export({ type: 'pkcs8', format: 'pem' })
    ).toString('base64');
    const result = envSchema.safeParse(baseEnv({ ...FULL_MUX, MUX_SIGNING_PRIVATE_KEY: ec }));
    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.path[0])).toContain('MUX_SIGNING_PRIVATE_KEY');
  });

  test('rejects a signing key that is not a base64 private key without echoing it', () => {
    const bad = 'not-a-real-key-SENTINEL-123';
    const result = envSchema.safeParse(baseEnv({ ...FULL_MUX, MUX_SIGNING_PRIVATE_KEY: bad }));
    expect(result.success).toBe(false);
    const issues = result.error.issues.filter((i) => i.path[0] === 'MUX_SIGNING_PRIVATE_KEY');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).not.toContain(bad);
    expect(issues[0].message).not.toContain(Buffer.from(bad).toString('base64'));
    expect(JSON.stringify(result.error.issues)).not.toContain('SENTINEL');
  });

  test('rejects a raw (non-base64) PEM signing key', () => {
    const pem = Buffer.from(FULL_MUX.MUX_SIGNING_PRIVATE_KEY, 'base64').toString('utf8');
    const result = envSchema.safeParse(baseEnv({ ...FULL_MUX, MUX_SIGNING_PRIVATE_KEY: pem }));
    expect(result.success).toBe(false);
  });

  test('MUX_UPLOADS_ENABLED and MUX_PUBLIC_CLIPS_ENABLED parse string to bool', () => {
    const on = envSchema.safeParse(
      baseEnv({ MUX_UPLOADS_ENABLED: 'true', MUX_PUBLIC_CLIPS_ENABLED: 'true' })
    );
    expect(on.success).toBe(true);
    expect(on.data.MUX_UPLOADS_ENABLED).toBe(true);
    expect(on.data.MUX_PUBLIC_CLIPS_ENABLED).toBe(true);
    const off = envSchema.safeParse(baseEnv({ MUX_UPLOADS_ENABLED: 'false' }));
    expect(off.data.MUX_UPLOADS_ENABLED).toBe(false);
  });

  test('the flags are not part of the all-or-nothing credential set', () => {
    expect(envSchema.safeParse(baseEnv({ MUX_UPLOADS_ENABLED: 'true' })).success).toBe(true);
  });
});
