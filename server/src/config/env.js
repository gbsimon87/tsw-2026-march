const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(process.cwd(), '.env') });

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  POSTHOG_HOST: z.string().url().default('https://app.posthog.com'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_GAME_SUMMARY_MODEL: z.string().default('gpt-5.4-mini'),
  OPENAI_GAME_SUMMARY_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_TEAM_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_TEAM_SEASON: z.string().optional(),
  STRIPE_PRICE_ID_LEAGUE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_LEAGUE_SEASON: z.string().optional(),
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
  // Auto Feed Generation (docs/auto-feed-generation/000-TRACKER.md): gates
  // auto-publishing game-card/highlight-clip posts for finalised public-league
  // games. Defaults off so the feature ships dark until explicitly enabled.
  AUTO_FEED_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

// Fail fast on a half-configured billing setup: once STRIPE_SECRET_KEY is set, all
// four subscription price IDs must be present. Otherwise a missing ID resolves to
// `undefined` at checkout and Stripe 503s silently in prod (see docs/pricing-
// overhaul/06-stripe-architecture.md). This is all-or-nothing, not per-field.
const REQUIRED_STRIPE_PRICE_IDS = [
  'STRIPE_PRICE_ID_TEAM_MONTHLY',
  'STRIPE_PRICE_ID_TEAM_SEASON',
  'STRIPE_PRICE_ID_LEAGUE_MONTHLY',
  'STRIPE_PRICE_ID_LEAGUE_SEASON',
];

const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (!data.STRIPE_SECRET_KEY) return;
  for (const key of REQUIRED_STRIPE_PRICE_IDS) {
    if (!data[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when STRIPE_SECRET_KEY is set`,
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation failed', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

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
