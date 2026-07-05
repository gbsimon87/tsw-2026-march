# PostHog Analytics

> Part of the [Application Audit](./README.md) · July 2026

Dual integration — browser + server. See also `docs/posthog-implementation.md`.

## Client

- Init: `client/src/lib/posthog.js` (`posthog-js`), wired in
  `client/src/app/providers/AppProviders.jsx` (module-load init — ships in the
  main bundle; a lazy init would trim initial JS).
- Config: **autocapture OFF, automatic pageviews OFF, session recording
  DISABLED**, pageleave ON. Pageviews are manual via
  `client/src/features/analytics/PostHogRouteTracker.jsx`; custom events via
  `client/src/features/analytics/trackEvent.js`.
- Identify/reset on login/logout.
- Gated by `VITE_ENABLE_ANALYTICS` + `VITE_POSTHOG_KEY` (+ `VITE_POSTHOG_HOST`).

## Server

- `server/src/modules/analytics/analytics.service.js` (`posthog-node`,
  `captureEvent`), exposed as `POST /api/v1/analytics/event` (authMiddleware).
- Controller validates `{event, distinctId, properties?}` — **`distinctId` is
  not checked against the authenticated user**, so events can be attributed to
  arbitrary IDs (data-quality, not security, issue). The capture is `await`ed
  inline; fire-and-forget would shave latency.
- Gated by `POSTHOG_KEY` (`POSTHOG_HOST` default `https://app.posthog.com`).

## Feature flags

PostHog feature flags are **not used** — no `isFeatureEnabled`/flag calls
anywhere. See [14-feature-flags](./14-feature-flags.md).

## Recommendations

1. Bind server-side `distinctId` to `req.user.id`.
2. Fire-and-forget the server capture (or queue with `flushAt`).
3. Lazy-load posthog-js after first paint.
