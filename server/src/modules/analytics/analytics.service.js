const { PostHog } = require('posthog-node');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');
const { ANALYTICS_CONSENT_VERSION } = require('./analyticsConsent');
const { parseServerEvent } = require('./analytics.contract');

const appEnv = env.APP_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development');

// posthog-node batches: by default it holds events until the batch fills or a
// timer elapses. On a long-running server that is what you want, but in
// development a handful of manual test events never reach the threshold, so
// nothing appears in PostHog and the instrumentation looks broken. Flush every
// event immediately outside production.
const posthogClient =
  env.ENABLE_ANALYTICS && env.POSTHOG_KEY
    ? new PostHog(env.POSTHOG_KEY, {
        host: env.POSTHOG_HOST,
        ...(appEnv === 'production' ? {} : { flushAt: 1, flushInterval: 0 }),
      })
    : null;

/**
 * Flush anything queued and close the client. Without this a restart or deploy
 * silently discards whatever is still batched.
 */
async function shutdownAnalytics() {
  if (!posthogClient) {
    return;
  }

  try {
    await posthogClient.shutdown();
  } catch (error) {
    logger.warn({ err: error }, 'PostHog shutdown failed');
  }
}

async function captureEvent(input) {
  if (!posthogClient) {
    return {
      captured: false,
      reason: 'analytics_disabled',
    };
  }

  if (!input.consent?.accepted || input.consent.version !== ANALYTICS_CONSENT_VERSION) {
    return { captured: false, reason: 'consent_not_granted' };
  }

  const properties = parseServerEvent(input.event, input.properties);
  if (!properties || !input.distinctId) {
    logger.warn({ event: input.event }, 'PostHog event rejected by contract');
    return { captured: false, reason: 'invalid_event_contract' };
  }

  await posthogClient.capture({
    distinctId: String(input.distinctId),
    event: input.event,
    properties: {
      ...properties,
      app_env: appEnv,
      app_version: env.APP_VERSION,
      event_schema_version: 1,
      event_source: input.eventSource || 'api',
      is_internal: Boolean(input.isInternal),
      is_demo: Boolean(input.isDemo),
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

function captureUserEventDetached(input) {
  Promise.resolve()
    .then(async () => {
      if (!input.consent?.accepted) return;
      // Lazy import avoids an auth-service cycle while still deriving traffic
      // classification from approved account metadata instead of email rules.
      const { findUserById } = require('../auth/auth.repository');
      const user = await findUserById(input.userId);
      return captureEvent({
        ...input,
        distinctId: String(input.userId),
        isInternal: Boolean(user?.isInternal),
        isDemo: Boolean(user?.isDemo),
      });
    })
    .catch((error) => {
      logger.warn({ err: error, event: input.event }, 'PostHog user event capture failed');
    });
}

module.exports = {
  captureEvent,
  captureEventDetached,
  captureUserEventDetached,
  shutdownAnalytics,
};
