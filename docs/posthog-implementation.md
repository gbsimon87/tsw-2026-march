# PostHog

Analytics is disabled unless both `VITE_ENABLE_ANALYTICS=true` and
`VITE_POSTHOG_KEY` are set. Client setup lives in `client/src/lib/posthog.js`;
route tracking lives in `PostHogRouteTracker.jsx`.

The client sends explicit `$pageview` and `$pageleave` events, including route
pattern and scroll depth. Signed-in users are identified by internal user ID
with only `plan`, `roles`, `emailVerified`, and `authProvider`. Do not send names,
email addresses, form values, or other personal data. Autocapture and session
recording remain disabled.

```env
VITE_ENABLE_ANALYTICS=true
VITE_POSTHOG_KEY=<project-key>
VITE_POSTHOG_HOST=https://eu.posthog.com
```

`VITE_POSTHOG_HOST` defaults to `https://app.posthog.com`. Optional server-side
events use `POSTHOG_KEY` and `POSTHOG_HOST`; `POST /api/v1/analytics/event` is
authenticated and currently reserved for trusted events.

After deployment, verify route changes and page leaves in Live Events, inspect
identity properties, and confirm autocapture/session recordings remain absent.
