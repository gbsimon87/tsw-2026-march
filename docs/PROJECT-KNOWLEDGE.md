# TSW — Project Knowledge

> **Definitive reference for developers and AI sessions.** Describes the app as
> it exists today. If this document and the code ever disagree, the code wins —
> update this file immediately after.
>
> Companion docs: [`app-overview.md`](./app-overview.md) (fast orientation +
> file-path map), [`api.md`](./api.md) (endpoint reference),
> [`permissions.md`](./permissions.md) (authorization matrix),
> [`billing.md`](./billing.md), [`security.md`](./security.md),
> [`posthog-implementation.md`](./posthog-implementation.md),
> [`demo-data-generation/`](./demo-data-generation/) (demo account seed
> plan, decisions, live tracker). Active work
> tracker: [`application-audit/000-OPTIMISATION-TRACKER.md`](./application-audit/000-OPTIMISATION-TRACKER.md)
> (performance/hardening, OPT-###). The separate `project-improvement-plan/`
> initiative (targeted bug fixes TSW-001–005) finished 2026-07-08 and was
> folded into this file's §4/§5/§11 and removed — see git history if the
> original tracker/investigation detail is ever needed.

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
- **Player discovery** on `/home` (`DiscoverablePlayers` component, 2026-07-10):
  a debounced (400ms) search over active players from public standalone teams
  and public league teams, backed by `GET /feed/discoverable/players`
  (`feed.service.js#listDiscoverablePlayers`, no auth required).
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

**Lesson (from TSW-001):** every "does this user have {team|league}
affiliation?" gate in `leagues.service.js` ORs in `ownerUserId === userId`
alongside the active-manager/member checks, because league creation never
auto-inserts a `LeagueManager` row for the owner (ownership and the manager
role are deliberately separate). A gate outside `leagues.service.js` that
reimplements this question from scratch is at risk of forgetting that
OR-clause — that's exactly what happened in `billing.service.js`'s
`assertFeedPostingAllowed`, which locked out pure league owners with no team
of their own. When adding a new affiliation gate, reuse or mirror an
existing `leagues.service.js` helper rather than writing the check fresh.

---

## 5. Database structure & key collections

15 collections, all defined inline in repository files:

| Collection                    | Owner module | Notes                                                                                                                                                                                                          |
| ----------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                        | auth         | account, `authProvider`, `emailVerified`, `plan`, unused `roles`/`league*` fields                                                                                                                              |
| `Session`                     | auth         | hashed refresh tokens; TTL index                                                                                                                                                                               |
| `AuthToken`                   | auth         | email-verify / password-reset tokens; TTL index                                                                                                                                                                |
| `Team`                        | teams        | roster, branding, **Stripe billing fields**, `processedWebhookEventIds`                                                                                                                                        |
| `TeamSeasonSummary`           | teams        | materialized standalone-team season stats (OPT-013)                                                                                                                                                            |
| `Game`                        | games        | team ref, opponent label, lineup state, **embedded events**                                                                                                                                                    |
| `Post`                        | feed         | `image`/`video`/`game_card`/`player_card`/`team_card`/`highlight_clip`; `playerCard`/`teamCard` carry sibling `teamId`/`playerId` (standalone) or `leagueTeamId`/`leaguePlayerId` (league), mutually exclusive |
| `League`                      | leagues      | metadata, owner, slug, **league billing state** (source of truth)                                                                                                                                              |
| `LeagueTeam` / `LeaguePlayer` | leagues      | teams/players within a league                                                                                                                                                                                  |
| `LeagueTeamMember`            | leagues      | user ↔ league-team roster link + `role`                                                                                                                                                                        |
| `LeagueJoinRequest`           | leagues      | player/helper/manager join flow                                                                                                                                                                                |
| `LeagueManager`               | leagues      | league-wide manager grants                                                                                                                                                                                     |
| `LeagueStandings`             | leagues      | materialized standings (OPT-010)                                                                                                                                                                               |
| `LeaguePlayerStats`           | leagues      | materialized raw player totals (OPT-011)                                                                                                                                                                       |

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
- **Lesson (from TSW-004):** feed card snapshot builders
  (`buildGameCardSnapshot`/`buildPlayerCardSnapshot`/`buildTeamCardSnapshot`
  in `feed.service.js`) are meant to produce the exact same shape as their
  live-compute fallback, per the OPT-017 compute-once-persist-as-snapshot
  pattern — but `buildGameCardSnapshot` once silently omitted a `recap`
  field the live path did produce, so cards rendered `0-0` only after
  round-tripping through the persisted-snapshot path (not on first render,
  which is what made it easy to miss in testing). When adding or changing a
  snapshot builder, verify its output against every field the consuming
  component actually reads, not just against what the author remembered to
  include — a snapshot test asserting the exact key set is the cheapest
  guard against this recurring, since the codebase is plain JS (no shared
  type to catch it automatically). `Game.boxScore`/`Game.gameSummary`
  frozen fields (OPT-012) follow the same pattern and deserve the same
  check if ever extended.

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
- ⚠️ **Data-fetch split-brain (known debt, shrinking)**: TanStack Query is wired
  into ~12 call sites (AuthContext, FeedPage `useInfiniteQuery`, GameDetailPage,
  the 3 public league pages, `DiscoverablePlayers` (2026-07-10), plus
  `GamesListPage`/`TeamsPage`/`LeaguesPage`/`MySportyPage`/
  `OpponentPlaceholderPage` migrated 2026-07-07). **~15 pages
  still fetch imperatively**, most notably `GameTrackPage` (the big one,
  deliberately last) and a mix of admin/CRUD + billing-flow pages. When adding
  a new data page, prefer `useQuery`; migrating the rest is the tracked
  "OPT-014b" follow-up (see its card for the exact remaining list and why each
  one is riskier than a plain read-swap).

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
- Tailwind utility classes inline; no CSS modules; `components/ui` is bespoke
  (no shadcn/Radix/`cn()`). Two palettes coexist — see §9.1 for which pages use
  which and why.
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

### 9.1 Frontend visual design system ("scoreboard" redesign, 2026-07-08)

A subset of client pages were redesigned away from the original generic
slate/sky-blue admin-dashboard look toward a basketball-specific visual
identity. **This redesign is partial** — it only touches the pages listed
below. Everything else (admin CRUD flows, billing pages, game tracking, most
team pages) still uses the original light/slate/sky-blue look via `PageHeader`.
Treat the two as coexisting design languages, not one replacing the other,
until/unless the remaining pages are explicitly redesigned too.

**Token system**

| Token           | Value                                                                | Use                                                                         |
| --------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Ink (dark card) | `#141414`                                                            | Hero/header card backgrounds                                                |
| Brand orange    | `#F4A300`                                                            | Eyebrows, stat numerals, accent underlines, hover states                    |
| Court green     | `#1B4332`                                                            | Secondary accent — section eyebrows, link hover, buttons                    |
| Warm page bg    | `#F7F5F0`                                                            | Page background on redesigned pages (replaces `slate-50`)                   |
| Display face    | `'Archivo Black', sans-serif` (inline `style`, not a Tailwind class) | Headlines, section titles — always paired with a `#F4A300` eyebrow above it |
| Data/mono face  | `'IBM Plex Mono', monospace` (inline `style`)                        | Scoreboard-style numerals: stat lines, jersey numbers, "GP" counts          |
| Body face       | Inter (`index.css` default, now actually loaded — see below)         | Body copy, unchanged                                                        |

Archivo Black + IBM Plex Mono are loaded via a Google Fonts `<link>` in
[`client/index.html`](../client/index.html) (Inter was already declared in
`globals.css` but was never linked — that's fixed too, no visible effect since
it matches the system-sans fallback).

**Recurring page shape** (Home, About, Contact, MySportyPage, AuthPage, the 3
public league pages, PublicLeaguePlayerPage, PublicLeagueTeamPage,
AdminLeaguePage):

1. A dark (`#141414`) header/hero card with a faint repeating-vertical-line
   texture (`opacity-[0.07]` background image), an orange all-caps eyebrow,
   an Archivo Black `<h1>`, and white/60% description text.
2. White `rounded-2xl border border-slate-200` content sections below, each
   with an eyebrow (`text-[#1B4332]`) + Archivo Black `<h2>` header pattern,
   replacing the old plain `text-xl font-semibold` headers.
3. Cards/list items use `bg-slate-50/60` with `hover:border-[#F4A300]/60
hover:bg-white` instead of the old plain slate hover.
4. Any stat/score/count gets the mono face + orange color instead of a plain
   bold slate number — this is the "scoreboard" motif and the closest thing to
   a signature element (see `StatReadout` in `HomePage.jsx` and the jersey-badge
   pattern in `PublicLeaguePlayerPage.jsx`/`MySportyPage.jsx`).
5. Primary buttons: `bg-[#141414]` with `hover:bg-[#1B4332]` (replaces
   `bg-slate-900 hover:bg-slate-700`). Links: `underline decoration-[#F4A300]
decoration-2 underline-offset-4` with `hover:text-[#1B4332]` (replaces
   `text-sky-700 hover:underline`).

**`DarkPageHeader` component** — [`client/src/components/DarkPageHeader.jsx`](../client/src/components/DarkPageHeader.jsx)
factors out step 1 above as a shared component with the same prop shape as
`PageHeader` (`eyebrow`, `title`, `titleAriaLabel`, `description`, `media`,
`children`, `className`, plus a `size="hero"` variant for the bigger Home/
About/Contact headline). It's a straight swap wherever the header is a plain
eyebrow+title+description(+static media) block: `HomePage`, `AboutPage`,
`ContactPage`, `PublicLeaguePage`, `PublicLeagueStandingsPage`,
`PublicLeagueGamesPage`.

**Deliberately left as bespoke inline JSX, not `DarkPageHeader`**, because
their header content doesn't fit a generic eyebrow/title/description/media
shape: `AuthPage` (no card, no media — just a centered heading above the form
card), `MySportyPage` and `AdminLeaguePage` (interactive avatar/logo upload
control in the media slot, not passive image; `AdminLeaguePage` additionally
has inline click-to-edit title JSX), `PublicLeaguePlayerPage` and
`PublicLeagueTeamPage` (two-column layout with a stat grid or compound
logo+text eyebrow, not a plain string). If a future change makes these more
uniform, revisit whether `DarkPageHeader` should grow render-prop/slot support
— it wasn't worth the added complexity for five one-off headers.

**`LeagueStandingsTable`** (`features/leagues/components/LeagueStandingsTable.jsx`)
team-name links were switched from `sky-700` to `#1B4332`/`#F4A300` — this is
shared by `AdminLeaguePage` too, so the admin (non-redesigned) page picked up
the new link color as a side effect; everything else on that page is still the
old palette.

**When adding a new page or extending one of the pages above**: match the
existing pattern on that specific page (check the file, not just this doc —
some accent choices are per-section, e.g. league pages use `#1B4332` eyebrows
throughout, game/player pages mix in mono stat numerals). When adding to a
page **not** in the list above, keep using the original slate/sky-blue/
`PageHeader` look unless the user explicitly asks for that page to be
redesigned too — don't spread the new palette opportunistically.

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
- **Demo account seeding** (`pnpm --filter server seed:demo`, 2026-07-08):
  `server/src/scripts/seed-demo-account.js` populates a realistic demo
  account (`testuser@gmail.com` / `password1!2@3#`) — 3 leagues (owner/
  manager/player role split across them, per [`permissions.md`](./permissions.md)),
  5 `LeagueTeam`s × 8 `LeaguePlayer`s per league, ≥3 completed games per team
  with full stat events, `Game.videoUrl` + per-event `videoTimestamp` on
  every game (so replay highlights are demonstrable — no other seed data
  does this), and 50 `highlight_clip` + a supporting mix of
  `image`/`game_card`/`player_card`/`team_card` posts in Demo League's Pulse
  feed, authored by 5 different accounts. Unlike `seed.js`/`pnpm seed`
  (destructive, dev-only, full reset every run), this script is **additive
  and idempotent** — every entity is keyed by a natural key and
  checked-before-created, so it's safe to re-run and is designed to
  eventually run against production behind an `ALLOW_DEMO_SEED=true` guard.
  Its only dependency is `seed.js` (reused player-name/game-event
  generation helpers) — `server/src/scripts/` was pared down to just those
  two seed-related files plus the unrelated backfill/migration scripts
  above; a one-time dev-DB-reset helper and an unrelated real-league TSV
  importer that used to live there were removed once no longer needed (see
  `demo-data-generation/TRACKER.md` Session 4). Full plan, decisions, and a
  live implementation tracker: [`demo-data-generation/`](./demo-data-generation/).
- **Deployment**: Render blueprint (`render.yaml`) — 4 services (API + client ×
  dev/prod). Secrets injected via the Render dashboard, never in `render.yaml`.
  See [`deployment-render.md`](./deployment-render.md) and
  [`render-env-matrix.md`](./render-env-matrix.md).

---

## 11. Technical debt, limitations & assumptions

**Known debt / inconsistencies**

- **Data-fetch split-brain** (client): ~15 pages bypass TanStack Query
  (§8), down from ~22 after the 2026-07-07 OPT-014b pass. No
  `useMutation`/`invalidateQueries`.
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
- **No refresh trigger for player/team feed-card snapshots**: `Post`'s
  `game_card` snapshots get re-resolved via `refreshGameCardPostsForGame`
  when a game's score changes post-completion, but `player_card`/`team_card`
  snapshots are computed once at share time and never automatically
  refreshed — if the underlying player/team stats change afterward, the
  shared card silently goes stale. No refresh trigger exists for these two
  card types (found during the TSW-004 investigation, not yet scheduled).
- **Swallowed-error pattern may recur elsewhere on the client**: the
  "Share to Pulse" handler in `GameDetailPage.jsx` used to catch a server
  error and discard its real message in favor of a generic string (fixed as
  part of TSW-001 — see below) — worth checking whether other client
  mutation handlers do the same thing, since it makes bugs in those paths
  very hard to diagnose without direct server-log/network-tab access.

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

**Active optimisation project**: `docs/application-audit/000-OPTIMISATION-TRACKER.md`
is the **sole surviving file** in that folder and the living tracker for the
performance/hardening work (OPT-###, 27 tasks) — the 30 original audit
documents it was built from were removed 2026-07-07 once every finding was
addressed (their "Source:" citations remain in the tracker as historical
pointers only). 22 tasks are done and committed; 1 is won't-fix (`OPT-025`,
investigated and found unsafe to ship — the prod backfill half is real and
done); 1 is deferred (`OPT-021`, its risky part needs real mobile-device
testing). Two remain open: `OPT-007` (5 index candidates await a ~1wk Atlas
usage observation — no code left to write, waiting on data) and `OPT-014b`
(React Query migration — 5 clean read-only pages done 2026-07-07;
mutation/polling-heavy pages like `BillingSuccessPage`'s poll loop and the
two large untested Public pages remain, plus `GameTrackPage`'s decomposition,
deliberately last as the biggest/riskiest file). `OPT-026` tracks the client
test suite's ~20 pre-existing failures (test-drift, not live bugs — discovered
2026-07-07, not yet triaged). Consult the tracker before starting any
optimisation work.

**Closed initiative — targeted bug fixes & architecture review (`TSW-001`–`005`,
2026-07-08)**: a separate, now-finished initiative that investigated and
shipped fixes for 5 reported issues; its tracker folder
(`docs/project-improvement-plan/`) has been removed since every finding is
now folded into this file. Summary: `TSW-002` (Key Moments + Top Performers
mobile scroll — neither was built as a horizontal scroller, unlike the
working Highlights section), `TSW-003` (prod nav title falling back to a
repo-name-shaped string), `TSW-004` (shared game cards rendering 0-0 — see
the snapshot-shape lesson in §5), `TSW-001` (Share to Pulse failing for
league owners — see the owner-OR-check lesson in §4), `TSW-005` (FeedComposer
now supports sharing league-scoped games/teams/players, shipped as an
additive extension; same day, widened to cover any public league, not just
the poster's own — see the `Post`/`isLeaguePublic` notes in §5 and §4 — and
closed a write-side gap where private-league entities could be shared
directly even though search already excluded them). Deferred, still-open
follow-ups: player/team card staleness refresh (§11 above) and league
player/team profile routes for feed-card linking (`playerUrl`/`teamUrl` stay
`null` for league cards today — the existing league profile routes are
slug-based, not ID-based, and the card snapshot only carries IDs; fixing
this means denormalizing `leagueSlug`/`teamSlug` into the snapshot too, not
a one-line route swap).

---

## 12. Where to start (by question)

| I need to understand…                   | Start here                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Product scope & features                | [`README.md`](../README.md), [`what-is-tsw.md`](./what-is-tsw.md)                                  |
| Fast file-path orientation              | [`app-overview.md`](./app-overview.md)                                                             |
| Routing / page composition              | `client/src/app/router/AppRouter.jsx`                                                              |
| Live game behavior                      | `client/src/features/games/pages/GameTrackPage.jsx`                                                |
| Derived stats / recap logic             | `server/src/modules/games/games.service.js`, `shared/statSummary.js`                               |
| API surface                             | [`api.md`](./api.md)                                                                               |
| Persistence schemas                     | `server/src/modules/*/*.repository.js`                                                             |
| Authorization rules                     | [`permissions.md`](./permissions.md)                                                               |
| Billing                                 | [`billing.md`](./billing.md)                                                                       |
| Deploy & env                            | [`deployment-render.md`](./deployment-render.md), [`render-env-matrix.md`](./render-env-matrix.md) |
| Performance/optimisation state          | [`application-audit/000-OPTIMISATION-TRACKER.md`](./application-audit/000-OPTIMISATION-TRACKER.md) |
| Bug fix / arch review history (closed)  | §11 above ("Closed initiative")                                                                    |
| Visual design system (partial redesign) | §9.1 above, `client/src/components/DarkPageHeader.jsx`                                             |
| Demo account / seed data generation     | §10 above ("Demo account seeding"), [`demo-data-generation/`](./demo-data-generation/)             |
