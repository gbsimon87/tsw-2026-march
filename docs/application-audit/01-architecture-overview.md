# Architecture Overview

> Part of the [Application Audit](./README.md) · July 2026

## What TSW is

TSW is a basketball stats platform: users create teams and leagues, track live game
events (shots with court coordinates, rebounds, assists, etc.), view standings,
box scores, player stats, leaderboards, AI game recaps, and share content on a
social feed ("Pulse").

## Repository layout

pnpm workspace monorepo (`pnpm-workspace.yaml`, root `package.json`), Node >= 20.10,
plain JavaScript throughout (no TypeScript).

```
client/            React 18 + Vite 5 single-page app (SPA)
server/            Express 4 + Mongoose 8 REST API
config/            shared eslint/prettier configs
env/               env files per app (env/client, env/server), loaded via ENV_FILE
docs/              documentation (this audit lives in docs/application-audit/)
scripts/           bootstrap, env validation (scripts/validate-env.mjs)
docker-compose.yml, server/Dockerfile, render.yaml   deployment
```

`pnpm dev` runs both apps in parallel (client on :5173, server on :4000).

## Client

- **Stack**: React 18.3, react-router-dom 6, Tailwind 3, recharts 3 (charts),
  posthog-js, @stripe/stripe-js, zod. Tests: vitest + testing-library.
- **Structure**: feature modules under `client/src/features/` (auth, billing,
  dashboard, feed, games, leagues, teams, analytics, contact), each with
  `api/`, `components/`, `pages/`.
- **Routing**: single flat router at `client/src/app/router/AppRouter.jsx` with
  ~40 routes. All pages are statically imported — **no code splitting**
  (zero `React.lazy` in the codebase); the entire app ships as one bundle.
- **Data fetching**: hand-rolled `fetch` wrapper (`client/src/lib/apiClient.js`)
  called from per-feature API modules inside `useEffect`. **No React Query/SWR,
  no client-side cache** — every page mount refetches.
- **State**: React Context only (`client/src/app/store/AuthContext.jsx` for the
  session); no global data store.

## Server

- **Stack**: Express 4.21, Mongoose 8.8, zod validation, pino logging, helmet,
  cors, express-rate-limit, csrf (double-submit), passport (Google OAuth only),
  jsonwebtoken + bcryptjs, multer (memory storage) for uploads.
- **Layering**: each domain is a self-contained module under
  `server/src/modules/<domain>/` with `*.routes.js → *.controller.js →
*.service.js → *.repository.js` plus `*.validation.js` (zod). Mongoose schemas
  are defined inline in the repository files (no separate models directory).
- **Modules**: `auth` (15 endpoints), `leagues` (~40), `teams` (15), `games` (11),
  `feed` (11), `billing` (5 + webhook), `analytics`, `contact`, `health`.
  All mounted under `/api/v1` by `server/src/routes/index.js`.
- **Cross-cutting services**: `server/src/services/` (token, session, authToken,
  email); middleware in `server/src/middleware/` (auth, CSRF, rate limit,
  request-id, error handling).
- **App wiring** (`server/src/app.js`): requestId → pino-http → helmet → cors →
  **Stripe webhook (raw body, mounted before `express.json`)** → json(1mb) →
  cookieParser → passport → CSRF → rate limiter → `/api/v1` router → 404/error.

## Data layer

MongoDB (Atlas in dev/prod) via Mongoose. 12 collections: `users`, `sessions`,
`authtokens`, `teams`, `games`, `leagues`, `leagueteams`, `leagueplayers`,
`leagueteammembers`, `leaguejoinrequests`, `leaguemanagers`, `posts`.
See [03-database-overview](./03-database-overview.md).

Key modelling decision: **game events are an unbounded embedded array on the
Game document** (`server/src/modules/games/games.repository.js:186`), along with
three roster-snapshot arrays. All stats, standings, and leaderboards are
computed **at read time in Node** by loading full Game documents and iterating
events — there is **no `.aggregate()` call anywhere in the codebase, and no
caching layer of any kind** (server or client).

## External integrations

| Service      | Purpose                             | Entry point                                                  |
| ------------ | ----------------------------------- | ------------------------------------------------------------ |
| Stripe       | team/league subscriptions, webhooks | `server/src/modules/billing/`                                |
| Cloudinary   | image/video storage & delivery      | `server/src/modules/feed/cloudinary.client.js`               |
| Resend       | transactional email                 | `server/src/services/email.service.js`                       |
| PostHog      | product analytics (client + server) | `client/src/lib/posthog.js`, `server/src/modules/analytics/` |
| OpenAI       | AI game summaries                   | `server/src/modules/games/gameSummaryAi.service.js`          |
| Google OAuth | social login                        | `server/src/modules/auth/oauth.google.js`                    |

## What does NOT exist (by design or omission)

- No background job system (no cron, queues, or schedulers) — see
  [16-background-jobs-scheduled-tasks](./16-background-jobs-scheduled-tasks.md).
- No feature flags — see [14-feature-flags](./14-feature-flags.md).
- No Redis / in-memory cache / HTTP caching — see [18-caching-strategy](./18-caching-strategy.md).
- No push/in-app notifications — see [17-notifications-email-flow](./17-notifications-email-flow.md).
- No server-side rendering; the client is a pure SPA.

## Primary data flows

1. **Live tracking**: `GameTrackPage` (client, 3,088 lines) POSTs each recorded
   event to `POST /api/v1/games/:gameId/events`; the server loads the full Game
   doc, appends, recalculates the lineup, saves the whole doc, then recomputes
   and returns the full game detail (box score + summary + recap + highlights)
   — roughly 7–10 passes over the events array per tap.
2. **League pages**: league/team/player/leader pages each call service
   compositions that load **all league games with full events** one to three
   times per request and recompute standings/stats in JS.
3. **Feed**: cursor-paginated post listing; each post is hydrated sequentially
   (creator + referenced game/team/player) — an N+1 pattern.
4. **Billing**: checkout → Stripe → webhook updates subscription fields stored
   directly on Team/League documents; entitlements derived on read.

## Biggest architectural pressure points (detailed in audit reports 23–30)

1. Read-time recomputation of standings/stats/leaderboards from raw events.
2. Full-document Game loads (events included) on list endpoints and hot paths.
3. No client cache + no code splitting on a large SPA.
4. Cloudinary assets delivered untransformed (no `f_auto`/`q_auto`/responsive).
5. In-memory rate limiting and no graceful shutdown — single-instance assumptions.
