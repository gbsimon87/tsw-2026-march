# TSW 2026 March

Basketball team stat tracking app built on a MERN monorepo.

## Product Overview

TSW helps coaches/managers track live game stats and review box scores later.
V1 focuses on fast, simple tracking for one team at a time:

- Authenticated user accounts (email/password + Google OAuth)
- Team and player roster setup
- Game creation and in-progress tracking
- Event-based stat capture for:
  - Free throws
  - 2-pointers
  - 3-pointers
- Court location stored per event (`zoneId` required, `x/y` optional)
- Game finish/save flow
- Previous game history + derived box scores

## Current V1 Features

### Backend

- `POST /api/v1/teams`
- `GET /api/v1/teams`
- `GET /api/v1/teams/:teamId`
- `POST /api/v1/teams/:teamId/players`
- `PATCH /api/v1/teams/:teamId/players/:playerId`
- `DELETE /api/v1/teams/:teamId/players/:playerId`

- `POST /api/v1/games`
- `GET /api/v1/games`
- `GET /api/v1/games/:gameId`
- `POST /api/v1/games/:gameId/events`
- `DELETE /api/v1/games/:gameId/events/:eventId`
- `POST /api/v1/games/:gameId/finish`

### Frontend Routes

- `/dashboard`
- `/teams/new`
- `/games/new`
- `/games`
- `/games/:gameId/track`
- `/games/:gameId`

## Stack

- Client: React + Vite + Tailwind
- Server: Node.js + Express + MongoDB (Mongoose)
- Auth: JWT cookie sessions + CSRF + email verification/reset + Google OAuth
- Tooling: pnpm workspaces, ESLint, Jest, Vitest

## Quick Start

```bash
pnpm install
pnpm dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:4000`

## Environment

Use these files:

- `env/client/.env.development` (local/dev branch)
- `env/client/.env.production` (production/main branch)
- `env/server/.env.development` (local/dev branch)
- `env/server/.env.production` (production/main branch)

Server runtime uses:

- `pnpm --filter server dev` -> `env/server/.env.development`
- `pnpm --filter server start` -> `env/server/.env.production`

Client runtime uses Vite `envDir`:

- `pnpm --filter client dev` -> `env/client/.env.development`
- `pnpm --filter client build` -> `env/client/.env.production`

Important Mongo setup:

- Use Atlas SRV URI in both server env files.
- Set different database names with `MONGO_DB_NAME`:
  - `env/server/.env.development` -> `MONGO_DB_NAME=tsw_2026_dev`
  - `env/server/.env.production` -> `MONGO_DB_NAME=tsw_2026_main`
- Optional: for fully local Mongo, set development `MONGO_URI` to `mongodb://127.0.0.1:27017`

Set at minimum:

- `VITE_API_BASE_URL`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CLIENT_ORIGIN`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL`
- `SMTP_*` values for auth emails

## Commands

```bash
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm check-env
```

## Roadmap

- Product roadmap: `docs/product-roadmap.md`
- Top-level milestone tracker: `ROADMAP.md`
