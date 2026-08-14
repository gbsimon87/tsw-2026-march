const crypto = require('crypto');
const { PostHog } = require('posthog-node');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');

const posthogClient = env.POSTHOG_KEY
  ? new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST })
  : null;

const appEnv = env.APP_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development');

async function captureEvent(input) {
  if (!posthogClient) {
    return {
      captured: false,
      reason: 'PostHog key is not configured',
    };
  }

  await posthogClient.capture({
    distinctId: input.distinctId,
    event: input.event,
    properties: {
      ...(input.properties || {}),
      // Server events do not share browser super-properties. Attach the tag
      // here so a valid key pointed at the wrong project is still detectable.
      app_env: appEnv,
    },
  });

  logger.debug({ event: input.event }, 'PostHog event captured');

  return {
    captured: true,
  };
}

/**
 * Capture without making the caller wait, and without letting a failure reach
 * them. Analytics must never delay or fail an auth flow, so callers on the
 * critical path (registration, login) use this rather than awaiting
 * captureEvent directly.
 */
function captureEventDetached(input) {
  Promise.resolve()
    .then(() => captureEvent(input))
    .catch((error) => {
      logger.warn({ err: error, event: input.event }, 'PostHog capture failed');
    });
}

/**
 * A stable pseudonymous id for someone with no account yet — used so repeated
 * failures by one person group together. The email is hashed, never stored:
 * a failed registration must not put an address into analytics.
 */
function pseudonymousId(email) {
  return `anon_${crypto
    .createHash('sha256')
    .update(String(email).trim().toLowerCase())
    .digest('hex')
    .slice(0, 32)}`;
}

module.exports = {
  captureEvent,
  captureEventDetached,
  pseudonymousId,
};
