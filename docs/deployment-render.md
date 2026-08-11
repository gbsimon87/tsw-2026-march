# Render Deployment

`render.yaml` defines four services:

| Service                      | Branch | Deploy    |
| ---------------------------- | ------ | --------- |
| `tsw-2026-march-api-dev`     | `dev`  | Automatic |
| `tsw-2026-march-client-dev`  | `dev`  | Automatic |
| `tsw-2026-march-api-prod`    | `main` | Manual    |
| `tsw-2026-march-client-prod` | `main` | Manual    |

Both API services run with `NODE_ENV=production`. Environment separation comes
from URLs, database name, credentials, Cloudinary folder, Stripe mode, and
PostHog project.

## Configuration

Use `render.yaml` for non-secret defaults and the Render dashboard for secrets
or environment-specific values. The complete contracts are
`server/src/config/env.js` and `client/src/lib/env.js`.

Keep these pairs aligned within each environment:

- `CLIENT_ORIGIN` and `VITE_API_BASE_URL`;
- `GOOGLE_CALLBACK_URL` and the API host;
- `MONGO_URI` and `MONGO_DB_NAME`;
- Stripe secret, webhook secret, four price IDs, and success/cancel URLs;
- Cloudinary credentials and environment-specific folder;
- PostHog client/server keys and host.

The production server also requires all four Resend settings. Stripe config is
all-or-nothing once `STRIPE_SECRET_KEY` is present. Never copy dev Stripe,
database, JWT, or OAuth credentials into production.

## Deploy

1. Update the Blueprint from `render.yaml`.
2. Enter `sync: false` values separately on each service.
3. Confirm the dev stack before promoting `dev` to `main`.
4. Back up production before migrations or high-risk releases.
5. Trigger the production services manually.

Verify `/api/v1/health`, client-to-API requests, local login, Google OAuth,
media uploads, and any enabled Stripe/PostHog behavior in each environment.

Manual service settings, if Blueprint sync is unavailable:

```text
API build:    pnpm install --frozen-lockfile && pnpm --filter server build
API start:    pnpm --filter server start
Client build: pnpm install --frozen-lockfile && pnpm --filter client build
Client output: client/dist
```
