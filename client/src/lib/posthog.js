import posthog from 'posthog-js';
import { hasAccepted } from './consent';
import { env } from './env';

let initialized = false;

export function isPostHogEnabled() {
  return Boolean(env.enableAnalytics && env.posthogKey);
}

export function isPostHogInitialized() {
  return initialized;
}

export function initPostHog() {
  if (initialized || !isPostHogEnabled()) {
    return;
  }

  // Consent model (docs/analytics-plan.md §3). UK PUECR attaches its obligation
  // to writing an identifier to the device, so before consent we run with
  // memory-only persistence: visits are still counted — keeping traffic totals
  // honest for people who decline — but nothing is stored and nothing links one
  // page load to the next. Accepting upgrades persistence in place; see
  // acceptPostHogConsent.
  const accepted = hasAccepted();

  posthog.init(env.posthogKey, {
    api_host: env.posthogHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    persistence: accepted ? 'localStorage+cookie' : 'memory',
    // app_env rides on every event as a safety net: if a key is ever pointed at
    // the wrong project, the property still says which environment sent it.
    loaded: (instance) => instance.register({ app_env: env.appEnv }),
  });

  initialized = true;
}

/**
 * Upgrade to persistent storage after the visitor accepts. Safe to call when
 * PostHog never initialised (analytics disabled) — it simply does nothing.
 */
export function acceptPostHogConsent() {
  if (!initialized || !isPostHogEnabled()) {
    return;
  }

  posthog.set_config({ persistence: 'localStorage+cookie' });
}

/**
 * Return to memory-only capture and remove anything already stored on the
 * device. Clearing matters: opting out alone leaves the identifier behind, and
 * withdrawal must be as effective as never having consented.
 */
export function declinePostHogConsent() {
  if (!initialized || !isPostHogEnabled()) {
    return;
  }

  // Order matters: reset() generates a fresh anonymous id and writes it using
  // whatever persistence is configured. Switching to memory first means that
  // write lands nowhere; the other way round it would put a new id on disk
  // moments after the visitor asked us not to.
  posthog.set_config({ persistence: 'memory' });
  posthog.reset();
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

/**
 * Returns true when the user was actually identified, so callers can tell
 * "identified" from "skipped, try again after consent".
 */
export function identifyPostHogUser(userId, properties) {
  if (!initialized || !isPostHogEnabled() || !userId) {
    return false;
  }

  // Never identify before consent. In memory-only mode there is no durable
  // anonymous id to merge, so this would create an identified person with no
  // history and no way to link later sessions — worse than not calling it,
  // because it looks like it worked.
  if (!hasAccepted()) {
    return false;
  }

  posthog.identify(userId, properties);
  return true;
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
