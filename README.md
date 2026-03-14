# TSW 2026 March

Basketball team stat tracking app built on a MERN monorepo.

## Product Overview

TSW helps coaches/managers track live game stats and review box scores later.
V1 focuses on fast, simple tracking for one team at a time:

- Authenticated user accounts (email/password + Google OAuth)
- Team and player roster setup
- Game creation and in-progress tracking
- Full-court visual tracking (tap/click on calibrated court image)
- Event-based stat capture for:
  - Inferred 2-pointers or 3-pointers from court selection + make/miss action
  - Free throws from dedicated FT buttons
  - Offensive/defensive rebounds
  - Assists on made 2PT and 3PT baskets
- Court location stored per event (`zoneId`, `x`, `y`)
- Game finish/save flow
- Previous game history + derived box scores

## Current V1 Features

### Backend

- `POST /api/v1/teams`
- `GET /api/v1/teams`
- `GET /api/v1/teams/:teamId`
- `PATCH /api/v1/teams/:teamId`
- `GET /api/v1/public/teams/:teamId`
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
- `/teams/:teamId`
- `/teams/:teamId/edit`
- `/games/new`
- `/games`
- `/games/:gameId/track`
- `/games/:gameId`

### Tracking Interaction

- Tap/click on full court image to infer `zoneId`, nearest hoop, and shot family (`FG2` or `FG3`).
- Record shot outcomes with `Shot Make` / `Shot Miss`.
- Record free throws with `FT Make` / `FT Miss` using fixed free-throw-line coordinates.
- After made 2PT/3PT baskets, prompt for an optional assist from a teammate or `No Assist`.
- After missed shots/free throws, prompt for an optional offensive rebound or `No Rebound`.
- Record defensive rebounds from the player/action controls in the tracking overlay.
- Every event stores normalized coordinates (`x`, `y`) in the range `0..100`.
- Built-in calibration overlay and draggable handles for court-image alignment/debugging.

### Game Detail Experience

- Tabbed layout for shorter, focused views:
  - `Box Score`
  - `Replay`
  - `Game Info`
- `Box Score` tab includes:
  - Box score table
  - Shot map rendered on court image with made/missed markers
  - Zone Results table (made/missed/total by zone)
  - Play-by-play event log with stat type, zone, coordinates, and event time
  - Assists and rebound splits in all box score views
- Shot-map filters:
  - Player: all players or a specific player
  - Shot type: all shots, 2PT, 3PT
- Optional zone-outline overlay toggle (`Hide Zones` / `Show Zones`).
- `Replay` tab includes:
  - Event-by-event replay controls (`Previous` / `Next`)
  - Progressive shot plotting in event order
  - Live replay box score that updates as events are stepped through, including non-shot stats such as assists and rebounds
- `Game Info` tab includes game metadata and title/state details:
  - game title/status
  - game date/time
  - recorded at
  - finished at

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
