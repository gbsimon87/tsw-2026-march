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

  const accepted = hasAccepted();

  posthog.init(env.posthogKey, {
    api_host: env.posthogHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    disable_session_recording: true,
    advanced_disable_flags: true,
    opt_out_capturing_by_default: !accepted,
    person_profiles: 'identified_only',
    persistence: accepted ? 'localStorage+cookie' : 'memory',
    secure_cookie: window.location.protocol === 'https:',
    respect_dnt: true,
    property_denylist: [
      '$current_url',
      '$pathname',
      '$referrer',
      '$referring_domain',
      '$host',
      '$raw_user_agent',
      '$ip',
      'url',
      'href',
      'path',
      'search',
      'query',
      'hash',
      'token',
      'email',
      'name',
      'caption',
      'transcript',
      'text',
      'error',
      'stack',
      'message',
    ],
    before_send: sanitizePostHogEvent,
    loaded: (instance) =>
      instance.register({
        app_env: env.appEnv,
        app_version: env.appVersion,
        event_schema_version: 1,
        event_source: 'browser',
        is_internal: false,
        is_demo: false,
        is_authenticated: false,
      }),
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
  posthog.opt_in_capturing();
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

  posthog.opt_out_capturing();
  posthog.set_config({ persistence: 'memory' });
  posthog.reset();
}

const FORBIDDEN_KEY =
  /(^|[_$])(url|uri|href|referrer|search|query|hash|token|email|name|caption|transcript|text|error|stack|message)(_|$)/i;

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_KEY.test(key))
      .map(([key, nested]) => [key, sanitizeValue(nested)])
  );
}

export function sanitizePostHogEvent(event) {
  if (!event || !event.properties) return event;
  return { ...event, properties: sanitizeValue(event.properties) };
}

export function capturePostHogPageView(properties) {
  if (!initialized || !isPostHogEnabled() || !hasAccepted()) {
    return false;
  }

  posthog.capture('$pageview', properties);
  return true;
}

export function capturePostHogPageLeave(properties) {
  if (!initialized || !isPostHogEnabled() || !hasAccepted()) {
    return false;
  }

  posthog.capture('$pageleave', properties);
  return true;
}

export function capturePostHogEvent(event, properties) {
  if (!initialized || !isPostHogEnabled() || !hasAccepted()) return false;
  posthog.capture(event, properties);
  return true;
}

export function setPostHogCommonContext({ isAuthenticated, isInternal, isDemo }) {
  if (!initialized || !isPostHogEnabled()) return;
  posthog.register({
    is_authenticated: Boolean(isAuthenticated),
    is_internal: Boolean(isInternal),
    is_demo: Boolean(isDemo),
  });
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
