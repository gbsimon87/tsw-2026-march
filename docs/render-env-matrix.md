# Render Environment Matrix

Temporary deployment reference for Render. This file lists the four deployed environments/services, the variables required by the code, and paste-ready `.env` blocks you can use when filling in Render.

Notes:

- Replace placeholder values like `<api-dev>.onrender.com` with the real Render URLs.
- Do not commit real secrets into this file.
- `NODE_ENV=production` is intentional for both deployed API services.
- `dev` and `prod` separation should come from branch, URLs, DB name, Cloudinary folder, and Stripe mode.
- Production database naming uses `tsw_2026_prod`.

## Render Services

### `tsw-2026-march-api-dev`

- Branch: `dev`
- Render type: Web Service
- Root dir: `server`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Start command: `pnpm start`
- Health check: `/api/v1/health`

### `tsw-2026-march-client-dev`

- Branch: `dev`
- Render type: Static Site
- Root dir: `client`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Publish dir: `dist`

### `tsw-2026-march-api-prod`

- Branch: `main`
- Render type: Web Service
- Root dir: `server`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Start command: `pnpm start`
- Health check: `/api/v1/health`

### `tsw-2026-march-client-prod`

- Branch: `main`
- Render type: Static Site
- Root dir: `client`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Publish dir: `dist`

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
CLIENT_ORIGIN=https://<client-dev>.onrender.com

MONGO_URI=<your-shared-atlas-uri>
MONGO_DB_NAME=tsw_2026_dev

JWT_ACCESS_SECRET=<dev-access-secret-32+-chars>
JWT_REFRESH_SECRET=<dev-refresh-secret-32+-chars>

GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://<api-dev>.onrender.com/api/v1/auth/google/callback

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

STRIPE_SECRET_KEY=<your-stripe-test-secret-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-test-webhook-secret>
STRIPE_PRICE_ID_PRO_MONTHLY=<your-stripe-test-price-id>
STRIPE_SUCCESS_URL=https://<client-dev>.onrender.com/billing/success
STRIPE_CANCEL_URL=https://<client-dev>.onrender.com/billing/cancel

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
VITE_API_BASE_URL=https://<api-dev>.onrender.com/api/v1
VITE_ENABLE_ANALYTICS=false
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com
VITE_STRIPE_PUBLISHABLE_KEY=<your-stripe-test-publishable-key>
```

### API Prod

```env
NODE_ENV=production
PORT=10000
CLIENT_ORIGIN=https://<client-prod>.onrender.com

MONGO_URI=<your-shared-atlas-uri>
MONGO_DB_NAME=tsw_2026_prod

JWT_ACCESS_SECRET=<prod-access-secret-32+-chars>
JWT_REFRESH_SECRET=<prod-refresh-secret-32+-chars>

GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://<api-prod>.onrender.com/api/v1/auth/google/callback

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your-gmail-address>
SMTP_PASS=<your-gmail-app-password>
SMTP_FROM_EMAIL=<your-gmail-address>
SMTP_FROM_NAME=TSW

EMAIL_VERIFY_TTL_MINUTES=60
PASSWORD_RESET_TTL_MINUTES=30

POSTHOG_KEY=
POSTHOG_HOST=https://app.posthog.com

STRIPE_SECRET_KEY=<your-stripe-live-secret-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-live-webhook-secret>
STRIPE_PRICE_ID_PRO_MONTHLY=<your-stripe-live-price-id>
STRIPE_SUCCESS_URL=https://<client-prod>.onrender.com/billing/success
STRIPE_CANCEL_URL=https://<client-prod>.onrender.com/billing/cancel

CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
CLOUDINARY_FOLDER=tsw/feed/prod

TEAM_LOGO_MAX_BYTES=2097152
FEED_IMAGE_MAX_BYTES=5242880
```

### Client Prod

```env
VITE_APP_NAME=tsw-2026-march
VITE_APP_ENV=production
VITE_API_BASE_URL=https://<api-prod>.onrender.com/api/v1
VITE_ENABLE_ANALYTICS=false
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com
VITE_STRIPE_PUBLISHABLE_KEY=<your-stripe-live-publishable-key>
```

## Environment Separation Rules

### `dev`

- Branch: `dev`
- Client URL: `https://<client-dev>.onrender.com`
- API URL: `https://<api-dev>.onrender.com`
- Mongo DB: `tsw_2026_dev`
- Cloudinary folder: `tsw/feed/dev`
- Stripe mode: test
- Deploy trigger: auto

### `prod`

- Branch: `main`
- Client URL: `https://<client-prod>.onrender.com`
- API URL: `https://<api-prod>.onrender.com`
- Mongo DB: `tsw_2026_prod`
- Cloudinary folder: `tsw/feed/prod`
- Stripe mode: live
- Deploy trigger: manual
