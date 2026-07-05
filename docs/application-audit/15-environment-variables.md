# Environment Variables

> Part of the [Application Audit](./README.md) · July 2026

Env files live in `env/server/.env.{development,production}` and
`env/client/.env.{development,production}`, loaded via `ENV_FILE`
(client: `vite.config.js` sets `envDir: '../env/client'`).
Validation: zod schemas in `server/src/config/env.js` and
`client/src/lib/env.js`; repo-level check `scripts/validate-env.mjs`
(`pnpm check-env`). Deploy values: `render.yaml` (see also
`docs/render-env-matrix.md`).

## Server (`server/src/config/env.js`) — defaults in parentheses

**Core**: `NODE_ENV` (development), `PORT` (4000), `CLIENT_ORIGIN`\* (comma-separated allowlist), `COOKIE_DOMAIN`?

**MongoDB**: `MONGO_URI`\*, `MONGO_DB_NAME`?

**JWT/auth**: `JWT_ACCESS_SECRET`_ (≥32 chars), `JWT_REFRESH_SECRET`_ (≥32),
`ACCESS_TOKEN_TTL` (15m), `REFRESH_TOKEN_TTL` (7d — note: session `expiresAt`
is hardcoded to 7d and ignores this), `EMAIL_VERIFY_TTL_MINUTES` (60),
`PASSWORD_RESET_TTL_MINUTES` (30)

**Google OAuth**: `GOOGLE_CLIENT_ID`?, `GOOGLE_CLIENT_SECRET`?,
`GOOGLE_CALLBACK_URL`?

**Resend/email**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`,
`CONTACT_EMAIL` — optional in dev (logs instead of sending), **hard-required in
production** (`env.js:72-90`; error text still says "SMTP configuration")

**PostHog**: `POSTHOG_KEY`?, `POSTHOG_HOST` (https://app.posthog.com)

**OpenAI**: `OPENAI_API_KEY`?, `OPENAI_GAME_SUMMARY_MODEL` (gpt-5.4-mini),
`OPENAI_GAME_SUMMARY_TIMEOUT_MS` (8000)

**Stripe**: `STRIPE_SECRET_KEY`?, `STRIPE_WEBHOOK_SECRET`?,
`STRIPE_PRICE_ID_TEAM_MONTHLY`?, `STRIPE_PRICE_ID_TEAM_SEASON`?,
`STRIPE_PRICE_ID_LEAGUE_MONTHLY`?, `STRIPE_PRICE_ID_LEAGUE_SEASON`?,
`STRIPE_PRICE_ID_PRO_MONTHLY`? (**legacy, unused**), `STRIPE_SUCCESS_URL`?,
`STRIPE_CANCEL_URL`?

**Cloudinary**: `CLOUDINARY_CLOUD_NAME`?, `CLOUDINARY_API_KEY`?,
`CLOUDINARY_API_SECRET`?, `CLOUDINARY_FOLDER` (tsw/feed)

**Upload limits**: `TEAM_LOGO_MAX_BYTES` (2MB), `FEED_IMAGE_MAX_BYTES` (5MB),
`FEED_VIDEO_MAX_BYTES` (100MB), `FEED_VIDEO_MAX_DURATION_SECONDS` (60)

\* = required always; ? = optional (integration disables itself when absent)

## Client (`client/src/lib/env.js`)

`VITE_APP_NAME`, `VITE_APP_ENV`, `VITE_API_BASE_URL` (zod-validated; hard-fails
if missing or localhost-in-prod), `VITE_STRIPE_PUBLISHABLE_KEY`,
`VITE_ENABLE_ANALYTICS`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`

## Hygiene notes

1. Dev Atlas credentials are committed in `env/server/.env.development` —
   acceptable only if that cluster holds disposable dev data; rotate before
   sharing the repo more widely.
2. Legacy vars to retire with the legacy checkout path:
   `STRIPE_PRICE_ID_PRO_MONTHLY`.
3. `EMAIL_VERIFY_TTL_MINUTES` supports a dead flow (registration pre-verifies).
