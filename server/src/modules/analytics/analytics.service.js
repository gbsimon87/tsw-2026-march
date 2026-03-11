const { PostHog } = require('posthog-node');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');

const posthogClient = env.POSTHOG_KEY
  ? new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST })
  : null;

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
    properties: input.properties || {},
  });

  logger.debug({ event: input.event }, 'PostHog event captured');

  return {
    captured: true,
  };
}

module.exports = {
  captureEvent,
};
