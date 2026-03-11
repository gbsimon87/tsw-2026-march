# MERN Render Template

Production-ready MERN monorepo starter optimized for cloning and shipping quickly on Render.

Stack:

- Client: React + Vite + Tailwind (CSS Modules supported)
- Server: Node.js + Express + MongoDB (Mongoose)
- Auth: email/password + Google OAuth + rotating JWT session cookies + email verification + password reset
- Analytics: PostHog-ready hooks (client + server)
- Tooling: pnpm workspaces, ESLint, Prettier, Jest, Vitest, GitHub Actions

## 1) Quick Start

```bash
git clone <your-repo>
cd <your-repo>
bash scripts/bootstrap.sh
pnpm dev
```

- Client runs at `http://localhost:5173`
- Server runs at `http://localhost:4000`

## 2) Branch Strategy and Render Environments

This template is configured for two long-lived branches and two long-lived Render environments:

| Branch | Environment         | API Service  | Client Service  | Auto Deploy                                |
| ------ | ------------------- | ------------ | --------------- | ------------------------------------------ |
| `main` | Production          | `*-api-prod` | `*-client-prod` | Manual (`autoDeployTrigger: off`)          |
| `dev`  | Development/Staging | `*-api-dev`  | `*-client-dev`  | Commit-based (`autoDeployTrigger: commit`) |

Default service names in this template:

- `mern-template-api-prod`
- `mern-template-client-prod`
- `mern-template-api-dev`
- `mern-template-client-dev`

## 3) New Project Setup Checklist

- [ ] Rename placeholders: `bash scripts/rename-template.sh your-app-slug "Your App Name"`
- [ ] Copy and update env files:
  - `client/.env`
  - `server/.env`
  - `env/client/.env.local`
  - `env/client/.env.production`
  - `env/server/.env.local`
  - `env/server/.env.production`
- [ ] Configure **both API URLs** (prod + dev) for Render services
- [ ] Configure **both client URLs/origins** (prod + dev)
- [ ] Configure **both Google OAuth callback URLs** (prod + dev)
- [ ] Use separate Mongo databases for prod and dev
- [ ] Use separate secrets for prod and dev (`JWT_*`, OAuth, analytics)
- [ ] Configure SMTP credentials for auth emails (`SMTP_*`)
- [ ] Set `VITE_APP_ENV` correctly per environment (`production` or `development`)
- [ ] Validate env templates: `pnpm check-env`
- [ ] Run quality gates: `pnpm test && pnpm lint && pnpm build`
- [ ] Validate in `dev` environment before merging `dev` -> `main`

## 4) Required Values To Change

At minimum, update:

- App slug/name placeholders (`mern-render-template`, `MERN Render Template`)
- `MONGO_URI` (separate values for prod/dev)
- `JWT_ACCESS_SECRET` (separate values for prod/dev)
- `JWT_REFRESH_SECRET` (separate values for prod/dev)
- `CLIENT_ORIGIN` (separate values for prod/dev)
- `VITE_APP_ENV`
- `VITE_API_BASE_URL` (separate values for prod/dev)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL` (separate values for prod/dev)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `EMAIL_VERIFY_TTL_MINUTES`
- `PASSWORD_RESET_TTL_MINUTES`

## 5) Environment Variables

### Client (`client/.env`)

```dotenv
VITE_APP_NAME=MERN Render Template
VITE_APP_ENV=development
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_ENABLE_ANALYTICS=false
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com
```

### Server (`server/.env`)

```dotenv
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGO_URI=mongodb://127.0.0.1:27017/mern_template
JWT_ACCESS_SECRET=replace-with-long-random-secret
JWT_REFRESH_SECRET=replace-with-long-random-secret
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/v1/auth/google/callback
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=MERN Template
EMAIL_VERIFY_TTL_MINUTES=60
PASSWORD_RESET_TTL_MINUTES=30
POSTHOG_KEY=
POSTHOG_HOST=https://app.posthog.com
```

## 6) Local Development Commands

```bash
pnpm dev            # run client + server
pnpm test           # run all tests
pnpm lint           # lint all packages
pnpm build          # build all packages
pnpm format         # check formatting
pnpm format:write   # write formatting
pnpm check-env      # validate env templates
```

## 7) Authentication Flow Overview

- Email/password endpoints under `/api/v1/auth/*`
- New local accounts must verify email before password login.
- Password reset uses one-time, hashed, TTL-backed reset tokens.
- Google OAuth via:
  - `GET /api/v1/auth/google/start`
  - `GET /api/v1/auth/google/callback`
- Access token in httpOnly cookie (`accessToken`, short-lived)
- Refresh token in httpOnly cookie (`refreshToken`, rotating)
- CSRF protection via `XSRF-TOKEN` + `x-csrf-token` header

## 8) PostHog Configuration

- Client analytics initialized in `client/src/lib/posthog.js`
- Server event forwarding endpoint: `POST /api/v1/analytics/event`
- If `POSTHOG_KEY` is empty, server analytics endpoint returns a safe no-op response.

## 9) Deploying To Render

Use `render.yaml` Blueprint deployment (recommended) so branch routing and auto-deploy policy are centrally managed.

See: `docs/deployment-render.md`

## 10) Render Env Var Matrix

| Key                          | Prod Example (`main`)                                            | Dev Example (`dev`)                                             |
| ---------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `NODE_ENV`                   | `production`                                                     | `production`                                                    |
| `CLIENT_ORIGIN`              | `https://your-app-prod.onrender.com`                             | `https://your-app-dev.onrender.com`                             |
| `MONGO_URI`                  | `mongodb+srv://.../app_prod`                                     | `mongodb+srv://.../app_dev`                                     |
| `JWT_ACCESS_SECRET`          | `prod-long-random-secret`                                        | `dev-long-random-secret`                                        |
| `JWT_REFRESH_SECRET`         | `prod-long-random-secret`                                        | `dev-long-random-secret`                                        |
| `GOOGLE_CALLBACK_URL`        | `https://your-api-prod.onrender.com/api/v1/auth/google/callback` | `https://your-api-dev.onrender.com/api/v1/auth/google/callback` |
| `SMTP_HOST`                  | `smtp.prod-provider.com`                                         | `smtp.dev-provider.com`                                         |
| `SMTP_USER`                  | `prod-smtp-user`                                                 | `dev-smtp-user`                                                 |
| `EMAIL_VERIFY_TTL_MINUTES`   | `60`                                                             | `60`                                                            |
| `PASSWORD_RESET_TTL_MINUTES` | `30`                                                             | `30`                                                            |
| `VITE_APP_ENV`               | `production`                                                     | `development`                                                   |
| `VITE_API_BASE_URL`          | `https://your-api-prod.onrender.com/api/v1`                      | `https://your-api-dev.onrender.com/api/v1`                      |

## 11) Folder Structure

```text
.
├── client/                 # React + Vite frontend
├── server/                 # Express API
├── config/                 # Shared lint/format configuration
├── docs/                   # Architecture, security, API, deployment docs
├── env/                    # Local/production env templates
├── scripts/                # Bootstrap/rename/validation helpers
├── .github/workflows/ci.yml
├── ROADMAP.md
└── render.yaml
```

## 12) Testing, Linting, CI

- Client tests: Vitest + React Testing Library
- Server tests: Jest + Supertest
- CI: GitHub Actions (`.github/workflows/ci.yml`) running env check, lint, test, build

## 13) Governance and Security Docs

- `SECURITY.md`: vulnerability reporting and secret-handling policy
- `CONTRIBUTING.md`: contribution workflow and quality gates
- `.github/CODEOWNERS`: default code ownership routing
- `.github/pull_request_template.md`: PR checklist and deployment/security prompts

## 14) Troubleshooting

- 401 on auth routes: verify cookies enabled and CORS `CLIENT_ORIGIN` is correct.
- CSRF errors: ensure `x-csrf-token` header is present for mutating requests.
- Google login fails: verify callback URL and OAuth consent app settings for the active environment.
- Render build issues: confirm branch and `autoDeployTrigger` settings in `render.yaml`.
