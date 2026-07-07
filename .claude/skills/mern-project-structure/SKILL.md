---
name: mern-project-structure
description: Use when navigating this repo's layout, adding a module/feature, wiring env vars, running scripts, or understanding the monorepo/tooling/deploy setup. Trigger on "project structure", "folder structure", "monorepo", "where does X go", "env", "scripts", "workspace", or "new module".
---

# TSW Monorepo Structure & Setup

pnpm workspace monorepo (`pnpm-workspace.yaml`), Node ≥20, two apps:

```
tsw-2026-march/
  client/                     # React 18 + Vite (ESM)
    src/
      app/                    # providers/, router/, store/ (composition root)
      features/<domain>/      # api/ components/ hooks/ pages/ schemas/
      components/ (+ ui/)     # shared UI (bespoke, not shadcn)
      lib/                    # apiClient.js, env.js, posthog.js
      layouts/  pages/  hooks/  utils/  styles/  assets/
  server/                     # Express + Mongoose (CommonJS)
    src/
      app.js  server.js       # app factory + bootstrap/graceful shutdown
      config/                 # env.js (Zod), db.js, logger.js, cors.js, cookie.js
      middleware/             # auth, error, notFound, rateLimit, requestId, csrf, publicCache
      routes/index.js         # mounts module routers under /api/v1
      services/               # cross-cutting: token, session, authToken, email
      utils/                  # apiError, asyncHandler, pagination, webhookIdempotency, crypto
      modules/<domain>/       # <domain>.{routes,controller,service,repository,validation}.js
      scripts/                # seed + idempotent backfills
      tests/{unit,integration}/
  env/{client,server}/.env.{development,production}   # env lives OUTSIDE the apps
  config/                     # shared eslint/prettier configs
  docs/                       # PROJECT-KNOWLEDGE.md is the definitive reference
  render.yaml                 # Render deploy blueprint (4 services)
  docker-compose.yml  .husky/  .github/workflows/ci.yml
```

Domains (both sides): `auth`, `games`, `teams`, `leagues`, `feed`, `billing`,
`analytics`, `contact` (+ server `health`, `shared`).

## Adding code — where it goes

- **New backend domain** → a folder in `server/src/modules/<domain>/` with the 5
  `<domain>.<layer>.js` files (see `express-api-patterns`); register in
  `routes/index.js`. **Schema goes inline in the repository**, not a `models/` dir.
- **New frontend area** → a folder in `client/src/features/<domain>/` with
  `api/`/`pages/` (and `components/`/`hooks/`/`schemas/` as needed); add routes to
  `app/router/AppRouter.jsx` (and the `PostHogRouteTracker` route list).

## Environment

- Env files live in **`env/{client,server}/`** (gitignored), **not** in each app.
  Server reads via `ENV_FILE=...`; client via Vite `envDir: '../env/client'`.
- Both sides **Zod-validate env at boot** (`server/src/config/env.js`,
  `client/src/lib/env.js`) and fail fast. Always add a new var to the schema; never
  read `process.env.X` / `import.meta.env.X` scattered across files.
- `pnpm check-env` validates env templates (runs in CI).

## Scripts (root `package.json`)

```bash
pnpm dev       # client :5173 + server :4000 in parallel
pnpm test      # all workspaces (server=Jest, client=Vitest)
pnpm lint      # all workspaces
pnpm build     # all workspaces
pnpm check-env # validate env templates
pnpm seed      # seed dev DB
pnpm bootstrap # scripts/bootstrap.sh (install + first-time setup)
```

Backfills: `ENV_FILE=../env/server/.env.development node src/scripts/<name>.js` (all `--dry-run`-able).

## Tooling & workflow

- **Husky** pre-commit runs `lint-staged` (Prettier); `commit-msg` runs commitlint
  (conventional commits required).
- **CI** (`.github/workflows/ci.yml`): `check-env → lint → test → build` on PRs and
  pushes to `main`.
- **Branch flow**: feature → `dev` (staging) → `main` (prod; deploys are manual).
  See `CONTRIBUTING.md`. Run the full CI set locally before a PR.
- **Deploy**: Render blueprint (`render.yaml`) — API + client × dev/prod. Secrets
  via the Render dashboard, never in `render.yaml`. See `docs/deployment-render.md`.

## Server startup facts worth knowing

- `db.js` connects once with a retry loop, `maxPoolSize` (env `MONGO_MAX_POOL_SIZE`,
  default 10), `serverSelectionTimeoutMS: 5000`; `disconnectDb()` for shutdown.
- `server.js` registers graceful SIGTERM/SIGINT shutdown (drain HTTP → disconnect
  Mongo → exit, 10s force-exit guard).
- `/api/v1/health` pings Mongo and returns 503 if disconnected.
