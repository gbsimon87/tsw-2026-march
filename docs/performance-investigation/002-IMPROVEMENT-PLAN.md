# 002 — Performance Improvement Plan

> Prioritized roadmap from [`001-INVESTIGATION.md`](./001-INVESTIGATION.md).
> Task IDs `PERF-0xx`; live status in [`000-TRACKER.md`](./000-TRACKER.md).
> Where a task overlaps the existing OPT tracker
> (`docs/application-audit/000-OPTIMISATION-TRACKER.md`) it references the
> OPT item instead of duplicating it.

## Quick wins (days)

### PERF-001 — Verify & fix Render prod plan (or add keep-alive) — **Critical**

- **Evidence**: `render.yaml:4` `plan: free` on `tsw-2026-march-api-prod`;
  warm prod feed is ~1.3 s vs 10–20 s reported → the gap is spin-up.
- **Action**: check the Render dashboard's actual plan. If free, upgrade to
  Starter (~$7/mo, no spin-down) — this is the single highest-leverage fix.
  Interim/cheap alternative: an external uptime ping (e.g. UptimeRobot, 5-min
  interval) against `/api/v1/health` to keep the instance warm.
- **Complexity**: trivial (config/billing). **Impact**: removes the 10–20 s
  mode entirely for most users. **Dependencies**: none. **Risks**: keep-alive
  pings burn free-tier hours and are best-effort only.
- **Success criteria**: first request after 30 min idle < 2 s TTFB.

### PERF-002 — Persist `cardSnapshot` for game_card posts at creation — **High**

- **Evidence**: `feed.service.js` ~L592 / ~L1057 omit the snapshot player/team
  cards already persist; first read runs 3–6 sequential queries per card
  including the full `events[]`-laden Game doc.
- **Action**: build the snapshot at creation (both manual and auto paths)
  using the exact shape `resolveGameCardPayload` produces. Heed the TSW-004
  lesson (PROJECT-KNOWLEDGE §5): add a snapshot test asserting the exact key
  set matches the live-compute path.
- **Complexity**: low-medium. **Impact**: removes the dominant warm-path N+1
  for the most common (auto-generated) post type. **Dependencies**: none.
  **Risks**: snapshot-shape drift (mitigated by the key-set test);
  `refreshGameCardPostsForGame` already handles post-completion score changes.
- **Success criteria**: a fresh page of 20 never-read game_cards serves in
  roughly the same time as a snapshot-warm page (< 300 ms locally).

### PERF-003 — Parallelize the feed hydration loop — **High**

- **Evidence**: `feed.service.js` ~L444–457 sequential `await sanitizePost`.
- **Action**: `Promise.all` (or bounded concurrency ~5, respecting
  `maxPoolSize: 10`) over the fetched posts, preserving order.
- **Complexity**: low. **Impact**: turns worst-case cold-snapshot pages from
  sum-of-latencies into max-of-latencies. **Dependencies**: none (compounds
  with PERF-002). **Risks**: pool contention if unbounded — bound it.
- **Success criteria**: cold-snapshot feed page ≤ 2× warm page time.

### PERF-004 — `.lean()` + projection on feed read path — **Medium**

- **Evidence**: `feed.repository.js` ~L162 (`listPosts`),
  `auth.repository.js` ~L88 (`findUsersByIds`), and the card-fallback
  `findGameById` loading full `events[]` (`games.repository.js` ~L293).
- **Action**: `.lean()` on the two list reads; for the card fallback only,
  a `.select('-events -rosterSnapshot')`-style projection **if** the public
  game pipeline provably doesn't need those fields (verify against
  `getPublicGame`'s consumers first — events feed highlights).
- **Complexity**: low (lean) / medium (projection). **Impact**: modest now,
  compounding at scale. **Dependencies**: PERF-002 reduces urgency of the
  projection half. **Risks**: `.lean()` drops getters/virtuals — verify
  sanitizers don't rely on them.
- **Success criteria**: no behavior change (snapshot tests pass); reduced
  per-page CPU/alloc.

### PERF-005 — Make Google Fonts non-blocking — **Medium**

- **Evidence**: `client/index.html` ~L31–35 blocking stylesheet on the
  critical render path.
- **Action**: self-host the three families (best) or async-load the
  stylesheet (`media="print"` + `onload` swap with noscript fallback).
- **Complexity**: low. **Impact**: shaves one third-party round-trip off
  first paint. **Dependencies**: none. **Risks**: FOUT window (already
  mitigated by `display=swap`).
- **Success criteria**: no `fonts.googleapis.com` request blocking first
  paint in a Lighthouse/Playwright trace.

## Medium-term (weeks)

### PERF-006 — Separate prod from the shared Atlas cluster / upgrade tier — **High**

- **Evidence**: dev and prod DBs share one free M0 cluster; M0 auto-pauses,
  throttles, and `serverSelectionTimeoutMS: 5000` stalls the first query.
- **Action**: move `tsw_2026_prod` to its own cluster; Atlas Flex (~$8+/mo
  usage-based) removes auto-pause and shared throttling. Co-locate region
  with the Render service.
- **Complexity**: medium (migration + connection-string rotation + downtime
  window). **Impact**: removes the DB half of the cold-start stack and
  dev-load-hurts-prod contention. **Dependencies**: PERF-001 first (bigger
  win, cheaper). **Risks**: migration mistake — mongodump backup first,
  follow the OPT-025 prod-script playbook.
- **Success criteria**: prod feed TTFB stable < 500 ms across a week,
  including first-request-after-idle.

### PERF-007 — Bound the discoverable/shareable fan-out endpoints — **Medium**

- **Evidence**: `feed.service.js` ~L738–959 — per-league and per-league-team
  query fan-out, unbounded `Team.find()`, limit applied post-fetch.
- **Action**: batch with `$in` (all league teams in one query, all players in
  one query), add `.lean()`, push the limit into the query where possible.
- **Complexity**: medium. **Impact**: none today (382 docs), removes a known
  scaling cliff on the `/home` landing path. **Dependencies**: none.
  **Risks**: subtle ordering/filter changes — cover with integration tests.
- **Success criteria**: query count for `/feed/discoverable/players` is O(1)
  in the number of leagues/teams (≤ 4 queries total).

### PERF-008 — Real-user performance telemetry — **Medium**

- **Evidence**: no field data exists (PostHog disabled in prod); the whole
  10–20 s report is anecdotal.
- **Action**: enable PostHog in prod (infra already wired, OPT-001-style
  deferred init) or log server-side request-duration percentiles from
  pino-http; alert on p95 TTFB.
- **Complexity**: low-medium. **Impact**: converts future perf work from
  anecdote to measurement; verifies PERF-001/006 landed. **Dependencies**:
  product decision to enable analytics. **Risks**: privacy posture — the
  whitelisted-properties pattern already exists.
- **Success criteria**: p50/p95 dashboard for `/feed` TTFB and page LCP.

## Long-term / architectural

### PERF-009 — Feed list virtualization — **Low**

- **Evidence**: `FeedList.jsx` ~L81–97 renders all loaded posts; DOM grows
  unbounded with infinite scroll. Not a first-paint issue.
- **Action**: windowing (e.g. `virtua`/`react-virtuoso`) — coordinate with
  OPT-021's browser-gated frontend batch; mobile snap-scroll makes this
  non-trivial.
- **Success criteria**: DOM node count roughly constant while scrolling 10+
  pages.

### PERF-010 — Response payload slimming — **Low**

- **Evidence**: 107 kB for 20 posts (dev). Mostly card snapshots.
- **Action**: audit snapshot fields actually consumed by the client; trim
  the rest. Only worth doing after PERF-008 shows payload matters on real
  connections.

### Explicitly not proposed (already done or tracked elsewhere)

- Code-splitting, manualChunks, deferred PostHog init — done (OPT-001).
- Standings/player-stats/team-summary materialization — done (OPT-010/011/013).
- Index additions — feed path needs none; the 5 open candidates stay with
  OPT-007's `$indexStats` observation.
- Redis/caching layer — deliberately deferred (PROJECT-KNOWLEDGE §11);
  nothing measured here justifies it yet.
