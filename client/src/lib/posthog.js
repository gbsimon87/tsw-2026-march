import posthog from 'posthog-js';
import { env } from './env';

let initialized = false;

export function initPostHog() {
  if (initialized || !env.enableAnalytics || !env.posthogKey) {
    return;
  }

  posthog.init(env.posthogKey, {
    api_host: env.posthogHost,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });

  initialized = true;
}
