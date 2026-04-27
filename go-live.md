# TSW Go-Live Plan

## Summary

This plan covers the full production launch for `thesportyway.com` with the current Render setup, plus the required product changes that should ship before or with launch.

Priority order:

- `[]` Correct Render production domain ownership and environment variables
- `[]` Update Namecheap DNS records for apex, `www`, and `api`
- `[]` Create production third-party credentials and finish launch-safe env setup
- `[x]` Ensure production can launch without Stripe or analytics
- `[x]` Improve homepage public discovery
- `[x]` Use existing league visibility fields correctly in admin/public discovery
- `[x]` Add fullscreen dual-team side switching
- `[x]` Ensure public game video is immediately visible on public game detail
- `[]` Run strict go-live verification

Locked production hosts:

- App: `https://thesportyway.com`
- Optional alias: `https://www.thesportyway.com`
- API: `https://api.thesportyway.com`

Current Render service hosts:

- Prod client: `https://tsw-2026-march-client-prod.onrender.com`
- Prod API: `https://tsw-2026-march-api-prod.onrender.com`
- Dev client: `https://tsw-2026-march-client-dev.onrender.com`
- Dev API: `https://tsw-2026-march-api-dev.onrender.com`

Current Namecheap facts already known:

- `A @ -> 216.24.57.1`
- `CNAME www -> tsw-5.onrender.com`
- `TXT @ -> v=spf1 include:spf.efwd.registrar-servers.com ~all`

Current verified status:

- `[x]` Prod client host responds at `https://tsw-2026-march-client-prod.onrender.com`
- `[]` Prod API health does not currently respond at `https://tsw-2026-march-api-prod.onrender.com/api/v1/health`
- `[]` Most likely current blocker: missing required production API env vars, especially SMTP credentials, which are enforced at startup

## Public APIs / Interfaces / Types

No new deployment API is required.

Planned application-facing changes:

- `[x]` Homepage will consume the existing public leagues list endpoint and public teams data.
- `[x]` Public league discovery must include only leagues that are both `isPublic=true` and `status='active'`.
- `[x]` League management UI must expose a clear public visibility control if it does not already.
- `[x]` Fullscreen tracking must expose the existing dual-team `activeSide` control.
- `[x]` Public game detail must render the existing `videoUrl` immediately when present.
- `[x]` Team recent-game UI should make it easy to navigate to public game detail where the video is shown.
- `[x]` Billing code must not block production startup or core flows when Stripe is intentionally not configured.

## Render and DNS

- `[]` Client service `tsw-2026-march-client-prod` owns `thesportyway.com`
- `[]` Client service `tsw-2026-march-client-prod` owns `www.thesportyway.com`
- `[]` API service `tsw-2026-march-api-prod` owns `api.thesportyway.com`
- `[]` API service does not own `thesportyway.com`
- `[]` API service does not own `www.thesportyway.com`
- `[]` Keep `A @ -> 216.24.57.1`
- `[]` Replace `CNAME www -> tsw-5.onrender.com` with `CNAME www -> tsw-2026-march-client-prod.onrender.com`
- `[]` Add `CNAME api -> tsw-2026-march-api-prod.onrender.com`
- `[]` Keep SPF, MX, DKIM, and email verification records untouched

## Production Environment

### API prod

- `[]` `NODE_ENV=production`
- `[]` `PORT=10000`
- `[]` `CLIENT_ORIGIN=https://thesportyway.com`
- `[]` `MONGO_URI=<atlas-cluster-uri>`
- `[]` `MONGO_DB_NAME=tsw_2026_prod`
- `[]` `JWT_ACCESS_SECRET=<32+ chars>`
- `[]` `JWT_REFRESH_SECRET=<32+ chars>`
- `[]` `GOOGLE_CLIENT_ID=<prod google client id>`
- `[]` `GOOGLE_CLIENT_SECRET=<prod google client secret>`
- `[]` `GOOGLE_CALLBACK_URL=https://api.thesportyway.com/api/v1/auth/google/callback`
- `[]` `SMTP_HOST=<provider host>`
- `[]` `SMTP_PORT=<provider port>`
- `[]` `SMTP_SECURE=<true|false>`
- `[]` `SMTP_USER=<provider username>`
- `[]` `SMTP_PASS=<provider password>`
- `[]` `SMTP_FROM_EMAIL=<from address>`
- `[]` `SMTP_FROM_NAME=The Sporty Way`
- `[]` `EMAIL_VERIFY_TTL_MINUTES=60`
- `[]` `PASSWORD_RESET_TTL_MINUTES=30`
- `[]` `POSTHOG_KEY=`
- `[]` `POSTHOG_HOST=https://app.posthog.com`
- `[]` `STRIPE_SECRET_KEY=`
- `[]` `STRIPE_WEBHOOK_SECRET=`
- `[]` `STRIPE_PRICE_ID_PRO_MONTHLY=`
- `[]` `STRIPE_SUCCESS_URL=https://thesportyway.com/billing/success`
- `[]` `STRIPE_CANCEL_URL=https://thesportyway.com/billing/cancel`
- `[]` `CLOUDINARY_CLOUD_NAME=<cloudinary cloud>`
- `[]` `CLOUDINARY_API_KEY=<cloudinary key>`
- `[]` `CLOUDINARY_API_SECRET=<cloudinary secret>`
- `[]` `CLOUDINARY_FOLDER=tsw/feed/prod`
- `[]` `TEAM_LOGO_MAX_BYTES=2097152`
- `[]` `FEED_IMAGE_MAX_BYTES=5242880`
- `[]` `COOKIE_DOMAIN=.thesportyway.com`

### Client prod

- `[]` `VITE_APP_NAME=tsw-2026-march`
- `[]` `VITE_APP_ENV=production`
- `[]` `VITE_API_BASE_URL=https://api.thesportyway.com/api/v1`
- `[]` `VITE_ENABLE_ANALYTICS=false`
- `[]` `VITE_POSTHOG_KEY=`
- `[]` `VITE_POSTHOG_HOST=https://app.posthog.com`
- `[]` `VITE_STRIPE_PUBLISHABLE_KEY=`

## Third-Party Setup

- `[]` Use one Mongo cluster with `tsw_2026_dev` and `tsw_2026_prod`
- `[]` Keep production database clean
- `[]` Use one Cloudinary account with `tsw/feed/dev` and `tsw/feed/prod`
- `[]` Create production Google OAuth credentials for `thesportyway.com`
- `[]` Create transactional SMTP credentials such as Resend
- `[]` Leave Stripe and analytics disabled for launch

## Product Changes

- `[x]` Add `Active Leagues` to homepage
- `[x]` Add `Featured Public Teams` to homepage
- `[x]` Filter public leagues to `isPublic=true` and `status='active'`
- `[x]` Expose league visibility toggle in league management
- `[x]` Keep using existing `status` and `isPublic` instead of adding a new `active` field
- `[x]` Keep public game video visible immediately on public game detail
- `[x]` Show public team recent-game video availability
- `[x]` Keep billing unavailable but non-blocking when Stripe is not configured
- `[x]` Keep fullscreen dual-team side switch visible and reset transient tracking state on switch

## Go-Live Verification

- `[]` Confirm API health at `https://tsw-2026-march-api-prod.onrender.com/api/v1/health`
- `[x]` Confirm client loads at `https://tsw-2026-march-client-prod.onrender.com`
- `[]` Wait for Render SSL on apex, `www`, and `api`
- `[]` Test `https://thesportyway.com`
- `[]` Test `https://www.thesportyway.com`
- `[]` Test `https://api.thesportyway.com/api/v1/health`
- `[]` Verify login/logout
- `[]` Verify cross-domain auth cookies
- `[]` Verify Google OAuth
- `[]` Verify verification email and password reset
- `[]` Verify team logo upload
- `[]` Verify feed image upload
- `[]` Verify homepage public discovery sections
- `[]` Verify public team page
- `[]` Verify public league page
- `[]` Verify public game page
- `[]` Verify public game video rendering
- `[]` Verify fullscreen dual-team switching
