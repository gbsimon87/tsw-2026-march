import posthog from 'posthog-js';
import { env } from '../../lib/env';

export function trackEvent(event, properties = {}) {
  if (!env.enableAnalytics) {
    return;
  }

  posthog.capture(event, properties);
}
