# PostHog Implementation

This project has PostHog infrastructure in place, but analytics is disabled by default.

## Current architecture

- Client analytics uses `posthog-js`.
- Client initialization lives in `client/src/lib/posthog.js`.
- App-level setup runs from `client/src/app/providers/AppProviders.jsx`.
- Route tracking and user identification are handled by `client/src/features/analytics/PostHogRouteTracker.jsx`, a render-null component mounted inside `AppProviders`. It fires `$pageview` on every SPA navigation and `$pageleave` (with a `scroll_depth` property) when navigating away. It also calls `posthog.identify` when an authenticated user is present and `posthog.reset` on sign-out.
- PostHog is initialized with `capture_pageleave: true` and `persistence: 'localStorage+cookie'`. Page-leave events are actively sent and include a `scroll_depth` value (0–100).
- A generic client helper for custom events exists at `client/src/features/analytics/trackEvent.js`. Note: this helper only checks `env.enableAnalytics` and does not verify PostHog initialization state; prefer the named helpers from `posthog.js` when initialization state matters.
- Server analytics uses `posthog-node`.
- Server event proxy is available at `POST /api/v1/analytics/event`, protected by auth.
- The server endpoint is reserved for future trusted server-side events. Page views are tracked client-side because React Router owns SPA navigation.

## PostHog website setup

1. Create or open the PostHog organization for this app.
2. Create a project, for example `TSW Production`.
3. Copy the project API key from Project settings.
4. Confirm the correct PostHog host:
   - US cloud commonly uses `https://app.posthog.com`.
   - EU cloud commonly uses `https://eu.posthog.com`.
5. Leave autocapture and session replay disabled for v1, or do not rely on them.
6. Add the production domain to allowed or trusted domains if PostHog prompts for it.
7. Optionally create a separate development project if you want local events kept out of production analytics.

## Environment variables

Required client variables for production page-view tracking:

```bash
VITE_ENABLE_ANALYTICS=true
VITE_POSTHOG_KEY=<project_api_key>
```

`VITE_POSTHOG_HOST` is optional for US cloud — it defaults to `https://app.posthog.com` when omitted. Set it explicitly only for the EU region:

```bash
VITE_POSTHOG_HOST=https://eu.posthog.com
```

Optional server variables for future server-side events:

```bash
POSTHOG_KEY=<project_api_key>
POSTHOG_HOST=<same_host>
```

Local development should keep analytics disabled by default:

```bash
VITE_ENABLE_ANALYTICS=false
```

## V1 privacy policy

- Track explicit SPA page views only.
- Identify authenticated users by internal user ID only.
- Do not send email or name to PostHog.
- Attach only non-sensitive user properties such as plan, roles, verification status, auth provider, and league billing status. Exact property names sent: `plan`, `roles`, `emailVerified`, `authProvider`, `leaguePlan`, `leagueSubscriptionStatus` (see `getSafeUserProperties` in `PostHogRouteTracker.jsx`).
- Keep autocapture disabled.
- Keep session recording disabled.

## Production validation

After deployment:

1. Open PostHog Live Events.
2. Navigate through public pages and authenticated pages.
3. Confirm `$pageview` events arrive.
4. Confirm route changes create new page-view events without full page reloads.
5. Confirm identified users show internal user IDs only.
6. Confirm email and name are not present in person properties.
7. Confirm no autocapture or session replay events are being relied on for v1 reporting.
8. Confirm `$pageleave` events arrive when navigating away and carry a `scroll_depth` property between 0 and 100.
