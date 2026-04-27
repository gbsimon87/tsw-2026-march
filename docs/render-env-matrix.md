# Render Environment Matrix

Temporary deployment reference for Render. This file lists the four deployed environments/services, the variables required by the code, and paste-ready `.env` blocks you can use when filling in Render.

Notes:

- This file now uses the current project URLs and intended production custom domains.
- Do not commit real secrets into this file.
- `NODE_ENV=production` is intentional for both deployed API services.
- `dev` and `prod` separation should come from branch, URLs, DB name, Cloudinary folder, and Stripe mode.
- Production database naming uses `tsw_2026_prod`.
- Launch mode for production can leave Stripe and PostHog keys blank.
- Production API startup still requires SMTP settings. If `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, or `SMTP_FROM_NAME` are missing, the server exits before `/api/v1/health` can respond.

## Render Services

### `tsw-2026-march-api-dev`

- Branch: `dev`
- Render type: Web Service
- Root dir: repo root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter server build`
- Start command: `pnpm --filter server start`
- Health check: `/api/v1/health`

### `tsw-2026-march-client-dev`

- Branch: `dev`
- Render type: Static Site
- Root dir: repo root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter client build`
- Publish dir: `client/dist`

### `tsw-2026-march-api-prod`

- Branch: `main`
- Render type: Web Service
- Root dir: repo root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter server build`
- Start command: `pnpm --filter server start`
- Health check: `/api/v1/health`

### `tsw-2026-march-client-prod`

- Branch: `main`
- Render type: Static Site
- Root dir: repo root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter client build`
- Publish dir: `client/dist`

## Variables Required By Code

These come from the runtime validation in:

- `/server/src/config/env.js`
- `/client/src/lib/env.js`

### Server variables used by deployed API services

- `NODE_ENV`
- `PORT`
- `CLIENT_ORIGIN`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `EMAIL_VERIFY_TTL_MINUTES`
- `PASSWORD_RESET_TTL_MINUTES`
- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PRO_MONTHLY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER`
- `TEAM_LOGO_MAX_BYTES`
- `FEED_IMAGE_MAX_BYTES`
- `COOKIE_DOMAIN`

### Client variables used by deployed client services

- `VITE_APP_NAME`
- `VITE_APP_ENV`
- `VITE_API_BASE_URL`
- `VITE_ENABLE_ANALYTICS`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_STRIPE_PUBLISHABLE_KEY`

## Render Entry Guidance

### Safe to place directly in `render.yaml`

- `NODE_ENV`
- `PORT`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `EMAIL_VERIFY_TTL_MINUTES`
- `PASSWORD_RESET_TTL_MINUTES`
- `POSTHOG_HOST`
- `CLOUDINARY_FOLDER`
- `TEAM_LOGO_MAX_BYTES`
- `FEED_IMAGE_MAX_BYTES`
- `VITE_APP_NAME`
- `VITE_APP_ENV`
- `VITE_ENABLE_ANALYTICS`
- `VITE_POSTHOG_HOST`

### Better to enter in Render dashboard as secrets or environment-specific values

- `CLIENT_ORIGIN`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `POSTHOG_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PRO_MONTHLY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `COOKIE_DOMAIN`
- `VITE_API_BASE_URL`
- `VITE_POSTHOG_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`

## Copy/Paste Templates

### API Dev

```env
NODE_ENV=production
PORT=10000
CLIENT_ORIGIN=https://tsw-2026-march-client-dev.onrender.com

MONGO_URI=<your-shared-atlas-uri>
MONGO_DB_NAME=tsw_2026_dev

JWT_ACCESS_SECRET=<dev-access-secret-32+-chars>
JWT_REFRESH_SECRET=<dev-refresh-secret-32+-chars>

GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://tsw-2026-march-api-dev.onrender.com/api/v1/auth/google/callback

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your-gmail-address>
SMTP_PASS=<your-gmail-app-password>
SMTP_FROM_EMAIL=<your-gmail-address>
SMTP_FROM_NAME=TSW Dev

EMAIL_VERIFY_TTL_MINUTES=60
PASSWORD_RESET_TTL_MINUTES=30

POSTHOG_KEY=
POSTHOG_HOST=https://app.posthog.com

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_PRO_MONTHLY=
STRIPE_SUCCESS_URL=https://tsw-2026-march-client-dev.onrender.com/billing/success
STRIPE_CANCEL_URL=https://tsw-2026-march-client-dev.onrender.com/billing/cancel

CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
CLOUDINARY_FOLDER=tsw/feed/dev

TEAM_LOGO_MAX_BYTES=2097152
FEED_IMAGE_MAX_BYTES=5242880
```

### Client Dev

```env
VITE_APP_NAME=tsw-2026-march (Dev)
VITE_APP_ENV=development
VITE_API_BASE_URL=https://tsw-2026-march-api-dev.onrender.com/api/v1
VITE_ENABLE_ANALYTICS=false
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com
VITE_STRIPE_PUBLISHABLE_KEY=
```

### API Prod

```env
NODE_ENV=production
PORT=10000
CLIENT_ORIGIN=https://thesportyway.com

MONGO_URI=<your-shared-atlas-uri>
MONGO_DB_NAME=tsw_2026_prod

JWT_ACCESS_SECRET=<prod-access-secret-32+-chars>
JWT_REFRESH_SECRET=<prod-refresh-secret-32+-chars>

GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://api.thesportyway.com/api/v1/auth/google/callback

SMTP_HOST=<your-smtp-host>
SMTP_PORT=<your-smtp-port>
SMTP_SECURE=<true-or-false>
SMTP_USER=<your-smtp-username>
SMTP_PASS=<your-smtp-password>
SMTP_FROM_EMAIL=<your-from-email>
SMTP_FROM_NAME=The Sporty Way

EMAIL_VERIFY_TTL_MINUTES=60
PASSWORD_RESET_TTL_MINUTES=30

POSTHOG_KEY=
POSTHOG_HOST=https://app.posthog.com

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_PRO_MONTHLY=
STRIPE_SUCCESS_URL=https://thesportyway.com/billing/success
STRIPE_CANCEL_URL=https://thesportyway.com/billing/cancel

CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
CLOUDINARY_FOLDER=tsw/feed/prod

TEAM_LOGO_MAX_BYTES=2097152
FEED_IMAGE_MAX_BYTES=5242880
COOKIE_DOMAIN=.thesportyway.com
```

### Client Prod

```env
VITE_APP_NAME=tsw-2026-march
VITE_APP_ENV=production
VITE_API_BASE_URL=https://api.thesportyway.com/api/v1
VITE_ENABLE_ANALYTICS=false
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com
VITE_STRIPE_PUBLISHABLE_KEY=
```

## Environment Separation Rules

### `dev`

- Branch: `dev`
- Client URL: `https://tsw-2026-march-client-dev.onrender.com`
- API URL: `https://tsw-2026-march-api-dev.onrender.com`
- Mongo DB: `tsw_2026_dev`
- Cloudinary folder: `tsw/feed/dev`
- Stripe mode: disabled unless intentionally enabled
- Deploy trigger: auto

### `prod`

- Branch: `main`
- Client URL: `https://thesportyway.com`
- API URL: `https://api.thesportyway.com`
- Mongo DB: `tsw_2026_prod`
- Cloudinary folder: `tsw/feed/prod`
- Stripe mode: disabled for launch unless intentionally enabled
- Deploy trigger: manual
