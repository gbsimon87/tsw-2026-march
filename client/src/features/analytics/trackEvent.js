import posthog from 'posthog-js';
import { isPostHogEnabled, isPostHogInitialized } from '../../lib/posthog';

export function trackEvent(event, properties = {}) {
  // Gate on initialisation, not just the env flag: PostHogRouteTracker calls
  // initPostHog() after first paint, so a call made before that would reach an
  // uninitialised client. Capture is safe pre-consent — init runs in
  // memory-only persistence until the visitor accepts (docs/analytics-plan.md §3).
  if (!isPostHogEnabled() || !isPostHogInitialized()) {
    return;
  }

  posthog.capture(event, properties);
}
