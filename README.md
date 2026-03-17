# TSW 2026 March

Basketball team stat tracking app built on a MERN monorepo.

## Product Overview

TSW helps coaches/managers track live game stats and review box scores later.
V1 focuses on fast, simple tracking for one team at a time:

- Authenticated user accounts (email/password + Google OAuth)
- Team and player roster setup
- Teams and games management pages for authenticated users
- Game creation and in-progress tracking
- Full-court visual tracking (tap/click on calibrated court image)
- Event-based stat capture for:
  - Inferred 2-pointers or 3-pointers from court selection + make/miss action
  - Free throws from dedicated FT buttons
  - Offensive/defensive rebounds
  - Assists on made 2PT and 3PT baskets
  - Opponent scoring totals via dedicated opponent events
  - Steals, turnovers, and fouls
- Court location stored per event (`zoneId`, `x`, `y`)
- Game finish/save flow
- Previous game history + derived box scores
- Public team pages with sortable season stat tables and recent/upcoming games
- Public player pages with per-game logs plus PPG/RPG/APG and expanded stat columns
- Homepage explore feed with recent public games across teams
- Public social feed with image posts and shareable game/player/team cards
- Floating create-post action with login redirect back to feed compose flow
- Team-scoped billing for Pro replay and public shot-map access

## Current V1 Features

### Backend

- `POST /api/v1/teams`
- `GET /api/v1/teams`
- `GET /api/v1/teams/:teamId`
- `PATCH /api/v1/teams/:teamId`
- `GET /api/v1/public/teams/:teamId`
- `GET /api/v1/public/teams/:teamId/players/:playerId`
- `GET /api/v1/public/opponents/:opponentSlug`
- `GET /api/v1/public/teams/explore`
- `GET /api/v1/feed`
- `GET /api/v1/feed/shareable/games`
- `GET /api/v1/feed/shareable/players`
- `GET /api/v1/feed/shareable/teams`
- `POST /api/v1/feed/image`
- `POST /api/v1/feed/game-card`
- `POST /api/v1/feed/player-card`
- `POST /api/v1/feed/team-card`
- `DELETE /api/v1/feed/:postId`
- `POST /api/v1/teams/:teamId/players`
- `PATCH /api/v1/teams/:teamId/players/:playerId`
- `DELETE /api/v1/teams/:teamId/players/:playerId`

- `POST /api/v1/games`
- `GET /api/v1/games`
- `GET /api/v1/games/:gameId`
- `POST /api/v1/games/:gameId/events`
- `DELETE /api/v1/games/:gameId/events/:eventId`
- `POST /api/v1/games/:gameId/finish`
- `POST /api/v1/billing/checkout-session`
- `POST /api/v1/billing/customer-portal`
- `POST /api/v1/billing/webhooks`

### Frontend Routes

- `/dashboard`
- `/feed`
- `/home`
- `/teams`
- `/teams/new`
- `/teams/:teamId`
- `/teams/:teamId/edit`
- `/teams/:teamId/players/:playerId`
- `/games/new`
- `/games`
- `/games/:gameId/track`
- `/games/:gameId`
- `/pricing`
- `/billing/success`
- `/billing/cancel`
- `/opponents/:opponentSlug`

### Tracking Interaction

- Tap/click on full court image to infer `zoneId`, nearest hoop, and shot family (`FG2` or `FG3`).
- Record shot outcomes with `Shot Make` / `Shot Miss`.
- Record free throws with `FT Make` / `FT Miss` using fixed free-throw-line coordinates.
- After made 2PT/3PT baskets, prompt for an optional assist from a teammate or `No Assist`.
- After missed shots/free throws, prompt for an optional offensive rebound or `No Rebound`.
- Record defensive rebounds from the player/action controls in the tracking overlay.
- Record steals, turnovers, and fouls from quick stat controls.
- Record opponent `+1`, `+2`, and `+3` scoring events without selecting a player.
- Every event stores normalized coordinates (`x`, `y`) in the range `0..100`.
- Built-in calibration overlay and draggable handles for court-image alignment/debugging.
- Live tracking box score uses a horizontally scrollable table with pinned player column.
- Recent-event recovery supports undo/delete flows instead of inline event editing.

### Game Detail Experience

- Tabbed layout for shorter, focused views:
  - `Recap`
  - `Stats`
  - `Replay`
- `Recap` tab includes:
  - game summary header with opponent-aware final score when available
  - shareable recap card actions
  - team stats
  - top performers
  - key moments
- `Stats` tab includes:
  - Sortable box score table
  - Compact shot snapshot
  - Play-by-play event log with stat type, zone, coordinates, and event time
  - Last-five default event view with expand/collapse for the full log
  - Assists, rebound splits, steals, turnovers, and fouls in all box score views
- `Replay` tab includes:
  - Event-by-event replay controls (`Previous` / `Next`)
  - Progressive shot plotting in event order
  - Live sortable replay box score that updates as events are stepped through, including non-shot stats such as assists and rebounds
  - Pro-only access with locked-state messaging for non-Pro teams
- Print mode is available on game detail through `?print=1`.

### Public Experience

- Public team page includes:
  - sortable player season table with games played, per-game averages, totals, shooting splits, and expanded stat columns
  - clickable player names linking to public player profiles
  - upcoming and recent game lists with compact expand/collapse behavior and scorelines for completed games
- Public player page includes:
  - player header
  - `PPG`, `RPG`, and `APG`
  - sortable per-game stat log and season totals, including `STL`, `TOV`, and `FOUL`
- Opponent placeholder pages group public games against an opponent name even when no full public team page exists.
- Homepage includes an `Explore` section linking to recent public games and team pages.
- Public feed includes:
  - image posts
  - game card posts
  - player card posts
  - team card posts
  - creator-only delete controls
  - floating create-post action button
  - reusable compose modal
  - logged-out post CTA that redirects to login and returns to `/feed?compose=1`

### Shared UI

- Reusable sortable `StatsTable` component powers:
  - public team tables
  - public player logs
  - game detail box scores
  - replay box scores
- The first column stays pinned during horizontal scrolling for easier reading on smaller screens.

### Billing

- Pricing page supports team-level checkout and billing management.
- Stripe Checkout starts Team Pro subscriptions.
- Stripe Billing Portal manages existing subscriptions.
- Billing success now re-checks the selected team after redirect instead of assuming webhooks already completed.
- Replay and public shot maps remain gated by backend entitlement state.

## Seed Data

- Seed script creates 10 local users:
  - `user1@user1.com` through `user10@user10.com`
  - password: `password`
- Each seeded user gets:
  - 1 team
  - 10 players
  - 20 completed games
- Total seeded sample data:
  - 10 users
  - 10 teams
  - 100 players
  - 200 games
  - 50 posts
- Seeded game events include randomized points, rebounds, and assists.

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
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER`
- `FEED_IMAGE_MAX_BYTES`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PRO_MONTHLY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

Recommended feed upload value:

- `FEED_IMAGE_MAX_BYTES=5242880` for a 5 MB image limit

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

## Future Work

- Fantasy stat tracking
- Season support and season-based reporting
- Richer trend summaries and season-level recap/reporting
- CSV export and broader reporting pipelines
- Feed likes, reposts, comments, and moderation
- Player profile images via uploaded media or linked Google image
- Embedded video playback, likely via YouTube iframe support
- Time-synced game tracking from video playback
- Opponent player/roster tracking beyond score totals
