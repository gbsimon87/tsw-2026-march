# Optimisation Roadmap

> Part of the [Application Audit](./README.md) · July 2026

Prioritised, actionable synthesis of the audit. Each item: what/current/
recommended/benefit/complexity/risks/files. Estimated complexity: **S** (≤1
day), **M** (2–4 days), **L** (1–2 weeks).

Note on urgency: the dataset is small today (17 games in dev), so nothing is
on fire — but the P1 items are scaling cliffs that get worse with every
tracked game, and the frontend items are felt by every user now.

---

## HIGH IMPACT

### H1. Route-level code splitting + chunking — **S/M, near-zero risk**

- **Current**: all ~40 pages statically imported in
  `client/src/app/router/AppRouter.jsx`; recharts + 3k-line tracker +
  stripe-js + posthog in one bundle; stock `vite.config.js`.
- **Recommended**: `React.lazy`/`Suspense` per route; lazy chart imports;
  `manualChunks` for recharts/posthog-js; lazy PostHog init; delete dead
  `DashboardPage.jsx`.
- **Benefit**: >50% initial-JS reduction for the default feed route; faster
  first paint for every visitor.
- **Risks**: brief suspense flashes (add skeletons); none functional.
- **Files**: `AppRouter.jsx`, `vite.config.js`, `AppProviders.jsx`,
  `GameRecapPanel`/chart imports.

### H2. Cloudinary delivery optimisation — **S/M**

- **Current**: raw `secure_url` delivery, zero transformations, 61/64 images
  unlazy, no srcset/dimensions; sync video transcode.
- **Recommended**: shared URL transformer (`f_auto,q_auto,w_*,c_limit`)
  applied in server sanitizers; `<CloudinaryImage>` component with srcset +
  `loading="lazy"` + width/height; `f_auto` on thumbnails;
  `eager_async:true`; `preload="metadata"` on feed videos.
- **Benefit**: 50–70% page-weight cut on image-heavy views; LCP/CLS
  improvements; upload latency drop.
- **Risks**: URL rewriting must only touch Cloudinary hosts; visual QA pass.
- **Files**: new `shared/cloudinaryUrl.js`, `feed.service.js`,
  `teams/leagues/auth` sanitizers, `cloudinary.client.js:61-62`, new client
  image component + ~40 call sites.
- Detail: [26](./26-cloudinary-optimisation.md).

### H3. Write-time materialisation of standings & player stats — **L, the structural fix**

- **Current**: standings O(G×E) recomputed in 4 compositions; leaders
  O(T×G×E×R) per unauthenticated request; player/team pages replay all events
  (`leagues.service.js:1647-2089`).
- **Recommended**: `Game.finalScore` + `eventCount` on completion;
  `leaguestandings` + `leagueplayerstats` collections updated by a
  post-response `recomputeLeagueAggregates(leagueId)` hook that **reuses the
  existing compute code**; reads become indexed finds with compute-on-miss
  fallback (self-backfilling, reversible).
- **Benefit**: league page cost goes from O(season events) to O(1); removes
  the top scaling risk and the public-DoS surface.
- **Risks**: dual-write bugs (mitigate: fallback path stays canonical; add
  parity tests comparing materialised vs live compute); seconds of staleness
  (acceptable).
- **Files**: `leagues.repository.js` (+2 schemas), `leagues.service.js`,
  `games.service.js` (finish/event/delete hooks), `games.repository.js`.
- Detail: [28](./28-computation-optimisation.md), sequencing steps 1–5 there.

### H4. React Query on the client — **M, incremental**

- **Current**: no cache; refetch on every mount; same league fetched by 6
  pages; full-league refetch after each admin mutation; `/auth/me` per load.
- **Recommended**: QueryClientProvider + keys per [29](./29-frontend-optimisation.md)
  §2; mutations use `setQueryData` with the already-returned authoritative
  payloads; `useInfiniteQuery` for the feed.
- **Benefit**: instant back/tab navigation, request dedup, large cut in API
  call volume (multiplies H3's effect).
- **Risks**: staleness tuning per key; migrate page-by-page to contain risk.
- **Files**: `AppProviders.jsx`, `features/*/api/*`, page components.

### H5. Kill full-collection public scans — **S/M**

- **Current**: explore/public-teams/opponents/shareable-search load ALL
  completed games (with events) or ALL teams and filter in JS
  (`teams.service.js:544-661`, `feed.service.js:500-562`).
- **Recommended**: indexed `.find().sort().limit()` with `-events` projection;
  `$in` team batch; indexed search with limit for shareable lookups.
- **Benefit**: removes O(total-games) public endpoints entirely.
- **Risks**: minimal — same response shapes.

---

## MEDIUM IMPACT

### M1. Slim the event-append hot path — **M**

`$push` instead of full-doc save; single stat pass instead of 7–10; slim delta
response; optimistic concurrency check. Benefit: tracker latency flat vs game
length; co-tracker safety. Risk: response-contract change coordinated with
GameTrackPage. Files: `games.service.js:1184-1392`, `games.repository.js`,
`GameTrackPage.jsx`. ([23](./23-api-audit.md) #4, [25](./25-performance-audit.md) P1.3)

### M2. De-duplicate intra-request loads — **S**

Fetch teams/games once per league request and pass down
(`leagues.service.js:507-716`); single game fetch on public detail; dedicated
slim paths for `/standings` and `/games` piggyback endpoints. Pure refactor.

### M3. Feed hydration batching/denormalisation — **M**

`$in` creator batch now (S); denormalise card display data at post-creation
(M). Benefit: 20-post page from ~60 queries to 1–3. Files:
`feed.service.js:266-311`, `feed.repository.js`.

### M4. Move blocking integrations off the request path — **S each**

AI summary (post-response + lock TTL + retry-on-cleared), Resend sends,
video eager transcode (H2 covers), webhook idempotency `$addToSet`. Files:
`games.service.js:1486-1505`, `email.service.js`, `billing.service.js:125-148`.

### M5. Index hygiene — **S (verify first)**

Drop `events.teamSide_1` + redundant prefixes on games/teams/leagues; add
`{leagueId,status}` (games), `{leagueTeamId,isActive}` (leagueplayers);
disable prod autoIndex. Verify with `$indexStats`. Benefit: cheaper event
appends (fewer index writes), slimmer working set.
([19](./19-indexing-strategy.md))

### M6. Pagination everywhere — **M (API+client)**

`limit`/cursor on games/teams/leagues/league-games lists, following the feed's
keyset pattern; client consumes with React Query. Prevents the next class of
unbounded responses.

### M7. GameTrackPage decomposition + memoisation — **M/L**

Split into memoised panels; memoise derived rosters; do together with M1's
optimistic updates. Benefit: responsive tracking UI on long games/low-end
devices.

### M8. HTTP caching for anonymous public GETs — **S**

`Cache-Control: public, max-age=30, stale-while-revalidate=300` on the public
routers. Instant relief for leaders/standings pre-H3; harmless after.

---

## LOW IMPACT (worthwhile hygiene)

| #   | Item                                                                                                    | Files                                   |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| L1  | Feed windowing + video unmount + throttled scroll                                                       | `FeedList.jsx`                          |
| L2  | Canvas share-card on demand                                                                             | `GameDetailPage.jsx:413+`               |
| L3  | Fix `participant.slug` schema field (kills perpetual backfill)                                          | `games.repository.js`                   |
| L4  | Consolidate duplicated stat code into `shared/statSummary.js`                                           | games/leagues/teams services            |
| L5  | Remove dead code: legacy checkout, email-verification path, unused exports, DashboardPage               | [22](./22-known-technical-debt.md)      |
| L6  | Ops: graceful shutdown, DB-ping health check, pool sizing, pinned Stripe apiVersion, login rate limiter | `server.js`, `db.js`, `health`, billing |
| L7  | Contact-form HTML escaping; analytics distinctId binding                                                | contact/analytics controllers           |
| L8  | `.lean()` on read-only queries                                                                          | repositories                            |
| L9  | Standings tie rule + `publicOnly` bug decisions                                                         | `leagues.service.js:1763, 549`          |

---

## Suggested execution order

Two parallel tracks (frontend/backend independent):

- **Frontend**: H1 → H2(client) → H4 → M7 → L1/L2
- **Backend**: H5 + M2 + M5 (quick wins) → H2(server) → H3 (steps 1–3 of
  [28](./28-computation-optimisation.md)) → M1 → M3 → M4 → M6/M8
- **Anytime**: L3–L9

Measure before/after each step: route p95 from pino logs, bundle size in CI,
web-vitals → PostHog ([25](./25-performance-audit.md) §Measurement).
