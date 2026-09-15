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

// posthog-js stashes the PROJECT API key — the public `phc_` token, not a
// secret — on every event as `properties.token`, then reads it back off the
// first event of a batch to build the request's `api_key`. Stripping it sent
// every batch with no api_key at all, which ingestion rejects with a 400 whose
// message ("missing event name attribute") points nowhere near the cause. The
// exact key `token` is therefore preserved at the top level of an event's
// properties; `reset_token`, `token_id` and any nested `token` are still
// removed, and no event schema in analyticsContract.js defines a `token`
// property, so a call site cannot smuggle a real secret through this hole.
const SDK_RESERVED_PROPERTY_KEYS = new Set(['token']);

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

  const properties = sanitizeValue(event.properties);
  for (const key of SDK_RESERVED_PROPERTY_KEYS) {
    if (key in event.properties) properties[key] = event.properties[key];
  }

  return { ...event, properties };
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

/**
 * Social backlog rank 5. Registers first-touch attribution as super properties
 * so EVERY later event carries the channel that found this person, without each
 * call site having to thread it through. Registered rather than sent once,
 * because the question is "which channel produces users who go on to track a
 * game", and that is a property of the whole funnel, not of one landing event.
 *
 * Registration writes to PostHog's own persistence, which is memory-only until
 * consent — so this is safe to call before a decision and simply does not
 * survive the tab.
 */
export function registerPostHogAttribution(properties) {
  if (!initialized || !isPostHogEnabled() || !properties) return false;
  posthog.register(properties);
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
export function identifyPostHogUser(userId, properties, setOnceProperties) {
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

  // The third argument is PostHog's $set_once bag: first-touch attribution must
  // describe the channel that ORIGINALLY found this person, so a later session
  // arriving from somewhere else must not overwrite it.
  posthog.identify(userId, properties, setOnceProperties);
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
