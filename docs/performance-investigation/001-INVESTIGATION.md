# 001 — Performance Investigation: The Pulse slow loads (10–20s)

> Investigation date: 2026-07-12, branch `chore/performance-investigation`
> (from `origin/dev` @ `544cc9d`). Companion docs:
> [`000-TRACKER.md`](./000-TRACKER.md) (living tracker),
> [`002-IMPROVEMENT-PLAN.md`](./002-IMPROVEMENT-PLAN.md) (prioritized plan).
> Method: local API timing against Atlas dev, production API timing
> (read-only), live dev-DB inspection (read-only), client production build,
> and full code-path audits of the feed/auth hot paths.

## TL;DR — root cause attribution

The 10–20s loads are **infrastructure-dominated, not code-dominated**:

1. **The production API runs on Render's FREE plan** (`render.yaml:4`,
   `plan: free` on `tsw-2026-march-api-prod`), despite the working assumption
   that prod was paid. Free Render web services spin down after ~15 min idle
   and take **~10–50s to cold-boot** on the next request. This matches the
   symptom (intermittent, 10–20s, worst on first visit) almost exactly.
   ⚠️ The Render dashboard can diverge from `render.yaml` — verify the actual
   plan in the dashboard before acting (see Unknowns).
2. **MongoDB Atlas M0 (free, shared)** adds: auto-pause after inactivity,
   `serverSelectionTimeoutMS: 5000` worth of first-query stall
   (`server/src/config/db.js`), high per-operation latency, and shared-cluster
   contention (dev + prod share one cluster).
3. A real but **secondary warm-path amplifier** exists in code: `game_card`
   posts are created **without** a `cardSnapshot`, so their first read runs a
   full `getPublicGame` pipeline (entire embedded `events[]` array + 3–6 DB
   round-trips) **sequentially per post** in the feed hydration loop. It
   self-heals (snapshot persisted on first read), which also matches the
   intermittency.

Everything else measured — bundle size, feed query shape, indexes, auth
middleware — is healthy at current scale.

## Measurements (evidence)

### API timing — local server → Atlas dev (warm)

| Endpoint                             | Warm time | Payload |
| ------------------------------------ | --------- | ------- |
| `GET /health`                        | ~30 ms    | —       |
| `GET /feed?limit=20` (first)         | 194 ms    | 107 kB  |
| `GET /feed?limit=20` (repeat)        | ~80 ms    | 107 kB  |
| `GET /feed/discoverable/players?q=a` | ~370 ms   | 30.5 kB |

### API timing — production `api.thesportyway.com` (measured 2026-07-12, service already warm)

| Endpoint               | Time                |
| ---------------------- | ------------------- |
| `GET /health` run 1    | 1.94 s              |
| `GET /health` runs 2–3 | ~0.47 s             |
| `GET /feed?limit=20`   | 1.27–1.45 s (74 kB) |

A true cold start was **not** observed (the service was awake). Warm prod is
~1.3 s for the feed — slow-ish (Atlas M0 + cross-region latency) but nowhere
near 10–20 s. The gap between 1.3 s warm and 10–20 s reported is exactly the
free-plan spin-up window.

### Database (Atlas dev, read-only)

- `tsw_2026_dev`: 17 collections, **382 documents, 1.7 MB data** — tiny.
  Index size (2.5 MB) exceeds data size; over-indexing is already tracked as
  OPT-007.
- `posts` by type: 55 `highlight_clip`, 5 `image`, 4 `game_card`,
  1 `player_card`, 1 `team_card`. **All 4 game_cards already carry a
  self-healed `cardSnapshot`** — confirming the read-path backfill works and
  that the N+1 cost is paid once per card, then disappears (intermittency).
- Feed list query is `Post.find({_id:{$lt:cursor}}).sort({_id:-1}).limit(n)` —
  fully served by the `_id` index. **No missing index on the feed path.**

### Client production build

Entry chunk 220 kB (60 kB gzip); `recharts` (158 kB gz), `posthog` (59 kB gz)
correctly isolated via `manualChunks` and not on the feed path; every route
except `FeedPage` (deliberately eager) is lazy. **Bundle is not the problem.**

## Code findings (file:line, ranked)

### Confirmed — warm-path amplifiers

1. **`game_card` posts never persist `cardSnapshot` at creation** —
   `feed.service.js` `createGameCardPostForUser` (~L592) and
   `autoCreateGameCardPost` (~L1057) build `gameCard` without a snapshot,
   unlike player/team cards (which snapshot at creation). First read falls
   back to `resolveGameCardPayload` (~L249) → `getPublicGame`
   (`games.service.js` ~L1342) → `findGameById` loading the **full Game doc
   including unbounded `events[]`** (`games.repository.js` ~L293, no
   `.lean()`, no `.select()`) plus team/league/shared-event lookups: **3–6
   round-trips per card**. Auto Feed Generation will create one game_card per
   finalized public-league game, making this the most common post type once
   enabled.
2. **Sequential post-hydration loop** — `feed.service.js` ~L444–457:
   `for … await sanitizePost(...)` over up to `limit+10` (30) posts. Card
   fallback latency stacks linearly; on Atlas M0 latency this multiplies.
3. **`listPosts` missing `.lean()`** — `feed.repository.js` ~L162–172; full
   Mongoose hydration for up to 30 docs per page. (Same for `findUsersByIds`
   in `auth.repository.js` ~L88.)
4. **Write inside the GET path** — snapshot self-heal fires a fire-and-forget
   `Post.updateOne` per miss (`feed.service.js` ~L300, `feed.repository.js`
   ~L229). Acceptable pattern (OPT-017), but contends for the 10-connection
   pool on a cold page full of misses.
5. **`GET /feed/discoverable/players` unbounded fan-out** —
   `feed.service.js` ~L881–959: `Team.find()` (all teams, embedded rosters,
   no `.lean()`), all public leagues, then **one query per league** and **one
   query per league team**, with the `limit || 48` slice applied only after
   all fetching. Same shape in `listShareablePlayers/Teams/Games`
   (~L738–879). Runs on `/home`; fine at 382 docs, a scaling cliff later.

### Confirmed — frontend

6. **Render-blocking Google Fonts stylesheet** — `client/index.html` ~L31–35:
   plain `<link rel="stylesheet">` to `fonts.googleapis.com` on the critical
   render path (preconnect + `display=swap` present, but the CSS fetch still
   blocks first paint).
7. **Silent-refresh round-trip on first load** — `apiClient.js` ~L65–79: an
   expired access cookie turns the first `/feed` into
   `/feed`(401) → `/auth/refresh` → `/feed` retry. Deduped across concurrent
   requests (good), but each leg pays the cold-start penalty when the server
   is asleep.
8. **No feed virtualization** — `FeedList.jsx` ~L81–97 renders every loaded
   post (mobile snap slides and desktop cards); unbounded DOM growth as pages
   accumulate. Not a first-paint issue at page size 20.

### Healthy (explicitly checked, no action)

- Client fires `/auth/me` and `/feed` **in parallel**; `/pulse` is public and
  does not wait on auth (`AuthContext.jsx`, `FeedPage.jsx`, `AppRouter.jsx`).
- `authMiddleware` is JWT-verify only (zero DB queries); `/auth/me` is one
  query; no bcrypt in the hot path.
- Middleware stack (helmet/cors/csrf/rate-limit) is cheap; rate limiter is
  in-memory (single-instance assumption already documented).
- No Cloudinary or other external network I/O in the feed read path (URL
  building is pure string work).
- Feed images carry width/height + `loading="lazy"`; no hidden export DOM
  per post.

## Hypotheses — status

| Hypothesis                                       | Verdict                                                 | Evidence                                                                        |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Render free-plan cold start dominates the 10–20s | **Confirmed (config), pending live cold-start capture** | `render.yaml:4` `plan: free` on prod API; warm prod is only ~1.3 s              |
| Atlas M0 pause/latency amplifies first requests  | **Likely**                                              | M0 tier confirmed; `serverSelectionTimeoutMS: 5000`; dev+prod share the cluster |
| Missing indexes / slow queries                   | **Refuted**                                             | 382 docs; feed query covered by `_id` index; warm feed 80 ms locally            |
| Oversized bundle / no code-splitting             | **Refuted**                                             | 60 kB gz entry; heavy libs chunked; routes lazy                                 |
| Auth bootstrap blocks the feed                   | **Refuted**                                             | Parallel requests; JWT-only middleware                                          |
| Warm-path N+1 on card posts                      | **Confirmed, secondary**                                | game_card snapshot omission + sequential loop (findings 1–2)                    |

## Unknowns / next measurements

1. **Actual Render dashboard plan for `tsw-2026-march-api-prod`** — the
   blueprint says `free`; the dashboard is authoritative. Check it. If it is
   genuinely paid (Starter+), capture Render metrics for slow requests
   instead.
2. **A true cold-start number** — hit the prod API after >15 min of
   verified idle and record `time_total` (expect 10–50 s if free).
3. **Atlas M0 prod-side metrics** — connection spikes, throttling, and
   whether the cluster auto-pauses (Atlas UI → Metrics).
4. **Real-user timing** — no RUM today; PostHog is disabled in prod
   (`VITE_ENABLE_ANALYTICS: false`), so there is no field data on how often
   users hit the cold path.
