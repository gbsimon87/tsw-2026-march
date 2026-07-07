# Deploying to Render

## Blueprint Model

This template uses a **single `render.yaml`** that defines two full stacks:

- Production stack (tracks `main`)
- Development/Staging stack (tracks `dev`)

Services defined:

- `tsw-2026-march-api-prod`
- `tsw-2026-march-client-prod`
- `tsw-2026-march-api-dev`
- `tsw-2026-march-client-dev`

## Why branch is set per service

Each Render service explicitly sets a `branch` so deployments are deterministic:

- prod services deploy from `main`
- dev services deploy from `dev`

This prevents accidental cross-environment deploys when both environments share one repository.

## Deploy behavior

- Production (`main`): `autoDeployTrigger: off` (manual deploy)
- Development (`dev`): `autoDeployTrigger: commit` (auto deploy on push)

## Blueprint Deployment Steps

1. Push this repository to GitHub.
2. In Render, choose **New +** -> **Blueprint**.
3. Select the repository and confirm `render.yaml`.
4. Create or update all four services.
5. Fill env vars separately for prod and dev services.

## Required env separation

Set separate values for each environment:

- API URLs and client origins
- MongoDB URIs
- JWT secrets
- Google OAuth callback URLs
- Resend credentials (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `CONTACT_EMAIL`)
- Stripe credentials (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, and the four price IDs `STRIPE_PRICE_ID_TEAM_MONTHLY`, `STRIPE_PRICE_ID_TEAM_SEASON`, `STRIPE_PRICE_ID_LEAGUE_MONTHLY`, `STRIPE_PRICE_ID_LEAGUE_SEASON`) — note `render.yaml` still declares only the legacy `STRIPE_PRICE_ID_PRO_MONTHLY`; the four price IDs above are what the billing flow actually consumes and must be added
- Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`) — prod uses `tsw/feed/prod`, dev uses `tsw/feed/dev`
- OpenAI (`OPENAI_API_KEY`, `OPENAI_GAME_SUMMARY_MODEL`, `OPENAI_GAME_SUMMARY_TIMEOUT_MS`)
- `COOKIE_DOMAIN` — must match the deployed client domain (e.g. `.thesportyway.com` for prod; leave empty for dev)
- PostHog keys (if enabled)

> **Warning:** `render.yaml` currently still contains seven legacy SMTP variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`) that the application no longer reads. These must be replaced with the four Resend variables above before deploying, or the server will exit at startup in production.

## Post-deploy verification

Run these checks for both prod and dev stacks:

1. API health endpoint returns 200:
   - `https://<api-host>/api/v1/health`
2. Client can call the corresponding API (`VITE_API_BASE_URL` points to same environment API).
3. Login and logout work.
4. Google OAuth callback lands in the matching environment client.

## Manual Deployment Fallback

If not using Blueprint sync:

- API Service (`server/`)
  - Build: `pnpm install --frozen-lockfile && pnpm --filter server build`
  - Start: `pnpm --filter server start`
- Client Static Site (`client/`)
  - Build: `pnpm install --frozen-lockfile && pnpm --filter client build`
  - Publish dir: `client/dist`

You still need separate prod/dev services configured with the same branch rules.
