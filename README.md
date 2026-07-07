# TSW 2026 March

Basketball team stat tracking app built on a MERN monorepo.

## Product Overview

TSW helps coaches/managers track live game stats, manage on-court lineups during games, and review shareable box scores later.
The current product still focuses on one tracked team at a time, but it now includes a more complete live-game workflow:

For a durable technical orientation, start with [`docs/PROJECT-KNOWLEDGE.md`](docs/PROJECT-KNOWLEDGE.md) (the definitive reference) and [`docs/app-overview.md`](docs/app-overview.md) (file-path map).

- Authenticated user accounts (email/password + Google OAuth)
- Team and player roster setup
- Premium league management with league teams, league rosters, standings, join requests, and league game scheduling
- Teams and games management pages for authenticated users
- Game creation and in-progress tracking
- Optional YouTube video link saved per game for low-cost playback testing
- Full-court visual tracking (tap/click on calibrated court image)
- Event-based stat capture for:
  - Inferred 2-pointers or 3-pointers from court selection + make/miss action
  - Free throws from dedicated FT buttons
  - Offensive/defensive rebounds
  - Assists on made 2PT and 3PT baskets
  - Opponent rebounds as explicit events
  - Opponent scoring totals via dedicated opponent events
  - Steals, turnovers, and fouls
- Court location stored per event (`zoneId`, `x`, `y`)
- Starting five setup, current on-court lineup tracking, and event-based substitutions
- Game finish/save flow
- Previous game history + derived box scores
- Public team pages with sortable season stat tables and recent/upcoming games
- Public player pages with per-game logs plus PPG/RPG/APG and expanded stat columns
- Homepage explore feed with recent public games across teams
- Public social feed with image posts and shareable game/player/team cards
- Floating create-post action with login redirect back to The Pulse compose flow
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
- `POST /api/v1/leagues`
- `GET /api/v1/leagues`
- `GET /api/v1/leagues/:leagueId`
- `PATCH /api/v1/leagues/:leagueId`
- `POST /api/v1/leagues/:leagueId/archive`
- `GET /api/v1/leagues/:leagueId/standings`
- `GET /api/v1/leagues/:leagueId/games`
- `POST /api/v1/leagues/:leagueId/teams`
- `GET /api/v1/leagues/:leagueId/teams`
- `GET /api/v1/leagues/:leagueId/teams/:leagueTeamId`
- `PATCH /api/v1/leagues/:leagueId/teams/:leagueTeamId`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/archive`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/logo`
- `DELETE /api/v1/leagues/:leagueId/teams/:leagueTeamId/logo`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/players`
- `PATCH /api/v1/leagues/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId`
- `DELETE /api/v1/leagues/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId/unclaim`
- `GET /api/v1/leagues/:leagueId/teams/:leagueTeamId/members`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/managers`
- `PATCH /api/v1/leagues/:leagueId/teams/:leagueTeamId/members/:memberId`
- `DELETE /api/v1/leagues/:leagueId/teams/:leagueTeamId/members/:memberId`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/join-requests`
- `GET /api/v1/leagues/:leagueId/teams/:leagueTeamId/join-requests`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/join-requests/:requestId/approve`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/join-requests/:requestId/reject`
- `POST /api/v1/leagues/:leagueId/teams/:leagueTeamId/join-requests/:requestId/cancel`

- `POST /api/v1/games`
- `GET /api/v1/games`
- `GET /api/v1/games/:gameId`
- `PATCH /api/v1/games/:gameId`
- `POST /api/v1/games/:gameId/events`
- `DELETE /api/v1/games/:gameId/events/:eventId`
- `POST /api/v1/games/:gameId/finish`
- `POST /api/v1/billing/checkout-session`
- `POST /api/v1/billing/customer-portal`
- `POST /api/v1/billing/webhooks`

### Frontend Routes

Source of truth: [`client/src/app/router/AppRouter.jsx`](client/src/app/router/AppRouter.jsx).

Primary:

- `/pulse` — the public feed ("The Pulse"); `/` and `/feed` redirect here
- `/home`, `/about`, `/contact`
- `/admin` — league admin dashboard (`/dashboard` alias; `/leagues` redirects here)
- `/admin/leagues/new`, `/admin/leagues/:leagueId`, `/admin/leagues/:leagueId/teams/:leagueTeamId`, `/admin/leagues/:leagueId/teams/new`, `/admin/leagues/:leagueId/games/new`
- `/teams`, `/teams/new`, `/teams/:teamId`, `/teams/:teamId/edit`, `/teams/:teamId/players/:playerId`
- `/games`, `/games/new`, `/games/:gameId`, `/games/:gameId/track` _(renders outside the app shell)_
- `/my-sporty`
- `/league/:leagueSlug`, `/league/:leagueSlug/standings`, `/league/:leagueSlug/games`, `/league/:leagueSlug/teams/:teamSlug`, `/league/:leagueSlug/teams/:teamSlug/players/:leaguePlayerId`
- `/opponents/:opponentSlug`
- `/billing/success`, `/billing/cancel`
- `/pricing` — **dev only** (redirects to `/pulse` in production)

Legacy `/leagues/:id/...` paths redirect to their `/admin/leagues/...` equivalents.

### Tracking Interaction

- Set a starting five before entering full-screen tracking.
- Manage current on-court players from the track page with event-based substitutions.
- Tap/click on the full court image to infer `zoneId`, nearest hoop, and shot family (`FG2` or `FG3`).
- Record shot outcomes with `Shot Make` / `Shot Miss`.
- Record free throws with dedicated `FT+` / `FT-` actions using fixed free-throw-line coordinates.
- After made 2PT/3PT baskets, prompt for an assist from the other 4 on-court teammates or `No Assist`.
- After missed shots/free throws, prompt for a rebound from the 5 on-court teammates or `Opponent Rebound`.
- Record defensive rebounds from the action controls in the full-screen tracking overlay.
- Record steals, turnovers, and fouls from full-screen quick stat controls.
- Record opponent `+1`, `+2`, and `+3` scoring events without selecting a player.
- Every event stores normalized coordinates (`x`, `y`) in the range `0..100`.
- Built-in calibration overlay and draggable handles for court-image alignment/debugging.
- Live tracking box score uses a horizontally scrollable table with pinned player column.
- Recent-event recovery supports removal of normal stat events and substitution events instead of inline event editing.

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
- Game detail can render an embedded YouTube video when the game includes a `videoUrl`
- `Replay` tab includes:
  - Event-by-event replay controls (`Previous` / `Next`)
  - Progressive shot plotting in event order
  - Live sortable replay box score that updates as events are stepped through, including non-shot stats such as assists and rebounds
  - Pro-only access with locked-state messaging for non-Pro teams
- Print mode is available on game detail through `?print=1` with a simplified print-first layout for browser print-to-PDF output.

### Public Experience

- Public league pages include:
  - standings with record, points for, points against, and differential
  - league game listings linked through the shared public game detail route
  - public league team pages with roster, claimed-profile badges, and a player stats table
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
- League creation uses separate league-premium entitlement fields on the user account and league billing state on the league record.

## Seed Data

- Seed script creates 10 local users:
  - `user1@user1.com` through `user10@user10.com`
  - password: `password`
- Each seeded user gets:
  - 1 team
  - 10 players
  - 20 completed games
- `user1@user1.com` also gets:
  - league premium enabled
  - 1 seeded league: `Metro Spring League`
  - 4 seeded league teams
  - 10 league players per league team
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
  - `env/server/.env.production` -> `MONGO_DB_NAME=tsw_2026_prod`
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
- `STRIPE_PRICE_ID_TEAM_MONTHLY`
- `STRIPE_PRICE_ID_TEAM_SEASON`
- `STRIPE_PRICE_ID_LEAGUE_MONTHLY`
- `STRIPE_PRICE_ID_LEAGUE_SEASON`
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

- Product roadmap: [`docs/product-roadmap.md`](docs/product-roadmap.md)
- Engineering optimisation tracker: [`docs/application-audit/000-OPTIMISATION-TRACKER.md`](docs/application-audit/000-OPTIMISATION-TRACKER.md)

## Future Work

- Fantasy stat tracking
- Season support and season-based reporting
- Richer trend summaries and season-level recap/reporting
- CSV export and broader reporting pipelines
- Feed likes, reposts, comments, and moderation
- Player profile images via uploaded media or linked Google image
- Editing/replacing a saved game video URL after game creation
- Time-synced game tracking from video playback
- Opponent player/roster tracking beyond score totals
