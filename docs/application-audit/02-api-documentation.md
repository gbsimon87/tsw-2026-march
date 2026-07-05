# API Documentation

> Part of the [Application Audit](./README.md) · July 2026

All routes are mounted under **`/api/v1`** by `server/src/routes/index.js`.
Pattern per module: `*.routes.js → *.controller.js → *.service.js →
*.repository.js`, request bodies validated with zod (`*.validation.js`).
Responses use `server/src/utils/apiResponse.js` envelopes; errors carry
`{error: {message, details, requestId}}`.

Auth legend: **auth** = `authMiddleware` (Bearer header or `accessToken`
cookie); **optional** = `optionalAuthMiddleware`; **none** = public.
Authorization is enforced in the **service layer**, not middleware.

Performance flags used below: `FULL-SCAN` (unbounded collection read),
`EVENTS` (loads full `Game.events` arrays), `N+1` (per-item queries),
`NO-PAGE` (no pagination), `RECOMPUTE` (derived data rebuilt per request).

---

## Auth — `/auth` (`server/src/modules/auth/auth.routes.js`)

| Method & path                     | Auth                          | Body                     | Notes                                                                                                                          |
| --------------------------------- | ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| POST `/auth/register`             | none                          | email, password ≥8, name | bcrypt cost 12; user created with `emailVerified: true` (verification is effectively bypassed)                                 |
| POST `/auth/login`                | none                          | email, password          | Sets `accessToken` (15m) + `refreshToken` (7d, path `/api/v1/auth`) cookies. No dedicated rate limit beyond the global 300/15m |
| POST `/auth/refresh`              | refresh cookie                | —                        | Full rotation w/ reuse detection; 4 sequential queries per refresh                                                             |
| POST `/auth/logout`               | refresh cookie                | —                        | Deletes session, clears cookies                                                                                                |
| GET `/auth/me`                    | auth                          | —                        | DB hit per call, uncached; fired on every SPA load                                                                             |
| POST `/auth/avatar`               | auth                          | multipart ≤2MB           | Cloudinary upload; 2 redundant user re-reads (`auth.service.js:330,343`)                                                       |
| POST `/auth/request-verification` | none (recovery limiter 8/15m) | email                    | **No-op stub** (`auth.service.js:227-234`) — dead endpoint                                                                     |
| POST `/auth/verify-email`         | recovery limiter              | token                    | Works but unused (registration pre-verifies)                                                                                   |
| POST `/auth/forgot-password`      | recovery limiter              | email                    | Resend email sent inline (blocks response)                                                                                     |
| POST `/auth/reset-password`       | recovery limiter              | token, newPassword       | Invalidates sessions                                                                                                           |
| GET `/auth/google/start`          | none                          | —                        | Passport redirect                                                                                                              |
| GET `/auth/google/callback`       | Google                        | code                     | Redirects to client with a 60s exchange JWT (no cookies on redirect)                                                           |
| POST `/auth/google/exchange`      | none                          | `{token}` (60s JWT)      | Sets cookies. Token is single-audience but replayable within its 60s window                                                    |

## Billing — `/billing` (`server/src/modules/billing/billing.routes.js`)

| Method & path                    | Auth                            | Body                 | Notes                                                                                                                                   |
| -------------------------------- | ------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/billing/team-checkout`    | auth + checkout limiter (5/10m) | `{teamId, interval}` | Stripe Checkout, 14-day trial                                                                                                           |
| POST `/billing/checkout-session` | auth + limiter                  | same                 | **Legacy duplicate** of team-checkout (byte-identical controller)                                                                       |
| POST `/billing/league-checkout`  | auth + limiter                  | `{interval}`         | League created later by webhook                                                                                                         |
| POST `/billing/customer-portal`  | auth + limiter                  | teamId XOR leagueId  | Stripe billing portal                                                                                                                   |
| POST `/billing/webhooks`         | Stripe signature                | raw event            | Mounted with `express.raw` before json/CSRF/rate-limit (`server/src/app.js:34-38`). See [09-payment-webhooks](./09-payment-webhooks.md) |

## Games — `/games` (`server/src/modules/games/games.routes.js`)

| Method & path                                       | Auth     | Body/query                                                                     | Perf                                                                                                                                                              |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/games/:gameId`                                | optional | —                                                                              | Public. Full pipeline (box score + summary + recap + highlights ≈ 7–10 event passes); game fetched **twice** (`games.service.js:1160,1167`). `EVENTS` `RECOMPUTE` |
| GET `/games?teamId&status`                          | auth     | query unvalidated                                                              | Loads full docs incl. events just for `eventCount` (`games.service.js:1030`); per-id logo lookups. `EVENTS` `N+1` `NO-PAGE`                                       |
| POST `/games`                                       | auth     | `createGameSchema` union (standalone / standalone-dual / league / league-dual) | Up to 5 team ownership lookups (`games.service.js:833-970`)                                                                                                       |
| PATCH `/games/:gameId`                              | auth     | title, opponent, scheduledAt, videoUrl, initialActiveSide                      | Returns full recomputed detail after a metadata edit                                                                                                              |
| POST `/games/:gameId/lineup`                        | auth     | `{playerIds[5], teamSide?}`                                                    | Full detail rebuild                                                                                                                                               |
| POST `/games/:gameId/events`                        | auth     | event union (shot w/ x,y,zone; non-shot; substitution; opponent aggregate)     | **Hot path**: full doc load + full save (no `$push`), lineup recalc scans all events, response recomputes full detail. `EVENTS` `RECOMPUTE`                       |
| POST `/games/:gameId/events/:eventId/insert-before` | auth     | same                                                                           | splice into array; rejects SUB events                                                                                                                             |
| PATCH `/games/:gameId/events/:eventId`              | auth     | `updateEventSchema`                                                            | full save + recompute                                                                                                                                             |
| DELETE `/games/:gameId/events/:eventId`             | auth     | —                                                                              | subdoc delete + full save                                                                                                                                         |
| POST `/games/:gameId/finish`                        | auth     | —                                                                              | **Synchronous OpenAI call (≤8s) inside the request** for league games; lock has no expiry; persisted fallback prevents retry                                      |
| DELETE `/games/:gameId`                             | auth     | —                                                                              | Also deletes related feed posts                                                                                                                                   |

Dead: `games.controller.getById` exported but never routed.

## Teams — `/teams`, `/public/teams`, `/public/opponents` (`server/src/modules/teams/teams.routes.js`)

| Method & path                                                          | Auth | Perf                                                                                                                       |
| ---------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| GET `/public/teams/explore`                                            | none | **ALL completed games with events** + per-game team lookup (`teams.service.js:600-641`). `FULL-SCAN` `EVENTS` `N+1`        |
| GET `/public/teams`                                                    | none | ALL teams + ALL completed games to pick 6 (`teams.service.js:643-661`). `FULL-SCAN`                                        |
| GET `/public/teams/:teamId`                                            | none | All team games; `summarizeEvents` twice per game. `EVENTS` `RECOMPUTE`                                                     |
| GET `/public/teams/:teamId/players/:playerId`                          | none | `computeBoxScore` per game + `listTeams()` full scan for opponent names (`teams.service.js:344,523`). `FULL-SCAN` `EVENTS` |
| GET `/public/opponents/:opponentSlug`                                  | none | ALL completed games + sequential team fetches in a loop (`teams.service.js:544-598`). `FULL-SCAN` `N+1`                    |
| POST `/teams`                                                          | auth | billing gate (`assertTeamCreationAllowed`)                                                                                 |
| GET `/teams`                                                           | auth | owner's teams. `NO-PAGE` (fine at ≤ tens)                                                                                  |
| GET `/teams/:teamId` · GET `.../entitlements` · PATCH `/teams/:teamId` | auth | owner-only                                                                                                                 |
| POST/DELETE `/teams/:teamId/logo`                                      | auth | Cloudinary upload/destroy, multer memory ≤2MB                                                                              |
| POST/PATCH/DELETE `/teams/:teamId/players(/:playerId)`                 | auth | embedded array ops; delete is soft (`isActive=false`)                                                                      |

## Leagues — `/leagues` (auth) and `/public-leagues` (optional)

(`server/src/modules/leagues/leagues.routes.js`; full table with authorization
detail in the leagues deep-read — key rows here)

### Public (optionalAuth)

| Path                                              | Perf                                                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/public-leagues`                             | N+1 `listLeagueTeams` per league (`leagues.service.js:466`). `N+1` `NO-PAGE`                                                                               |
| GET `/public-leagues/:leagueSlug`                 | Games loaded **2×** (standings + list), teams 3×; `publicOnly` option silently ignored (`leagues.service.js:549` vs `:1705`). `EVENTS` `RECOMPUTE`         |
| GET `.../standings` and `.../games`               | Call the **full league builder and discard** most of it (`leagues.controller.js:349-364`)                                                                  |
| GET `.../leaders`                                 | **Hottest endpoint**: O(teams × games × events × roster) rebuild per request, unauthenticated (`leagues.service.js:1981-2089`). `EVENTS` `RECOMPUTE` `N+1` |
| GET `.../teams/:teamSlug`                         | Games loaded **3×** (`leagues.service.js:711-716`); per-request player-stat recompute                                                                      |
| GET `.../teams/:teamSlug/players/:leaguePlayerId` | Two extra full event sweeps (game rows + highlights, `leagues.service.js:768-850`)                                                                         |

### Authenticated (selection)

| Path                                                                         | Authorization                       | Perf                                                                                                     |
| ---------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| POST `/leagues`                                                              | owner + `isLeagueActive` billing    | stub-league lookup by literal name `'My League'` (`leagues.service.js:398`)                              |
| GET `/leagues`                                                               | member/manager/owner                | per-league viewer-context refetch — `N+1` on memberships (`leagues.service.js:455-457`)                  |
| GET `/leagues/:leagueId`                                                     | `assertLeagueViewer`                | teams queried 3×, games 2× per request (`leagues.service.js:507-512`)                                    |
| GET `.../standings`, `.../games`                                             | viewer                              | full builder, payload discarded (`leagues.controller.js:342-359`)                                        |
| PATCH `/leagues/:leagueId` · POST `.../archive`                              | owner/league-manager · owner        | —                                                                                                        |
| POST/DELETE `.../logo`                                                       | owner/league-manager                | Cloudinary                                                                                               |
| GET/POST/DELETE `.../managers`                                               | participant / owner / owner         | `buildUsersMap` = N individual user fetches (`leagues.service.js:385-389`), used by ~10 endpoints. `N+1` |
| POST/GET `.../teams`                                                         | manager+billing / viewer            | roster counts via `listLeaguePlayers` per team. `N+1`                                                    |
| GET `.../teams/:leagueTeamId`                                                | team access                         | standings + games full-load, `findIndex` ×2                                                              |
| PATCH `.../teams/:id`, `.../archive`, `.../logo`                             | manager (archive: not team-manager) | —                                                                                                        |
| POST/PATCH/DELETE `.../players(/:id)` (+ `/unclaim`)                         | team manager+                       | soft delete                                                                                              |
| GET `.../members`, POST `.../managers`, PATCH/DELETE `.../members/:memberId` | manager tiers                       | `N+1` users                                                                                              |
| POST/GET `.../join-requests` (+ approve/reject/cancel)                       | requester / manager tiers           | —                                                                                                        |

## Feed — `/feed` (`server/src/modules/feed/feed.routes.js`)

| Method & path                                          | Auth                                                                                                                         | Perf                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/feed?cursor&limit(≤50, def 20)`                  | **none** (mounted before `authMiddleware`, no optionalAuth → `req.auth` always undefined; `canDelete` never true on listing) | Keyset pagination is good, but hydration is a **sequential per-post N+1**: creator + card resolution (game cards run the full `getPublicGame` pipeline) — 40–80+ queries per page (`feed.service.js:301-311`). `N+1` `EVENTS` |
| GET `/feed/shareable/{games,players,teams}?q&limit`    | none                                                                                                                         | Loads **ALL completed games / ALL teams** and substring-filters in JS per keystroke (`feed.service.js:500-562`). `FULL-SCAN`                                                                                                  |
| POST `/feed/image`                                     | auth, multer 5MB memory                                                                                                      | Cloudinary upload, no transformations applied                                                                                                                                                                                 |
| POST `/feed/video`                                     | auth, multer **100MB memory**                                                                                                | **Buffered fully in RAM + synchronous eager MP4 transcode** (`cloudinary.client.js:61-62`); post-hoc duration check destroys oversized uploads                                                                                |
| POST `/feed/game-card` · `/player-card` · `/team-card` | auth                                                                                                                         | stores IDs; hydrated at read time                                                                                                                                                                                             |
| POST `/feed/highlight-clip`                            | auth                                                                                                                         | dup guard via unique sparse index on `highlightClip.eventId`                                                                                                                                                                  |
| DELETE `/feed/:postId`                                 | auth (owner)                                                                                                                 | fire-and-forget Cloudinary destroy (orphan risk)                                                                                                                                                                              |

## Others

| Method & path           | Auth              | Notes                                                                             |
| ----------------------- | ----------------- | --------------------------------------------------------------------------------- |
| POST `/analytics/event` | auth              | Awaits PostHog capture inline; `distinctId` not validated against the authed user |
| POST `/contact`         | none, 5/h limiter | Resend email inline; user fields interpolated into HTML `<pre>` unescaped         |
| GET `/health`           | none              | Returns ok **without checking DB connectivity**                                   |

---

## Cross-cutting observations

- **Duplicate endpoints**: `/billing/checkout-session` ≡ `/billing/team-checkout`;
  league `/standings` + `/games` (both routers) duplicate slices of the league
  detail endpoint; `DashboardPage`/`AdminPage` on the client double-consume the
  same three list endpoints.
- **Large payloads**: game detail responses include the full events array +
  box score + recap + highlights; league detail includes teams + standings +
  full game rows. Event appends return the entire detail per tap.
- **Missing pagination**: everything except the feed (`GET /games`, `GET /teams`,
  `GET /leagues`, league games/standings, public explore/lists).
- **Missing query validation**: list query params (`games.controller.js:28-31`)
  and most `:id` params rely on Mongoose cast errors.
- **N+1 hot spots**: feed hydration, `buildUsersMap`, roster counts per team,
  per-game team lookups on public explore, per-league viewer context.
- **Batching opportunities**: `$in` user/team lookups; combined league-detail
  fetch; event append batching from the tracker; feed hydration via `$lookup`
  or batched `$in` fetches.

Full analysis: [23-api-audit](./23-api-audit.md).
