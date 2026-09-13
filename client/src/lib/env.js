import { z } from 'zod';

const envSchema = z.object({
  // TSW-003: never default to a repo/package-name-shaped string — if
  // VITE_APP_NAME is unset (e.g. not configured in the Render dashboard for
  // a given service), this is what surfaces in user-facing copy.
  VITE_APP_NAME: z.string().default('The Sporty Way'),
  VITE_APP_ENV: z.enum(['development', 'production']).default('development'),
  VITE_APP_VERSION: z.string().min(1).optional(),
  VITE_API_BASE_URL: z.string().url().optional(),
  VITE_ENABLE_ANALYTICS: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === 'true')
    .default(false),
  VITE_POSTHOG_KEY: z.string().optional(),
  VITE_POSTHOG_HOST: z.string().url().default('https://eu.i.posthog.com'),
});

const parsed = envSchema.safeParse({
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
  VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
  VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_ENABLE_ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS,
  VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
  VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
});

if (!parsed.success) {
  throw new Error(`Client environment validation failed: ${parsed.error.message}`);
}

if (!parsed.data.VITE_API_BASE_URL) {
  throw new Error('Client environment validation failed: VITE_API_BASE_URL is required');
}

if (
  parsed.data.VITE_APP_ENV === 'production' &&
  new URL(parsed.data.VITE_API_BASE_URL).hostname === 'localhost'
) {
  throw new Error(
    'Client environment validation failed: production VITE_API_BASE_URL cannot point to localhost'
  );
}

if (parsed.data.VITE_ENABLE_ANALYTICS) {
  if (!parsed.data.VITE_APP_VERSION) {
    throw new Error(
      'Client environment validation failed: VITE_APP_VERSION is required when analytics is enabled'
    );
  }
  if (!/^phc_[A-Za-z0-9_-]+$/.test(parsed.data.VITE_POSTHOG_KEY || '')) {
    throw new Error(
      'Client environment validation failed: analytics requires a valid phc_ project key'
    );
  }
  if (new URL(parsed.data.VITE_POSTHOG_HOST).origin !== 'https://eu.i.posthog.com') {
    throw new Error(
      'Client environment validation failed: analytics must use the approved EU PostHog host'
    );
  }
}

export const env = {
  appName: parsed.data.VITE_APP_NAME,
  appEnv: parsed.data.VITE_APP_ENV,
  appVersion: parsed.data.VITE_APP_VERSION || 'local',
  apiBaseUrl: parsed.data.VITE_API_BASE_URL,
  enableAnalytics: parsed.data.VITE_ENABLE_ANALYTICS,
  posthogKey: parsed.data.VITE_POSTHOG_KEY,
  posthogHost: parsed.data.VITE_POSTHOG_HOST,
};
