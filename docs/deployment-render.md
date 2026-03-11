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
- SMTP credentials and sender identity (`SMTP_*`)
- PostHog keys (if enabled)

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
  - Build: `pnpm install --frozen-lockfile && pnpm build`
  - Start: `pnpm start`
- Client Static Site (`client/`)
  - Build: `pnpm install --frozen-lockfile && pnpm build`
  - Publish dir: `dist`

You still need separate prod/dev services configured with the same branch rules.
