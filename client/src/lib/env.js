import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('tsw-2026-march'),
  VITE_APP_ENV: z.enum(['development', 'production']).default('development'),
  VITE_API_BASE_URL: z.string().url().default('http://localhost:4000/api/v1'),
  VITE_ENABLE_ANALYTICS: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === 'true')
    .default(false),
  VITE_POSTHOG_KEY: z.string().optional(),
  VITE_POSTHOG_HOST: z.string().url().default('https://app.posthog.com'),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse({
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
  VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_ENABLE_ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS,
  VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
  VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
  VITE_STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  throw new Error(`Client environment validation failed: ${parsed.error.message}`);
}

export const env = {
  appName: parsed.data.VITE_APP_NAME,
  appEnv: parsed.data.VITE_APP_ENV,
  apiBaseUrl: parsed.data.VITE_API_BASE_URL,
  enableAnalytics: parsed.data.VITE_ENABLE_ANALYTICS,
  posthogKey: parsed.data.VITE_POSTHOG_KEY,
  posthogHost: parsed.data.VITE_POSTHOG_HOST,
  stripePublishableKey: parsed.data.VITE_STRIPE_PUBLISHABLE_KEY,
};
