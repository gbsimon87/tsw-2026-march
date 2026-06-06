import posthog from 'posthog-js';
import { env } from './env';

let initialized = false;

export function isPostHogEnabled() {
  return Boolean(env.enableAnalytics && env.posthogKey);
}

export function initPostHog() {
  if (initialized || !isPostHogEnabled()) {
    return;
  }

  posthog.init(env.posthogKey, {
    api_host: env.posthogHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    persistence: 'localStorage+cookie',
  });

  initialized = true;
}

export function capturePostHogPageView(properties) {
  if (!initialized || !isPostHogEnabled()) {
    return;
  }

  posthog.capture('$pageview', properties);
}

export function capturePostHogPageLeave(properties) {
  if (!initialized || !isPostHogEnabled()) {
    return;
  }

  posthog.capture('$pageleave', properties);
}

export function identifyPostHogUser(userId, properties) {
  if (!initialized || !isPostHogEnabled() || !userId) {
    return;
  }

  posthog.identify(userId, properties);
}

export function resetPostHogUser() {
  if (!initialized || !isPostHogEnabled()) {
    return;
  }

  posthog.reset();
}

export function __resetPostHogForTests() {
  initialized = false;
}
