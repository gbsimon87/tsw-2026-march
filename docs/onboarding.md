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
- Configure SMTP credentials for verification and password reset emails.
- Configure separate prod/dev frontend origins and API base URLs.
- Run checks: `pnpm check-env && pnpm test && pnpm lint`.

## Branch Workflow

1. Create feature branch from `dev`.
2. Merge feature branch into `dev`.
3. Validate changes in Render dev services (`*-api-dev`, `*-client-dev`).
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
