# Onboarding

## Clone and Bootstrap

```bash
git clone <your-new-repo>
cd <your-new-repo>
bash scripts/bootstrap.sh
```

## First Updates

- Rename placeholders: `bash scripts/rename-template.sh your-app-slug "Your App Name"`
- Configure env files directly:
  - `env/client/.env.development`
  - `env/client/.env.production`
  - `env/server/.env.development`
  - `env/server/.env.production`
- Use Atlas SRV MongoDB URI in both server env files.
- Use `MONGO_DB_NAME=tsw_2026_dev` for development and `MONGO_DB_NAME=tsw_2026_prod` for production.
- Optional: for local-only dev, set development `MONGO_URI` to `mongodb://127.0.0.1:27017`.
- Configure separate prod/dev Google OAuth callback URLs.
- Configure Resend credentials (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `CONTACT_EMAIL`) in the server env files for verification, password reset, and contact-form emails. All four are required in production — the server will refuse to start if any are missing.
- For optional integrations (Cloudinary media uploads, Stripe billing, OpenAI game summaries, PostHog analytics), see `server/src/config/env.js` for the full variable list and their defaults.
- Configure separate prod/dev frontend origins and API base URLs.
- Run checks: `pnpm test && pnpm lint`. (`pnpm check-env` checks for legacy SMTP keys rather than the Resend keys above — it will report false failures on a correctly-configured Resend setup. Verify email config manually against `env.js` instead.)

## Branch Workflow

1. Create feature branch from `dev`.
2. Merge feature branch into `dev`.
3. Validate changes in Render dev services (`*-api-dev`, `*-client-dev`). Dev services auto-deploy on push to `dev` (`autoDeployTrigger: commit`); production requires a manual trigger (`autoDeployTrigger: off`).
4. Promote by merging `dev` into `main`.
5. Trigger manual deploy for production services (`*-api-prod`, `*-client-prod`).

## Required URL and Secret Pairs

Keep these values separate for prod and dev:

- `CLIENT_ORIGIN`
- `VITE_API_BASE_URL`
- `GOOGLE_CALLBACK_URL`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `CONTACT_EMAIL`
