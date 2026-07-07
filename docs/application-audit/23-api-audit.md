# API Audit

> Part of the [Application Audit](./README.md) · July 2026

Endpoint-by-endpoint reference lives in [02-api-documentation](./02-api-documentation.md).
This report ranks the API-level problems and prescribes fixes.

## Critical (unbounded work on public routes)

### 1. Full-collection scans with events on public endpoints

- `GET /public/teams/explore` — **ALL completed games with full events** +
  per-game team lookup (`teams.service.js:600-641`).
- `GET /public/teams` — ALL teams + ALL completed games to pick 6 (`:643-661`).
- `GET /public/opponents/:opponentSlug` — ALL completed games + sequential team
  fetches in a loop (`:544-598`).
- `GET /feed/shareable/{games,players,teams}` — ALL completed games / ALL teams
  substring-filtered in JS **per keystroke** (`feed.service.js:500-562`).

**Fix**: replace with indexed, projected, limited queries
(`.find({status:'completed'}).sort(...).limit(N).select('-events -rosterSnapshot...')`);
shareable search should use an indexed prefix/text query with `limit`.

### 2. League leaders / standings recomputation per request

`GET /public-leagues/:slug/leaders` rebuilds O(teams × games × events × roster)
per unauthenticated request (`leagues.service.js:1981-2089`); standings
recomputed inside four different compositions. **Fix**: write-time
materialisation ([28](./28-computation-optimisation.md)); interim: 30s
in-process cache + `Cache-Control`.

## High

### 3. Feed hydration N+1

`GET /feed` hydrates each post **sequentially**: creator fetch + full
`getPublicGame`/`getPublicTeam`/`getPublicPlayer` per card
(`feed.service.js:301-311`) — 40–80+ queries per 20-post page.
**Fix**: batch creators with one `$in` query; store denormalised card display
data at post-creation time (title, names, logos, score) so read-time
resolution disappears; keep a slim refresh path for stale cards.

### 4. Event-append round trip returns the world

`POST /games/:gameId/events` saves the full doc then recomputes and returns
box score + summary + recap + highlights (~7–10 event passes)
(`games.service.js:1212-1392`).
**Fix**: `$push` the event; return a slim delta (event + updated score +
affected stat row); tracker already merges authoritative responses so this is
a contract change, not a rewrite. Add `updatedAt`-based optimistic concurrency.

### 5. Full events loaded for lists

`GET /games` loads whole docs to compute `eventCount`
(`games.service.js:1030`). **Fix**: `.select()` projection +
`{$size: '$events'}` via aggregation, or maintain an `eventCount` field.

## Medium

### 6. Duplicate / wasteful endpoints

- `/billing/checkout-session` ≡ `/billing/team-checkout` — remove legacy.
- League `/standings` and `/games` (both routers) call the **full league
  builder and discard most of it** (`leagues.controller.js:342-364`) — give
  them dedicated slim service paths (or delete: the detail endpoint already
  returns both).
- `GET /games/:gameId` fetches the game twice (`games.service.js:1160,1167`).

### 7. Repeated loads within one request

League detail compositions load teams 3× and games 2–3× per request via
nested `Promise.all` helpers (`leagues.service.js:507-512, 546-550, 658-668,
711-716`). **Fix**: fetch once, pass down (pure refactor of service
composition).

### 8. `buildUsersMap` and friends — N individual fetches

`leagues.service.js:385-389` (used by ~10 endpoints), roster counts per team
(`:634-643`), viewer context per league (`:455-457`), logo lookups per game
(`games.service.js:986-993`), AdminLeaguePage per-team `getTeam` fan-out
(client). **Fix**: `$in` queries / aggregate counts / one join-requests
endpoint for the admin tab.

### 9. Missing pagination

Everything except `/feed`: `GET /games`, `GET /teams`, `GET /leagues`, league
games/standings rows, public lists. Add `limit`/cursor params now — the client
([29](./29-frontend-optimisation.md)) needs them for virtualised/paginated
lists later. Feed's keyset cursor is the pattern to copy.

### 10. Missing query/param validation

List filters unvalidated (`games.controller.js:28-31`); ObjectId params mostly
unchecked. Add zod schemas for query/params in each `*.validation.js` (the
scaffolding already exists).

## Low

- Health check without DB ping.
- Analytics `distinctId` unbound to authed user; capture awaited inline.
- CSRF token minted per request (Set-Cookie churn on every GET).
- No dedicated rate limiter on login/register/refresh.
- `notFound`/error middlewares fine; response envelope consistent ✅.

## Batching opportunities summary

| Opportunity      | Where                                                 | Mechanism                                                          |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| User lookups     | leagues members/managers/join-requests, feed creators | single `$in`                                                       |
| Roster counts    | `listTeamsForLeagueViewer`                            | `countDocuments`/aggregate `$group`                                |
| Card hydration   | feed                                                  | denormalise at write                                               |
| Event appends    | tracker                                               | client-side queue + bulk endpoint (optional, after slim-delta fix) |
| League page data | league detail + leaders                               | one composed endpoint reading materialised docs                    |
