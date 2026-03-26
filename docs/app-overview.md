# Application Overview

This document is the fast orientation guide for the TSW application. Use it as the first stop when you need to understand what the product does, how the repo is composed, and how the main runtime flows are wired together.

## What The App Is

TSW is a basketball stat-tracking application for coaches and team managers.

Core product capabilities today:

- Create and manage teams and rosters.
- Create games and track live events during a game.
- Optionally attach a YouTube link to a game and render it on the game detail page.
- Capture shots by tapping or clicking a calibrated full-court image.
- Track lineup state, substitutions, rebounds, assists, steals, turnovers, fouls, and opponent scoring.
- Finish games and derive box scores, recaps, replay views, and public-facing summaries from saved events.
- Publish public team/player pages and a social feed with image posts and shareable game, player, and team cards.
- Gate replay and public shot-map features behind team-level Pro billing.

The current product model is centered on one tracked team per game. Opponents are represented primarily by score totals and opponent labels, not full opponent rosters.

## Repo Shape

This is a pnpm workspace monorepo with two applications:

- `client/`: React + Vite SPA
- `server/`: Node.js + Express API backed by MongoDB

Top-level files worth knowing:

- [`README.md`](../README.md): product summary, quick start, feature inventory
- [`ROADMAP.md`](../ROADMAP.md): current status and planned work
- [`render.yaml`](../render.yaml): deployment topology for dev and prod
- [`docs/api.md`](./api.md): API surface summary
- [`docs/deployment-render.md`](./deployment-render.md): deployment notes
- [`docs/render-env-matrix.md`](./render-env-matrix.md): env var matrix

## High-Level Architecture

The app is split into a browser SPA and an API:

1. The React client renders all authenticated and public pages.
2. The client talks to the API through `fetch` with cookie credentials enabled.
3. The API validates auth via JWT cookies or bearer tokens.
4. MongoDB stores users, sessions, auth tokens, teams, games, and feed posts.
5. Stripe manages team subscriptions and webhook-driven entitlement updates.
6. Cloudinary stores uploaded feed images and team logos.

The server follows a layered module structure:

- `routes`: register HTTP endpoints
- `controller`: translate HTTP requests into service calls
- `service`: business logic
- `repository`: Mongoose schemas and persistence

## Frontend Wiring

Frontend entry path:

- [`client/src/main.jsx`](../client/src/main.jsx): renders the app
- [`client/src/app/providers/AppProviders.jsx`](../client/src/app/providers/AppProviders.jsx): wraps the app in `BrowserRouter` and `AuthProvider`
- [`client/src/app/router/AppRouter.jsx`](../client/src/app/router/AppRouter.jsx): defines route-level composition
- [`client/src/layouts/AppLayout.jsx`](../client/src/layouts/AppLayout.jsx): shared shell and nav

Authentication state is loaded once at startup:

- [`client/src/app/store/AuthContext.jsx`](../client/src/app/store/AuthContext.jsx) calls `authApi.me()` on mount.
- Protected pages are wrapped in `ProtectedRoute`.
- Public pages like team pages, player pages, game detail, and the feed remain accessible without login where supported.

API access is centralized in:

- [`client/src/lib/apiClient.js`](../client/src/lib/apiClient.js)

Important client behavior in that file:

- Base URL comes from `VITE_API_BASE_URL`.
- Requests always send cookies via `credentials: 'include'`.
- CSRF tokens are read from response headers and attached automatically on mutating requests.

## Frontend Feature Map

The client is organized mostly by feature under `client/src/features/`.

Major feature areas:

- `auth/`: login, registration, verification, password reset
- `teams/`: team CRUD, public team/player pages, reusable stats table
- `games/`: new game flow, live tracking, game detail, recap, replay, shot-map logic
- `feed/`: feed listing, composer, shareable cards, image posts
- `billing/`: pricing, checkout redirect flow, billing return pages
- `analytics/`: client-side event tracking

Main user journeys:

- Teams:
  - [`client/src/features/teams/pages/TeamsPage.jsx`](../client/src/features/teams/pages/TeamsPage.jsx)
  - create/edit flows live in `NewTeamPage.jsx` and `EditTeamPage.jsx`
- Games:
  - [`client/src/features/games/pages/NewGamePage.jsx`](../client/src/features/games/pages/NewGamePage.jsx)
  - [`client/src/features/games/pages/GameTrackPage.jsx`](../client/src/features/games/pages/GameTrackPage.jsx)
  - [`client/src/features/games/pages/GameDetailPage.jsx`](../client/src/features/games/pages/GameDetailPage.jsx)
- Feed:
  - [`client/src/features/feed/pages/FeedPage.jsx`](../client/src/features/feed/pages/FeedPage.jsx)
- Billing:
  - [`client/src/features/billing/pages/PricingPage.jsx`](../client/src/features/billing/pages/PricingPage.jsx)

## Live Game Tracking Flow

The live tracking experience is the most application-specific part of the product.

How it works:

1. A user creates a game for one of their teams.
2. The user can optionally attach a YouTube URL during game creation for low-cost video playback.
3. The track page loads the team roster and current game state.
4. The user must set a starting five.
5. The user taps the court image to choose a location.
6. Court inference logic classifies the selection into a zone and shot family (`FG2` or `FG3`).
7. The user records make or miss, or uses direct quick actions for free throws and non-shot stats.
8. The client may prompt for a follow-up event such as assist or rebound.
9. Each event is posted to the API and stored on the game document.
10. Box score, recap, replay, and public summaries are all derived from the saved event list.

Key tracking code:

- [`client/src/features/games/court/courtInference.js`](../client/src/features/games/court/courtInference.js): maps tap coordinates to shot families and zones
- [`client/src/features/games/court/courtImageCalibration.js`](../client/src/features/games/court/courtImageCalibration.js): calibration values
- [`client/src/features/games/components/InteractiveCourtImage.jsx`](../client/src/features/games/components/InteractiveCourtImage.jsx): main court interaction surface
- [`server/src/modules/games/games.service.js`](../server/src/modules/games/games.service.js): validates events, maintains lineup state, and computes derived outputs
- [`server/src/modules/shared/statSummary.js`](../server/src/modules/shared/statSummary.js): event summarization logic used by box score and recap paths

## Game Detail And Derived Views

The game detail page is fed by a single game payload and then split into tabs:

- `Recap`: summary, top performers, key moments, recap card actions
- `Stats`: sortable box score, shot snapshot, play-by-play log
- `Replay`: event-by-event progression with a live-updating replay box score

Important detail:

- Replay access is entitlement-gated.
- Game detail itself is public, but premium replay behavior depends on team billing state.
- Print mode is supported by `?print=1`.

## Backend Wiring

Backend bootstrap:

- [`server/src/server.js`](../server/src/server.js): connects MongoDB and starts the HTTP server
- [`server/src/app.js`](../server/src/app.js): configures middleware and mounts routers
- [`server/src/routes/index.js`](../server/src/routes/index.js): mounts domain routers under `/api/v1`

Global middleware stack:

- request ID assignment
- `pino-http` request logging
- `helmet`
- CORS
- Stripe webhook raw-body route
- JSON parser
- cookie parser
- Passport initialization for Google OAuth
- CSRF token attach/protect middleware
- API rate limiting
- domain routers
- not-found and error middleware

## Backend Domain Map

Registered API modules:

- `auth`
- `analytics`
- `billing`
- `feed`
- `health`
- `teams`
- `games`
- public team and opponent surfaces under `/public/...`

Representative route files:

- [`server/src/modules/auth/auth.routes.js`](../server/src/modules/auth/auth.routes.js)
- [`server/src/modules/teams/teams.routes.js`](../server/src/modules/teams/teams.routes.js)
- [`server/src/modules/games/games.routes.js`](../server/src/modules/games/games.routes.js)
- [`server/src/modules/feed/feed.routes.js`](../server/src/modules/feed/feed.routes.js)
- [`server/src/modules/billing/billing.routes.js`](../server/src/modules/billing/billing.routes.js)

Access model:

- `/games/:gameId` is public for game detail viewing.
- Most team management, game mutation, feed creation, and billing routes require auth.
- Public read routes are split out explicitly for team/player/opponent surfaces.

## Persistence Model

The main Mongo documents are:

- `User`: account, auth provider, verification status, user-level plan
- `Session`: refresh-token-backed login sessions
- `AuthToken`: email verification and password reset tokens
- `Team`: roster, branding, billing fields, subscription status, Stripe linkage
- `Game`: team reference, opponent label, lineup state, and embedded event list
- `Post`: feed post with `image`, `game_card`, `player_card`, or `team_card` payload

Files that define those schemas:

- [`server/src/modules/auth/auth.repository.js`](../server/src/modules/auth/auth.repository.js)
- [`server/src/modules/teams/teams.repository.js`](../server/src/modules/teams/teams.repository.js)
- [`server/src/modules/games/games.repository.js`](../server/src/modules/games/games.repository.js)
- [`server/src/modules/feed/feed.repository.js`](../server/src/modules/feed/feed.repository.js)

Notable design choice:

- Game events are embedded inside the game document rather than stored in a separate collection. Most reporting views are computed from those embedded events at read time.

## Auth And Session Model

Auth uses:

- email/password login
- Google OAuth
- JWT access and refresh tokens
- cookie-based sessions
- CSRF protection
- email verification and password reset tokens

Important auth files:

- [`server/src/modules/auth/auth.service.js`](../server/src/modules/auth/auth.service.js)
- [`server/src/services/token.service.js`](../server/src/services/token.service.js)
- [`server/src/services/session.service.js`](../server/src/services/session.service.js)
- [`server/src/middleware/auth.middleware.js`](../server/src/middleware/auth.middleware.js)

At a high level:

- access tokens authorize requests
- refresh tokens are hashed and persisted in `Session`
- login/refresh rotates session state
- unverified local users cannot log in until email verification completes

## Billing And Entitlements

Billing is team-scoped, not just user-scoped.

That matters because replay and shot-map access are evaluated against a team’s subscription state. The billing service:

- creates Stripe Checkout sessions for Team Pro
- opens Stripe Billing Portal sessions
- processes Stripe webhooks
- writes subscription fields back onto `Team`
- derives entitlements such as `canViewReplay` and `canViewShotMaps`
- syncs a simplified user plan based on whether the owner has any Pro team

Primary file:

- [`server/src/modules/billing/billing.service.js`](../server/src/modules/billing/billing.service.js)

## Deployment And Environment Model

Local development:

- root `pnpm dev` runs client and server in parallel
- client defaults to `http://localhost:5173`
- server defaults to `http://localhost:4000`

Environment validation exists on both sides:

- [`client/src/lib/env.js`](../client/src/lib/env.js)
- [`server/src/config/env.js`](../server/src/config/env.js)

Deployment model:

- Render blueprint defines four services
- `main` drives production
- `dev` drives development/staging
- API and client are deployed as separate services in each environment

See:

- [`render.yaml`](../render.yaml)
- [`docs/deployment-render.md`](./deployment-render.md)
- [`docs/render-env-matrix.md`](./render-env-matrix.md)

## Where To Start Depending On The Question

If you need to understand:

- overall product scope: [`README.md`](../README.md)
- current priorities: [`ROADMAP.md`](../ROADMAP.md)
- routing and page composition: [`client/src/app/router/AppRouter.jsx`](../client/src/app/router/AppRouter.jsx)
- live game behavior: [`client/src/features/games/pages/GameTrackPage.jsx`](../client/src/features/games/pages/GameTrackPage.jsx)
- derived stats and recap logic: [`server/src/modules/games/games.service.js`](../server/src/modules/games/games.service.js)
- persistence schemas: repository files under `server/src/modules/*/*.repository.js`
- deployment and env setup: Render docs and env matrix in `docs/`

## Maintenance Notes

This file should be updated when any of these change:

- a new top-level product capability ships
- the main route map changes
- a new backend domain module is added
- the auth or billing model changes
- the deployment model changes

If this document and code ever disagree, trust the code first and update this file immediately after.
