# TSW — Project Knowledge

> **Definitive reference for developers and AI sessions.** Describes the app as
> it exists today. If this document and the code ever disagree, the code wins —
> update this file immediately after.
>
> Companion docs: [`app-overview.md`](./app-overview.md) (fast orientation +
> file-path map), [`api.md`](./api.md) (endpoint reference),
> [`permissions.md`](./permissions.md) (authorization matrix),
> [`billing.md`](./billing.md), [`security.md`](./security.md),
> [`posthog-implementation.md`](./posthog-implementation.md).

---

## 1. What the app is

**TSW ("The Sporty Way")** is a basketball stat-tracking and league-management
platform for coaches, team managers, and league organizers.

Core capabilities:

- Create teams/rosters; create games and **track live events** by tapping a
  calibrated full-court image (shots inferred as FG2/FG3 by zone).
- Derive box scores, recaps, shot maps, and replay views from the saved event
  list.
- Run **leagues** with standings, join requests, rosters, managers/helpers, and
  public league/team/player pages. League games track **both** teams at once.
- A public social feed — **"The Pulse"** (route `/pulse`) — with image posts and
  shareable game/player/team/highlight cards.
- **Team-scoped and League-scoped Pro billing** gating replay, public shot maps,
  and highlight clips.

The product model is centered on **one tracked team per standalone game**;
opponents are represented by score totals and labels, not full rosters. League
games are the exception (dual-team tracking).

---

## 2. Architecture at a glance

pnpm workspace monorepo, two apps, no shared package:

|            | Server (`server/`)                   | Client (`client/`)                                 |
| ---------- | ------------------------------------ | -------------------------------------------------- |
| Runtime    | Node ≥20, Express, **CommonJS**      | React 18, **ESM**                                  |
| Data/UI    | Mongoose (MongoDB Atlas)             | Vite + Tailwind 3                                  |
| Fetching   | —                                    | TanStack Query (partial) + hand-rolled `apiClient` |
| Validation | Zod                                  | Zod                                                |
| Tests      | **Jest** + Supertest (`--runInBand`) | **Vitest** + React Testing Library                 |
| Logging    | Pino / pino-http                     | PostHog client                                     |

The client is a browser SPA that talks to `/api/v1` over `fetch` with
`credentials: 'include'`. MongoDB is the store; Stripe drives billing;
Cloudinary stores media; Resend sends email; PostHog captures analytics.

### Backend layering (strict, per module)

Each domain is a self-contained module under `server/src/modules/<domain>/`
with **consistent file naming `<domain>.<layer>.js`**:

```
routes → controller → service → repository
          (+ <domain>.validation.js holds Zod schemas)
```

- **routes** — HTTP boundary, attach middleware, wrap handlers in `asyncHandler`.
- **controller** — parse/validate (`schema.parse(req.body|req.query)`), call the
  service, shape JSON. Thin. Uses a local `requireAuthUserId(req)` helper.
- **service** — business logic **and** authorization (`assert*` helpers that
  throw `ApiError(403)`). This is where the rules live.
- **repository** — **defines the Mongoose schema/model inline** and holds all
  data access. **There is no `models/` directory** — models live in repository
  files, guarded with `mongoose.models.X || mongoose.model(...)`.

Cross-cutting services (`token`, `session`, `authToken`, `email`) live in
`server/src/services/`. Shared helpers (`statSummary`, `cloudinaryUrl`,
`stats.constants`, `pagination.validation`) live in `modules/shared/`.

### Frontend layering (feature-based)

```
client/src/
  app/        composition root — providers/, router/, store/ (AuthContext)
  features/<domain>/   api/  components/  hooks/  pages/  schemas/
  components/  shared cross-feature UI (+ components/ui/ — bespoke, NOT shadcn)
  layouts/     AppLayout.jsx (single shell)
  lib/         apiClient.js, env.js, posthog.js
  pages/       static top-level pages (Home, About, Contact, NotFound)
```

The `api/components/hooks/pages/schemas` template is **aspirational, not
enforced** — `games` is the richest (adds a `court/` geometry module); `auth` is
the only feature with a `schemas/` folder; `dashboard`/`contact`/`media` are
effectively flat.

---

## 3. Frontend ↔ backend communication

All API access is centralized in [`client/src/lib/apiClient.js`](../client/src/lib/apiClient.js):

- Base URL from `VITE_API_BASE_URL`; **every** request sends cookies
  (`credentials: 'include'`).
- **CSRF double-submit**: reads the `XSRF-TOKEN` cookie into a module var, sends
  it as the `x-csrf-token` header on mutations, and refreshes it from each
  response's `x-csrf-token` header.
- **Silent refresh**: on a 401 (except auth endpoints) it calls `/auth/refresh`
  once (deduped via a shared `refreshPromise`) and retries the original request.
- Exposes `get/post/put/patch/delete` + `postFormData` +
  `postFormDataWithProgress` (XHR for upload progress). Errors normalize to
  `Error` with `.status`, `.details`, `.requestId`.

Features wrap it in singleton `*Api` objects (e.g. `authApi`, `billingApi`).

### Routing (source of truth: [`AppRouter.jsx`](../client/src/app/router/AppRouter.jsx))

- Canonical feed is **`/pulse`** (FeedPage). `/` and `/feed` **redirect** to it.
- Dashboard/league admin entry is **`/admin`** (`/dashboard` is an alias;
  `/leagues` → `/admin`). Legacy `/leagues/:id/...` paths redirect to
  `/admin/leagues/...` via `LegacyLeagueRedirect`.
- **`/pricing` renders only outside production** (redirects to `/pulse` in
  prod) — billing is not yet publicly launched.
- `ProtectedRoute` guards authenticated pages (reads `useAuth()`, redirects to
  `/login`). Public: league/team/player pages (slug-based), game detail,
  opponent placeholders, the feed.
- **`/games/:gameId/track` renders outside `AppLayout`** (full-screen tracking,
  no shared nav).
- Nearly every page is `React.lazy`-loaded (OPT-001 code-splitting); recharts /
  posthog-js / stripe-js are isolated `manualChunks` in `vite.config.js`.

---

## 4. Authentication & authorization

### Auth (cookie-based JWT)

- Dual token delivery: `Authorization: Bearer` **or** an `accessToken` cookie
  (`auth.middleware.js`). Access TTL ~15m, refresh ~7d (env-configurable).
- **Refresh tokens are hashed and persisted** in the `Session` collection;
  `/auth/refresh` **rotates** the session (verify hash → delete old → issue
  new). A TTL index auto-expires sessions.
- Local (email/password) users **cannot log in until email is verified**.
  Google OAuth via `/auth/google/*` + client `GoogleCompletePage`.
- Client session state lives in [`AuthContext.jsx`](../client/src/app/store/AuthContext.jsx)
  as a TanStack Query (`['auth','me']`). On every auth transition it calls
  `purgePrivateCache()` to evict the prior user's permission-scoped cache.

### Authorization (resource + league-role based, enforced in services)

There is **no meaningful global RBAC** — `User.roles` defaults to `['user']` and
is not enforced. Real authorization is ownership + **league role**, checked by
`assert*` helpers in `leagues.service.js`, not by middleware:

- **League roles** (`LeagueTeamMember.role`): `manager`, `helper`, `player`;
  plus a separate `LeagueManager` collection for league-wide managers, and the
  league **owner**.
- Key gates: `assertLeagueOwner`, `assertLeagueManagerOrOwner`,
  `assertTeamManagerOrOwner`, `canManageLeagueGame`, `canFinalizeLeagueGame`,
  `canEditCompletedLeagueGame`, `getLeagueContextForGame`.
- Every `GET /leagues/:id` response carries
  `viewerContext: { viewerRole, managedTeamIds }`, which drives all client-side
  permission UI (client checks are UX-only).

**The full matrix lives in [`permissions.md`](./permissions.md).**

---

## 5. Database structure & key collections

15 collections, all defined inline in repository files:

| Collection                    | Owner module | Notes                                                                             |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------- |
| `User`                        | auth         | account, `authProvider`, `emailVerified`, `plan`, unused `roles`/`league*` fields |
| `Session`                     | auth         | hashed refresh tokens; TTL index                                                  |
| `AuthToken`                   | auth         | email-verify / password-reset tokens; TTL index                                   |
| `Team`                        | teams        | roster, branding, **Stripe billing fields**, `processedWebhookEventIds`           |
| `TeamSeasonSummary`           | teams        | materialized standalone-team season stats (OPT-013)                               |
| `Game`                        | games        | team ref, opponent label, lineup state, **embedded events**                       |
| `Post`                        | feed         | `image`/`video`/`game_card`/`player_card`/`team_card`/`highlight_clip`            |
| `League`                      | leagues      | metadata, owner, slug, **league billing state** (source of truth)                 |
| `LeagueTeam` / `LeaguePlayer` | leagues      | teams/players within a league                                                     |
| `LeagueTeamMember`            | leagues      | user ↔ league-team roster link + `role`                                           |
| `LeagueJoinRequest`           | leagues      | player/helper/manager join flow                                                   |
| `LeagueManager`               | leagues      | league-wide manager grants                                                        |
| `LeagueStandings`             | leagues      | materialized standings (OPT-010)                                                  |
| `LeaguePlayerStats`           | leagues      | materialized raw player totals (OPT-011)                                          |

### Notable design choices

- **Game events are embedded** in the `Game` document, not a separate
  collection. Every derived view (box score, recap, replay, public summaries) is
  computed from that event list.
- **Read-time compute is being replaced by write-time materialization**
  (standings, league player stats, team season summaries, frozen
  `Game.finalScore`/`eventCount`/`boxScore`/`gameSummary`). Each materialized
  read does **compute-on-miss + persist** (self-healing, reversible, no migration
  needed). Recompute is fired **post-response** (`setImmediate`) from write
  triggers, with an in-flight dirty-flag to avoid dropping concurrent writes.
- **Keyset (cursor) pagination** on `_id: -1` via `utils/pagination.js`
  (`DEFAULT_PAGE_LIMIT=20`, `MAX_PAGE_LIMIT=50`). Applied to `GET /games`,
  `/teams`, `/public/leagues`. Repos paginate only when a `limit` is passed, so
  internal callers stay unbounded. Response adds `nextCursor` alongside the
  existing array key (backward-compatible).
- **`.lean()`** on read-only list/public paths only.
- **Optimistic concurrency** (`optimisticConcurrency: true`) on the `Game`
  schema — a stale co-tracker save throws `VersionError` → translated to `409`.
- Connection pool: `maxPoolSize` (env `MONGO_MAX_POOL_SIZE`, default 10),
  `serverSelectionTimeoutMS: 5000`, retry loop on connect.

### Stat model (`modules/shared/stats.constants.js`)

- `STAT_TYPES`: FT/FG2/FG3 made+miss, `OPP_*` (opponent scoring/rebounds),
  `AST`, `OREB`, `DREB`, `STL`, `BLK`, `TOV`, `FOUL`, `SUB_IN`, `SUB_OUT`.
- `SHOT_ZONE_IDS`: PAINT, MID_RANGE_L/R, TOP_KEY, CORNER/WING 3s, BACKCOURT,
  FREE_THROW_LINE. Every event stores normalized `x`/`y` in `0..100`.

---

## 6. Stripe integration

Entry: [`billing.service.js`](../server/src/modules/billing/billing.service.js).
Billing is **resource-scoped** (a Team or a League), not just user-scoped.

- **Two products, two intervals** — Team and League, each `monthly`/`season`,
  resolved to env price IDs (`STRIPE_PRICE_ID_TEAM_MONTHLY|SEASON`,
  `STRIPE_PRICE_ID_LEAGUE_MONTHLY|SEASON`). Current display pricing:
  **Team $12/mo · $89/season**, **League $49/mo · $299/season** (see
  `PricingPage.jsx`). A legacy `pro` plan value is still tolerated.
- **API version pinned**: `new Stripe(key, { apiVersion: '2024-06-20' })`.
- **Flow**: client posts to `/billing/team-checkout` | `/billing/league-checkout`
  | `/billing/customer-portal`, gets a hosted-Checkout/Portal URL, validates it
  with `isSafeStripeUrl()` (must be `https` on `checkout.` / `billing.stripe.com`),
  then `window.location.assign`. There is **no client-side Stripe.js/Elements**
  (`@stripe/stripe-js` is a dep but effectively unused). 14-day trial. League doc
  is created **post-checkout** to avoid a chicken-and-egg.
- **Webhook** (`POST /api/v1/billing/webhooks`) is mounted **before**
  `express.json()` with `express.raw()` so the raw body is available for
  signature verification. Handles `checkout.session.completed`,
  `customer.subscription.*`, `invoice.payment_failed`. `invoice.paid` /
  `trial_will_end` are currently no-ops.
- **Idempotency** is atomic at the DB layer: `claimTeamWebhookEvent` /
  `claimLeagueWebhookEvent` (`utils/webhookIdempotency.js`) do a gated
  `findOneAndUpdate` (`processedWebhookEventIds: { $ne: eventId }` +
  `$push`/`$slice: -25`). The create path guards by customer id instead.
- **Entitlements** derived from plan + status:
  `canTrackStats`, `canViewReplay`, `canViewShotMaps`, `canViewHighlightClips`,
  `canManageLeague`. Guards: `assertTeamCreationAllowed` (402),
  `assertFeedPostingAllowed` (403). `syncOwnerPlan` re-scans a user's teams after
  every webhook and sets `User.plan` to `pro` if **any** team is active Pro.

Stripe is the **source of truth** for activation/cancellation — the client never
promotes to Pro directly. See [`billing.md`](./billing.md) and
[`stripe-development-setup.md`](./stripe-development-setup.md).

---

## 7. PostHog analytics

Infrastructure is present; **analytics is disabled by default**
(`VITE_ENABLE_ANALYTICS=false` in dev). Full detail in
[`posthog-implementation.md`](./posthog-implementation.md).

- **Client** (`posthog-js`): init in [`lib/posthog.js`](../client/src/lib/posthog.js)
  (guarded, idempotent; `autocapture:false`, `capture_pageview:false`,
  `capture_pageleave:true`, `disable_session_recording:true`,
  `persistence:'localStorage+cookie'`).
  Driven by `features/analytics/PostHogRouteTracker.jsx` (render-null, mounted in
  `AppProviders`, inits **after first paint** per OPT-001): manually fires
  `$pageview`/`$pageleave` (with `scroll_depth`) on route change,
  `identify`s with a **whitelisted** `getSafeUserProperties` (plan, roles,
  emailVerified, authProvider, league plan/status — **never email/name**), and
  `reset`s on logout.
- **Server** (`posthog-node`): `analytics.service.js` `captureEvent(...)`, exposed
  at `POST /api/v1/analytics/event` (auth-protected), reserved for future trusted
  server-side events. No-op if `POSTHOG_KEY` unset.
- **Inconsistency to know**: a second helper `features/analytics/trackEvent.js`
  imports `posthog` directly and checks only `env.enableAnalytics` (not init
  state) — prefer the named helpers from `lib/posthog.js`.

---

## 8. TanStack Query patterns (and the caveat)

Config in [`queryClient.js`](../client/src/app/providers/queryClient.js): global
`staleTime: 30_000`, `retry: 1`. Auth query overrides to 5min / `retry:false`.

- **Query keys** are inline array literals, camelCase, e.g. `['publicLeague', slug]`,
  `['game', gameId]`, `FEED_QUERY_KEY = ['feed']`, `AUTH_ME_QUERY_KEY = ['auth','me']`.
  **No central query-key factory.**
- **Custom query hook**: `features/leagues/hooks/usePublicLeague.js` (shared by
  the 3 public league pages; `enabled: Boolean(slug)`, `select: r => r.league`).
- **Mutations use no `useMutation`** — they are plain async `*Api` calls; cache
  updates are manual `queryClient.setQueryData` (e.g. feed optimistic insert,
  auth writes). **No `invalidateQueries` anywhere.**
- ⚠️ **Data-fetch split-brain (known debt)**: TanStack Query is wired into only
  ~6 call sites (AuthContext, FeedPage `useInfiniteQuery`, GameDetailPage, the 3
  public league pages). **~22 pages still fetch imperatively** with
  `useEffect + useState + Promise.all`. When adding a new data page, prefer
  `useQuery`; migrating the imperative pages is the tracked "OPT-014b" follow-up.

---

## 9. Conventions & coding standards

**Backend**

- Errors: throw `ApiError(statusCode, message, details?)` from services;
  `error.middleware.js` maps ZodError / Multer size / CastError → 400 and masks
  500 bodies to "Internal server error". Response shape:
  `{ error: { message, details, requestId } }`.
- Wrap every route handler in `asyncHandler`.
- Validate at the controller boundary with Zod (`schema.parse`).
- Env is fully **Zod-validated at boot** (`config/env.js`); the process exits on
  failure; secrets have min-length checks (JWT ≥ 32).
- Structured logging: Pino + pino-http, `requestId` propagated through.
- **`OPT-###` comments are an inline changelog** — they document why a
  performance/correctness decision was made. Don't remove them.

**Frontend**

- **Named exports everywhere** (lazy loader unwraps `.then(m => ({default: m.X}))`).
- Zod for all boundary validation; forms are hand-rolled (`useAuthForm` pattern),
  **not** react-hook-form.
- Tailwind utility classes inline (slate/emerald/amber/violet palette); no CSS
  modules; `components/ui` is bespoke (no shadcn/Radix/`cn()`).
- Accessibility is taken seriously (`aria-label`, `inert`, focus management,
  `useId`) — maintain it.
- **No path aliases** — imports are deep relative chains (`../../../lib/...`).

**Repo-wide**

- Conventional commits enforced by commitlint + Husky; `lint-staged` runs
  Prettier on staged files (pre-commit). ESLint + Prettier configs in `config/`.
- Branch flow: feature → `dev` (staging) → `main` (prod, manual deploy). See
  [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- Pre-PR checks: `pnpm check-env && pnpm lint && pnpm test && pnpm build` (also
  the CI job in `.github/workflows/ci.yml`).

---

## 10. Important workflows

- **Run locally**: `pnpm dev` (client :5173, server :4000). Client env from
  `env/client/.env.development`, server from `env/server/.env.development` (via
  `ENV_FILE`). `pnpm seed` populates sample data (10 users
  `user1..10@userN.com` / `password`).
- **Live tracking** (the most app-specific flow): create game → set starting
  five → tap court → `courtInference.js` classifies zone + FG2/FG3 → record
  make/miss (or FT / non-shot quick actions) → follow-up prompt (assist/rebound)
  → each event POSTed to the API. Box score/recap/replay derive from events.
  Key files: `features/games/court/*`, `InteractiveCourtImage.jsx`,
  `games.service.js`, `shared/statSummary.js`.
- **Backfill scripts** (`server/src/scripts/`, idempotent, `--dry-run`):
  `backfill-game-finalscore`, `backfill-league-standings`,
  `backfill-team-season-summaries`, `backfill-participant-slug`. Run with
  `ENV_FILE=../env/server/.env.development node src/scripts/<name>.js`.
- **Deployment**: Render blueprint (`render.yaml`) — 4 services (API + client ×
  dev/prod). Secrets injected via the Render dashboard, never in `render.yaml`.
  See [`deployment-render.md`](./deployment-render.md) and
  [`render-env-matrix.md`](./render-env-matrix.md).

---

## 11. Technical debt, limitations & assumptions

**Known debt / inconsistencies**

- **Data-fetch split-brain** (client): ~22 pages bypass TanStack Query
  (§8). No `useMutation`/`invalidateQueries`.
- **Unused/partial fields**: `User.roles` (never enforced) and
  `User.league*` billing fields duplicate `League` state (League is the source
  of truth) — a partial/abandoned migration.
- **Legacy `pro` plan** value tolerated in both team and league active checks;
  the "We-ball Saturday" league uses a manually-set `pro` with no Stripe sub.
- **Backward-compat aliases** kept "until routes migrated" (`createCheckoutSession`,
  `createCustomerPortalSession`, `getBillingSummary`) — migration incomplete.
- **League-create webhook idempotency is by-customer, not by-event-id** — a
  concurrent-create race remains open (closing it needs a `stripeCustomerId`
  unique index, a prod-data-gated migration, deferred with OPT-007).
- **Two email providers in deps** (`nodemailer` + `resend`); only Resend is wired
  — nodemailer is likely vestigial. Legacy `SMTP_*` vars linger in prod env /
  `render.yaml` and should be cleaned up (see `security.md`).
- **`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are shared across dev and prod** env
  files — should be rotated to distinct per-environment values.
- **Duplicated route lists**: `PostHogRouteTracker` maintains its own hardcoded
  route-pattern list that must stay in sync with `AppRouter`.
- **No path aliases**, deep relative imports (client).

**Limitations / assumptions**

- One tracked team per standalone game; opponents are score totals only (league
  games are the dual-team exception).
- No caching layer (Redis deferred), no job queue/cron — the only "background"
  work is post-response `setImmediate` recomputes and the AI game-summary
  generation (guarded by a 2-min TTL DB lock).
- `/pricing` and billing are **not publicly launched** (dev-only route).
- Dataset is tiny today (~tens of games); the materialization work targets
  **scaling cliffs**, not current slowness.
- Single-instance assumption: the credential rate limiter uses an in-memory
  store (per-process, not shared) — revisit if the app goes multi-instance.

**Active optimisation project**: the `docs/application-audit/` folder — headed by
[`000-OPTIMISATION-TRACKER.md`](./application-audit/000-OPTIMISATION-TRACKER.md)
— is the living tracker for the performance/hardening work (OPT-###). Most
backend items are done and committed; the open items are browser-gated frontend
work (React Query migration, GameTrackPage decomposition, client
infinite-scroll) and prod-data-gated migrations. Consult it before starting
optimisation work.

---

## 12. Where to start (by question)

| I need to understand…          | Start here                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Product scope & features       | [`README.md`](../README.md), [`what-is-tsw.md`](./what-is-tsw.md)                                  |
| Fast file-path orientation     | [`app-overview.md`](./app-overview.md)                                                             |
| Routing / page composition     | `client/src/app/router/AppRouter.jsx`                                                              |
| Live game behavior             | `client/src/features/games/pages/GameTrackPage.jsx`                                                |
| Derived stats / recap logic    | `server/src/modules/games/games.service.js`, `shared/statSummary.js`                               |
| API surface                    | [`api.md`](./api.md)                                                                               |
| Persistence schemas            | `server/src/modules/*/*.repository.js`                                                             |
| Authorization rules            | [`permissions.md`](./permissions.md)                                                               |
| Billing                        | [`billing.md`](./billing.md)                                                                       |
| Deploy & env                   | [`deployment-render.md`](./deployment-render.md), [`render-env-matrix.md`](./render-env-matrix.md) |
| Performance/optimisation state | [`application-audit/000-OPTIMISATION-TRACKER.md`](./application-audit/000-OPTIMISATION-TRACKER.md) |
