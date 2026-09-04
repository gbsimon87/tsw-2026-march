const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(process.cwd(), '.env') });

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Deployment identity is separate from NODE_ENV: both Render services run
  // production-mode Node, but analytics still needs to distinguish dev/prod.
  APP_ENV: z.enum(['development', 'production']).optional(),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().min(1),
  MONGO_URI: z.string().min(1),
  MONGO_DB_NAME: z.string().min(1).optional(),
  // OPT-023: cap the Mongoose connection pool per instance. Default 10 matches
  // the driver default; expose it so pool size can be tuned to the host without
  // a code change.
  MONGO_MAX_POOL_SIZE: z.coerce.number().int().positive().default(10),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_FROM_NAME: z.string().optional(),
  CONTACT_EMAIL: z.string().email().optional(),
  EMAIL_VERIFY_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default('https://eu.i.posthog.com'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_GAME_SUMMARY_MODEL: z.string().default('gpt-5.4-mini'),
  OPENAI_GAME_SUMMARY_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  // Instagram publishing (docs/instagram-integration/): single-account
  // bootstrap configuration. Disabled by default; OAuth-backed connection
  // storage will replace the raw token once the approval UI exists.
  INSTAGRAM_PUBLISHING_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  INSTAGRAM_GRAPH_API_BASE_URL: z.string().url().default('https://graph.instagram.com'),
  INSTAGRAM_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .optional(),
  INSTAGRAM_USER_ID: z.string().regex(/^\d+$/).optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1).optional(),
  INSTAGRAM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  // Operator-only OAuth connection flow. This is independent from the legacy
  // bootstrap publishing flag above so environments can test account
  // connection without enabling any publishing endpoint.
  INSTAGRAM_OAUTH_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  INSTAGRAM_APP_ID: z.string().regex(/^\d+$/).optional(),
  INSTAGRAM_APP_SECRET: z.string().min(1).optional(),
  INSTAGRAM_OAUTH_REDIRECT_URL: z.string().url().optional(),
  INSTAGRAM_OAUTH_AUTHORIZE_URL: z
    .string()
    .url()
    .default('https://www.instagram.com/oauth/authorize'),
  INSTAGRAM_OAUTH_TOKEN_URL: z
    .string()
    .url()
    .default('https://api.instagram.com/oauth/access_token'),
  INSTAGRAM_TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  INSTAGRAM_TOKEN_KEY_VERSION: z.string().min(1).default('v1'),
  // Temporary previous key pair used only during an explicit credential
  // rotation. Remove both values after the rotation command succeeds.
  INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_ADDITIONAL_TEAM: z.string().optional(),
  STRIPE_PRICE_ID_LEAGUE: z.string().optional(),
  STRIPE_PRICE_ID_LEAGUE_PLUS: z.string().optional(),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().optional(),
  STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID: z.string().optional(),
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('tsw/feed'),
  TEAM_LOGO_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 1024 * 1024),
  FEED_IMAGE_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  FEED_VIDEO_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024),
  FEED_VIDEO_MAX_DURATION_SECONDS: z.coerce.number().int().positive().default(60),
  // Auto Feed Generation (docs/auto-feed.md): gates
  // auto-publishing game-card/highlight-clip posts for finalised public-league
  // games. Defaults off so the feature ships dark until explicitly enabled.
  AUTO_FEED_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  // Player Milestones (docs/PROJECT-KNOWLEDGE.md#player-milestones): gates ONLY the feed
  // posts. Milestone records and profile surfaces are always live. Defaults
  // off so the machinery can ship dark and real volume can be observed before
  // anything reaches The Pulse.
  AUTO_FEED_MILESTONES_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

// Fail fast on a half-configured deployed billing setup: once STRIPE_SECRET_KEY
// is set, all three subscription price IDs must be present. Otherwise a missing
// ID resolves to `undefined` at checkout and Stripe 503s silently in production
// (see docs/stripe.md). Local NODE_ENV=development is deliberately exempt so an
// old or in-progress sandbox setup cannot prevent the app from starting; its paid
// Checkout routes still return "Billing is not configured" until the new Price
// IDs are supplied. Render uses NODE_ENV=production in both environments, so
// deployed development and production remain strict.
// Audit M2: the webhook secret and success/cancel URLs are as load-bearing as the
// price IDs. Without STRIPE_WEBHOOK_SECRET, boot succeeds and checkout works, but
// every webhook fails signature verification — customers are charged and never
// provisioned. The success/cancel URLs are required by every checkout session.
const REQUIRED_STRIPE_CONFIG = [
  'STRIPE_PRICE_ID_ADDITIONAL_TEAM',
  'STRIPE_PRICE_ID_LEAGUE',
  'STRIPE_PRICE_ID_LEAGUE_PLUS',
  'STRIPE_PORTAL_CONFIGURATION_ID',
  'STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_SUCCESS_URL',
  'STRIPE_CANCEL_URL',
];

const REQUIRED_INSTAGRAM_CONFIG = [
  'INSTAGRAM_GRAPH_API_VERSION',
  'INSTAGRAM_USER_ID',
  'INSTAGRAM_ACCESS_TOKEN',
];

const REQUIRED_INSTAGRAM_OAUTH_CONFIG = [
  'INSTAGRAM_GRAPH_API_VERSION',
  'INSTAGRAM_APP_ID',
  'INSTAGRAM_APP_SECRET',
  'INSTAGRAM_OAUTH_REDIRECT_URL',
  'INSTAGRAM_TOKEN_ENCRYPTION_KEY',
];

const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (data.STRIPE_SECRET_KEY) {
    if (data.NODE_ENV !== 'development') {
      for (const key of REQUIRED_STRIPE_CONFIG) {
        if (!data[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STRIPE_SECRET_KEY is set outside local development`,
          });
        }
      }
    }

    const formatChecks = [
      [
        'STRIPE_SECRET_KEY',
        /^(sk|rk)_(test|live)_/,
        'must be a Stripe test or live secret/restricted key',
      ],
      ['STRIPE_WEBHOOK_SECRET', /^whsec_/, 'must start with whsec_'],
      ['STRIPE_PRICE_ID_ADDITIONAL_TEAM', /^price_/, 'must start with price_'],
      ['STRIPE_PRICE_ID_LEAGUE', /^price_/, 'must start with price_'],
      ['STRIPE_PRICE_ID_LEAGUE_PLUS', /^price_/, 'must start with price_'],
      ['STRIPE_PORTAL_CONFIGURATION_ID', /^bpc_/, 'must start with bpc_'],
      ['STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID', /^bpc_/, 'must start with bpc_'],
    ];
    for (const [key, pattern, message] of formatChecks) {
      if (data[key] && !pattern.test(data[key])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} ${message}` });
      }
    }

    const priceIds = REQUIRED_STRIPE_CONFIG.filter((key) => key.startsWith('STRIPE_PRICE_ID_')).map(
      (key) => data[key]
    );
    if (priceIds.every(Boolean) && new Set(priceIds).size !== priceIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_PRICE_ID_ADDITIONAL_TEAM'],
        message: 'Every Stripe price environment variable must use a different price ID',
      });
    }

    const keyMode = data.STRIPE_SECRET_KEY.match(/^(?:sk|rk)_(test|live)_/)?.[1];
    if (data.APP_ENV === 'development' && keyMode === 'live') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_SECRET_KEY'],
        message: 'Development must use a Stripe test key',
      });
    }
    if (data.APP_ENV === 'production' && keyMode === 'test') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_SECRET_KEY'],
        message: 'Production must use a Stripe live key',
      });
    }

    let clientOrigins;
    try {
      clientOrigins = data.CLIENT_ORIGIN.split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => new URL(value).origin);
      if (clientOrigins.length === 0) throw new Error('No client origins configured');
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLIENT_ORIGIN'],
        message: 'CLIENT_ORIGIN must contain valid comma-separated URLs when Stripe is enabled',
      });
      clientOrigins = [];
    }

    for (const key of ['STRIPE_SUCCESS_URL', 'STRIPE_CANCEL_URL']) {
      if (data[key] && !clientOrigins.includes(new URL(data[key]).origin)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must use an origin allowed by CLIENT_ORIGIN`,
        });
      }
    }
  }

  if (data.INSTAGRAM_PUBLISHING_ENABLED) {
    for (const key of REQUIRED_INSTAGRAM_CONFIG) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when INSTAGRAM_PUBLISHING_ENABLED is true`,
        });
      }
    }
  }

  if (data.INSTAGRAM_OAUTH_ENABLED) {
    for (const key of REQUIRED_INSTAGRAM_OAUTH_CONFIG) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when INSTAGRAM_OAUTH_ENABLED is true`,
        });
      }
    }
  }

  const hasPreviousInstagramKey = Boolean(data.INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY);
  const hasPreviousInstagramVersion = Boolean(data.INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION);
  if (hasPreviousInstagramKey !== hasPreviousInstagramVersion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [
        hasPreviousInstagramKey
          ? 'INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION'
          : 'INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY',
      ],
      message: 'Both previous Instagram token key values are required during key rotation',
    });
  }
  if (
    hasPreviousInstagramVersion &&
    data.INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION === data.INSTAGRAM_TOKEN_KEY_VERSION
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION'],
      message: 'Previous and current Instagram token key versions must differ',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation failed', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'development' && env.STRIPE_SECRET_KEY) {
  const missingStripeConfig = REQUIRED_STRIPE_CONFIG.filter((key) => !env[key]);
  if (missingStripeConfig.length > 0) {
    console.warn(
      `Stripe billing is incomplete in local development. The app will start, but paid Checkout is unavailable until these variables are set: ${missingStripeConfig.join(', ')}`
    );
  }
}

if (env.NODE_ENV === 'production') {
  const requiredSmtpKeys = [
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'RESEND_FROM_NAME',
    'CONTACT_EMAIL',
  ];
  const missing = requiredSmtpKeys.filter((key) => {
    const value = env[key];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    console.error('Environment validation failed', {
      smtp: `Missing required SMTP configuration in production: ${missing.join(', ')}`,
    });
    process.exit(1);
  }
}

module.exports = {
  env,
  envSchema,
};
