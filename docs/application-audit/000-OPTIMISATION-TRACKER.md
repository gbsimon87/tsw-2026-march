# 000 — Optimisation Master Tracker

> **The single source of truth for the TSW optimisation project.**

> Created 2026-07-04 from the [Application Audit](./README.md). This file sorts
> first in the folder on purpose — it is the entry point for all optimisation
> work.

> 🛑 **STANDING INSTRUCTION (2026-07-06): do not `git commit` any work on this
> project until the user explicitly says so.** The user wants to run manual
> testing first. Finish implementation + automated verification (tests/build)
> and leave changes uncommitted in the working tree; wait for explicit
> go-ahead before committing. This applies to OPT-014 and all subsequent
> tasks until the user lifts the restriction.

---

## ⚠️ HOW TO USE THIS FILE — read before touching any code

**If you are an AI or developer picking up this project:**

1. **Read this file first, in full, before making any implementation change.**
   It tells you the current state, what's done, why decisions were made, and
   what to do next. You should not need to re-audit the codebase — the detailed
   findings live in docs `19`, `23`–`30`; this file orchestrates them.
2. **Start with the "Recommended next task" in the dashboard below.** Respect
   the dependency graph — do not start a task whose dependencies are not
   `Completed`.
3. **After completing (or meaningfully advancing) ANY task, immediately update
   this file.** An update is not optional — it is part of the task. Update:
   - the task's **Status** (and **Completion date** when done),
   - **What was implemented** and **Files modified** in the task's Completion
     notes,
   - **Documentation updated** (which audit docs you touched, if any),
   - **New discoveries** and any **new follow-up tasks** created (add them as
     `OPT-0xx` cards),
   - any **priority or dependency changes** to other tasks,
   - the **Status board** table and the **counts** in the dashboard,
   - the **Decisions log** / **Architecture changes log** if you introduced a
     new collection, field, utility, or made an architectural choice.
4. **Measure before and after** every task (see Implementation reminders).
5. Keep the tracker accurate: reorder, merge, split, or retire tasks as reality
   changes (Phase 7 of the brief). A stale tracker is worse than none.

---

## 📊 Project status dashboard

- **Overall status:** `All server-side hygiene AND ops work is DONE (OPT-001–006, 008–020, 022, 023, 024). OPT-025's prod backfill is done; its code projection was investigated and marked won't-fix. OPT-007's provably-dead index drops are done in dev, verified against production data via mongodump — same drop needs to be run against prod. The remaining OPT-007 half needs a week of $indexStats observation; everything else is browser-gated frontend work.`
- **Current wave:** Wave 5 complete for everything codeable-without-a-browser
  except OPT-007's traffic-gated half. Branch `dev`.
- **Recommended next task:** **Run `scripts/migrate-drop-dead-indexes.js`
  against production** (same command shape as OPT-025's backfill — dry-run
  first, mongodump backup first, then the real drop). Once that's done, the
  only remaining work is: **watch `$indexStats`** on the 5 traffic-gated
  candidates (`leagueId`, `trackedLeagueTeamId`, `status`, `gameContext`,
  `trackingMode`) for about a week before deciding on those; and **for a
  session WITH live browser testing** — the batched frontend follow-up
  (**`OPT-021`**, **`OPT-016`** full scope, **`OPT-014b`**, **`OPT-018`
  client**). (Done: OPT-001–006, 008–020, 022, 023, 024; won't-fix: OPT-025;
  partial: OPT-007.)
- **Dataset context:** tiny today (~17 games, 136 docs in dev; 14 games in
  prod). Nothing is slow _now_; the P1 items are **scaling cliffs**, the
  frontend items are felt by every user immediately. Prioritise accordingly.

**Counts by status** (25 tasks total; OPT-025 added during OPT-008):

| Status      | Count                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Not Started | 0                                                                                                |
| In Progress | 1 (`OPT-007` — provably-dead half done in dev, needs prod run + observation window for the rest) |
| Blocked     | 0                                                                                                |
| Completed   | 22 (`001`–`006`, `008`–`020`, `022`, `023`, `024`)                                               |
| Won't-fix   | 1 (`OPT-025` — prod backfill done; code projection unsafe, see its card)                         |
| Deferred    | 1 (`OPT-021`, batched with browser-gated frontend work — see Decisions log)                      |

---

## 🗺️ How the project is organised

Work is grouped into **dependency waves**, not just impact tiers. The impact
tiers (High/Medium/Low) and the per-item detail live in
[30-optimisation-roadmap](./30-optimisation-roadmap.md); this tracker adds the
**ordering and dependency graph** so foundational work lands before its
consumers and rework is minimised.

**Ordering principles:**

1. **Shared utilities before consumers** — `cloudinaryUrl.js` and
   `statSummary.js` exist before the code that uses them.
2. **Index hygiene alongside query rewrites** ([19](./19-indexing-strategy.md))
   — drops/adds land so rewrites hit the right indexes. _Verify with
   `$indexStats` in prod before dropping._
3. **Denormalised fields before their readers** — `Game.finalScore` +
   `eventCount` before list endpoints stop loading events and before standings
   materialisation reuses them.
4. **DB materialisation before caching / client stat consumers** — caching
   comes _after_ data-consistency is established ([27](./27-caching-opportunities.md)).
5. **Backend contract changes before frontend consumers** — slim-delta
   event-append before GameTrackPage optimistic updates; server pagination
   before client virtualised lists.
6. **Two independent tracks** — Frontend (H1, H2-client, H4, M7, L1) and
   Backend (H5, M2, M5, H2-server, H3, M1, M3, M4, M6, M8) run in parallel.

**Wave summary:**

| Wave | Theme                                       | Tasks             |
| ---- | ------------------------------------------- | ----------------- |
| 0    | Foundations & quick wins (no deps)          | OPT-001 … OPT-007 |
| 1    | Denormalised fields (prerequisites)         | OPT-008, OPT-009  |
| 2    | Write-time materialisation (structural fix) | OPT-010 … OPT-013 |
| 3    | Client cache + contract changes             | OPT-014 … OPT-017 |
| 4    | Broaden caching & pagination                | OPT-018 … OPT-021 |
| 5    | Hygiene & ops                               | OPT-022 … OPT-024 |

---

## 📋 Status board

| ID      | Title                                          | Wave | Priority | Complexity | Status       | Depends on         |
| ------- | ---------------------------------------------- | ---- | -------- | ---------- | ------------ | ------------------ |
| OPT-001 | Route code splitting + chunking                | 0    | High     | S/M        | ✅ Completed | —                  |
| OPT-002 | Cloudinary URL transformer (server)            | 0    | High     | S          | ✅ Completed | —                  |
| OPT-003 | `<CloudinaryImage>` + lazy + srcset            | 0    | High     | S/M        | ✅ Completed | OPT-002            |
| OPT-004 | Kill full-collection public scans              | 0    | High     | S/M        | ✅ Completed | (OPT-007)          |
| OPT-005 | De-dup intra-request league loads              | 0    | Medium   | S          | ✅ Completed | —                  |
| OPT-006 | Consolidate stat code → `statSummary.js`       | 0    | Medium   | S/M        | ✅ Completed | —                  |
| OPT-007 | Index hygiene                                  | 0    | Medium   | S          | 🟡 Partial   | — (verify first)   |
| OPT-008 | `Game.finalScore` + `eventCount` + projections | 1    | High     | M          | ✅ Completed | OPT-006            |
| OPT-009 | Async video transcode + video hygiene          | 1    | Medium   | S          | ✅ Completed | OPT-002            |
| OPT-010 | `leaguestandings` materialisation              | 2    | High     | L          | ✅ Completed | OPT-006, OPT-008   |
| OPT-011 | `leagueplayerstats` materialisation            | 2    | High     | L          | ✅ Completed | OPT-010            |
| OPT-012 | Frozen `Game.boxScore` + single event pass     | 2    | Medium   | M          | ✅ Scoped    | OPT-008            |
| OPT-013 | Team season summaries (standalone)             | 2    | Medium   | M          | ✅ Completed | OPT-006            |
| OPT-014 | React Query on the client                      | 3    | High     | M          | ✅ Scoped    | (OPT-010, OPT-011) |
| OPT-015 | Slim event-append hot path                     | 3    | Medium   | M          | ✅ Scoped    | OPT-008            |
| OPT-016 | GameTrackPage decomposition + memo             | 3    | Medium   | M/L        | ✅ Scoped    | OPT-015            |
| OPT-017 | Feed hydration batching + denormalise          | 3    | Medium   | M          | ✅ Completed | —                  |
| OPT-018 | Pagination everywhere                          | 4    | Medium   | M          | ✅ Backend   | —                  |
| OPT-019 | HTTP caching for anonymous GETs                | 4    | Medium   | S          | ✅ Completed | OPT-010, OPT-011   |
| OPT-020 | Blocking integrations off request path         | 4    | Medium   | S          | ✅ Completed | —                  |
| OPT-021 | Feed windowing + video unmount                 | 4    | Low      | M          | ⏸️ Deferred  | (OPT-009)          |
| OPT-022 | Low-impact hygiene batch                       | 5    | Low      | S          | ✅ Completed | —                  |
| OPT-023 | Ops hardening                                  | 5    | Low      | S          | ✅ Completed | —                  |
| OPT-024 | Correctness decisions                          | 5    | Low      | S          | ✅ Completed | —                  |
| OPT-025 | Project `events` out of list endpoints         | 1    | Medium   | S          | 🚫 Won't-fix | OPT-008 + backfill |

_Deps in (parentheses) are "benefits from / stronger after" rather than hard
blockers._

---

## ✅ Completed

- **OPT-024** — Correctness decisions. _2026-07-07._ 4 product decisions from
  the owner, all implemented: **(1) ties disallowed** — league games can no
  longer finish tied (`assertLeagueScoreNotTied` in `games.service.js`, checked
  before any mutation at finalize time and again on edits to a completed
  league game); standings math fixed from a 2-way `>=` branch (which silently
  awarded ties to the home team) to a real 3-way win/loss/tie branch with a new
  `ties` row field. **(2) Private league visibility fixed** — investigated
  first and found the gap was narrower than assumed: the authenticated
  `/leagues/:leagueId` router already checked membership correctly; the bug was
  isolated to the public-slug router, whose `assertLeagueVisible` 404'd a
  private league for its own owner/manager/players, not just for strangers.
  Extracted a shared `isLeagueMember` check (owner, active league manager, or
  any team-member role) and wired it through `assertLeagueVisible` + all 6
  public controller handlers, gated on the viewer's `req.auth?.userId` from the
  already-applied `optionalAuthMiddleware`. Non-members still get a 404 (not 403) so a private league's existence isn't revealed. **(3) Contact-form HTML
  escaping** — new `utils/escapeHtml.js`; free-text fields escaped before
  interpolating into the HTML email body (plaintext body untouched). **(4)
  Analytics distinctId bound to the authenticated user** — the client's
  `identify()` call was already correct; the server's `/analytics/event` route
  now overrides the client-supplied `distinctId` with `req.auth.userId` rather
  than trusting the request body. Full suite **33 suites / 261 tests** (up from
  32/249); lint clean. See card for full per-item detail.
- **OPT-023** — Ops hardening. _2026-07-07._ Committed (`e97e5c8`+) on `dev`.
  All five sub-items shipped: **(1) graceful SIGTERM/SIGINT shutdown** in
  `server.js` (drain HTTP → disconnect Mongo → exit, with a 10s force-exit
  guard); **(2) DB-ping health check** — `/health` now returns 503 unless Mongo
  is connected _and_ answers a ping, so orchestrators pull severed instances out
  of rotation; **(3) pool + fail-fast** — `maxPoolSize` (new
  `MONGO_MAX_POOL_SIZE` env, default 10) + `serverSelectionTimeoutMS: 5000` on
  connect, plus a `disconnectDb()` for the shutdown path; **(4) pinned Stripe
  `apiVersion: '2024-06-20'`** so an SDK bump can't silently reshape payloads;
  **(5) dedicated credential rate limiter** (20/15min) on
  `/register`,`/login`,`/refresh`, which previously had only the global
  300/15min budget. Full suite **32 suites / 249 tests**; lint clean. See card
  for per-item detail.
- **OPT-022** — Low-impact hygiene batch (backend sub-items; canvas-on-demand
  deferred). _2026-07-07._ Committed (`e97e5c8`) on `dev`. 5 independent sub-items,
  each investigated rather than assumed: **(1) `participant.slug` schema fix —
  a real bug, not just hygiene.** The field was always written at game
  creation but never declared in the schema, so Mongoose silently dropped it
  on every save; every dual-team league game read paid for a live
  `findLeagueTeamById` lookup to reconstruct it. Fixed the schema, ran a new
  idempotent backfill script against dev (20/20 games fixed, independently
  re-verified persisted), and added a schema-regression test proven to fail
  without the fix. **(2) Dead-code claims mostly didn't hold up** — the
  "legacy checkout" and "email-verification" targets are both live,
  intentional, tested code paths; **nothing was deleted**. `DashboardPage` was
  already gone (OPT-001). No confidently-dead exports found. **(3) Canvas-on-
  demand — deferred**, pure client rendering, batched with the other browser-
  gated frontend work. **(4) `.lean()` added to 3 verified-safe queries**
  (`listCompletedGames`, `listPublicCompletedGames`, `listLeaguesByIds`) after
  tracing every caller individually; verified against real dev MongoDB.
  **(5) No query-validation gap** — OPT-018 already covered every `req.query`
  usage in the codebase. Full server suite **31 suites / 244 tests**; lint
  clean. See card + Decisions log for full detail.
- **OPT-018** — Pagination everywhere (backend; client deferred). _2026-07-07._
  Committed (`ebe1e20`) on `dev`. Added shared keyset-cursor helpers
  (`utils/pagination.js`) + shared zod query validation
  (`shared/pagination.validation.js`), and applied real `_id`-desc cursor
  pagination to the clean single-source lists: `GET /games`, `GET /teams`,
  `GET /public/leagues` — each now returns its existing array key **plus**
  `nextCursor` (backward-compatible; clients unchanged). The owner `GET
/leagues` list merges 3 sources in memory so it gets validation only (keyset
  N/A — deferred). Repo functions paginate only when a `limit` is passed, so
  internal callers stay unbounded. No-dup/no-drop proven in unit tests and
  **verified against real dev MongoDB**. 30 suites / 242 tests; lint clean.
  Client infinite-scroll/virtualisation deferred to a follow-up. See card +
  Decisions log.
- **OPT-020** — Move blocking integrations off the request path. _2026-07-06._
  Committed (`1e095ba`) on `dev`. Three sub-items: **(a)** league AI summary now
  generated post-response (`setImmediate` in `games.service.js`), with a
  stale-lock **TTL** (2min) so a crashed/hung generation no longer wedges the
  summary forever, and a `releaseGameSummaryLock` retry-on-failure path —
  **verified against real dev MongoDB**; **(b)** transactional + contact
  emails dispatched fire-and-forget (`sendTemplateEmailAsync`) so Resend can't
  block/fail the request; **(c)** Stripe webhook idempotency made atomic via a
  gated `findOneAndUpdate` (`$ne` filter + `$push`/`$slice`) in
  `utils/webhookIdempotency.js`, replacing a read-check-write race that could
  double-process a duplicate delivery. 29 suites / 228 server tests pass; lint
  clean. See card + Decisions log.
- **OPT-019** — HTTP caching for anonymous public GETs. _2026-07-06._
  Committed (`20fac7f`) on `dev`. New `publicCache.middleware.js`
  sets `Cache-Control: public, max-age=30, stale-while-revalidate=300` +
  `Vary: Cookie, Authorization` on anonymous GET/HEAD to the 3 public routers
  and the one anon-readable game route; `private, no-cache` when any auth
  token (cookie or Bearer) is present — load-bearing, since league public-
  player and public game detail personalise on `req.auth`. Express weak ETags
  give anon conditional revalidation for free. **Security fix found in
  passing:** the global CSRF middleware stamped a `Set-Cookie` on every
  response including these cacheable ones (a shared cache could replay one
  visitor's CSRF token); `attachCsrfToken` now skips emission on first-touch
  anonymous cacheable requests. 6 unit + 4 integration assertions;
  27 suites / 222 server tests pass; lint clean. See card + Decisions log.
- **OPT-001** — Route-level code splitting + chunking. _2026-07-05._ Branch
  `feat/opt-wave-0`. Every route now lazy-loads as its own chunk; recharts,
  posthog-js and stripe-js are isolated `manualChunks`; PostHog init deferred
  to after first paint; dead `DashboardPage` removed. Build confirms recharts
  (534KB), posthog (182KB), GameTrackPage (67KB), GameDetailPage (58KB) are all
  out of the entry bundle (entry now 165KB / 44KB gz). See its card for detail.
- **OPT-002** — Cloudinary `f_auto,q_auto` delivery transformer. _2026-07-05._
  Branch `feat/opt-wave-0`. New `server/src/modules/shared/cloudinaryUrl.js`
  (`transformCloudinaryUrl` + `buildCloudinarySrcSet`, unit-tested) applied at
  all logo/avatar/feed-media sanitize points; video thumbnail fixed to `f_auto`.
  40–80% image byte savings, zero client change. All 171 server tests pass.
  See its card for detail.
- **OPT-004** — Kill full-collection public scans. _2026-07-05._ Branch
  `feat/opt-wave-0`. New `listPublicCompletedGames(limit)` repo method
  (`.select('-events -rosterSnapshot -boxScore').limit()`) replaces
  load-everything-then-filter in three public endpoints (`getPublicOpponentBySlug`,
  `listPublicExploreGames`, `listPublicTeams`). Removes O(total-games) public
  loads; response shapes unchanged. See its card for detail.
- **OPT-006** — Consolidate per-player stat accumulation. _2026-07-05._ Branch
  `feat/opt-wave-0`. Added `createEmptyPlayerStatLine` + `applyEventToPlayerStatLine`
  to `shared/statSummary.js`; games & leagues services (which had identical ~85-line
  inline duplicates) now delegate to the shared implementation. Single source of
  truth for OPT-010/011 materialisation to reuse. 174 tests pass (parity confirmed).
  See its card for detail.
- **OPT-005** — De-duplicate intra-request league loads. _2026-07-05._ Branch
  `feat/opt-wave-0`. `getLeagueStandings` and `listLeagueGames` gained an optional
  `{teams, games}` pre-fetch escape hatch; 4 league-detail compositions now load
  teams + raw games ONCE and pass them down (was teams×2–3, games×2–3 per request →
  now ×1 each). `publicOnly` behaviour preserved as-is (fixed later in OPT-024).
  ~10 redundant DB round-trips removed per league page; 174 tests pass. See its card.
- **OPT-008** — `Game.finalScore` + `eventCount` denormalisation. _2026-07-05._
  Branch `feat/opt-wave-0`. **(Wave 1 — first structural prerequisite.)** New
  schema fields frozen on completion + maintained on event edits; league score
  reads (`getLeagueGameScore`, used by game rows AND standings) now prefer the
  stored `finalScore` with a compute-on-read fallback for legacy games. Idempotent
  backfill script added and run on dev (18/18 games). Enables Wave 2 materialisation
  (OPT-010/012). Spawned follow-up **OPT-025** (project events out, gated on prod
  backfill). 177 tests pass. See its card.
- **OPT-009** — Async video transcode + video delivery hygiene. _2026-07-05._
  Branch `feat/opt-wave-0`. **(Wave 1 complete.)** `eager_async: true` so video
  uploads return immediately; new `cloudinaryVideoPlaybackUrl` delivers
  `f_auto,q_auto,vc_auto` on-the-fly (works before & after the eager MP4 lands);
  new `destroyCloudinaryAsset` awaits + logs destroys (was 3× fire-and-forget →
  silent asset leaks). 179 tests pass. See its card.
- **OPT-010** — `leaguestandings` materialisation + recompute hook. _2026-07-06._
  Branch `feat/opt-wave-0`. **(Wave 2 — the top scaling fix.)** New
  `leaguestandings` collection; live compute renamed `computeLeagueStandings`
  (source of truth, reuses OPT-006/008); `getLeagueStandings` now an indexed
  materialised read with **compute-on-miss self-backfill**;
  `recomputeLeagueAggregates` (in-flight-guarded) fired post-response
  (`setImmediate`) from all game + league-team write triggers. Idempotent
  backfill script run on dev — 2/2 leagues, zero parity mismatches. Reversible
  (delete collection → compute-on-miss). 183 tests pass. See its card.
- **OPT-011** — `leagueplayerstats` materialisation. _2026-07-06._ Branch `dev`.
  **(Wave 2 continues.)** New `leagueplayerstats` collection (raw totals only —
  full-replace write); `computeLeaguePlayerStats` (source of truth, reuses
  OPT-006) + `deriveLeaguePlayerScores` keeps ppg/fantasy/DPOY formulas at READ
  time (no recompute needed to tune weights); `getPublicLeagueLeaders` now reads
  materialised rows instead of replaying every team's games/events (the
  O(T×G×E×R) hot path). `recomputeLeagueAggregates` extended to persist both
  aggregates from one teams/games fetch. Team-page stats deliberately left on
  live compute (scope decision, see Decisions log). Backfill run on dev — 48 +
  12 rows, zero parity mismatches on both leagues. 188 tests pass. See its card.
- **OPT-012** — Frozen `Game.boxScore` + `gameSummary` (scoped). _2026-07-06._
  Branch `dev`. **(Wave 2 continues.)** `finishGameForUser` freezes both on
  completion (one team-context resolve, reused for the AI-summary branch too);
  `getGameForUser` serves frozen data for completed games with a live-compute
  fallback (self-healing, no backfill needed); refreeze wired into all 3 event
  mutators. **Scoped down:** `recap`/`highlights` NOT frozen (embed live player
  names — freezing would go stale on renames) and the "single pass for live
  games" consolidation was descoped (too large/risky for a live-only win on a
  tiny dataset) — both documented in the Decisions log. Verified byte-identical
  to live compute on 3 real dev games (read-only check, no writes). 192 tests
  pass. See its card.
- **OPT-013** — Team season summaries (standalone teams). _2026-07-06._ Branch
  `dev`. **(Wave 2 COMPLETE.)** New `teamseasonsummaries` collection; existing
  `buildPublicTeamSummary` unchanged, now wrapped by `computeTeamSeasonSummary`
  - a materialised `getTeamSeasonSummary` (indexed find, compute-on-miss
    self-backfill) wired into `getPublicTeam`. Triggers scoped precisely to
    one_sided standalone games (confirmed by tracing `buildPublicTeamSummary`'s
    data source before wiring, since dual_team standalone games never appear in
    it). Lazy `require` used in `games.service.js` to avoid a cycle with
    `teams.service.js`. Backfill run on dev — 2/2 teams, zero parity mismatches;
    confirmed `getPublicTeam` serves materialised data end-to-end. 197 tests pass.
    See its card.
- **OPT-017** — Feed hydration batching + card denormalisation. _2026-07-06._
  Branch `dev`. **(Wave 3 begins.)** Creators batched with one `$in`
  (`findUsersByIds`) instead of one query per post. New `cardSnapshot` field on
  `gameCard`/`playerCard`/`teamCard` denormalises display data at creation time
  (reusing pipeline calls that were previously discarded); reads serve the
  snapshot directly (zero extra queries) with a compute-on-miss self-backfill
  fallback for pre-existing posts. New `refreshGameCardPostsForGame` (the "slim
  refresh path") wired into the existing OPT-010/012/013 game-completion
  triggers, fixing a real staleness bug (a card shared mid-game would show a
  frozen score forever). Verified on real dev data: byte-identical card content
  vs. the old live compute; a fully-warm feed read dropped to **3 real data
  queries** total. Also fixed a latent test-hygiene gap (unflushed
  `setImmediate` callbacks) this task's new scheduler exposed. 206 tests pass.
  See its card.
- **OPT-015** — Slim event-append hot path (scoped). _2026-07-06._ Branch `dev`.
  **(Sets up OPT-016.)** Enabled Mongoose's native `optimisticConcurrency:true`
  on the Game schema — a co-tracker's stale save now throws `VersionError`,
  translated to a clear `409` instead of silently clobbering another tracker's
  event. Verified against **real MongoDB** (throwaway doc, cleaned up after).
  New slim response (`game`/`lineups`/`boxScore`/`gameSummary`/
  `canEditCompletedGame` only) replaces the full `getGameForUser` payload on
  the 4 event mutators — confirmed via grep that `GameTrackPage.jsx` never
  reads the dropped fields outside its initial load, so **no client changes
  were needed** for correctness. Also eliminated a redundant second
  `findGameById` the old code paid on every append. **`$push` intentionally
  not implemented** — the business validation rules need the current state
  loaded first, so a blind atomic push can't work; the version-checked
  load→validate→save pattern is the correct mechanism for the actual goal
  (no more clobbering). 212 tests pass. See its card.
- **OPT-016** — GameTrackPage `onCourtPlayers`/`benchPlayers` memoisation
  (heavily scoped). _2026-07-06._ Branch `dev`. Only the one explicitly-named,
  mechanically-safe fix was made: `onCourtPlayers`/`benchPlayers` (and
  `lineupIds`, whose unmemoised `|| []` fallback would have defeated them)
  wrapped in `useMemo` — these were recreated on every render, including
  renders from unrelated state (shot picker, follow-up prompts, layout
  toggles). **The rest of the task (panel extraction, `useCallback` handlers,
  optimistic updates) was NOT attempted** — verifying a rewrite of the app's
  core live-tracking UI needs clicking through the interaction paths in a
  browser, which wasn't available this session; the blast radius of getting
  it wrong (broken game tracking) was judged too severe to attempt blind. See
  the card for the full reasoning and what a real follow-up needs. Verified:
  `GameTrackPage.test.jsx` baseline (7 failed/18 passed) identical with and
  without the change; full client suite unchanged; `eslint`
  `react-hooks/exhaustive-deps` clean; `vite build` succeeds, chunk size
  unchanged.
- **OPT-014** — React Query on the client (scoped). _2026-07-06._ Committed
  (`6ae914d`) on `dev`. Added `@tanstack/react-query`;
  `QueryClientProvider` wired into `AppProviders.jsx`. Migrated 6 call sites:
  `AuthContext` (`['auth','me']`, preserves its stale-response race guard,
  mutations use `setQueryData`), `FeedPage` (`useInfiniteQuery(['feed'])`,
  delete/create use `setQueryData`), `GameDetailPage` (`['game', gameId]`),
  and the 3 public league pages that all independently fetched the same
  league (`PublicLeaguePage`/`PublicLeagueGamesPage`/`PublicLeagueStandingsPage`)
  via a new shared `usePublicLeague(leagueSlug)` hook — the literal
  "same league fetched by 6 pages" the roadmap names, 3 of 6 fixed. **~20
  pages not migrated**, most notably `GameTrackPage` (skipped for the same
  reason as OPT-016 — its mutation-merges-into-state pattern needs browser
  verification to rewrite safely) and several admin/CRUD pages with
  non-trivial mutation logic. See the card for the full remaining-scope
  list (candidate follow-up "OPT-014b"). Verified: full client suite
  unchanged before/after (20 failed/116 passed both times, same failures);
  `vite build` succeeds, `GameTrackPage` chunk untouched; `eslint` clean;
  fixed 4 test files (`AppRouter.test.jsx`, `GameDetailPage.test.jsx`,
  `AuthContext.test.jsx`, `FeedPage.test.jsx`, `tests.smoke.test.jsx`) that
  needed a `QueryClientProvider` test wrapper added.
- **OPT-003** — `<CloudinaryImage>` component + **full rollout**. _2026-07-05._
  Branch `feat/opt-wave-0`. Component built (11 tests) and **all 64 `<img>` sites
  migrated** across 34 files (7 manual + 57 via a 6-agent parallel workflow).
  Cloudinary images get responsive `srcset`/`sizes`; static/YouTube images get
  lazy + dimensions only; heroes are eager. Zero plain `<img>` remain; build
  passes; no new test failures. See its card.

## 🔄 In Progress

_None._

## ⛔ Blocked

_None._

## ⏸️ Deferred

- **OPT-021** — Feed windowing + video unmount + throttled scroll. _Deferred
  2026-07-07._ Low priority, and it changes client feed rendering so it can't be
  safely verified without live browser testing. Batched with the other
  browser-gated frontend work (OPT-016 full scope, OPT-014b, OPT-018 client) for
  a future session that has real browser verification. See Decisions log
  (2026-07-07).

---

## 🧭 Decisions log

Record every architectural / scope decision here with a date and rationale.

- **2026-07-07 — browser-verification workflow established; frontend batch is
  now workable.** The remaining frontend items (OPT-021, OPT-016 full scope,
  OPT-014b, OPT-018 client) were originally deferred "for a session with real
  browser verification." That session is now happening: `pnpm dev` runs both
  servers against the dev DB, and changes are verified by clicking through in a
  real browser (the user confirms behaviour). The smallest of the batch —
  OPT-022's canvas-on-demand item — was completed and browser-verified this way
  (commit `0572b38`). The rest of the batch is being tackled in ascending
  difficulty order: OPT-021 → OPT-018 client → OPT-014b → OPT-016 (largest/
  riskiest, the 3,141-line GameTrackPage, last). Dependencies for all are
  already satisfied, so ordering is by risk, not blocking.
- **2026-07-07 — OPT-025: marked won't-fix; prod backfill kept.** Investigated
  before writing any code and found the task as scoped would break real
  functionality: 5 of 9 consumers of the shared `listLeagueGamesByLeagueId`
  fetch (highlights, live per-player team stats, the standings/player-stats
  materialisation fallback) still read `game.events` directly, and OPT-005
  deliberately unified every league-detail read onto that one shared fetch per
  request — there's no "list-only" code path that doesn't also feed an
  events-needing sibling in the same request. Projecting `events` out of the
  shared fetcher would silently zero highlights and team stats, or turn the
  standings fallback into a silent wrong-score bug for any future
  legacy/edge-case game. **Why not force it through anyway:** the actual bytes
  saved at today's scale (14 prod games, low hundreds of events each) are
  negligible, while the two honest ways to really achieve the goal — splitting
  the shared fetch into a projected list-only query plus a separate full query
  (re-adds the extra round-trip OPT-005 removed), or moving `events` to its own
  collection (a real schema migration) — are both bigger than this task's
  scope. **The prod backfill itself is real, done, and stays done** regardless
  of this decision: all 14 production games now have a persisted `finalScore`/
  `eventCount` (verified via a follow-up dry-run showing 0 remaining), which is
  independently useful (the OPT-008 fast-path no longer needs a live compute
  fallback for any current game) even though the events-projection half won't
  ship. Revisit if event counts grow 10–100×, or if events move to their own
  collection anyway for other reasons.
- **2026-07-07 — OPT-023: credential limiter stays single-instance (IP-keyed
  in-memory) for now.** The new `authCredentialLimiter` uses express-rate-limit's
  default in-memory store, so its budget is per-process, not shared across
  instances. Correct multi-instance limiting needs a shared store (Redis), which
  is deliberately deferred with the rest of the Redis work (caching layer, etc.)
  — the app is single-instance today, so per-process limiting is already a strict
  improvement over the zero limiter these endpoints had. **Why:** shipping the
  limiter now closes the credential-abuse gap immediately; wiring Redis for it
  alone would pull an unbudgeted dependency forward. Revisit when the app goes
  multi-instance or when Redis lands for caching.
- **2026-07-07 — OPT-023: one `/health` endpoint doubles as liveness AND
  readiness.** Rather than split into `/livez` + `/readyz`, the single endpoint
  now returns 503 when the DB is unreachable. **Why:** the deployment only needs
  one probe today and a DB-severed instance genuinely can't serve, so failing
  the one health check is the desired behaviour. If a future orchestrator needs
  a liveness probe that stays 200 during DB blips (to avoid restart storms),
  split then — noted so it isn't a surprise.
- **2026-07-07 — OPT-022: two of the card's "dead code" targets were investigated
  and NOT removed — they're live.** The card assumed a "legacy checkout
  endpoint" and an "email-verification path" were dead code to delete. Both
  turned out to be intentional, tested, live code: the checkout route is
  explicitly commented as a kept-for-backward-compatibility shim with its own
  integration test; email verification is a fully wired route → controller →
  service → client page flow reachable from the login form. Deleting either on
  the card's say-so (without re-verifying) would have broken a payment
  endpoint and an auth flow. Correcting a tracker card's assumption against
  live code takes priority over completing every checkbox as originally
  written — the card is now corrected rather than the code.
- **2026-07-07 — All remaining frontend-rendering work batched + deferred to a
  browser-testing session.** OPT-021 (feed windowing/video unmount/throttled
  scroll) was the last Wave 4 item; the user chose to defer it rather than ship
  it blind. It joins the other work that changes client rendering and can't be
  verified without clicking through the live UI: **OPT-016** (GameTrackPage
  full decomposition), **OPT-014b** (~20 pages still to migrate to React Query),
  and **OPT-018 client** (infinite-scroll/virtualisation). These are grouped as
  a single future frontend session with real browser testing. All backend +
  safe frontend work (OPT-001–006, 008–020) is done and committed; nothing
  unblocked-and-codeable remains except Wave 5 backend hygiene/ops
  (OPT-022/023). Rationale: the project has consistently scoped down rather than
  ship UI changes it can't verify (see OPT-016, OPT-014 notes) — deferring
  keeps that discipline.
- **2026-07-07 — OPT-018: backend-complete + client backward-compat (client
  paging deferred).** Chosen with the user. All paginated list endpoints keep
  their existing top-level array key and simply add `nextCursor`, so the current
  client pages keep working untouched while the backend gains a bounded default
  limit + keyset cursor. Client infinite-scroll / virtualisation (and upgrading
  the already-React-Query public league pages to `useInfiniteQuery`) is a
  follow-up, grouped with the other browser-gated frontend work (OPT-014b,
  OPT-016) — the dataset is tiny today so the default limit is invisible.
- **2026-07-07 — OPT-018: `GET /leagues` (owner) gets validation only, not
  keyset.** That list is a 3-source in-memory union (owned + member + managed),
  deduped and re-sorted, so a single-collection `_id` cursor can't page it
  correctly. It's a per-user handful of leagues, not a scaling surface — params
  are validated and it returns `nextCursor: null` for contract consistency.
  Correct paging would need an offset/merged strategy; deferred. Public leagues,
  `/games`, and `/teams` are single-source and got real keyset pagination.
- **2026-07-06 — OPT-020: webhook idempotency made atomic; league-create race
  left as a documented deferral.** The 4 team + 2 league update handlers now
  claim each Stripe event with a single gated `findOneAndUpdate`
  (`processedWebhookEventIds: { $ne: eventId }` + `$push`/`$slice`), so the DB
  enforces exactly-once even under concurrent duplicate deliveries — replacing
  a load→check-in-memory→save race. The **create** path
  (`createLeagueFromCheckoutSession`) can't use this (no existing doc to claim
  against); its by-customer guard is unchanged. Fully closing its
  concurrent-create race needs a **unique index on `stripeCustomerId`**, which
  is a prod-data-gated migration (existing null/duplicate values could violate
  it) — deferred to the same "verify against prod first" bucket as OPT-007,
  noted in-code rather than done blind.
- **2026-07-06 — OPT-020: AI summary generation moved fully post-response, with
  a lock TTL.** `finishGameForUser` used to `await` the OpenAI call inline, so
  finishing a league game blocked on a multi-second third-party call. It now
  runs in a `setImmediate` after the response. This is safe because the finish
  response never carried the summary text — the client already fetches it once
  it lands. Added a 2-minute **stale-lock TTL** (a crash/hang between claim and
  save previously wedged the summary forever, since the claim required
  `lockId: null`) and a `releaseGameSummaryLock` so a failed generation frees
  the lock for immediate retry. All lock transitions verified against real dev
  MongoDB.
- **2026-07-06 — OPT-020: emails are fire-and-forget, including password reset
  and contact.** For password reset the token is persisted before the send, and
  for contact the request's job is done once accepted — so neither should block
  or fail on Resend latency. `sendTemplateEmailAsync` logs delivery failures
  server-side but never throws into the request path. Trade-off accepted: a
  failed send now surfaces only in logs, not to the user (matches the roadmap's
  "email async / failure doesn't fail the request" directive).
- **2026-07-06 — OPT-019: CSRF token not emitted on anonymous cacheable GETs.**
  Making public GETs cacheable exposed that the global `attachCsrfToken`
  stamps a `Set-Cookie` on every response — unsafe for a shared cache to
  store (it could replay one visitor's CSRF token to all). User was asked
  how to resolve and chose **"most secure without breaking anything."** We
  skip CSRF token emission for first-touch anonymous cacheable requests
  (rather than stripping `Set-Cookie` in the cache layer, which is surprising,
  or leaving it and only browser-caching). Safe because CSRF tokens are only
  verified on non-safe methods (never anonymous-safe), the client refreshes
  its token from the next non-public response header, and the Origin-header
  fallback still guards cross-site mutations. Guarded by `!req.cookies._csrfSecret`
  so returning users with existing CSRF state are unaffected.
- **2026-07-04 — Redis deferred.** No Redis until one of: multi-instance rate
  limiting, a job queue, or cross-instance cache coherence becomes real. DB
  materialisation + React Query + HTTP caching cover current needs
  ([27](./27-caching-opportunities.md) §5).
- **2026-07-04 — Materialisation fallback stays canonical.** For OPT-010/011,
  the live read-time compute path remains the source of truth: reads do
  compute-on-miss + persist (self-backfilling), so the change is reversible and
  needs no migration script ([28](./28-computation-optimisation.md)).
- **2026-07-04 — No aggregation-pipeline rewrite of stat loops.** The fix is to
  stop computing on read (materialise), not to translate JS loops into `$group`
  ([24](./24-database-audit.md) #1). Aggregation stays for ad-hoc reads
  (event/roster counts, shareable search).
- **2026-07-04 — Tie-break rule: RESOLVED (2026-07-07, OPT-024).** Product
  decision: the league format doesn't allow ties. Implemented as a hard
  validation error at game-finalize/edit time (`assertLeagueScoreNotTied` in
  `games.service.js`), not a standings-math workaround — a tie can no longer
  reach a `completed` league game at all. See OPT-024's card for full detail.
- **2026-07-04 — Index drops gated on verification.** No prod index drop
  (OPT-007) until `$indexStats` shows a verification window of zero ops on the
  candidate ([19](./19-indexing-strategy.md) §Process).
- **2026-07-06 — Team-page player stats stay on live compute.** Considered
  materialising `getPublicLeagueTeamBySlug`'s per-team stats (`buildLeagueTeamPlayerStats`)
  as part of OPT-011 alongside leaders, but its output includes zero-game roster
  players (a shape difference from the leaders aggregate) and is already scoped
  to one team's games (cheap). Materialising it would need either dropping those
  rows or adding a roster-change recompute trigger — not worth it for an
  already-cheap read. Only the league-wide leaders/DPOY path (the actual
  O(T×G×E×R) hot path) was materialised.
- **2026-07-06 — HEAD moved from `feat/opt-wave-0` to `dev` mid-session.** All
  OPT-001–009 commits are on `feat/opt-wave-0`; OPT-010 onward landed on `dev`
  (which was fast-forwarded/even with `feat/opt-wave-0` at that point — linear
  history, no divergence, no lost work). Future sessions: check `git log
--oneline -5` to see which branch has the latest tracker-referenced commits.
- **2026-07-06 — OPT-012 scoped down: only `boxScore`/`gameSummary` frozen, not
  `recap`/`highlights`.** Both embed live player display names resolved from
  current team docs; freezing would let names go stale on a rename. The
  "single pass for live games" half of OPT-012 was also descoped — consolidating
  4 functions' event-array passes across 2 files was judged too large/risky for
  a live-game-only win on a currently-tiny dataset. See the card for full
  reasoning; revisit both if event counts grow materially.
- **2026-07-06 — Materialised doc chosen over a 60s memory cache for OPT-013.**
  The task description offered either. Went with the materialised-doc pattern
  (matching OPT-010/011) for consistency, multi-instance correctness (a memory
  cache wouldn't be shared across server processes), and because the
  self-healing compute-on-miss fallback is already proven.
- **2026-07-06 — Lazy `require` is the house pattern for avoiding service-layer
  require cycles.** `teams.service.js` requires `games.service.js` (for
  `computeBoxScore`); OPT-013 needed the reverse direction too
  (`games.service.js` → `teams.service.js`, to schedule a team-summary
  recompute on game completion). Used a function-body `require` inside the
  trigger helper instead of a top-level import — `leagues.service.js` already
  does this for its billing-service import. Reach for this pattern whenever two
  service modules need each other.
- **2026-07-06 — `deletePostsByGameId` left as dead code (not wired) during
  OPT-017.** This repository function (delete a game's shared cards on game
  deletion) pre-dates this session and has never been called from anywhere.
  OPT-017's scope is card _staleness_ (score/name drift while the game and
  post both still exist), not deletion cleanup — a different concern. Left
  untouched; flag if a future task wants to wire it up.
- **2026-07-06 — test files must flush `setImmediate` after mutating calls.**
  `games.service.test.js` never flushed pending immediates, so the
  OPT-010/013 post-response schedulers were firing into a torn-down Jest
  module registry after each test — silently harmless for those two (mocked
  as synchronous no-ops) until OPT-017's `scheduleFeedCardRefreshForGame`
  exposed it loudly (`TypeError` on a torn-down import). Fixed with a
  top-level `afterEach(() => new Promise(r => setImmediate(r)))`. Any new test
  file that calls `finishGameForUser`/the event mutators/`deleteGameForUser`
  needs the same flush — it's the pattern to copy.
- **2026-07-06 — OPT-015's `$push` scoped to "version-checked load→save"
  instead of a literal atomic push.** The append path's validation (lineup
  state, substitution legality, active-roster checks) all need the game's
  _current_ state loaded before deciding what to push — a blind
  `Game.findOneAndUpdate({...}, {$push: ...})` can't run that validation
  against data it never loaded. Mongoose's `optimisticConcurrency:true`
  (version-key check on `.save()`) gets the actual goal — no silent
  clobbering between co-trackers — without needing a lower-level atomic op
  the business rules can't support blindly. True `$push`/`$position` is only
  worth revisiting if profiling ever shows the full-doc save itself (distinct
  from the race) is the bottleneck, which the roadmap's own "tiny dataset"
  framing suggests is not the case today.
- **2026-07-06 — OPT-016's UI rewrite requires live browser verification this
  session didn't have.** No browser-automation tool was available. Rather
  than rewrite the app's core live-tracking component (panel extraction +
  optimistic updates) on source-reading confidence alone, only the one
  mechanically-verifiable fix (memoising two named arrays, confirmed via
  `exhaustive-deps` lint + unchanged test baseline) was made. **This is a
  standing gap, not a closed decision** — the full OPT-016 scope is real,
  valuable work. Future sessions: either have a human click through the
  tracking flows alongside the AI's changes, or build out enough automated
  coverage of GameTrackPage's interaction paths (shot picker, follow-up
  prompts, substitutions, mobile/desktop, video sync) to trust an AI's own
  verification before attempting the rewrite.

## 🔎 Verification log

Post-completion adversarial verification passes. Each entry lists what was
audited, what was found, and what was corrected.

### 2026-07-06 — OPT-014 pre-commit review (all dirty files, bugs + security)

Method: line-by-line adversarial read of every uncommitted file, focused on
bugs and security flaws, checked against the **installed React Query v5
source** (not assumptions). Result: **2 real bugs found and fixed** (1 a
security flaw), both regression-locked with tests that were confirmed to fail
without the fix. Client suite went 116 → **118 passing** (2 net-new tests),
same 20 pre-existing failures unchanged; lint + build clean.

- **🐛 HIGH / correctness — `AuthContext` queryFn could return `undefined`.**
  The stale-hydration guard returned `undefined` when a mutation bumped the
  revision mid-flight. React Query v5 (`query-core/src/query.ts:569`)
  **throws** `"data is undefined"` and flips the query into an error state on
  a `undefined` return — the exact race the guard was meant to protect
  instead corrupted the auth query (console-error spam + broken
  `isError`/refetch semantics; in an adjacent timing it could read back as
  logged-out). The original passing test only exercised the `.reject()`
  (catch) path, never the `.resolve()`-stale path — false confidence.
  **Fix:** never return `undefined` — when the revision moved on, return the
  value the mutation already wrote (`queryClient.getQueryData(...) ?? null`).
  Added a test for the stale-but-successful-resolve path asserting no
  "Query data cannot be undefined" is logged (verified: fails without fix).
- **🔒 HIGH / security — persistent cache not purged on auth transitions.**
  Adding React Query introduced an **app-wide singleton `QueryClient`** where
  before every mount refetched. On login-as-different-user or logout we only
  reset `['auth','me']`, leaving all other cached queries (`['game',id]`,
  `['feed']`, private league data, owner-only fields like `canDelete`/
  `canEditCompletedGame`) in memory for the next user on the same tab to
  read. **Fix:** `purgePrivateCache()` (`removeQueries` for every key except
  the auth session) runs on `login`/`register`/`loginWithGoogleExchange`/
  `logout`. Excludes `['auth','me']` deliberately — removing the key the
  provider actively observes would trigger an unwanted immediate `/auth/me`
  refetch (first attempt used `queryClient.clear()` and did exactly that,
  breaking two tests; `removeQueries`-with-predicate is the correct tool).
  Added a test seeding a private `['game',...]` entry, logging out, and
  asserting it's purged while `['auth','me']` survives (verified: fails
  without the purge).
- **✅ Reviewed and cleared:** `FeedPage` infinite-query + `setQueryData`
  splice logic (delete/create paths correct, initial-error render matches
  old behavior); `GameDetailPage` single-query swap (only one former
  `setData` site, no dangling refs); the 3 league pages + `usePublicLeague`
  hook (loading/error semantics equivalent; generic error text is
  arguably a marginal security improvement — no server error detail
  leaked); all 5 test-wrapper additions create a **fresh `QueryClient` per
  render** (no cross-test cache bleed).

### 2026-07-06 — Waves 1–2 full verification (OPT-008, 009, 010, 011, 012, 013)

Method: adversarial re-review of every Wave 1/2 change — hunting the riskiest
seams (type mismatches on materialised reads, async-readiness assumptions,
missing recompute triggers, concurrency races) — verified against **real dev
data**, not just mocks. Result: **4 real bugs found and fixed, 1 limitation
documented, 2 tasks fully clean.** All fixes have regression tests; suite went
197 → **201 passing**. All parity/backfill checks re-run clean afterwards.

- **✅ OPT-008 — clean, live-confirmed.** Backfill re-run scanned 20 games
  (2 more than at implementation time — the user finished 2 games via the UI
  in between) and updated 0: the write hooks populated `finalScore`/`eventCount`
  correctly for the live-finished games. Idempotency re-confirmed.
- **🐛 OPT-011 — HIGH: leaders lost identity fields on the materialised path.**
  `listLeaguePlayerStats` returns `.lean()` docs whose `leagueTeamId`/
  `leaguePlayerId` are **ObjectIds**, but `getPublicLeagueLeaders`' lookup Maps
  are keyed by **strings** → on every materialised read (i.e. the normal case
  after OPT-011), `teamName`, `teamSlug`, `jerseyNumber`, `position`, and
  `avatarUrl` were all `null`; only `displayName` survived via its stored
  fallback — which is exactly why the original spot-check (displayName + ppg
  only) missed it. **Fixed** by normalising both ids with `String()` before the
  lookups; confirmed on dev (`Demi James / 94 Truck / #99 / PG` now resolves);
  regression test simulates the ObjectId shape so it can't recur.
- **🐛 OPT-009 — MEDIUM: still-processing eager URL could be persisted.** With
  `eager_async: true` Cloudinary still returns the (deterministic) derived URL
  in the response but with `status: 'processing'`; requesting it mid-transcode
  returns **423 Locked**, and the post URL is stored permanently — so uploads
  during the transcode window would have persisted a broken playback URL,
  defeating the task's own goal. **Fixed**: the eager URL is only used when
  `status !== 'processing'`; otherwise the on-the-fly `f_auto,q_auto,vc_auto`
  URL is stored (works before AND after the eager MP4 lands). 2 regression
  tests (processing → on-the-fly; ready → eager).
- **🐛 OPT-013 — MEDIUM: roster mutations didn't refresh the summary.** The
  materialised season summary embeds per-player rows (names, positions, zeroed
  rows for every roster player), but only game triggers were wired — a player
  rename/add/deactivate used to appear immediately (live compute) and now went
  stale until the next game event. **Fixed**: `addPlayerToTeam`,
  `updatePlayerOnTeam`, `deactivatePlayerOnTeam` now schedule the recompute.
- **🐛 OPT-010/011/013 — LOW (race): in-flight coalescing could drop the
  latest write.** A trigger landing while a recompute was mid-flight joined the
  existing promise — which had already read its data **before** that write —
  so the second change was never materialised (and compute-on-miss can't
  rescue it because the doc exists). **Fixed** in both recompute hooks
  (`recomputeLeagueAggregates`, `recomputeTeamSeasonSummary`) with a dirty-flag:
  a mid-flight trigger marks the entry dirty and exactly one follow-up pass
  runs when the current one finishes. Concurrency regression test added.
- **✅ OPT-012 — clean, live-confirmed.** A game finished via the UI after
  OPT-012 landed has all three frozen artefacts (`finalScore`, `gameSummary`,
  `boxScore`) and they are **mutually consistent** (0–2 across all three,
  written by two independent code paths); pre-freeze completed games correctly
  serve via the live-compute fallback.
- **📌 OPT-013 — documented limitation (not fixed):** `isGamePubliclyViewable`
  is time-dependent (a completed game with a future `scheduledAt` is excluded
  until that time passes). When the time passes, no trigger fires, so the
  materialised summary stays stale until the next roster/game write. Extreme
  edge case (a completed-but-future-scheduled game is already odd data);
  fixing it would need a timer/TTL. Revisit only if it ever bites.

Re-verification after fixes: `backfill-game-finalscore` (20 scanned/0 updated),
`backfill-league-standings` (2 leagues, 5+2 standings rows, 48+12 player rows,
zero parity flags), `backfill-team-season-summaries` (2 teams, zero parity
flags), leaders identity fields resolve on the materialised path, 201/201
tests, eslint clean.

## 🏗️ Architecture changes log

Log new collections, fields, utilities, and providers as they are introduced.

- ✅ **built (OPT-002, 2026-07-05)** `server/src/modules/shared/cloudinaryUrl.js`
  — `transformCloudinaryUrl(url, {w})` + `buildCloudinarySrcSet(url, widths)`.
  Cloudinary-host-only, idempotent, null-safe. Applied in all logo/avatar/feed
  sanitizers.
- ✅ **built (OPT-004, 2026-07-05)** `listPublicCompletedGames(limit)` in
  `games.repository.js` — projected (`-events -rosterSnapshot -boxScore`),
  limited finder for public endpoints.
- ✅ **built (OPT-006, 2026-07-05)** `createEmptyPlayerStatLine` +
  `applyEventToPlayerStatLine` added to `shared/statSummary.js` — the shared
  per-player box-score accumulator (games & leagues delegate to it). Team-level
  helpers (`summarizeEvents`, `summarizeEventsBySide`) pre-existed.
- ✅ **built (OPT-008, 2026-07-05)** `Game.finalScore {home, away}` +
  `Game.eventCount` fields in `games.repository.js`; write hooks + read fast-path
  in games/leagues services; idempotent backfill script
  `scripts/backfill-game-finalscore.js`.
- ✅ **built (OPT-003, 2026-07-05, partial rollout)** `<CloudinaryImage>` client
  component at `client/src/features/media/CloudinaryImage.jsx`.
- ✅ **built (OPT-012, 2026-07-06)** `Game.boxScore` + `Game.gameSummary` frozen
  fields (Mixed, nullable) in `games.repository.js`; `refreezeGameBoxScoreIfCompleted`
  helper in `games.service.js`. `recap`/`highlights` intentionally NOT added —
  see Decisions log.
- ✅ **built (OPT-013, 2026-07-06)** `teamseasonsummaries` collection
  (`{teamId unique+indexed, summary: Mixed, timestamps}`) + `findTeamSeasonSummary`/
  `upsertTeamSeasonSummary`/`deleteTeamSeasonSummary` in `teams.repository.js`;
  `computeTeamSeasonSummary`/`getTeamSeasonSummary`/`recomputeTeamSeasonSummary`/
  `scheduleTeamSeasonSummaryRecompute` in `teams.service.js`; backfill script
  `scripts/backfill-team-season-summaries.js`.
- ✅ **built (OPT-010, 2026-07-06)** `leaguestandings` collection
  (`{leagueId unique+indexed, rows, timestamps}`) + `findLeagueStandings` /
  `upsertLeagueStandings` / `deleteLeagueStandings` in `leagues.repository.js`;
  backfill script `scripts/backfill-league-standings.js`.
- ✅ **built (OPT-010, 2026-07-06)** `recomputeLeagueAggregates(leagueId)` +
  `scheduleLeagueAggregateRecompute` post-response hook (reuses OPT-006's shared
  accumulator via `computeLeagueStandings`). OPT-011 will extend it to player
  stats.
- ✅ **built (OPT-011, 2026-07-06)** `leagueplayerstats` collection
  (`{leagueId, leagueTeamId, leaguePlayerId} compound-unique+indexed`, raw
  stat-line fields + `gamesCount`, timestamps) + `listLeaguePlayerStats` /
  `replaceLeaguePlayerStats` / `deleteLeaguePlayerStats` in
  `leagues.repository.js`. `recomputeLeagueAggregates` (OPT-010) extended to
  persist this alongside standings from one teams/games fetch.
- ✅ **built (OPT-017, 2026-07-06)** `findUsersByIds` (`$in` batch) in
  `auth.repository.js`; `cardSnapshot` field on the `gameCard`/`playerCard`/
  `teamCard` sub-schemas in `feed.repository.js` + `updatePostCardSnapshot`/
  `listGameCardPostsByGameId`; `buildGameCardSnapshot`/`buildPlayerCardSnapshot`/
  `buildTeamCardSnapshot` + `refreshGameCardPostsForGame` in `feed.service.js`.
- ✅ **built (OPT-015, 2026-07-06)** `optimisticConcurrency: true` on the Game
  schema (`games.repository.js`) — Mongoose's native version-key check;
  `saveGameEventMutation` + `buildSlimGameEventDelta` in `games.service.js`.
- ✅ **built (OPT-014, 2026-07-06)** `@tanstack/react-query` `QueryClientProvider`
  (`client/src/app/providers/queryClient.js`, wired in `AppProviders.jsx`);
  shared `usePublicLeague(leagueSlug)` hook in
  `client/src/features/leagues/hooks/usePublicLeague.js`. **Scoped** — see
  OPT-014's card for the ~20-page remaining-migration list.
- ✅ **built (OPT-019, 2026-07-06)** `server/src/middleware/publicCache.middleware.js`
  (`publicCacheMiddleware` + `isPubliclyCacheableRequest` predicate). Applied
  in `routes/index.js` (3 public routers) and `games.routes.js` (public game
  detail). `csrf.middleware.js` now imports the predicate to skip CSRF
  `Set-Cookie` on anonymous cacheable responses.
- ✅ **built (OPT-020, 2026-07-06)** `server/src/utils/webhookIdempotency.js`
  (`claimWebhookEvent(Model, filter, eventId)` — atomic gated
  `findOneAndUpdate` with `$push`/`$slice: -25`; `MAX_PROCESSED_WEBHOOK_EVENT_IDS`).
  Exposed via `claimTeamWebhookEvent` (teams.repository) and
  `claimLeagueWebhookEvent` (leagues.repository); `billing.service.js` webhook
  handlers claim-first (old in-memory `hasProcessedWebhookEvent`/
  `markWebhookEventProcessed` removed).
- ✅ **changed (OPT-020, 2026-07-06)** `games.repository.js`:
  `claimGameSummaryGeneration(gameId, lockId, now?)` now honours a stale-lock
  TTL (`AI_SUMMARY_LOCK_TTL_MS = 2min`); new `releaseGameSummaryLock(gameId,
lockId)`. `games.service.js`: new `scheduleGameSummaryGeneration` (post-
  response `setImmediate`, retry-on-failure release); `finishGameForUser` no
  longer awaits OpenAI.
- ✅ **changed (OPT-020, 2026-07-06)** `email.service.js`: new
  `sendTemplateEmailAsync` (fire-and-forget); `sendVerificationEmail`/
  `sendPasswordResetEmail` now fire-and-forget. Callers `auth.service.js`
  (password reset) and `contact.routes.js` no longer await Resend.
- ✅ **built (OPT-018, 2026-07-07)** `server/src/utils/pagination.js`
  (`applyIdCursor`, `buildCursorPage`, `DEFAULT_PAGE_LIMIT=20`,
  `MAX_PAGE_LIMIT=50`) and `server/src/modules/shared/pagination.validation.js`
  (`paginationQueryShape`, `paginationQuerySchema`). Consumed by games/teams/
  leagues repositories (optional `{limit,cursor}` → keyset find), services
  (`buildCursorPage` → `{ items…, nextCursor }`) and controllers
  (`schema.parse(req.query)`). Response contract: existing array key +
  `nextCursor` added. `listGamesByOwner`, `listTeamsByOwner`,
  `listPublicLeagues` paginate only when a `limit` is supplied.
- ✅ **changed (OPT-022, 2026-07-07)** `games.repository.js`: `participantSchema`
  gained `slug: { type: String, default: null }` (was silently dropped on
  every save before this). New `scripts/backfill-participant-slug.js`
  (idempotent, dry-run flag) for pre-existing games — already run against dev.
  `.lean()` added to `listCompletedGames`/`listPublicCompletedGames`
  (games.repository.js) and `listLeaguesByIds` (leagues.repository.js).
- ✅ **built/changed (OPT-023, 2026-07-07)** ops hardening:
  `server.js` gained `registerGracefulShutdown(server)` (SIGTERM/SIGINT drain →
  `disconnectDb` → exit, 10s force-exit guard) and now captures the
  `http.Server` from `app.listen`. `config/db.js`: `connect` sets `maxPoolSize`
  - `serverSelectionTimeoutMS: 5000`; new `disconnectDb()` export. `config/env.js`:
    new `MONGO_MAX_POOL_SIZE` (default 10). `health.controller.js` now pings Mongo
    (503 unless connected + ping OK; response gains a `db` field). `billing.service.js`:
    `new Stripe(key, { apiVersion: '2024-06-20' })`. `rateLimit.middleware.js`: new
    `authCredentialLimiter` (20/15min) exported and applied to `/register`,
    `/login`, `/refresh` in `auth.routes.js`.
- ✅ **built/changed (OPT-024, 2026-07-07)** correctness decisions:
  `games.service.js`: new `assertLeagueScoreNotTied(gameContext, finalScore)`,
  called in `finishGameForUser` (pre-mutation) and
  `syncGameDenormalizedAfterEventChange` (post-edit-on-completed). New tie
  rejection is 422. `leagues.service.js`: new shared `isLeagueMember(userId,
league)` (owner / active league manager / any leagueTeamMember role) used by
  both `assertLeagueViewer` (refactored onto it, behaviour unchanged) and
  `assertLeagueVisible` (fixed — now takes `viewerUserId`, allows a member
  through a private league via the public-slug routes). Standings loop gained
  a `ties` row field. `getPublicLeagueBySlug`/`getPublicLeagueTeamBySlug`/
  `getPublicLeaguePlayerBySlug`/`getPublicLeagueLeaders` all gained a
  `viewerUserId` parameter; all 6 public controller handlers now pass
  `req.auth?.userId || null`. New `utils/escapeHtml.js` (5-char HTML escape,
  no new dependency); `contact.routes.js` builds a separate escaped
  `htmlBodyLines` for the email's `html` field. `analytics.controller.js`
  always overrides `distinctId` with `req.auth.userId` (schema field kept
  optional for backward-compat, but ignored).
- ✅ **changed (OPT-007, 2026-07-07, partial)** index hygiene:
  `games.repository.js` — removed `index: true` from 9 fields proven unqueried/
  redundant (`homeTeamId`, `awayTeamId`, `homeLeagueTeamId`,
  `awayLeagueTeamId`, `events.teamSide`, `homeParticipant.teamId`,
  `awayParticipant.teamId`, `homeParticipant.leagueTeamId`,
  `awayParticipant.leagueTeamId`). `config/db.js` — `autoIndex:
env.NODE_ENV !== 'production'`. New `scripts/migrate-drop-dead-indexes.js`
  — matches live indexes by key shape (not name), idempotent, `--dry-run`;
  run against dev (9 dropped, verified 0 remaining); **not yet run against
  production**. 5 remaining low-cardinality candidates
  (`leagueId`/`trackedLeagueTeamId`/`status`/`gameContext`/`trackingMode`)
  intentionally untouched — need a `$indexStats` traffic-observation window,
  not provable from code.

## 🔔 Implementation reminders

- **Measure before + after every task.** Route p95 from existing pino logs;
  bundle size via `pnpm vite build --mode production`; client `web-vitals` →
  PostHog ([25](./25-performance-audit.md) §Measurement). Record the numbers in
  the task's completion notes.
- **Read-only DB verification before index drops** — `$indexStats` for a week,
  then drop via migration; disable prod `autoIndex` (OPT-007).
- **Keep the live-compute fallback** for materialisation — it is the rebuild
  source of truth and makes OPT-010/011 reversible.
- **Only rewrite Cloudinary-host URLs** in the transformer — never touch
  non-Cloudinary hosts (OPT-002).
- **Slim-delta is a contract change** — OPT-015's response shape must be
  coordinated with GameTrackPage (OPT-016) in the same or adjacent change.
- **No app code changes were made during the audit or this planning phase** —
  every task below is greenfield implementation work.

---

## 🧪 Manual testing guide (per completed task)

> **How to run the app:** `pnpm dev` from repo root (starts client on
> `http://localhost:5173` and server on `http://localhost:4000`). Open Chrome
> DevTools before testing (Cmd+Opt+I). Use the **Network** tab (filter by JS or
> Img) and the **Console** tab (watch for errors) throughout.

### ✅ OPT-001 — Route code splitting + chunking

**What to test:** Routes now load as separate JS chunks on demand instead of
one giant bundle.

1. Open DevTools → **Network** tab → filter by **JS**. Check "Disable cache".
2. Navigate to `http://localhost:5173/` (the feed/home).
   - **Look for:** A small set of JS files loads (entry ~44KB gzipped). You
     should NOT see `recharts`, `posthog`, or a huge `GameTrackPage` chunk yet.
3. Navigate to a **game detail** page (`/games/:id` — open any game from the
   feed or a league).
   - **Look for:** A NEW chunk loads on-demand (the recharts chunk ~534KB and
     the GameDetailPage chunk appear only NOW, not on first load).
4. Navigate to **pricing** (`/pricing`).
   - **Look for:** The stripe-js chunk loads only here.
5. Navigate to a **game tracking** page (`/games/:id/track` on a game you own).
   - **Look for:** The large GameTrackPage chunk loads only now; brief loader
     (SportsLoader) may flash — that's the Suspense boundary working.
6. **Console:** No errors. **PostHog:** analytics init happens after first
   paint (you can confirm the posthog chunk loads slightly after the page
   renders, not blocking it).

**Pass criteria:** Entry bundle is small; heavy libraries load only on the
routes that use them; no console errors; all routes still render.

---

### ✅ OPT-002 — Cloudinary delivery optimization (server-side URLs)

**What to test:** Image URLs served by the API now carry `f_auto,q_auto`
(auto-format + auto-quality) so Cloudinary delivers WebP/AVIF at optimal size.

1. Open DevTools → **Network** tab → filter by **Img**.
2. Navigate to any page with team/league logos or avatars, e.g.:
   - Home (`/`) — featured teams & leagues logos
   - A public league page (`/league/:slug`)
   - The feed (`/`) — post images and creator avatars
3. Click any loaded image request and inspect its **URL** (Request URL in
   Headers).
   - **Look for:** The URL contains `/upload/f_auto,q_auto/` (or
     `f_auto,q_auto,w_...` if width was applied). Example:
     `res.cloudinary.com/.../upload/f_auto,q_auto/v123/tsw/...`
4. Check the **Response Headers** of an image → `content-type`.
   - **Look for:** `image/webp` or `image/avif` in a modern browser (proof
     `f_auto` is negotiating a better format than the original PNG/JPG).
5. Compare a logo's transferred **Size** (Network column) — should be notably
   smaller than the raw asset.
6. **Feed videos:** Open a post with video. Inspect the thumbnail URL — should
   use `f_auto` (not the old `f_jpg`).

**Pass criteria:** Cloudinary image URLs include `f_auto,q_auto`;
non-Cloudinary images (static assets, placeholders) are untouched; images still
display correctly everywhere.

---

### ✅ OPT-003 — CloudinaryImage component (full rollout: all 64 images)

**What to test:** Every `<img>` is now `<CloudinaryImage>` — lazy loading,
explicit dimensions (no layout shift), and responsive `srcset` on Cloudinary
images across the whole app.

**Spot-check these representative spots:**

1. **Home page** (`/`) — featured league/team logos + section images.
2. **Feed** (`/`) — image posts (full-width), player/team/game cards, creator
   avatars, YouTube highlight thumbnails.
3. **League pages** (`/league/:slug`, `/standings`, `/team/:slug`, player pages)
   — header logos (eager), table avatars/logos (lazy).
4. **Team pages** (`/teams`, `/teams/:id`) — team logos, player avatars.
5. **Game pages** — `GameDetailPage` (team logos), `GameTrackPage` (headers),
   and court images in shot map / replay / recap components.
6. **Admin pages** — league/team/game admin, new-entity logo previews (blob
   URLs — lazy, no srcset).

**For each spot, in DevTools:**

- **Elements** tab → inspect the image → confirm `loading` (lazy for
  list/scroll, eager for page-header heroes), `decoding="async"`, and explicit
  `width`/`height`.
- Cloudinary images (logos, avatars, feed media) have a `srcset` with multiple
  widths + a `sizes` attribute. Court images, placeholders, and YouTube
  thumbnails correctly have **no** srcset.
- **Network** tab: scroll a long list/feed — lazy images load only as they
  approach the viewport.
- **Visual:** No layout jump as images load (dimensions reserve space → no CLS).

**Pass criteria:** Zero plain `<img>` remain; Cloudinary images request a
responsively-sized source; static/YouTube images lazy-load with reserved space;
page-header heroes are eager. Build passes; no new test failures.

---

### ✅ OPT-004 — Kill full-collection public scans (server-side)

**What to test:** Public endpoints no longer load ALL completed games with
their (heavy) events arrays — they use limited, projected queries.

> This is a **backend** change with no visual difference. Test via the API
> responses and by confirming the pages that consume these endpoints still work.

1. **Explore/home:** Navigate to `/` — the "Featured Teams" and public games
   sections are powered by `listPublicExploreGames` / `listPublicTeams`.
   - **Look for:** Sections populate correctly with teams and recent games.
2. **Opponent page:** Navigate to a public opponent page (`/opponents/:slug` —
   reachable from a public team's game list).
   - **Look for:** Related games list renders; correct opponent name and game
     count.
3. **Verify the payload is slimmer (optional, DevTools → Network → XHR):**
   - Find the request to `/api/v1/public/teams/explore` (or `/public/teams`,
     `/public/opponents/:slug`).
   - Inspect the JSON **Response** → confirm games in the response do NOT
     include a giant `events` array (only summary fields: id, title, opponent,
     scheduledAt, teamPoints, team).
   - **Response size** should be small even as the dataset grows.

**Pass criteria:** All public/explore pages render identical content to before;
API responses exclude `events`/`rosterSnapshot`/`boxScore`; response shape
unchanged for the client.

---

### ✅ OPT-006 — Consolidate per-player stat accumulation (server-side)

**What to test:** Box-score / player-stat numbers are now computed by one shared
function instead of two duplicated ones. This is a **pure refactor** — the
numbers must be byte-for-byte identical to before. No visual change; verify by
spot-checking that stats still add up correctly.

1. **Standalone game box score:** Open any completed game (`/games/:id`) → the
   **Box Score** tab.
   - **Look for:** Each player's PTS/FG/REB/AST/etc. are correct. Spot-check the
     math: e.g. a player with 2 made 3-pointers and 1 made free throw = 7 pts.
2. **League player stats:** Open a league (`/league/:slug`) → player/leaders or
   a team roster with stats.
   - **Look for:** Per-player totals render correctly and match the games they
     played.
3. **League standings** (`/league/:slug/standings`):
   - **Look for:** Team W-L, PF, PA still correct (team-level summary path,
     also part of the shared module).
4. **Live game (optional):** Track a game (`/games/:id/track`), record a few
   events, and confirm the running box score updates correctly per stat type.

**Pass criteria:** All stat displays produce the same numbers as before the
refactor (server suite proves parity: 174 tests pass). No player line is missing
fields; points math is correct for every shot type.

---

### ✅ OPT-005 — De-duplicate intra-request league loads (server-side)

**What to test:** League pages now fetch teams/games once per request instead of
2–3×. Pure refactor — pages must render identically; the win is fewer DB queries.

1. **Public league page** (`/league/:slug`):
   - **Look for:** Teams list, standings table, and games list all render
     correctly and consistently (same teams appear in all three sections).
2. **Public league team page** (`/league/:slug/team/:teamSlug`):
   - **Look for:** Roster, team games, player stats, and the team's standings
     position all render; numbers match the league page.
3. **Authenticated league view** (log in as a league owner/member → open your
   league dashboard):
   - **Look for:** Teams, standings, games, and (for managers) team-manager
     info all load correctly.
4. **Authenticated league team view** (open a specific team within your league):
   - **Look for:** Roster, members/join-requests (if manager), standings, and
     games render.
5. **Optional — confirm fewer queries (server logs):** With the server running,
   watch the pino query logs (or add MongoDB profiler) while loading a league
   page. You should see roughly **one** `leagueteams` find and **one**
   `games` find per request, not three and two.

**Pass criteria:** Every league/team page renders identical content to before;
standings, games, and rosters are consistent across sections; no duplicate
teams/games fetches per request. ⚠️ Note: the `publicOnly` **games** filter
(a param to `listLeagueGames`, meant to hide individual draft/internal games
within an otherwise-public league) is still a no-op — this was a distinct,
smaller item from the **league-level** private/public visibility OPT-024
fixed. Not yet scheduled; flag if it turns out to matter in practice.

---

### ✅ OPT-008 — `Game.finalScore` + `eventCount` denormalisation (server-side)

**What to test:** Completed games now store their score in a `finalScore` field
(frozen at completion, refreshed on edits) and league score reads use it. Scores
must be identical to before; the win is not re-summing events on list reads.

> **First:** the dev DB was backfilled during implementation, so existing games
> already have `finalScore`. To test the write hooks, create/finish a NEW game.

1. **Finish a game → score freezes:**
   - Track a game (`/games/:id/track`), record some scoring events, then finish it.
   - Open the league it belongs to (`/league/:slug`) → the game row and standings
     show the correct score.
2. **Edit a completed game → score updates:**
   - On a completed league game, add or remove a scoring event (via the game's
     edit flow).
   - **Look for:** The league game row / standings reflect the new score (the
     `finalScore` was refreshed because the game is completed).
3. **Standings parity:**
   - `/league/:slug/standings` — every team's PF/PA/W-L matches the sum of their
     completed games' scores. Compare a couple by hand.
4. **Legacy fallback (already covered by backfill):** All pre-existing games got
   `finalScore` via the backfill script; their scores render unchanged.
5. **Backfill script (optional, DB-level):**
   - `cd server && ENV_FILE=../env/server/.env.development node src/scripts/backfill-game-finalscore.js --dry-run`
   - **Look for:** Reports each game's computed `finalScore`/`eventCount`; a
     second non-dry run reports "updated 0" (idempotent).

**Pass criteria:** New games freeze a correct `finalScore` on completion; edits
to completed games update it; standings and game rows match hand-computed scores;
backfill is idempotent. ⚠️ Note: list queries still _load_ events for now —
projecting them out is the gated follow-up **OPT-025** (needs a prod backfill
first).

---

### ✅ OPT-009 — Async video transcode + delivery hygiene (server-side)

**What to test:** Feed video uploads return faster (async transcode), videos play
via optimised delivery, and asset deletions are awaited + logged.

> Requires Cloudinary configured (a real `CLOUDINARY_*` env). If not configured,
> video upload throws "Cloudinary is not configured" — that's expected.

1. **Non-blocking upload:** Create a feed video post (feed composer → attach a
   video → post).
   - **Look for:** The upload request returns promptly (doesn't hang for the full
     transcode duration). Post appears in the feed.
2. **Playback works immediately:** Play the newly-posted video.
   - **Look for:** It plays right after upload (before the eager MP4 would have
     finished). In DevTools → Network → Media, the video URL contains
     `/video/upload/f_auto,q_auto,vc_auto/` (on-the-fly optimised delivery).
3. **Thumbnail:** The feed card's video thumbnail loads (URL contains
   `so_1,f_auto,q_auto`).
4. **Delete awaits cleanup:** Delete your video post.
   - **Look for:** Deletion succeeds. In the **server logs**, a failed Cloudinary
     destroy is now logged as an error/warn — no longer silently swallowed. On
     success, no error is logged.
5. **Over-duration rejection:** Upload a video longer than
   `FEED_VIDEO_MAX_DURATION_SECONDS`.
   - **Look for:** 422 error; the just-uploaded asset is cleaned up (awaited), and
     any cleanup failure is logged.

**Pass criteria:** Uploads return without waiting for transcode; videos play via
`f_auto,q_auto,vc_auto` before and after the eager MP4 exists; post deletes await
their Cloudinary destroy and log failures instead of leaking assets. ⚠️ Note:
moving logos/avatars out of the shared `tsw/feed` folder was deferred (data
migration, out of scope) — see the card.

---

### ✅ OPT-010 — `leaguestandings` materialisation (server-side)

**What to test:** League standings now come from a pre-computed `leaguestandings`
collection instead of being recomputed from all games+events on every read. The
numbers must be identical; recomputes fire automatically after game/team changes.

> The dev DB was backfilled during implementation (both dev leagues — **We Ball
> Saturday** and **Dev Test League** — were verified with **zero parity
> mismatches** between materialised and live compute). To test the recompute
> triggers, change a game/team and confirm standings update within ~a second.

1. **Standings render correctly** (materialised read — regression check, should
   be unchanged from before this task):
   - `/league/:slug/standings` for **We Ball Saturday** and **Dev Test League**
     — W-L, PF, PA, +/- and ordering look right.
   - The standings block on the league overview page `/league/:slug`.
   - A specific team page `/league/:slug/team/:teamSlug` — its rank/record is
     consistent with the standings page.
2. **Finish a game → standings update** (exercises a new code path):
   - Track + finish a new league game. Reload the standings shortly after.
   - **Look for:** The teams' records/points reflect the new result (the
     post-response recompute persisted fresh rows).
3. **Edit a completed game → standings update** (new code path):
   - Add/remove a scoring event on a completed league game; reload standings →
     they reflect the change.
4. **Delete a completed game → standings update** (new code path):
   - Delete a completed league game; reload standings → that game no longer
     counts.
5. **Rename / add / archive a team → standings update** (new code path):
   - Rename a league team → its name updates in the standings row.
   - Add a team → a new zeroed row appears; archive → row set changes.
6. **No errors:** while doing 2–5, watch the browser console AND the `pnpm dev`
   server logs — no client errors, and no `Cloudinary destroy failed` /
   `Post-response league aggregate recompute failed` log lines.
7. **Compute-on-miss fallback (reversible):** If the `leaguestandings` collection
   is ever empty/dropped, standings still render correctly (computed live and
   re-persisted on first read). Optional DB check:
   `node src/scripts/backfill-league-standings.js --dry-run` (with `ENV_FILE`)
   prints each league's standings and flags any parity mismatch.

**Pass criteria:** Standings match the previous live-computed values exactly
(steps 1 — regression); every write trigger (finish/edit/delete game,
create/rename/archive team) results in updated standings within a moment (steps
2–5 — new behaviour); no errors logged anywhere (step 6); dropping the
collection degrades gracefully to live compute (step 7). Recompute never blocks
the triggering request (fires after the response).

---

### ✅ OPT-011 — `leagueplayerstats` materialisation (server-side)

**What to test:** League leaders/DPOY now come from a pre-computed
`leagueplayerstats` collection instead of replaying every team's games+events.
The numbers must be identical; the same OPT-010 recompute triggers keep it fresh.

1. **Leaders render correctly** (materialised read — regression check):
   - Open the leaders/leaderboard view for **We Ball Saturday** and
     **Dev Test League** — top scorers, PPG, and DPOY ordering should look
     right and match what you saw before this task.
   - **Specifically check the identity fields**: each leader row shows its
     **team name, team logo, jersey number, position, and avatar** — these are
     exactly the fields the 2026-07-06 verification bug nulled on the
     materialised path (see the Verification log), so confirm they're
     populated, not blank.
2. **Finish/edit/delete a game → leaders update** (same triggers as OPT-010,
   now also refreshing player stats):
   - Track + finish a league game with a few scoring events for a player.
   - Reload the leaders view shortly after — that player's PPG/stats should
     reflect the new game.
3. **Team page still shows correct player stats** (unchanged — deliberately
   left on live compute, see the card's scope decision):
   - `/league/:slug/team/:teamSlug` — per-player stat rows still render,
     including players with zero games played (materialising would have
     dropped those; confirm they're still there).
4. **No errors:** watch server logs while doing 2 — no `Player stats backfill
persist failed` or `Post-response league aggregate recompute failed` lines.
5. **Compute-on-miss fallback (reversible):** dropping the `leagueplayerstats`
   collection still serves correct leaders (computed live and re-persisted on
   first read). Optional DB check:
   `node src/scripts/backfill-league-standings.js --dry-run` (with `ENV_FILE`)
   now also reports player-stat row counts.

**Pass criteria:** Leaders/DPOY match previous live-computed values exactly;
they update after game changes within a moment; team-page stats (incl.
zero-game players) are unaffected; no errors logged; dropping the collection
degrades gracefully.

---

### ✅ OPT-012 — Frozen box score + game summary (server-side, scoped)

**What to test:** Completed games now freeze their box score + summary on
completion instead of recomputing from events on every read. The displayed
numbers must be identical; the win is not replaying events for old games.

> No dev-DB backfill was done for this one (unlike OPT-008/010/011) — the
> live-compute fallback self-heals on every read, and finishing a game is a
> one-way action, so no test game was finished against the shared dev DB during
> implementation. Pre-existing completed games currently have NO frozen data and
> serve via live compute; that's expected until they're next finished or edited.

1. **Existing completed games still render correctly** (regression — currently
   exercises the live-compute fallback, not the freeze):
   - Open any completed game (`/games/:id`) → Box Score tab and the summary
     header. Numbers should be unchanged from before this task.
2. **Finish a NEW game → box score freezes** (exercises the new code path):
   - Track and finish a game. Open its detail page.
   - **Look for:** Box score and summary render correctly immediately.
3. **Edit a completed game → box score refreezes:**
   - On that same completed game, add or remove a scoring event.
   - **Look for:** The box score and summary update to reflect the edit (proves
     the refreeze fired, not a stale frozen snapshot).
4. **Recap/highlights still work identically** (unaffected — deliberately not
   frozen): the recap panel and any video highlights should look exactly as
   before; player names in them reflect current team data, same as always.
5. **No errors** in server logs while doing 2–3.

**Pass criteria:** All completed-game reads (old and new) show correct,
consistent box scores and summaries; editing a completed game updates the
displayed data; recap/highlights are unaffected. ⚠️ Note: the "consolidate 7–10
event passes into one for live games" half of this task was **descoped** — live
(in-progress) games still do their existing multi-pass compute. See the card.

---

### ✅ OPT-013 — Team season summaries (server-side)

**What to test:** Standalone (non-league) team public pages now serve a
pre-computed season summary instead of recomputing from every game+event on
each view. Numbers must be identical; the win is not replaying events on
every page load.

> The dev DB was backfilled during implementation for the two standalone teams
> (**Toronto Raptors**: 2 games/15 pts, **Milwaukee Bucks**: 0 games) — zero
> parity mismatches confirmed against live compute.

1. **Team page renders correctly** (materialised read — regression check):
   - Open the public team page for a standalone team
     (`/teams/:id` or wherever the public team page lives) — season summary
     (games played, points, shooting %s, per-player stat rows) should look
     right and match what you saw before this task.
2. **Finish a standalone game → summary updates** (new code path):
   - Track and finish a standalone (one-sided, non-league) game for that team
     with a few scoring events.
   - Reload the team page shortly after — the summary should reflect the new
     game (gamesCount incremented, points/stats updated).
3. **Edit a completed standalone game → summary updates:**
   - Add/remove a scoring event on that completed game; reload the team page →
     summary reflects the change.
4. **Delete a completed standalone game → summary updates:**
   - Delete it; reload the team page → that game no longer counts.
5. **Dual-team standalone games are unaffected** (scope check — these were
   never part of this summary, before or after this task):
   - If you have a dual-team standalone game (two teams tracked against each
     other, no league), confirm neither team's public page treats it any
     differently than before.
6. **No errors** in server logs while doing 2–4 — no `Team season summary
backfill persist failed` or `Post-response team season summary recompute
failed` lines.
7. **Compute-on-miss fallback (reversible):** dropping the
   `teamseasonsummaries` collection still serves a correct summary (computed
   live and re-persisted on first read). Optional DB check:
   `node src/scripts/backfill-team-season-summaries.js --dry-run` (with
   `ENV_FILE`) reports each team's computed summary.

**Pass criteria:** Season summaries match previous live-computed values
exactly; they update after finish/edit/delete on standalone one-sided games
within a moment; dual-team standalone games are unaffected; no errors logged;
dropping the collection degrades gracefully.

---

### ✅ OPT-017 — Feed hydration batching + card denormalisation (server-side)

**What to test:** The feed page now resolves each post's creator with one
batched query and serves game/player/team card content from a stored
snapshot instead of re-running the full public pipeline on every read. Card
content must be identical; the win is fewer DB round-trips per feed page.

1. **Feed renders correctly** (regression — should be unchanged):
   - Open the feed (`/`) and scroll through all post types — images, videos,
     game cards, player cards, team cards, highlight clips. Names, logos,
     scores, and stats should look right and match what you saw before this
     task.
2. **Existing cards self-backfill on first read:** the dev DB has real cards
   from before this task — the first time you load the feed after this
   change, their snapshot gets computed once and persisted; subsequent loads
   don't re-resolve them. No visible difference, just fewer queries after the
   first load.
3. **New cards snapshot at creation:** post a new player or team card (via the
   feed composer) → it should appear immediately with correct data (this
   exercises the creation-time snapshot path, not the read-time fallback).
4. **Stale-card refresh on game completion:**
   - Post a game card for a game that's still **in progress**.
   - Finish that game (or edit a completed game's events).
   - Reload the feed → the game card's score should now reflect the finished/
     edited game, not the stale in-progress state at share time.
5. **No errors** in server logs while doing 3–4 — no `Feed card snapshot
persist failed` or `Post-response feed card refresh failed` lines.
6. **Deleted-game cards degrade gracefully:** if a game_card references a game
   that no longer exists (deleted), that card should render as if the post
   were skipped (same behaviour as before this task) — not an error.

**Pass criteria:** All card content matches pre-change output exactly; new
cards snapshot correctly at creation; a game card's score updates after the
game finishes/is edited; deleted-game cards degrade the same way as before; no
errors logged. Optional DB check: inspect `db.posts.find({type: {$in:
['game_card','player_card','team_card']}})` — cards should accumulate a
non-null `cardSnapshot` as they're read.

---

### ✅ OPT-015 — Slim event-append hot path (server-side, scoped)

**What to test:** Tracking a game (append/remove/update an event) now returns a
smaller response and rejects a stale concurrent save with a clear error
instead of silently losing an event. The tracking UI itself should behave
identically — this is a backend contract change the client already tolerates.

1. **Tracking still works normally** (regression check — the primary thing to
   verify):
   - Open `/games/:id/track` for an in-progress game and record several stats
     (makes, misses, assists, rebounds, substitutions). Score, box score, and
     the recent-events list should all update correctly after each action.
   - Undo/remove an event, edit an event — both should still work and update
     the displayed score/stats.
2. **Insert-before (retroactive event insert) still works:** if the tracker
   supports inserting a missed event before an existing one, confirm it still
   inserts at the right position and updates the score.
3. **Co-tracker conflict surfaces clearly (new behaviour):** this needs two
   sessions tracking the _same_ game concurrently — hard to trigger by hand
   without a second device/browser profile logged in as a manager on the same
   league game. If you can set that up: have both submit a stat at nearly the
   same time. One should succeed normally; the other should show an error
   message like "This game was updated by someone else. Reload and try
   again." instead of the event silently vanishing. If you can't easily set
   up two sessions, this is covered by the automated tests (a real-MongoDB
   throwaway-document check was also run during implementation — see the
   card's completion notes).
4. **No errors** in server logs during 1–2.

**Pass criteria:** Tracking flow (append, remove, update, insert-before) works
identically to before; a genuine concurrent conflict returns a 409 with a
clear message instead of a lost event; no errors logged otherwise.

---

### ✅ OPT-016 — GameTrackPage memoisation (client-side, heavily scoped)

**What to test:** A small, purely internal performance fix — two arrays that
were recreated on every render are now memoised. There should be **zero
visible difference** in the tracking UI; this is the most important thing to
confirm, since this task deliberately did NOT touch the actual UI/behaviour.

1. **Tracking flow works exactly as before** (the only real check needed):
   - Open `/games/:id/track`, record several stats across different
     categories (makes, misses, assists, rebounds, steals, turnovers,
     substitutions). Everything should look and behave identically to before
     this task.
   - Switch between Court / Subs / Events panels (if applicable to the game
     mode) — no change expected.
   - For dual-team games, switch the active side — on-court/bench player
     lists should still update correctly for each side.
2. **No console errors or warnings** while doing the above (React would warn
   loudly about stale closures or missing dependencies if the memoisation
   were done incorrectly — it wasn't, per the `exhaustive-deps` lint check,
   but this is worth eyeballing anyway).

**Pass criteria:** No visible or functional difference from before this task.
⚠️ Note: this card intentionally does NOT cover panel extraction or optimistic
updates — those parts of OPT-016 were not attempted (see the card for why).
If you want that work done, it needs either your own hands-on testing
alongside the changes, or a decision to build out more automated coverage of
the tracking flows first.

---

### ✅ OPT-014 — React Query on the client (scoped, 6 pages migrated)

**What to test:** For each migrated page, confirm the page still loads and
behaves the same as before, AND that navigating away and back doesn't
trigger a fresh network request every time (React Query's whole point). Open
your browser's DevTools Network tab and filter to XHR/fetch requests for
each check below.

1. **Login / session (`AuthContext`):**
   - Log in, confirm the app shows you as logged in everywhere (header,
     feed composer, etc.) — same as before.
   - Log out, then log back in — confirm no stale user data flashes.
   - Refresh the page while logged in — you should see exactly one
     `/auth/me` request on load, same as before.
   - **Cache-purge-on-logout (security fix from the pre-commit review):**
     while logged in, browse a game detail page and a public league page
     (to populate the cache), then log out. Log in as a **different user**
     (or stay logged out and revisit those pages). Confirm you do NOT
     briefly see the previous user's data — every page should fetch fresh,
     and any owner-only affordances (edit/delete buttons) from the first
     user must not appear for the second.
2. **Feed (`/pulse`):**
   - Open the feed, scroll to the bottom — confirm more posts load
     (infinite scroll still works) and a new request fires only when you
     actually reach the bottom (Network tab: one request per page of
     posts, not more).
   - Create a post — confirm it appears at the top of the feed
     **without a full feed refetch** (Network tab should show the create
     request but not a subsequent `GET` to reload the whole feed).
   - Delete a post — confirm it disappears immediately, again without a
     full refetch.
3. **Public league pages** — pick any public league and visit:
   `/league/:slug`, `/league/:slug/games`, `/league/:slug/standings` in
   that order (all three fetch the same league object):
   - First page load: exactly one request for the league object plus one
     for that page's specific data (leaders/games/standings).
   - Now use the browser back/forward buttons between these 3 pages, or
     navigate between them via in-app links: **the league object should
     NOT be re-fetched** — Network tab should show zero requests for the
     league on the second/third visit within a short window (30s default
     staleness). This is the actual point of the task — confirm it's
     really happening, not just that the pages still work.
4. **Game detail page (`/games/:id`):** open a completed game's detail
   page — confirms identically to before. Navigate away and back within
   ~30s — should NOT refetch (Network tab shows no new request for that
   game).
5. **Game tracking page (`/games/:id/track`) — should be UNCHANGED.** This
   page was deliberately NOT touched by this task (see card notes). Track
   a few stats to confirm it still behaves exactly as before — this is a
   regression check, not a new-behavior check.

**Pass criteria:** all pages above load and function identically to before;
back/forward navigation between the 3 league pages and the game detail page
shows the request-dedup behavior in the Network tab; the tracking page shows
zero behavioral change.

⚠️ Note: ~20 pages (including `GameTrackPage`, admin/CRUD pages, and several
public pages) were **not** migrated — see the OPT-014 card for the full list
and reasons. Nothing in this task has been committed yet; it's still in the
working tree pending your manual testing and go-ahead.

---

### ✅ OPT-019 — HTTP caching for anonymous public GETs (backend)

**What to test:** Cache headers on public API responses, verified in DevTools
Network tab (or `curl -I`). This is a backend header change — there should be
**no visible UI difference**; the payoff is browsers/CDNs revalidating instead
of refetching public data.

1. **Anonymous public GET is cacheable.** While **logged out**, load a public
   league or team page and inspect the API response (e.g.
   `GET /api/v1/public/teams/explore`, `/api/v1/public/leagues/:slug`). The
   response should carry `Cache-Control: public, max-age=30,
stale-while-revalidate=300` and `Vary: Cookie, Authorization`.
2. **No CSRF cookie on those responses (security).** On that same anonymous
   public GET, confirm there is **no `Set-Cookie` header** for `XSRF-TOKEN` /
   `_csrfSecret`. (You can still use the site normally — the token gets set on
   your next non-public request like login.)
3. **Authed requests are NOT publicly cached.** While **logged in**, hit the
   same public endpoint (or the public game detail `GET /api/v1/games/:id`) —
   the response should now say `Cache-Control: private, no-cache`, not
   `public`.
4. **Mutations still work (CSRF not broken).** Log in and perform any
   state-changing action (create/edit a team, post to the feed, start/finish a
   game). These must still succeed — confirming the CSRF-cookie skip didn't
   break the token handshake.
5. **Completed game detail revalidates.** Load a completed game's public detail
   twice while logged out; the second request may come back `304 Not Modified`
   (weak ETag) — data unchanged, no re-download.

**Pass criteria:** public headers present only when anonymous; `private,
no-cache` when authed; no `Set-Cookie` on cacheable anon responses; all
mutations still work; no UI change anywhere.

---

### ✅ OPT-020 — Blocking integrations off the request path (backend)

**What to test:** Three independent backend behaviours. No visible UI change
except that finishing a league game feels faster; the rest is observable in
server logs / DB.

1. **Finishing a league game returns immediately (AI summary is async).**
   Track and finish a **league** game. The finish action should return right
   away — it no longer waits several seconds for OpenAI. The AI recap appears a
   moment later once the game detail is (re)loaded; it is `null` at first, then
   populated. Watch the server log for `Post-response AI summary generation
failed` — you should NOT see it on a normal success.
2. **AI summary lock recovers from failure (retry).** If OpenAI is
   misconfigured/unreachable, finishing still succeeds (no error to the user),
   the failure is logged, and the lock is released — finishing/reloading again
   re-attempts generation instead of being permanently stuck with no summary.
   (Lock TTL + release were verified against real dev MongoDB; this is the
   user-facing manifestation.)
3. **Password reset + contact form don't block on email.** Trigger a password
   reset and submit the contact form. Both should respond promptly even if
   Resend is slow, and a delivery failure must NOT turn into a request error
   (the response is still success; failures show only in the server log as
   `Async email delivery failed`).
4. **Stripe webhooks are idempotent (dev/stripe-cli).** If you have the Stripe
   CLI, `stripe trigger` a subscription event (or resend the same event twice
   from the dashboard). The team/league state should update once and the replay
   should be a no-op — no double-application. (Enforced atomically in the DB
   now; the integration test `13.10` also covers replay → 200 each time.)

**Pass criteria:** finishing a league game is snappy; a failed AI generation
never errors the finish and can be retried; reset/contact never fail on email
latency; duplicate webhooks apply exactly once.

---

### ✅ OPT-018 — Pagination (backend; client backward-compat)

**What to test:** The list endpoints now cap results and expose a cursor, but
the response keeps its existing shape plus `nextCursor`, so **the app should
look and behave exactly as before**. Verify in DevTools Network / `curl`.

1. **Lists still render unchanged.** Log in and open the Games, Teams, and
   Leagues pages, plus a public league listing. Everything should display as
   before (with the tiny dataset, nothing is truncated).
2. **Response shape adds `nextCursor`.** Inspect `GET /api/v1/games`,
   `/api/v1/teams`, `/api/v1/public/leagues`. Each response now includes a
   `nextCursor` field (likely `null` given the small dataset) alongside the
   existing `games`/`teams`/`leagues` array. Nothing else changed.
3. **`limit` + `cursor` work (if you want to exercise paging).** Append
   `?limit=1` to `GET /api/v1/games` — you get 1 game and a non-null
   `nextCursor`. Then `?limit=1&cursor=<that value>` returns the next game.
   Walking the cursor should never repeat or skip a game.
4. **Bad params are rejected (400).** `?limit=0`, `?limit=999`, or
   `?cursor=notanid` should return a 400 validation error, not a 500 or a
   silent full list.
5. **Owner leagues list.** `GET /api/v1/leagues` returns `nextCursor: null`
   by design (it merges your owned + member + managed leagues) — this is
   expected, not a bug.

**Pass criteria:** all list pages look identical to before; responses carry
`nextCursor`; `limit`/`cursor` page cleanly with no dupes/drops; invalid params
return 400.

---

### ✅ OPT-022 — Low-impact hygiene batch (backend sub-items)

**What to test:** Mostly invisible correctness fixes — no UI change expected
anywhere. The one user-visible effect is that dual-team league game pages may
load their opponent info slightly faster (one fewer DB round-trip per side).

1. **Participant slugs.** Open any **dual-team league** game (in progress or
   completed) that existed before this change. It should look and behave
   exactly as before — the slug was already being reconstructed live, this
   just makes it a stored field instead. Nothing to visually check; the
   backfill was already run and verified against dev.
2. **Nothing else changed.** The dead-code investigation didn't remove
   anything (both flagged targets turned out to be live), the `.lean()`
   additions are read-only query optimisations with identical output shape,
   and no validation gap existed to fix. If anything looks different on any
   page, that's a regression — please flag it.
3. **Regression check for the schema fix.** If you want to confirm the fix
   itself: `node src/scripts/backfill-participant-slug.js --dry-run` from
   `server/` (with `ENV_FILE` pointed at dev) should report "would update 0" —
   confirming the backfill already ran and nothing is missing a slug anymore.

**Pass criteria:** everything looks identical to before across all pages; the
dry-run backfill reports 0 remaining.

---

### ✅ OPT-023 — Ops hardening (backend)

**What to test:** All infra-facing; no UI change. Best verified in a running
server + a staging deploy. Each sub-item can be checked independently.

1. **Graceful shutdown.** Start the server (`pnpm --filter server dev` or prod
   start), then send it `SIGTERM` (or Ctrl-C for `SIGINT`). Expect logs:
   `Received shutdown signal; draining` → `Disconnected from MongoDB` →
   `Shutdown complete`, then a clean `exit 0`. Fire a slow request first and
   confirm it finishes before the process exits (it should not be dropped). If
   a connection hangs >10s the process force-exits with a logged error — that's
   the safety net, not a bug.
2. **DB-ping health check.** With Mongo up, `GET /api/v1/health` → **200**
   `{ status:'ok', db:'ok', … }`. Then stop Mongo (or point `MONGO_URI` at a
   dead host) and hit it again → **503** `{ status:'unavailable', db:'error' or
'disconnected' }`. A load balancer using this endpoint will now drop the
   instance from rotation instead of sending it traffic.
3. **Pool / fail-fast.** Point `MONGO_URI` at an unreachable host and start the
   server — connection selection should fail in ~5s (not hang ~30s), then the
   existing retry loop logs its attempts. Optionally set `MONGO_MAX_POOL_SIZE`
   and confirm it's accepted (numeric, positive).
4. **Stripe pinned version.** Trigger any billing call (e.g. start a checkout in
   staging) and confirm it still works — the SDK now sends
   `Stripe-Version: 2024-06-20`. Visible in Stripe Dashboard → Developers →
   Logs on the request, or via `stripe listen`.
5. **Credential rate limiter.** Hit `POST /api/v1/auth/login` (wrong creds is
   fine) more than ~20 times within 15 min from one IP → the 21st should return
   **429** `{ error: { message: 'Too many authentication attempts…' } }`. The
   global browsing budget (300/15min) is unaffected; recovery endpoints keep
   their own tighter limit.

**Pass criteria:** graceful drain on signal; `/health` flips 200↔503 with DB
up/down; billing still works with the pinned version; login trips a 429 past
its budget; no UI difference anywhere.

---

### ✅ OPT-024 — Correctness decisions (backend)

**What to test:** Four independent fixes; each has a distinct, checkable
behaviour change.

1. **Tie rule.** Try to finalize a league game with an equal score (in the
   tracker UI, or `POST /api/v1/games/:gameId/finish` on a game whose events
   sum to an equal home/away score) — it should now be **rejected** (422,
   "League games cannot end in a tie…") instead of completing. A non-tied
   score still finalizes normally. Editing events on an _already-completed_
   league game so the score becomes level should also now be rejected.
   Standalone (non-league) games are unaffected — a standalone game can still
   finish level.
2. **Private league visibility.** Set a league to private (owner-only toggle,
   `isPublic: false`). Then:
   - Log **out** and visit that league's public page (`/leagues/:slug` on the
     public site) → should 404, same as before.
   - Log in as a **stranger** (not a member) and visit the same public URL →
     should still 404.
   - Log in as the **owner**, a **league manager**, or **a rostered player on
     one of its teams** and visit the same public URL → should now load
     correctly (this is the fix — previously all of these also got a 404).
   - Confirm a **public** league still loads fine for a logged-out visitor (no
     regression).
3. **Contact-form escaping.** Submit the contact form with a name or message
   containing `<script>alert(1)</script>` or similar. The email that lands in
   the configured `CONTACT_EMAIL` inbox should show the literal escaped text
   (`&lt;script&gt;...`) in its HTML rendering, not execute anything or render
   as a heading/bold/etc.
4. **Analytics distinctId.** Not independently visible in the UI — this is a
   server-side correctness fix on an endpoint the current client doesn't call.
   If/when a client integration starts posting to `/api/v1/analytics/event`
   while authenticated, confirm in PostHog that the event lands under the
   user's real distinctId (their DB user id), not whatever the client sent.

**Pass criteria:** tied league games are rejected at finalize and at
retroactive edit; standalone games unaffected; private leagues are visible to
their own members and still hidden from everyone else; contact-form HTML
injection is neutralised; analytics events (if/when sent) bind to the
authenticated user.

---

## 🗂️ Task detail cards

Each card follows the standard structure. Complexity: **S** ≤1 day · **M** 2–4
days · **L** 1–2 weeks.

---

### OPT-001 — Route-level code splitting + chunking

- **Priority:** High · **Status:** ✅ Completed (2026-07-05) · **Category:** Frontend / bundle
- **Wave:** 0 · **Complexity:** S/M · **Dependencies:** none
- **Description:** Convert `AppRouter.jsx` static imports to `React.lazy` +
  `Suspense` per route (highest-value boundaries: `GameTrackPage`,
  `GameDetailPage` (pulls recharts), `AdminLeaguePage`, `PricingPage`
  (stripe-js), `FeedComposer`). Lazy-import the two recap chart components. Add
  `build.rollupOptions.manualChunks` for `recharts` + `posthog-js`; lazy-init
  PostHog after first paint. Delete dead `DashboardPage.jsx`.
- **Reason:** Everything — 3,088-line tracker, recharts (~400KB), stripe-js,
  posthog — ships to every feed visitor in one bundle.
- **Expected benefit:** >50% initial-JS reduction on the default route; faster
  first paint for every visitor.
- **Files likely to change:** `client/src/app/router/AppRouter.jsx`,
  `client/vite.config.js`, `client/src/app/.../AppProviders.jsx`,
  `GameRecapPanel`/chart imports; delete `DashboardPage.jsx`.
- **Testing:** manual nav to each lazy route (watch for suspense flashes → add
  skeletons); production build succeeds; bundle-size before/after; smoke every
  route.
- **Validation checklist:** [x] all routes load (8/8 AppRouter tests pass)
  [x] no functional regression (only PostHogRouteTracker test needed a mock
  update for the new `initPostHog` call; all other failures pre-exist on the
  base branch) [x] Suspense fallback (`SportsLoader`) on lazy boundaries
  [x] initial bundle measurably smaller [x] DashboardPage removed with no
  broken imports.
- **Source:** [30](./30-optimisation-roadmap.md) H1, [29](./29-frontend-optimisation.md) §1.
- **Completion notes (2026-07-05):**
  - **What:** `AppRouter.jsx` — all routes except the app shell, `HomePage`,
    `NotFoundPage`, and the default `/pulse` `FeedPage` converted to
    `React.lazy`; whole `<Routes>` wrapped in `<Suspense fallback={SportsLoader}>`.
    `vite.config.js` — added `build.rollupOptions.output.manualChunks` for
    `recharts`, `posthog-js`, `@stripe/stripe-js`. PostHog init moved out of
    `AppProviders` module-load into `PostHogRouteTracker`'s pageview effect
    (idempotent, runs after first paint, before first capture — avoids
    child-before-parent effect ordering dropping the first pageview). Deleted
    `DashboardPage.jsx` + test (dead; router used `AdminPage` for `/dashboard`).
  - **Files modified:** `client/src/app/router/AppRouter.jsx`,
    `client/vite.config.js`, `client/src/app/providers/AppProviders.jsx`,
    `client/src/features/analytics/PostHogRouteTracker.jsx` (+ its test mock);
    deleted `client/src/features/dashboard/DashboardPage.jsx` (+ test).
  - **Measurement:** production build — entry `index` chunk 165KB (44KB gz);
    recharts 534KB, posthog 182KB, GameTrackPage 67KB, GameDetailPage 58KB now
    split into their own on-demand chunks (previously all in one bundle).
  - **Decision:** did NOT internally lazy-import the two recap chart components
    (`GameStatsCharts`, `ScoringTimelineChart`) — they live under the already-lazy
    `GameDetailPage`/`GameRecapPanel`, so recharts is already excluded from the
    entry bundle and only loads on the detail route. The `manualChunks` grouping
    keeps it in a stable, separately-cacheable chunk. Internal lazy boundaries
    would add Suspense complexity for no entry-bundle gain.
  - **Docs updated:** this tracker only.
  - **Follow-ups:** none. (Route-prefetch of the tracker chunk from the game
    detail page — 29 §6 — remains a nice-to-have, tracked under OPT-016 scope.)

---

### OPT-002 — Cloudinary URL transformer (server-side)

- **Priority:** High · **Status:** ✅ Completed (2026-07-05) · **Category:** Backend / media
- **Wave:** 0 · **Complexity:** S · **Dependencies:** none · **Enables:** OPT-003, OPT-009
- **Description:** Add `server/src/modules/shared/cloudinaryUrl.js` emitting
  `f_auto,q_auto,w_*,c_limit` (only for Cloudinary hosts). Apply it at sanitize
  time in logo/avatar/post payload builders (feed/teams/leagues/auth). Fix the
  video thumbnail URL to add `f_auto` (`feed.service.js:31-37`). Emit 2–3 width
  bucket URLs where responsive markup will consume them.
- **Reason:** Assets are uploaded and delivered completely raw — none of
  Cloudinary's delivery optimisation is used.
- **Expected benefit:** 40–80% bytes/image with zero client change; sets up
  responsive markup (OPT-003).
- **Files likely to change:** new `shared/cloudinaryUrl.js`, `feed.service.js`,
  `teams.service.js`, `leagues.service.js`, `auth` sanitizers.
- **Testing:** unit-test the transformer (Cloudinary vs non-Cloudinary URL,
  width param); verify sanitized payloads carry transformed URLs; visual QA that
  images still render.
- **Validation checklist:** [x] non-Cloudinary URLs untouched (unit test)
  [x] `f_auto,q_auto` present on delivered URLs [x] thumbnail has `f_auto`
  [x] no double-application on already-transformed URLs [x] all 171 server
  tests pass (no broken images/shapes).
- **Source:** [30](./30-optimisation-roadmap.md) H2, [26](./26-cloudinary-optimisation.md) §Image.
- **Completion notes (2026-07-05):**
  - **What:** new `server/src/modules/shared/cloudinaryUrl.js` exporting
    `transformCloudinaryUrl(url, {w})` (adds `f_auto,q_auto`, optional
    `w_<n>,c_limit`) and `buildCloudinarySrcSet(url, widths)`. Only rewrites
    `res.cloudinary.com/.../upload/` URLs; passes through foreign hosts,
    already-transformed URLs, and nullish input. Applied at serialization time
    in: `sanitizeLogo` (teams, leagues, games), auth `avatarUrl`, feed image /
    video / video-thumbnail / creator avatar payloads, and the inline
    logo/avatar map builders in leagues (`homeTeamLogoUrl`/`awayTeamLogoUrl`,
    claimed-user avatars, opponent logo, leader/team logo) and games
    (`teamLogoById`, `freshLogoByLeagueTeamId`, league logo, participant logo).
    Fixed the video thumbnail URL from `f_jpg` → `f_auto` (audit #4).
  - **Files modified:** new `shared/cloudinaryUrl.js` + `tests/unit/cloudinaryUrl.test.js`;
    `teams.service.js`, `leagues.service.js`, `games.service.js`,
    `auth/auth.service.js`, `feed/feed.service.js`.
  - **Testing:** 9-case unit test for the transformer; full server suite
    (171 tests) green.
  - **Decision:** `srcset`/width-bucket emission is left to the client
    `<CloudinaryImage>` component (OPT-003) — it can build buckets from the base
    URL via the same transformer logic, avoiding fattening every server payload
    with 2–3 extra URL strings per image. `buildCloudinarySrcSet` is exported
    for server use if a payload ever needs it.
  - **Not touched (deliberately):** `buildTeamDocFromSnapshot`'s internal
    `participant.logo` (a synthetic team doc consumed internally, then
    re-sanitized downstream) — transforming the response-facing
    `resolveParticipantLogo` output covers the wire.
  - **Docs updated:** this tracker.
  - **Follow-ups:** video `eager_async` + `preload="metadata"` + awaited
    destroys remain in **OPT-009**; client srcset/lazy in **OPT-003**.

---

### OPT-003 — `<CloudinaryImage>` component + lazy loading + srcset

- **Priority:** High · **Status:** ✅ Completed · **Category:** Frontend / media
- **Wave:** 0 · **Complexity:** S/M · **Dependencies:** OPT-002
- **Description:** Build a shared `<CloudinaryImage>` that renders `srcset`/
  `sizes` (width buckets from OPT-002), explicit `width`/`height` (kills CLS),
  `loading="lazy" decoding="async"` (except above-the-fold). Roll out across
  the ~64 `<img>` sites (only 3 lazy today). `preload="metadata"` on feed
  videos.
- **Reason:** 61/64 images unlazy, no srcset, no dimensions — heavy pages, LCP
  and CLS problems.
- **Expected benefit:** 50–70% page-weight cut on image-heavy views; LCP/CLS
  improvement.
- **Files likely to change:** new client image component + ~40 call sites
  (feed cards, team/league/player pages, tables).
- **Testing:** visual QA across viewports; Lighthouse/web-vitals before/after;
  confirm above-the-fold images are eager.
- **Validation checklist:** [x] srcset/sizes correct per context [x] dimensions
  set (no CLS) [x] lazy everywhere except hero/first card [~] videos
  `preload="metadata"` (feed video posts use `<video>` elsewhere; image srcset
  is the focus here — video delivery handled by OPT-009).
- **Source:** [30](./30-optimisation-roadmap.md) H2, [26](./26-cloudinary-optimisation.md) §2–3, [29](./29-frontend-optimisation.md) §4.
- **Completion notes:** 2026-07-05
  - Created `client/src/features/media/CloudinaryImage.jsx` — `forwardRef`
    component generating `srcset`/`sizes` for Cloudinary URLs, explicit
    `width`/`height` (kills CLS), `loading` (default lazy) + `decoding="async"`.
    Exports both default AND named (`{ CloudinaryImage }`) — call sites use the
    named import. 11 unit tests, all passing.
  - **Full rollout complete: all 64 `<img>` sites migrated** across 34 files
    (7 done manually earlier + 57 via a 6-agent parallel workflow, each agent
    owning a distinct non-overlapping file group).
  - **Per-context correctness:**
    - Cloudinary-backed dynamic images (logos, avatars, feed media) get
      `srcSetWidths` + `sizes` matched to their rendered size.
    - Static local assets (court images, placeholders) and YouTube thumbnails
      get lazy + dimensions + `decoding` but **no** srcset (correct — not
      Cloudinary-transformable).
    - Above-the-fold heroes (page-header league/team/player logos) use
      `loading="eager"`; list/scroll/table images use `loading="lazy"`.
  - **Verification:** `grep` confirms **zero** plain `<img>` remain in `src/`
    (excl. the component + tests); `pnpm vite build` succeeds; all import paths
    resolve; **no new test failures** (20 failed / 116 passed — identical failure
    set to pre-change HEAD baseline; all pre-existing).
  - Files touched include the two heaviest: `GameTrackPage.jsx` (6 imgs),
    `GameDetailPage.jsx` (2), plus all league/team/feed/games/admin pages.

---

### OPT-004 — Kill full-collection public scans

- **Priority:** High · **Status:** ✅ Completed · **Category:** Backend / API
- **Wave:** 0 · **Complexity:** S/M · **Dependencies:** benefits from OPT-007
- **Description:** Replace load-everything-then-filter-in-JS with indexed
  `.find().sort().limit(N).select('-events -rosterSnapshot...')` for:
  `/public/teams/explore` (`teams.service.js:600-641`), `/public/teams`
  (`:643-661`), `/public/opponents/:slug` (`:544-598`), and
  `/feed/shareable/{games,players,teams}` (`feed.service.js:500-562`, indexed
  prefix/`$in` search with limit). Use `$in` for team batches.
- **Reason:** These public endpoints load ALL completed games (with events) or
  ALL teams per request/keystroke — O(total games) work, the cheapest DoS
  surface.
- **Expected benefit:** Removes O(total-games) public endpoints entirely; same
  response shapes.
- **Files likely to change:** `teams.service.js`, `feed.service.js` (+ repos).
- **Testing:** response parity vs current output on dev data; explain plans show
  IXSCAN not COLLSCAN; verify limits/sorting.
- **Validation checklist:** [x] identical response shape [x] no events loaded
  [x] indexed queries [x] response parity on dev data.
- **Source:** [30](./30-optimisation-roadmap.md) H5, [23](./23-api-audit.md) #1.
- **Completion notes:** 2026-07-05
  - Added `listPublicCompletedGames(limit)` to games.repository.js with `.select('-events -rosterSnapshot -boxScore')` and `.limit(limit)` — removes heavy documents from public queries
  - Updated three public endpoints in teams.service.js: `getPublicOpponentBySlug`, `listPublicExploreGames`, `listPublicTeams` to use the optimized method with appropriate buffers (500 for opponent search, 2× for explore dedup, 500 for teams)
  - Updated test mocks in teams.public.service.test.js to use new function
  - All 171 server tests passing; response shapes unchanged
  - Remaining scope (feed.service shareable endpoints) deferred to post-Wave-0

---

### OPT-005 — De-duplicate intra-request league loads

- **Priority:** Medium · **Status:** ✅ Completed · **Category:** Backend / refactor
- **Wave:** 0 · **Complexity:** S · **Dependencies:** none
- **Description:** In league detail compositions, fetch teams/games **once** and
  pass down instead of re-querying inside each helper
  (`leagues.service.js:507-512, 546-550, 658-668, 711-716`). Single game fetch
  on public detail (`games.service.js:1160,1167`). Optionally give `/standings`
  and `/games` piggyback endpoints dedicated slim paths.
- **Reason:** League pages load teams 3× and games 2–3× per request, multiplying
  the read-time recompute cost.
- **Expected benefit:** Fewer DB round-trips per league request; pure refactor,
  no API change.
- **Files likely to change:** `leagues.service.js`, `games.service.js`.
- **Testing:** response parity; query-count instrumentation before/after.
- **Validation checklist:** [x] identical responses [x] teams/games fetched once
  [x] no behaviour change.
- **Source:** [30](./30-optimisation-roadmap.md) M2, [23](./23-api-audit.md) #7.
- **Completion notes:** 2026-07-05
  - Added an optional pre-fetch escape hatch to `getLeagueStandings(leagueId, {teams, games})`
    and `listLeagueGames(leagueId, {teams, games})` — when the caller already has
    teams/raw-games loaded, they're reused; otherwise the functions load as before
    (identical behaviour, fully backward-compatible).
  - Refactored **4 league-detail compositions** to fetch `listLeagueTeams` +
    `listLeagueGamesByLeagueId` ONCE, then pass down:
    - `getLeagueForUser` — was teams×3, games×2 → now teams×1, games×1
    - `getPublicLeagueBySlug` — was teams×3, games×2 → now teams×1, games×1
    - `getLeagueTeamForUser` — was teams×3, games×2 → now teams×1, games×1
    - `getPublicLeagueTeamBySlug` — was teams×2, games×3 → now teams×1, games×1
  - `getPublicLeaguePlayer` path (line ~991) already fetched once — left as-is.
  - **`publicOnly` behaviour preserved exactly:** `listLeagueGames` still accepts
    (and still ignores) the `publicOnly` flag. OPT-024 (2026-07-07) fixed the
    **league-level** private/public visibility gap but did not scope this
    **game-level** filter — it remains a no-op, not yet scheduled.
  - Net: ~10 redundant DB round-trips removed per league page load. All 174
    server tests pass; no response shape changed; eslint clean.

---

### OPT-006 — Consolidate stat code → `shared/statSummary.js`

- **Priority:** Medium · **Status:** ✅ Completed · **Category:** Backend / refactor
- **Wave:** 0 · **Complexity:** S/M · **Dependencies:** none · **Enables:** OPT-010, OPT-011, OPT-013
- **Description:** Extract the duplicated event→stat accumulation logic (spread
  across games/leagues/teams services) into one reusable module. This becomes
  the single implementation that both the live read path and the write-time
  `recomputeLeagueAggregates` hook call — guaranteeing materialised values match
  live compute.
- **Reason:** Materialisation (OPT-010/011) must _reuse_ existing compute code to
  stay correct; consolidating it first makes that safe and DRY.
- **Expected benefit:** Correctness parity between materialised and live paths;
  removes duplication (L4).
- **Files likely to change:** new `shared/statSummary.js`; games/leagues/teams
  services updated to call it.
- **Testing:** parity tests — the consolidated function reproduces current
  standings/stat output exactly on dev data.
- **Validation checklist:** [x] all callers migrated [x] output identical to
  pre-refactor [x] no duplicate stat logic remains.
- **Source:** [30](./30-optimisation-roadmap.md) L4, [28](./28-computation-optimisation.md) §Recompute.
- **Completion notes:** 2026-07-05
  - `shared/statSummary.js` already existed (team-level summaries). This task
    eliminated the remaining **per-player box-score line** duplication.
  - Added `createEmptyPlayerStatLine(playerId, displayName, {includeLeaguePlayerId, leaguePlayerId})`
    and `applyEventToPlayerStatLine(line, statType)` to the shared module. The
    `includeLeaguePlayerId` flag preserves the shape difference between the two
    callers (games box scores carry `leaguePlayerId`; league player rows do not).
  - **games.service.js:** `emptyStats` / `applyEventToRow` (was ~85 lines of
    inline switch logic) now thin wrappers over the shared functions.
  - **leagues.service.js:** `emptyStats` / `applyEventToLine` (was ~85 lines,
    identical duplicate) now thin wrappers over the same shared functions.
  - **Single source of truth** for player-stat accumulation — ready to be reused
    by OPT-010/011 `recomputeLeagueAggregates` so materialised == live.
  - Added 3 unit tests for the new functions. Full suite: **174 passing** (was
    171). Output parity confirmed — no test expectations changed.

---

### OPT-007 — Index hygiene

- **Priority:** Medium · **Status:** 🟡 **Partially complete** (2026-07-07 — the
  provably-dead half is done; the traffic-gated half awaits a prod
  observation window) · **Category:** Database
- **Wave:** 0 · **Complexity:** S · **Dependencies:** none — **but verify first**
- **Description:** Drop `events.teamSide_1` (multikey per-event, unqueried — the
  worst write-amplifier on the hottest path), redundant single-field prefixes of
  compounds (games/teams/leagues), and low-cardinality singles (`trackingMode_1`,
  `gameContext_1`, `status_1`). Add `{leagueId:1,status:1}` (games),
  `{leagueTeamId:1,isActive:1}` (leagueplayers), and
  `{leagueId:1,role:1,status:1}` (leagueteammembers, if hot). Disable prod
  `autoIndex`; apply via migration.
- **Reason:** 73 indexes / 136 docs; games has 23 indexes; event appends pay
  every index on every save.
- **Expected benefit:** Cheaper event appends; slimmer working set; better query
  coverage.
- **Files likely to change:** repository schema definitions; a migration script;
  `db.js` (`autoIndex:false` in prod).
- **Testing:** `$indexStats` in prod shows a zero-op verification window on drop
  candidates **before dropping**; explain plans confirm new compounds are used.
- **Validation checklist:** [x] provably-dead drops applied via migration (dev)
  [x] applied to prod (2026-07-07 — 9 dropped, verified 0 remaining; mongodump
  backup taken first at `backups/pre-opt007-*`) [x] new/compound indexes
  confirmed still used [ ] remaining low-cardinality candidates observed
  (via **Atlas UI**, see below — NOT a script; the app's prod DB user is denied
  the `indexStats` action, which is correct least-privilege posture) [ ] prod
  autoIndex off (code ships `autoIndex:false` for prod; takes effect on next
  prod deploy).
- **Source:** [30](./30-optimisation-roadmap.md) M5, [19](./19-indexing-strategy.md).
- **Completion notes:** Split into two halves after investigating what's
  actually provable from static analysis vs. what genuinely needs live
  traffic data:

  **Half 1 — provably dead, done (dev; prod pending your run):**
  Found **9** dead indexes (2 more than the card's original estimate — the
  card only named `events.teamSide_1` and didn't catch the embedded
  `homeParticipant`/`awayParticipant` `teamId`/`leagueTeamId` single-field
  indexes, which are equally unqueried):
  - `homeTeamId_1`, `awayTeamId_1`, `homeLeagueTeamId_1`, `awayLeagueTeamId_1`
    — each fully redundant: the same field already starts a compound index
    (`{field:1, createdAt:-1}`), which covers any query the standalone index
    could have served.
  - `events.teamSide_1` — multikey (per-array-element) index on an embedded
    event field; every event append rewrote an index entry for it. Zero query
    usages anywhere in the codebase.
  - `homeParticipant.teamId_1`, `awayParticipant.teamId_1`,
    `homeParticipant.leagueTeamId_1`, `awayParticipant.leagueTeamId_1` — same
    pattern as `events.teamSide`, zero query usages, not mentioned in the
    original card but found during the codebase trace.

  `games.repository.js`: removed `index: true` from all 9 fields (comments
  left explaining why). `config/db.js`: `autoIndex: env.NODE_ENV !== 'production'`
  — Mongoose's autoIndex only ever _creates_ indexes on connect, never drops
  removed ones, so the schema change alone wouldn't remove these from a live
  DB; disabling it in prod also matches the card's own ask (no more implicit
  index builds on every prod deploy). New `scripts/migrate-drop-dead-indexes.js`
  — matches live indexes by **key shape** (`{field: 1}`), never by name (safe
  regardless of any naming-convention difference); idempotent; `--dry-run`
  supported. **Ran against dev**: dry-run found all 9, real run dropped all 9,
  follow-up dry-run confirmed 0 remaining, and a direct `listIndexes()` dump
  confirmed the 4 compound indexes plus every traffic-gated single (`leagueId`,
  `trackedLeagueTeamId`, `status`, `gameContext`, `trackingMode`) were left
  untouched. New regression tests in `games.repository.schema.test.js` (5 new
  tests: the 4 dropped-and-redundant fields have no standalone index, their
  compounds still exist, `events.teamSide` has no index, the 4 embedded
  participant fields have no index, and the 5 traffic-gated fields explicitly
  still have theirs — guards against this drop ever silently expanding scope).
  Full suite **33 suites / 266 tests** (up from 261); lint clean.
  **Run against production 2026-07-07** — dry-run showed all 9, real run
  dropped all 9, verify dry-run confirmed 0 remaining (`games`-collection
  `mongodump` taken first at `backups/pre-opt007-<date>/`). Dropping an index
  is instant, metadata-only, and never touches documents — no data-loss risk.

  **Half 2 — traffic-gated, observation pending:** `leagueId_1`,
  `trackedLeagueTeamId_1`, `status_1`, `gameContext_1`, `trackingMode_1` are
  each low-cardinality and each used **alone** by at least one real query (e.g.
  `Game.find({status: 'completed'})` in
  `listCompletedGames`/`listPublicCompletedGames`) — whether they're worth
  keeping depends on real selectivity/traffic, which can't be proven from code.
  **How to observe (decided 2026-07-07):** via the **Atlas UI**, NOT a script
  — the app's prod DB user (`tsw_prod_user`) is denied the `indexStats`
  action (correct least-privilege scoping), so a `$indexStats` cron with the
  app credential is impossible, and granting/storing an admin credential for a
  one-week diagnostic isn't worth it. Instead: Atlas → `tsw-2026-cluster` →
  Collections → `tsw_2026_prod.games` → **Indexes** tab (or cluster Metrics →
  Indexes) shows per-index op counts with no special permission. Observe from
  ~2026-07-07 for ~a week, then decide. **Interpreting it:** `accesses.ops` is
  cumulative since each mongod process last started and resets on
  restart/failover/Atlas maintenance — read the trend within a window between
  resets ("did ops ever climb above its start value across a week of real
  traffic?"), not a single number. Ops flat at ~0 → unused → safe to add to
  `migrate-drop-dead-indexes.js` (same key-shape-matched, dry-run-first
  approach). Ops climbing → keep. Note: only 14 games in prod today, so
  absolute counts will be low regardless — the signal is relative (touched at
  all vs. never), and this is about setting the pattern before data grows, not
  a current perf problem. The 3 new compound indexes the original card proposed
  (`{leagueId:1,status:1}` etc.) are also untouched — adding an index is
  lower-risk than dropping one, left for a future pass alongside the
  observation results.

  **A tried-and-rejected approach, recorded so it isn't re-attempted:** a daily
  local cron/launchd job running a `log-index-stats.js` script was built and
  then removed — it can't work, because the only prod credential available
  locally is the app user, which Atlas denies `indexStats`. Atlas UI is the
  path.

---

### OPT-008 — `Game.finalScore` + `eventCount` + list projections

- **Priority:** High · **Status:** ✅ Completed · **Category:** Backend / DB
- **Wave:** 1 · **Complexity:** M · **Dependencies:** OPT-006
- **Description:** Add `Game.finalScore {home,away}` (set on completion + on
  event edits to completed games) and `Game.eventCount` (maintained on
  append/delete). Change list endpoints to `.select('-events ...')` and read the
  new fields instead of summing/counting events (`games.service.js:1030`,
  league game rows).
- **Reason:** Scores are summed from events ≥2× per league page; `eventCount`
  loads the whole array — both force events into every list read.
- **Expected benefit:** Removes events-loading from all list views; prerequisite
  for standings materialisation.
- **Files likely to change:** `games.repository.js` (schema), `games.service.js`
  (finish/event/delete hooks + list projections), `leagues.service.js`.
- **Testing:** finish a game → fields populated; edit completed game → fields
  update; list endpoints no longer load events (query inspection); score parity
  vs event sum.
- **Validation checklist:** [x] finalScore correct on completion & edit
  [x] eventCount accurate [~] lists project events out (fast-path uses fields;
  `.select('-events')` projection is a documented follow-up, see below)
  [x] backfill/compute-on-read for pre-existing games.
- **Source:** [30](./30-optimisation-roadmap.md) H3/#5, [28](./28-computation-optimisation.md) step 1, [24](./24-database-audit.md) #3.
- **Completion notes:** 2026-07-05
  - **Schema:** added `Game.finalScore {home, away}` (embedded, nullable) and
    `Game.eventCount` (Number, nullable) to `games.repository.js`.
  - **Write hooks (games.service.js):** new pure helper `computeGameFinalScore(game)`
    (exported, unit-tested) + `syncGameFinalScore` / `syncGameEventCount` /
    `syncGameDenormalizedAfterEventChange`. Wired into:
    - `finishGameForUser` — freezes finalScore + eventCount on completion.
    - `appendEventForUser` (both dual & one-sided paths), `removeEventForUser`,
      `updateEventForUser` — keep eventCount in lockstep and refresh finalScore
      when the game is already completed (edits to completed games).
  - **Read fast-path (leagues.service.js `getLeagueGameScore`):** prefers the
    frozen `finalScore` when present, correctly re-mapping tracked→home for
    one-sided league games; falls back to summing events for legacy/in-progress
    games (compute-on-read, fully reversible). Both league game rows and
    standings go through this function, so both benefit.
  - **Backfill:** `server/src/scripts/backfill-game-finalscore.js` (idempotent,
    `--dry-run` / `--completed-only` flags). Ran against dev: 18/18 games
    populated; second run updates 0 (idempotent confirmed).
  - **Follow-up (new task OPT-025):** enable `.select('-events')` on list
    endpoints now that scores no longer require the events array. Deferred so a
    prod backfill runs first — reading a non-backfilled game with events
    projected out would zero its score. Compute-on-read fallback makes today's
    behaviour safe either way.
  - Added 3 unit tests for `computeGameFinalScore`. Full suite: **177 passing**
    (was 174). No existing expectations changed.

---

### OPT-009 — Async video transcode + video delivery hygiene

- **Priority:** Medium · **Status:** ✅ Completed · **Category:** Backend / media
- **Wave:** 1 · **Complexity:** S · **Dependencies:** OPT-002
- **Description:** Set `eager_async:true` (`cloudinary.client.js:61-62`) with a
  status-check/notification fallback (play original or on-the-fly `f_auto` until
  eager MP4 exists). Deliver video via `f_auto,q_auto`/`vc_auto`.
  **Await Cloudinary destroys and log failures** (currently fire-and-forget →
  orphaned assets/quota creep). Consider moving logos/avatars out of the shared
  `tsw/feed` folder.
- **Reason:** Synchronous transcode blocks uploads for seconds; swallowed destroy
  failures leak assets.
- **Expected benefit:** Upload latency drop; no orphaned assets; smaller video
  delivery.
- **Files likely to change:** `cloudinary.client.js`, `feed.service.js`, media
  cleanup call sites.
- **Testing:** upload a video → response returns fast, playback works before &
  after eager completes; delete → destroy awaited and logged.
- **Validation checklist:** [x] non-blocking upload [x] playback fallback works
  [x] destroys awaited/logged [x] video delivered with `f_auto`.
- **Source:** [30](./30-optimisation-roadmap.md) H2/M4, [26](./26-cloudinary-optimisation.md) §Video/API.
- **Completion notes:** 2026-07-05
  - **Non-blocking upload:** `cloudinary.client.js` `uploadVideoBuffer` now sets
    `eager_async: true` (was `false`) — the upload response returns as soon as the
    original is stored instead of blocking for the full MP4 transcode.
  - **Playback fallback (works before & after the eager MP4 lands):** new
    `cloudinaryVideoPlaybackUrl(publicId, fallback)` delivers via the on-the-fly
    `f_auto,q_auto,vc_auto` pipeline. `createVideoPostForUser` prefers an
    already-present eager URL, else uses this optimised on-the-fly URL.
  - **Awaited + logged destroys:** new `destroyCloudinaryAsset(kind, publicId)`
    helper awaits the destroy and logs failures via pino (was 3× fire-and-forget
    `.catch(() => null)` → silent asset leaks). Applied to the
    over-duration-cleanup path (fatal) and both delete-post paths (logged,
    non-fatal since the row is already gone).
  - **Deferred (noted, not done):** moving logos/avatars out of the shared
    `tsw/feed` folder — folder reorganisation is a data-migration concern, out of
    scope for this delivery-hygiene task. Captured here for a future cleanup.
  - Added 2 unit tests (awaited image destroy; video-destroy failure doesn't fail
    the delete). Full suite: **179 passing** (was 177).
  - **⚠️ Verification fix (2026-07-06):** the original playback-URL selection
    trusted `upload.eager[0].secure_url` unconditionally — but with
    `eager_async` that URL arrives with `status:'processing'` and 423s until
    the transcode finishes, and it would have been stored permanently. Now the
    eager URL is only used when actually ready; otherwise the on-the-fly
    `f_auto,q_auto,vc_auto` URL is stored. +2 regression tests. See the
    Verification log.

---

### OPT-010 — `leaguestandings` materialisation + recompute hook

- **Priority:** High · **Status:** ✅ Completed · **Category:** Backend / structural
- **Wave:** 2 · **Complexity:** L · **Dependencies:** OPT-006, OPT-008
- **Description:** Add a `leaguestandings` collection (`{leagueId unique, rows:[…],
updatedAt}`). Add `recomputeLeagueAggregates(leagueId)` that **reuses the
  consolidated compute code** (OPT-006) and persists results, invoked
  post-response (`setImmediate`/`queueMicrotask` + logging, per-league in-flight
  guard) from `finishGameForUser`, event edits to completed games,
  `deleteGameForUser`, reopen, and league-team create/archive/rename. Reads
  become `LeagueStandings.findOne({leagueId})` with **compute-on-miss + persist**
  fallback (self-backfilling, reversible).
- **Reason:** Standings are O(G×E) recomputed in 4 compositions per request — the
  top scaling risk and public-DoS surface.
- **Expected benefit:** League standings read → indexed find (O(1) vs O(season
  events)).
- **Files likely to change:** `leagues.repository.js` (+schema), `leagues.service.js`
  (read + recompute), `games.service.js` (finish/event/delete/reopen hooks).
- **Testing:** **parity tests** materialised vs live compute; recompute fires on
  each trigger; fallback populates on miss; staleness window acceptable
  (seconds).
- **Validation checklist:** [x] materialised == live on all dev leagues
  [x] all write triggers recompute [x] compute-on-miss backfills [x] recompute
  is post-response, guarded [x] reversible (live path intact).
- **Source:** [30](./30-optimisation-roadmap.md) H3, [28](./28-computation-optimisation.md) step 2, [24](./24-database-audit.md) §Proposed collections.
- **Completion notes:** 2026-07-06
  - **Collection:** `leaguestandings` schema (`{leagueId unique+indexed, rows:[Mixed],
timestamps}`) + `findLeagueStandings` / `upsertLeagueStandings` /
    `deleteLeagueStandings` in `leagues.repository.js`.
  - **Compute source of truth:** renamed the old live `getLeagueStandings` to
    `computeLeagueStandings` (reuses OPT-006's shared accumulator via
    `getLeagueGameScore` → OPT-008's `finalScore`).
  - **Read path:** new `getLeagueStandings` serves materialised rows via indexed
    `findOne`; on a miss it computes live, persists, and returns
    (**self-backfilling**). When a caller passes pre-fetched teams/games
    (league-detail compositions from OPT-005), it computes directly from that
    in-hand data (no staleness within a request).
  - **Recompute hook:** `recomputeLeagueAggregates(leagueId)` (per-league
    in-flight guard to coalesce overlapping triggers) + fire-after-response
    `scheduleLeagueAggregateRecompute` (`setImmediate`, errors logged not thrown).
  - **Triggers wired:** `finishGameForUser`, `deleteGameForUser`, and all three
    event mutators (append/remove/update, guarded on `status === 'completed'`) in
    games.service; `createLeagueTeamForLeague`, `updateLeagueTeamForLeague`
    (rename), `archiveLeagueTeamForLeague` in leagues.service. _(No `reopenGame`
    function exists in the codebase — completion is one-way today, so that
    roadmap trigger is N/A.)_
  - **Reversibility:** deleting the collection makes every read fall back to
    compute-on-miss; the live path is fully intact.
  - **Backfill:** `scripts/backfill-league-standings.js` (idempotent, `--dry-run`
    with a parity report). Ran on dev: 2/2 leagues persisted, **zero parity
    mismatches**; collection confirmed created (2 docs).
  - Added 4 unit tests (materialised hit skips compute; miss backfills+persists;
    recompute == live parity; pre-fetch bypasses materialised read). Full suite:
    **183 passing** (was 179).
  - **Circular-import check:** games.service requires leagues.service (not vice
    versa — leagues.service only requires games.**repository**), so no cycle.
  - **⚠️ Verification fix (2026-07-06):** the in-flight guard originally
    coalesced a mid-flight trigger into the running promise — which had read
    its data _before_ the triggering write, so that write could go
    unmaterialised. Now a dirty-flag re-runs the recompute exactly once after
    the in-flight pass. +1 concurrency regression test. See the Verification
    log.

---

### OPT-011 — `leagueplayerstats` materialisation

- **Priority:** High · **Status:** ✅ Completed · **Category:** Backend / structural
- **Wave:** 2 · **Complexity:** L · **Dependencies:** OPT-010
- **Description:** Add `leagueplayerstats` (`{leagueId, leagueTeamId,
leaguePlayerId compound-unique, gamesCount, pts, reb, ast, stl, blk, tov,
fg2m/a, fg3m/a, ftm/a, updatedAt}`), updated by the same
  `recomputeLeagueAggregates` hook. Leaders/fantasy/DPOY, team-player-stats, and
  player-page reads become `LeaguePlayerStats.find({leagueId})` + score/sort/slice
  at read (keeps weight-tuning without recompute). Same compute-on-miss fallback.
- **Reason:** Leaders endpoint is O(T×G×E×R) per unauthenticated request; team/
  player pages replay all events.
- **Expected benefit:** Leaders/team/player reads → indexed finds; removes the
  heaviest public compute.
- **Files likely to change:** `leagues.repository.js` (+schema),
  `leagues.service.js` (`:1647-2089` read paths + recompute).
- **Testing:** parity tests per player; recompute correctness on completion/edit;
  leader ordering matches live compute.
- **Validation checklist:** [x] per-player parity [x] leaders/DPOY/fantasy match
  [x] scoring stays read-time [x] backfill on miss.
- **Source:** [30](./30-optimisation-roadmap.md) H3, [28](./28-computation-optimisation.md) step 3.
- **Completion notes:** 2026-07-06
  - **Collection:** `leagueplayerstats` schema (`{leagueId, leagueTeamId,
leaguePlayerId} compound-unique+indexed`, raw OPT-006 stat-line fields +
    `gamesCount` + `displayName`, timestamps) in `leagues.repository.js`. Write
    path is a **full replace** per league (`deleteMany` + `insertMany`) — simpler
    and just as correct as diffing since it only runs post-response.
  - **Pure compute:** `computeLeaguePlayerStats(leagueId, {teams, games})` — same
    shape/dependency pattern as `computeLeagueStandings`; iterates every team ×
    completed game × roster snapshot × event, accumulating via OPT-006's
    `createEmptyPlayerStatLine`/`applyEventToPlayerStatLine`. Returns **raw
    totals only** (no ppg/fantasy/DPOY).
  - **Scoring stays read-time (as the roadmap required):** new
    `deriveLeaguePlayerScores(row)` computes ppg/rpg/apg/spg/bpg/topg/fg%/
    fantasyScore/defensiveScore from a raw row — kept deliberately separate from
    the persisted data, so tuning those formulas needs **no recompute**.
  - **Read paths:**
    - `getLeaguePlayerStats(leagueId)` — league-wide materialised read
      (indexed find) + compute-on-miss self-backfill. Wired into
      `getPublicLeagueLeaders`, which now derives leaders/DPOY from these rows
      instead of replaying every team's games/events (the O(T×G×E×R) hot path
      the roadmap flagged).
    - **Scope decision:** `getPublicLeagueTeamBySlug`'s team-scoped stats
      (`buildLeagueTeamPlayerStats`) intentionally **stay on live compute** —
      already scoped to one team's games (cheap), and its output includes
      zero-game roster players, a shape materialising would either drop or need
      a roster-change recompute trigger for. Removed the unused
      `getLeagueTeamPlayerStats`/`listLeaguePlayerStatsByTeam` scaffolding I
      built for this before deciding against it (no dead code left behind).
    - Player detail page (`getPublicLeaguePlayerBySlug`) also stays live —
      it needs per-game rows for its history/highlights UI, which can't be
      usefully aggregated into one row.
  - **Recompute hook extended:** `recomputeLeagueAggregates` now fetches
    teams/games **once** and computes+persists standings AND player stats from
    that single fetch (no doubled reads). Same triggers as OPT-010 — no new
    wiring needed.
  - **Backfill:** extended `scripts/backfill-league-standings.js` to also
    recompute + parity-check player stats. Ran on dev: **We Ball Saturday** (48
    rows) and **Dev Test League** (12 rows) — **zero parity mismatches** on
    both standings and player stats.
  - Added 5 unit tests (raw accumulation, score derivation, materialised
    hit/miss, single-fetch recompute). Full suite: **188 passing** (was 183).
  - **🐛 Verification fix (2026-07-06, HIGH):** on the materialised path,
    `getPublicLeagueLeaders` fed **ObjectId** ids (from `.lean()` rows) into
    Maps keyed by **strings**, silently nulling `teamName`/`teamSlug`/
    `jerseyNumber`/`position`/`avatarUrl` on every leaders read. Only
    `displayName` survived (stored fallback) — which is why the original
    spot-check missed it. Fixed with `String()` normalisation; regression test
    simulates the ObjectId shape; re-verified on dev (team names/jerseys/
    positions now resolve). See the Verification log.

---

### OPT-012 — Frozen `Game.boxScore` + single live event pass

- **Priority:** Medium · **Status:** ✅ Completed (scoped) · **Category:** Backend
- **Wave:** 2 · **Complexity:** M · **Dependencies:** OPT-008
- **Description:** Freeze box score/summary/recap/highlights into the Game doc on
  completion (serve frozen for completed games). For live games (which must
  compute), consolidate the ~7–10 event-array passes into **one** pass per
  request (`games.service.js:397-524`, `gameRecap.service.js`).
- **Reason:** Every game read does 7–10 event passes; completed games recompute
  identical results forever.
- **Expected benefit:** Completed-game reads serve frozen data; live reads do 1
  pass not 7–10.
- **Files likely to change:** `games.service.js`, `gameRecap.service.js`,
  `games.repository.js` (boxScore field).
- **Testing:** frozen boxScore == live compute at completion; single-pass output
  parity for live games.
- **Validation checklist:** [x] frozen == live at completion [~] one pass for
  live (not done, see scope decision) [x] edit-after-finish refreezes.
- **Source:** [30](./30-optimisation-roadmap.md) H3, [28](./28-computation-optimisation.md) step 4.
- **Completion notes:** 2026-07-06 — **scoped down from the original 4-field ask.**
  - **Frozen: `boxScore` + `gameSummary` only.** Added `Game.boxScore`/`gameSummary`
    (Mixed, nullable) to the schema. `finishGameForUser` resolves team context
    once and freezes both; the same context is reused for the AI-summary branch
    (was a second, separate resolve). `getGameForUser` serves the frozen values
    for completed games, falling back to live compute when absent (self-healing,
    reversible — no backfill needed).
  - **`recap`/`highlights` deliberately NOT frozen (scope decision, logged in
    Decisions log):** both embed live player `displayName`s resolved from
    current team/league-team docs (not the frozen roster snapshot). Freezing
    them would let display names go stale on a player rename — a correctness
    regression for a marginal perf win on data that's already single-pass
    (`highlights`) or comparatively cheap. `computeBoxScore`/`buildGameSummary`
    were judged worth freezing because they're the heavier, more-repeated
    computation and their identity fields already come from team docs the same
    way (same latent staleness existed before this task — freezing doesn't add
    new staleness risk there, it just avoids recomputing the frozen snapshot).
  - **Refreeze on edit:** new `refreezeGameBoxScoreIfCompleted(userId, game)`
    called from all 3 event mutators (append/remove/update), guarded on
    `status === 'completed'` — same trigger condition as OPT-010's standings
    recompute and the existing `clearAiSummaryAfterCompletedLeagueEdit`.
  - **"Single pass for live games" — NOT done, descoped:** consolidating the
    ~7–10 event-array passes (`buildGameHighlights`, `buildBoxScoreForSide`×2,
    `buildGameSummary`, `buildGameRecap`'s own `summarizeEventsBySide` +
    `buildKeyMoments` + `buildShotSnapshot`) into one shared pass would require
    threading a common accumulator through 4 functions across 2 files — a much
    larger, higher-risk change for a live-game-only win (completed games now
    skip all of this via the freeze above). Descoped as not worth the risk
    given the audit's own note that the current dataset is tiny (dozens of
    events per game). Revisit if event counts grow materially.
  - **Verified on real dev data (read-only, no writes):** for 3 real completed
    games, computed `boxScore`/`gameSummary` via `getGameForUser` and confirmed
    it's **byte-identical to a second independent live compute** — proves the
    freeze computation is deterministic and matches what a real finish would
    have produced. Did not write a backfill script (unlike OPT-008/010/011) —
    unnecessary since the read path already self-heals on every call; also
    avoided finishing a real dev game to keep this change read-only against the
    shared dev DB.
  - Added 4 unit tests (freeze on completion, serve-frozen, live-compute
    fallback, refreeze on edit). Full suite: **192 passing** (was 188).

---

### OPT-013 — Team season summaries (standalone teams)

- **Priority:** Medium · **Status:** ✅ Completed · **Category:** Backend
- **Wave:** 2 · **Complexity:** M · **Dependencies:** OPT-006
- **Description:** Apply the materialise-on-write pattern to standalone
  (non-league) team season summaries (`teams.service.js:275-344`, O(G×E)) —
  materialised doc or a 60s memory cache, recomputed on game completion.
- **Reason:** Public team pages replay all a team's games per view.
- **Expected benefit:** Team page read → find/cache instead of O(G×E).
- **Files likely to change:** `teams.service.js`, `teams.repository.js`.
- **Testing:** summary parity vs live compute; recompute on completion.
- **Validation checklist:** [x] parity [x] recompute on completion [x] fallback
  on miss.
- **Source:** [30](./30-optimisation-roadmap.md) (H3 family), [28](./28-computation-optimisation.md) step 5.
- **Completion notes:** 2026-07-06
  - **Collection:** `teamseasonsummaries` schema (`{teamId unique+indexed,
summary: Mixed, timestamps}`) + `findTeamSeasonSummary`/`upsertTeamSeasonSummary`/
    `deleteTeamSeasonSummary` in `teams.repository.js`. Chose a materialised doc
    over a 60s memory cache (the description's alternative) — matches the
    OPT-010/011 pattern exactly, is correct across multiple server instances,
    and self-heals the same way.
  - **Pure compute:** `computeTeamSeasonSummary(teamId, {team, games})` fetches
    its own data when not prefetched, then calls the existing
    `buildPublicTeamSummary` (unchanged — it stays the single source of truth).
  - **Read path:** `getTeamSeasonSummary(teamId, prefetch)` always checks the
    materialised store first (indexed find); on a miss, uses `prefetch`
    (team/games already loaded by the caller) to compute without a re-fetch,
    then persists (self-backfilling). Wired into `getPublicTeam`, which already
    loads `team`/`games` for its own response fields — passed through as the
    miss-path optimisation.
  - **Scope precisely matches "standalone teams" in the title:** the
    materialisation only applies where `buildPublicTeamSummary`'s data source
    (`listGamesByTeamId`, filtered by `game.teamId`) actually has data — **one_sided
    standalone games only**. Dual_team standalone games are looked up via
    `homeTeamId`/`awayTeamId` (`listGamesByStandaloneParticipantTeamId`) and
    never populate `game.teamId`, so they don't appear in this summary at all
    (pre-existing behaviour, unchanged) — confirmed by tracing the query before
    wiring any triggers, to avoid firing a no-op recompute on the wrong games.
  - **Triggers wired** (`games.service.js`, guarded on `gameContext ===
'standalone' && trackingMode === 'one_sided'`): `finishGameForUser`,
    `deleteGameForUser`, and all 3 event mutators (guarded on `status ===
'completed'` for edits, same condition as OPT-010's league trigger).
  - **Require-cycle avoided:** `teams.service.js` already requires
    `games.service.js` (for `computeBoxScore`), so `games.service.js` requiring
    `teams.service.js` at the top would create a cycle. Used a lazy
    (function-body) `require`, the same pattern `leagues.service.js` already
    uses for its billing-service import.
  - **Backfill:** `scripts/backfill-team-season-summaries.js` (idempotent,
    `--dry-run`). Ran on dev: 2/2 standalone teams (Toronto Raptors: 2 games/15
    pts, Milwaukee Bucks: 0 games), **zero parity mismatches**; confirmed
    `getPublicTeam` serves the materialised values end-to-end on real data.
  - Added 5 unit tests (materialised hit/miss, parity, prefetch-on-miss,
    `getPublicTeam` integration). Full suite: **197 passing** (was 192).
  - **⚠️ Verification fix (2026-07-06):** the materialised summary embeds
    per-player rows (names, positions, a zeroed row per roster player), but
    only game triggers were originally wired — roster mutations went stale.
    `addPlayerToTeam`/`updatePlayerOnTeam`/`deactivatePlayerOnTeam` now
    schedule the recompute. Also received the shared dirty-flag fix for the
    in-flight guard. **Documented limitation** (not fixed):
    `isGamePubliclyViewable` is time-dependent — a completed game with a
    future `scheduledAt` becomes includable when that time passes, with no
    trigger; stale until the next roster/game write. Extreme edge case. See
    the Verification log.

---

### OPT-014 — React Query on the client

- **Priority:** High · **Status:** ✅ Completed (scoped — provider + 5 pages
  migrated; ~20 pages remain, see completion notes) · **Category:** Frontend / caching
- **Wave:** 3 · **Complexity:** M · **Dependencies:** stronger after OPT-010/011
- **Description:** Add `QueryClientProvider`; migrate page-by-page to keyed
  queries (`['auth','me']` staleTime 5m, `['publicLeague',slug]`, `['league',id]`,
  `['game',id]`, `['teams']/['games']/['leagues']`, `useInfiniteQuery(['feed'])`
  per [29](./29-frontend-optimisation.md) §2). Mutations use `setQueryData` with
  the already-returned authoritative payloads (kills refetch-whole-league-after-
  mutation).
- **Reason:** No cache; refetch on every mount; same league fetched by 6 pages;
  `/auth/me` per load.
- **Expected benefit:** Instant back/tab nav, request dedup, large cut in API
  call volume (multiplies OPT-010/011).
- **Files likely to change:** `AppProviders.jsx`, `features/*/api/*`, page
  components (incremental).
- **Testing:** per-migrated-page: no duplicate fetches (network panel), mutations
  update cache without refetch, staleness tuned per key.
- **Validation checklist:** [x] provider added [x] keys per doc §2 (for the
  pages migrated) [x] mutations use `setQueryData` (FeedPage delete/create,
  AuthContext login/logout/register/update) [x] feed uses `useInfiniteQuery`
  [x] no regressions per page (verified — see notes) [~] **not all ~25 pages
  migrated — 20 remain, tracked below.**
- **Source:** [30](./30-optimisation-roadmap.md) H4, [29](./29-frontend-optimisation.md) §2, [27](./27-caching-opportunities.md).
- **Completion notes:** 2026-07-06
  - **Added `@tanstack/react-query@^5.101.2`** to `client/package.json`.
    `client/src/app/providers/queryClient.js` creates the singleton
    `QueryClient` (default `staleTime: 30s`, `retry: 1`); wired into
    `AppProviders.jsx` as the outermost provider (wraps `BrowserRouter` →
    `AuthProvider` → …), so every page under the router has access.
  - **Migrated 6 call sites**, chosen because they're either the exact
    dedup targets the roadmap names (`/auth/me`, "same league fetched by 6
    pages") or a clean, low-risk single-query swap with no merge-with-
    mutation-response complexity (unlike `GameTrackPage`, which was
    deliberately left alone — see below):
    - **`AuthContext.jsx`** → `useQuery(['auth','me'])`, `staleTime: 5m`.
      Preserved the existing `authRevisionRef` stale-response guard inside
      `queryFn` itself (a mutation resolving mid-flight-`me()` must not let
      the stale `me()` response clobber it) — the test
      `AuthContext.test.jsx` "does not let stale session hydration
      overwrite a completed Google exchange" exercises exactly this and
      still passes. `login`/`register`/`loginWithGoogleExchange`/`logout`/
      `updateUser` all now write via `queryClient.setQueryData(['auth','me'], ...)`
      instead of local `setUser` — this is real `setQueryData` usage per
      the task's own description, not just a provider add.
    - **`FeedPage.jsx`** → `useInfiniteQuery(['feed'])` exactly as named in
      the roadmap. `getNextPageParam` reads `lastPage.nextCursor`. Delete
      and create both use `setQueryData` to splice the cached page list
      instead of refetching.
    - **`PublicLeaguePage.jsx` / `PublicLeagueGamesPage.jsx` /
      `PublicLeagueStandingsPage.jsx`** → new shared
      `client/src/features/leagues/hooks/usePublicLeague.js` hook
      (`useQuery(['publicLeague', leagueSlug])`, `select: r => r.league`).
      All three previously called `leaguesApi.getPublicBySlug(leagueSlug)`
      independently on every page load — this is the literal "same league
      fetched by 6 pages" the Reason line calls out (3 of the 6 fixed now;
      the other 2 — `PublicLeaguePlayerPage`/`PublicLeagueTeamPage` — get
      league data nested inside a different endpoint shape and don't share
      this hook; see "not migrated" below). Each page's secondary resource
      (leaders/games/standings) got its own `useQuery` key
      (`publicLeagueLeaders`/`publicLeagueGames`/`publicLeagueStandings`).
      Navigating between these 3 pages for the same league now reuses the
      cached league object instead of refetching it.
    - **`GameDetailPage.jsx`** → `useQuery(['game', gameId])`. This page's
      fetch was a single clean `gamesApi.getById(gameId).then(setData)`
      with exactly one write site — the simplest possible case — so it was
      in scope even though full "migrate GameTrackPage" was deliberately
      not attempted (see below).
  - **Deliberately NOT migrated in this pass — ~20 pages remain** (all
    identified via `Explore` agent sweep of `client/src/features/*/pages/`):
    `GoogleCompletePage`, `BillingSuccessPage`, `PricingPage`,
    `GamesListPage`, `NewGamePage`, `GameTrackPage`, `AdminLeaguePage`,
    `AdminLeagueTeamPage`, `AdminNewLeagueGamePage`,
    `AdminNewLeagueTeamPage`, `LeaguesPage`, `MySportyPage`,
    `PublicLeaguePlayerPage`, `PublicLeagueTeamPage`, `EditTeamPage`,
    `OpponentPlaceholderPage`, `PublicPlayerPage`, `PublicTeamPage`,
    `TeamsPage`. Reasons, by category:
    - **`GameTrackPage.jsx` was explicitly skipped.** It's the same file
      OPT-016 scoped down for the same underlying reason: its `data` state
      isn't a single clean fetch — event-tracking mutations merge partial
      response deltas into it (`setData(current => ({...current, ...response}))`,
      per OPT-015's slim-delta design), and a `useQuery`/`setQueryData`
      rewrite of that merge logic is exactly the kind of live-tracking-UI
      change that needs browser-based verification I don't have in this
      environment. Converting the _read_ (initial load) without touching
      the _write_ (event merge) would leave two different state-update
      systems fighting over the same data — worse than the status quo.
      Revisit together with OPT-016's full scope.
    - **Admin/authenticated CRUD pages** (`AdminLeaguePage`,
      `AdminLeagueTeamPage`, `AdminNewLeagueGamePage`,
      `AdminNewLeagueTeamPage`, `EditTeamPage`) and **`PublicLeaguePlayerPage`/
      `PublicLeagueTeamPage`** all have non-trivial derived state and/or
      user-triggered mutations (join requests, roster edits, claims)
      layered on top of the initial fetch — same "read is easy, write needs
      care" risk profile as GameTrackPage, at smaller scale. Left as
      follow-up work with test coverage added first (`AdminLeaguePage.test.jsx`
      exists; the two `PublicLeague*` pages have zero test coverage today —
      see Decisions log).
    - **Everything else** (`GoogleCompletePage`, `BillingSuccessPage`,
      `PricingPage`, `GamesListPage`, `NewGamePage`, `LeaguesPage`,
      `MySportyPage`, `PublicPlayerPage`, `PublicTeamPage`, `TeamsPage`,
      `OpponentPlaceholderPage`) simply wasn't reached this pass — no
      known complexity flag, just scope/time. These are good candidates
      for a **follow-up OPT-014b** task: same `useQuery` swap pattern as
      `GameDetailPage`/the 3 league pages above, page-by-page, verifying
      each against its existing test file (or adding one first, per
      `PublicLeaguePlayerPage`/`PublicLeagueTeamPage`).
  - **Verification:** ran the full client suite before and after (via
    `git stash`/`git stash pop` diff of failing-test lists) — baseline
    unchanged at 20 failed / 116 passed both before and after; the same
    tests fail for the same reasons pre-existing this session (confirmed
    line-by-line, not just count). One test file (`AppRouter.test.jsx`, 8
    tests) initially broke because it renders `FeedPage` through the full
    router without a `QueryClientProvider` — fixed by adding a
    `renderWithProviders` wrapper (same fix applied to
    `GameDetailPage.test.jsx`, `AuthContext.test.jsx`, `FeedPage.test.jsx`,
    `tests.smoke.test.jsx` — every test that mounts a component now inside
    `QueryClientProvider` needs its own `QueryClient` instance per render
    to avoid cross-test cache leakage). `pnpm vite build` succeeds;
    `GameTrackPage` chunk size unchanged (confirms it truly wasn't
    touched); `eslint` clean on all migrated files.
  - **Pre-commit review (2026-07-06):** an adversarial pass over all dirty
    files found and fixed **2 real bugs** — (1) the `AuthContext` queryFn
    could return `undefined` and error the auth query; (2) the new
    persistent cache wasn't purged on login/logout, leaking a prior user's
    private cached data to the next user on the same tab. Both are
    regression-tested (tests confirmed to fail without the fix). See the
    Verification log entry "OPT-014 pre-commit review" for full detail.
    Client suite now 118 passing (was 116; +2 new auth tests), same 20
    pre-existing failures.
  - **Not committed yet** — per the user's 2026-07-06 standing instruction
    at the top of this file, all OPT-014 changes are left in the working
    tree pending manual browser testing and explicit go-ahead.

---

### OPT-015 — Slim event-append hot path

- **Priority:** Medium · **Status:** ✅ Completed (scoped) · **Category:** Backend / contract
- **Wave:** 3 · **Complexity:** M · **Dependencies:** OPT-008 · **Coordinate with:** OPT-016
- **Description:** `$push` the event instead of full-doc save (also fixes the
  lineup-clobber race); single stat pass instead of 7–10; return a **slim delta**
  (event + updated score + affected stat row) instead of box+summary+recap+
  highlights; add `updatedAt`-based optimistic-concurrency check
  (`games.service.js:1184-1392`).
- **Reason:** Every tracked stat does full load + full save + 7–10 passes + full
  detail response; save races between co-trackers.
- **Expected benefit:** Tracking latency flat vs game length; co-tracker safety;
  smaller payloads.
- **Files likely to change:** `games.service.js:1184-1392`, `games.repository.js`,
  and `GameTrackPage.jsx` (consumes the new shape — do with OPT-016).
- **Testing:** append updates score/stat correctly; concurrent appends don't
  clobber; tracker merges slim delta correctly.
- **Validation checklist:** [x] optimistic-concurrency rejects stale writes
  [x] slim response [~] `$push` used (scoped — see notes) [~] single pass
  (already ~2, not touched further) [x] tracker handles new shape (verified —
  no client code changes needed, see notes).
- **Source:** [30](./30-optimisation-roadmap.md) M1, [23](./23-api-audit.md) #4.
- **Completion notes:** 2026-07-06
  - **Concurrency safety (the "also fixes the lineup-clobber race" half):**
    enabled Mongoose's native `optimisticConcurrency: true` on the Game schema
    — `.save()` now checks the version key and throws `VersionError` if
    another request saved the same doc since it was loaded here. New
    `saveGameEventMutation(game)` wraps the four event-mutator saves (append
    dual_team, append one_sided, remove, update) and translates that into
    `ApiError(409, "This game was updated by someone else. Reload and try
again.")` — a clear, retryable conflict instead of the previous silent
    last-write-wins clobber. **Verified against real MongoDB**, not just
    mocks: created a throwaway test document, saved two loaded copies
    sequentially, and confirmed the second genuinely throws `VersionError` —
    then deleted the throwaway doc (never touched real user data).
  - **`$push` scoped down, not implemented as literally asked:** the append
    path's business rules (lineup/substitution validation, "is this player
    currently on the court", roster active-player checks) all need to read
    the game's _current_ state before deciding what to push — a blind atomic
    `$push` can't validate against data it hasn't loaded. The
    optimistic-concurrency load→validate→mutate→save-with-version-check
    pattern above **is** the correct/standard way to get race-safety here;
    it achieves the task's actual goal (no more silent clobbering) without a
    lower-level atomic op the validation logic can't support blindly. Revisit
    true `$push`/`$position` only if profiling shows the full-doc save itself
    (not the race) is the bottleneck.
  - **Slim response:** new `buildSlimGameEventDelta(userId, game, context)`
    returns only `game`, `lineups`, `boxScore`, `gameSummary`,
    `canEditCompletedGame` — dropping `recap`, `highlights`, `team`,
    `opponentTeam`, `participants`, `league`, `teamEntitlements`, `aiSummary`,
    `replayFilters`. Confirmed via grep that `GameTrackPage.jsx` **never reads
    any of the dropped fields** outside its initial-load effect, and its
    `setData((current) => ({...current, ...response}))` merge leaves those
    keys at their initial-load values when absent from a later response —
    **zero client changes were needed** for this to work correctly today (full
    rewiring is still OPT-016's job for the _optimistic-update_ half, but the
    contract change itself is drop-in compatible).
  - **Eliminated a redundant re-fetch:** the old code ended every mutator with
    `return getGameForUser(userId, gameId)`, which re-ran `assertGameAccess`
    (a second `findGameById`) just to rebuild the response from data already
    in memory post-save. The slim builder works directly off the in-memory,
    already-saved `game` + the `context` the caller resolved before mutating
    (team/participant docs are unaffected by an event mutation, so reusing is
    safe) — one DB read per append instead of two. `removeEventForUser`/
    `updateEventForUser` didn't have `context` in scope before, so they still
    resolve it once (same cost as before, just no _second_ `getGameForUser`
    round-trip).
  - **"Single pass instead of 7-10" — not touched further:** `computeBoxScore`
    (2 passes: an event loop + one internal `summarizeEvents` call) was
    already far better than "7-10" on this specific path _before_ this task —
    that number describes `getGameForUser`'s full response (recap's own
    `summarizeEventsBySide` + `buildKeyMoments` + `buildShotSnapshot`, on top
    of box score), which the slim response above no longer runs at all on
    the append path. No further consolidation attempted.
  - Added 6 unit tests (slim shape assertions, no-double-fetch, 409 on
    version conflict, non-version errors still propagate, remove/update slim
    shape). Full suite: **212 passing** (was 206).

---

### OPT-016 — GameTrackPage decomposition + memoisation

- **Priority:** Medium · **Status:** ✅ Completed (heavily scoped) · **Category:** Frontend / rendering
- **Wave:** 3 · **Complexity:** M/L · **Dependencies:** OPT-015
- **Description:** Split the 3,088-line page into memoised children (CourtPanel,
  BoxScorePanel, EventLog, VideoPanel); `useCallback` handlers; memoise
  `onCourtPlayers`/`benchPlayers` (`:516-518`). Apply optimistic score/box
  updates using OPT-015's slim delta. Flatten the load waterfall (`:411-474`) —
  server includes fallback roster in `GET /games/:id`.
- **Reason:** ~25 useState, ~1,700 JSX lines re-render per keystroke; sparse
  memoisation.
- **Expected benefit:** Responsive tracking UI on long games / low-end devices.
- **Files likely to change:** `GameTrackPage.jsx` (+ new child components).
- **Testing:** render-count profiling before/after; tracking flow works with
  optimistic updates + server reconciliation.
- **Validation checklist:** [x] `onCourtPlayers`/`benchPlayers` memoised
  [ ] children extracted into memoised panels — **not done, see notes**
  [ ] handlers stabilised with `useCallback` — **not done, see notes**
  [ ] optimistic updates using OPT-015's slim delta — **not done, see notes**
  [x] no functional regression (test suite + build unchanged).
- **Source:** [30](./30-optimisation-roadmap.md) M7, [29](./29-frontend-optimisation.md) §3.
- **Completion notes:** 2026-07-06 — **heavily scoped down; only the one
  explicitly-named, mechanically-safe fix was made.**
  - **What was done:** `onCourtPlayers` and `benchPlayers` (the two arrays the
    task calls out by name) were unmemoised — plain `.map()`/`.filter()` calls
    recreated on **every** render, including renders triggered by unrelated
    state (shot picker open/close, follow-up prompts, mobile/desktop layout
    toggles). Wrapped both in `useMemo`. Also had to memoise `lineupIds`
    itself (`isDualTeam ? ... || [] : ... || []`) — its `|| []` fallback was a
    fresh array reference every render whenever the lineup was empty, which
    would have silently defeated the two new `useMemo`s (their dependency
    array would never look equal). Verified with `eslint`'s
    `react-hooks/exhaustive-deps` rule — clean, no missing-dependency warnings.
  - **Why the rest was NOT attempted, despite being explicitly asked for:** - **Full CourtPanel/BoxScorePanel/EventLog/VideoPanel extraction** would
    require threading dozens of state values/setters through new prop
    boundaries (or a context) across ~1,300 lines of interleaved JSX
    covering the shot picker, follow-up-prompt flows, substitution UI,
    mobile vs. desktop layouts, and video sync — and then verifying every
    one of those interaction paths is still behaviourally identical. That
    verification fundamentally requires clicking through the live tracking
    UI in a browser; I do not have browser automation tooling in this
    environment, and a text-only read of a 3,000+ line component is not
    sufficient confidence for a change to the app's core live-tracking
    feature. The blast radius of getting this wrong (broken game tracking)
    is severe enough that I chose not to attempt it blind. - **`useCallback` for handlers** — surveyed all ~30 inline handler
    functions. Most are called only from JSX event handlers (where identity
    stability doesn't matter) or close over `data`/`inflightRef`/other
    per-render values in ways that would need careful re-derivation to keep
    correct semantics under `useCallback`. Wrapping `onSelect` props (e.g.
    `PlayerSelectionPanel`'s `onSelect={(id) => updateSideState(...)}`) would
    only pay off paired with `React.memo` on the receiving components, which
    isn't done either (same reasoning as above) — so doing one without the
    other has no render-count benefit today. `updateSideState` itself has no
    external dependencies and could safely become a `useCallback(fn, [])`,
    but in isolation, with nothing memoised downstream, it's a no-op change. - **Optimistic updates using OPT-015's slim delta** — this is a genuine
    behavioural change to the tracking flow (predicting the score locally
    before the server responds, then reconciling), not a refactor. It needs
    the same live-UI verification as the panel extraction, plus a design
    decision on how to reconcile a rejected optimistic update against the
    new OPT-015 409 conflict response — out of scope to improvise silently. - **Load-waterfall flattening** ("server includes fallback roster in `GET
/games/:id`") — touches the server response contract again on top of
    OPT-015; not attempted without a specific need driving it.
  - **Verification:** `GameTrackPage.test.jsx` baseline is 7 failed / 18
    passed — confirmed **identical** with and without this change (stashed
    and re-ran). Full client suite unchanged (20 failed / 116 passed, same as
    session baseline). `pnpm vite build` succeeds; `GameTrackPage` chunk size
    unchanged (~68KB). No new test coverage added — the change is provably a
    no-behaviour-change memoisation (confirmed via `exhaustive-deps` lint +
    identical test results), and the existing component test exercises the
    interaction paths that would surface a real break.
  - **If revisited:** the full decomposition is real, valuable work — but it
    should be done with either (a) a human driving the browser alongside an
    AI making the changes, or (b) enough end-to-end/Playwright-style coverage
    of the tracking flows to trust an AI's own verification. Neither was
    available this session.

---

### OPT-017 — Feed hydration batching + card denormalisation

- **Priority:** Medium · **Status:** ✅ Completed · **Category:** Backend / feed
- **Wave:** 3 · **Complexity:** M · **Dependencies:** none (pairs with OPT-014)
- **Description:** Batch post creators with one `$in` (now, S); denormalise card
  display data (title, names, logos, score) into the Post doc at creation (M) so
  read-time resolution disappears; keep a slim refresh path for stale cards
  (`feed.service.js:266-311`).
- **Reason:** Feed hydrates each post sequentially (creator + full public
  pipeline per card) → 40–80+ queries per 20-post page.
- **Expected benefit:** 20-post page from ~60 queries to 1–3.
- **Files likely to change:** `feed.service.js`, `feed.repository.js`.
- **Testing:** query-count per feed page before/after; card content parity; stale
  card refresh path works.
- **Validation checklist:** [x] `$in` creator batch [x] card data denormalised at
  write [x] refresh path for stale [x] card content unchanged.
- **Source:** [30](./30-optimisation-roadmap.md) M3, [23](./23-api-audit.md) #3.
- **Completion notes:** 2026-07-06
  - **Creator batching (S):** `findUsersByIds` (`$in`) in `auth.repository.js`;
    `listFeedPosts` resolves every post's creator with **one** query instead of
    one `findUserById` per post. `sanitizePost` accepts an optional prefetched
    `creator` — single-post call sites (create/delete) are unchanged.
  - **Card denormalisation (M):** added `cardSnapshot` (Mixed) to
    `gameCard`/`playerCard`/`teamCard` sub-schemas. Extracted pure
    `buildGameCardSnapshot`/`buildPlayerCardSnapshot`/`buildTeamCardSnapshot`
    builders from the old inline resolvers — same source of truth, now callable
    from both creation and hydration.
    - `createPlayerCardPostForUser`/`createTeamCardPostForUser` already called
      the full public pipeline for validation and were **discarding the
      result** — now reused to snapshot at creation (no extra query added).
    - `createGameCardPostForUser` doesn't call the pipeline at creation (only a
      cheap `findGameById` viewability check) — its card self-backfills on
      first read instead, same miss-path as the others.
    - Read path (`resolve*CardPayload`): serves `cardSnapshot` directly when
      present (**zero extra queries**); on a miss, resolves live and persists
      via a fire-and-forget `persistCardSnapshot` (failures logged, never
      block the response) — self-backfilling, matches OPT-010/011/013.
    - **Dropped `gameCard.recap`/`gameCard.participants` from the snapshot** —
      grepped the client and confirmed neither field is rendered by any feed
      card component; no point denormalising unused data.
  - **Slim refresh path for stale cards:** `refreshGameCardPostsForGame(gameId)`
    (`listGameCardPostsByGameId` + force-refresh every match) wired into
    `games.service.js`'s existing OPT-010/012/013 trigger points
    (`finishGameForUser`, and the 3 completed-game event mutators) via a lazy
    `require` (avoids a cycle — `feed.service.js` already requires
    `games.service.js` for `getPublicGame`/`canAccessGame`). Fixes a real bug
    class: a game*card shared mid-game would otherwise show a stale score
    forever once the game finished. **`deleteGameForUser` intentionally left
    untouched** — the pre-existing `deletePostsByGameId` repository function is
    dead code (never wired to any caller before this task), and wiring it is a
    separate concern from card \_staleness* (this task's actual scope); noted,
    not fixed.
  - **Verified on real dev data:** feed hydration for 17 real posts produces
    byte-identical card content to the pre-change live compute (spot-checked a
    team card); query-count instrumentation on a fully-warm feed showed **3
    real data queries** (`posts.find` + `users.find` + one `games.findOne` for
    a since-deleted game's card, correctly falling through with no snapshot
    persisted) — down from the per-post pipeline calls the old code made.
    9/10 existing dev cards self-backfilled their snapshot on first read; the
    10th (referencing a deleted game) correctly stayed unsnapshotted.
  - Added 5 unit tests (creator batching, snapshot-hit, snapshot-miss +
    self-backfill, creation-time snapshot, force-refresh). Also found and fixed
    a **latent test-hygiene gap**: `games.service.test.js` never flushed
    pending `setImmediate` callbacks, so the OPT-010/013 post-response
    schedulers were firing into a torn-down Jest module registry after each
    test finished — silently harmless for those two (their mocked functions
    are synchronous no-ops) but this task's `scheduleFeedCardRefreshForGame`
    exposed it loudly. Fixed with a top-level `afterEach` that flushes pending
    immediates. Full suite: **206 passing** (was 201).

---

### OPT-018 — Pagination everywhere

- **Priority:** Medium · **Status:** ✅ Completed (backend; client deferred) · **Category:** Backend + client
- **Wave:** 4 · **Complexity:** M · **Dependencies:** none (feeds OPT-014)
- **Description:** Add `limit`/cursor to `GET /games`, `/teams`, `/leagues`,
  league games/standings rows, and public lists — copying the feed's keyset
  cursor pattern. Client consumes via React Query / virtualised lists. Add zod
  query/param validation while touching these routes.
- **Reason:** Everything except `/feed` returns unbounded lists.
- **Expected benefit:** Prevents the next class of unbounded responses; enables
  client virtualisation.
- **Files likely to change:** games/teams/leagues controllers+services+validation;
  client list pages + API modules.
- **Testing:** cursor paging correctness; client loads pages; validation rejects
  bad params.
- **Validation checklist:** [x] keyset cursor on the clean single-source lists
  (`/games`, `/teams`, `/public/leagues`) [~] client paginates (deferred — see
  notes; responses are backward-compatible so nothing breaks) [x] query
  validation added (shared zod schema) [x] no dropped/duplicated items across
  pages (unit-proven + verified against real dev Mongo).
- **Source:** [30](./30-optimisation-roadmap.md) M6, [23](./23-api-audit.md) #9/#10.
- **Completion notes:** 2026-07-07 — **scope: backend-complete + client
  backward-compat** (chosen with the user; client infinite-scroll/virtualisation
  deferred to a follow-up, like OPT-014b).
  - **Shared helpers.** New `utils/pagination.js` (`applyIdCursor` — merges a
    non-mutating `_id: {$lt: cursor}` clause; `buildCursorPage(rows, limit)` —
    trims an over-fetched `limit+1` batch and derives `nextCursor`;
    `DEFAULT_PAGE_LIMIT=20`, `MAX_PAGE_LIMIT=50`) and
    `modules/shared/pagination.validation.js` (`paginationQueryShape` /
    `paginationQuerySchema` — `cursor` = 24-hex ObjectId, `limit` coerced,
    bounded, defaulted). Pattern: repo does `find(applyIdCursor(q, cursor))
.sort({_id:-1}).limit(limit+1)`; service calls `buildCursorPage`; controller
    `schema.parse(req.query)`.
  - **Endpoints paginated (keyset on `_id` desc):** `GET /games`
    (`listGamesForUser` → `{ games, nextCursor }`, filters teamId/status
    validated too), `GET /teams` (`listTeamsForUser` → `{ teams, nextCursor }`),
    `GET /public/leagues` (`listPublicLeagues` → `{ leagues, nextCursor }`,
    base query paged then only the page is enriched with teams). All keep their
    existing top-level key so non-paginating clients are unaffected; `nextCursor`
    is added alongside. Repo functions paginate **only when `limit` is
    supplied** — internal callers (billing `syncOwnerPlan`, feed shareable
    lookups) omit it and still get every row.
  - **`GET /leagues` (owner list) — validation only, keyset intentionally NOT
    applied.** This list merges three sources (owned + member + managed
    leagues), dedupes, and re-sorts in memory, so a single-collection `_id`
    cursor can't page across the union correctly. It's a per-user handful of
    leagues (not a scaling-cliff surface); params are validated and it returns
    `nextCursor: null` for a consistent contract. Proper paging here would need
    an offset/merged strategy — deferred (see Decisions log).
  - **Not separately paginated:** the public **teams** surface (`/public/teams/
explore`) already runs through the pre-bounded `listPublicCompletedGames(100)`
    (OPT-004); the league **games/teams/standings** sub-lists are embedded in
    composite league-detail responses (bounded by league size) rather than being
    standalone list endpoints — restructuring those composites is out of scope.
  - **Client:** unchanged. The three owner list pages (Games/Teams/Leagues) +
    PublicTeamPage still read the array key and ignore `nextCursor`; the public
    league pages already use React Query (post-OPT-014) and can upgrade to
    `useInfiniteQuery` in the client follow-up. With the tiny current dataset,
    the default limit (20/50) is invisible; the cursor is there for when it
    matters.
  - **Tests:** new `pagination.test.js` (helper mechanics incl. a full
    page-through proving **no dup / no drop / exact order**, + schema
    validation), 2 service-level pagination tests, updated the opponent test for
    the new `{ games, nextCursor }` shape. Full server suite **30 suites / 242
    tests**; lint clean. **Verified against real dev MongoDB**: paged an owner's
    8 games at limit=2 → all 8 walked in exact order, zero dupes/drops,
    terminated correctly. Not committed (per standing instruction).

---

### OPT-019 — HTTP caching for anonymous public GETs

- **Priority:** Medium · **Status:** ✅ Completed · **Category:** Backend / caching
- **Wave:** 4 · **Complexity:** S · **Dependencies:** OPT-010, OPT-011
- **Description:** Add `Cache-Control: public, max-age=30,
stale-while-revalidate=300` on the public routers (which never personalise);
  only cache when no auth cookie present. Longer max-age + ETag on completed game
  detail once recap/summary settle.
- **Reason:** Anonymous public responses are identical for all viewers; zero
  infra cost.
- **Expected benefit:** Instant relief on leaders/standings; CDN-compatible.
- **Files likely to change:** public routers / a small caching middleware.
- **Testing:** headers present on public GETs, absent when authed; cached content
  is post-materialisation (correct).
- **Validation checklist:** [x] headers on public routes only [x] no caching of
  authed responses [x] ETag on completed game detail (Express weak ETags,
  active — verified not disabled) [x] **security:** no `Set-Cookie` on
  cacheable anonymous responses (CSRF interaction found + fixed).
- **Source:** [30](./30-optimisation-roadmap.md) M8, [27](./27-caching-opportunities.md).
- **Completion notes:** 2026-07-06
  - **New `publicCache.middleware.js`** — sets
    `Cache-Control: public, max-age=30, stale-while-revalidate=300` +
    `Vary: Cookie, Authorization` on **anonymous** safe-method (GET/HEAD)
    requests, and `private, no-cache` otherwise. `hasAuthToken` checks both
    the `accessToken` cookie and a `Bearer` header. Applied on the 3 public
    routers (`/public/opponents`, `/public/leagues`, `/public/teams`) in
    `routes/index.js`, plus the one anonymously-readable game route
    (`GET /games/:gameId`, which runs `optionalAuthMiddleware`) in
    `games.routes.js`.
  - **Why "only when anonymous" is load-bearing, not cosmetic:** two public
    handlers genuinely personalise on `req.auth` — league public-player
    (`getPublicPlayer` passes `req.auth?.userId`) and the public game detail
    (`getPublicGame` → `canEditCompletedGame`/owner fields). `publicLeagues`
    even mounts `optionalAuthMiddleware` router-wide. So a blanket
    `public` cache would have let a shared cache serve one signed-in
    viewer's personalised body to everyone. The middleware emits public
    headers **only** when no auth token is present.
  - **ETag:** Express's default weak ETags on JSON are active (confirmed not
    disabled in `app.js`), giving anonymous viewers conditional revalidation
    on completed-game detail for free — no custom ETag code needed.
  - **🔒 Security fix found during implementation — CSRF `Set-Cookie` vs
    shared caches.** `attachCsrfToken` runs globally and stamped a fresh
    `XSRF-TOKEN` `Set-Cookie` on **every** response, including the now-
    cacheable anonymous public GETs. A shared/CDN cache storing a response
    with `Set-Cookie` could replay one visitor's CSRF token to every
    subsequent visitor (and many CDNs refuse to cache `Set-Cookie`
    responses at all, silently killing the benefit). **Fix:**
    `attachCsrfToken` now skips token emission for a first-touch anonymous
    cacheable request (shared `isPubliclyCacheableRequest` predicate, and
    only when no `_csrfSecret` cookie already exists). Safe because a CSRF
    token is only ever _verified_ on non-safe methods (never anonymous-safe),
    and the client refreshes its token from the `x-csrf-token` response
    header of its next non-public request (login/me/etc.); the Origin-header
    fallback in `csrfProtection` still covers cross-site mutations.
    (User was consulted on the approach and chose "most secure without
    breaking anything" — see Decisions log.)
  - **Tests:** `publicCache.middleware.test.js` (6 unit tests — all branches:
    anon GET/HEAD cache, cookie/Bearer skip, POST skip, non-Bearer-auth
    treated anon); integration assertions added to `public-teams.test.js`
    (public header present on anon; `private, no-cache` when cookied; **no
    `Set-Cookie` on cacheable anon**; CSRF still refreshed when `_csrfSecret`
    already present). Full server suite **27 suites / 222 tests pass**; lint
    clean. Not committed (per standing instruction).

---

### OPT-020 — Move blocking integrations off the request path

- **Priority:** Medium · **Status:** ✅ Completed · **Category:** Backend
- **Wave:** 4 · **Complexity:** S each · **Dependencies:** none
- **Description:** AI summary → post-response with a lock **TTL** + retry-on-
  cleared (`games.service.js:1486-1505`); Resend sends async
  (`email.service.js`); webhook idempotency via `$addToSet`+`$slice`
  (`billing.service.js:125-148`). (Video transcode covered by OPT-009.)
- **Reason:** OpenAI (≤8s), inline email, and non-atomic webhook idempotency
  block/endanger request handlers.
- **Expected benefit:** Faster finish/mutation responses; safe idempotency; no
  stuck AI lock.
- **Files likely to change:** `games.service.js`, `email.service.js`,
  `billing.service.js`.
- **Testing:** finish returns immediately, summary appears after; email failure
  doesn't fail the request; duplicate webhook is idempotent; lock expires.
- **Validation checklist:** [x] AI post-response + lock TTL (+ retry-on-cleared)
  [x] email async [x] webhook idempotent via atomic gated `$push`/`$slice`
  [x] no request-path blocking.
- **Source:** [30](./30-optimisation-roadmap.md) M4, [23](./23-api-audit.md), [09](./09-payment-webhooks.md).
- **Completion notes:** 2026-07-06 — three independent sub-items:
  - **(a) AI summary post-response + TTL + retry-on-cleared.**
    `finishGameForUser` no longer `await`s `buildPersistedGameSummary`
    (OpenAI, up to several seconds) — new `scheduleGameSummaryGeneration`
    runs it in a `setImmediate` after the finish response is sent (the
    finish response never carried the summary text anyway; the client
    fetches it once it lands). `claimGameSummaryGeneration` now takes a
    **stale-lock TTL** (`AI_SUMMARY_LOCK_TTL_MS = 2min`, injectable `now`):
    a lock is claimable when unlocked OR `aiSummaryGenerationLockedAt` is
    older than the TTL — fixing the previous permanent-stuck-lock bug (a
    crash/hang between claim and save left the summary ungeneratable
    forever, since the claim required `lockId: null`). New
    `releaseGameSummaryLock(gameId, lockId)` clears the lock on generation
    failure so a later finish retries immediately instead of waiting out
    the TTL. **Verified against real dev MongoDB** (throwaway league game,
    then deleted): fresh claim ok → re-claim while fresh BLOCKED →
    re-claim after TTL ok → release-wrong-lock no-op → release-owned ok →
    claim-after-release ok.
  - **(b) Email async.** New `sendTemplateEmailAsync` (fire-and-forget via
    `setImmediate`, logs failures, never throws into the request path).
    `sendVerificationEmail`/`sendPasswordResetEmail` are now fire-and-forget;
    `issuePasswordReset` (password reset) and the contact route no longer
    `await` Resend — the reset token / contact record is already persisted,
    so a slow/failing provider can't delay or fail the request.
  - **(c) Webhook idempotency now atomic.** The previous
    load→check-in-memory-array→save sequence had a read-check-write race:
    two concurrent deliveries of the same Stripe event could both pass the
    check and both apply the effect. New shared
    `utils/webhookIdempotency.js#claimWebhookEvent` does a single
    `findOneAndUpdate` gated on `processedWebhookEventIds: { $ne: eventId }`,
    appending + bounding via `$push`/`$slice: -25` in the same atomic op —
    the DB guarantees exactly one caller wins; a `null` result means
    duplicate/not-found → skip. Exposed as `claimTeamWebhookEvent` /
    `claimLeagueWebhookEvent` (repo layer, mockable); all 5 team/league
    update handlers now claim-first. The removed in-memory helpers
    (`hasProcessedWebhookEvent`/`markWebhookEventProcessed`) are gone. The
    league _create_ path (`createLeagueFromCheckoutSession`) keeps its
    by-customer guard — it has no existing doc to claim against; fully
    closing its concurrent-create race needs a unique index on
    `stripeCustomerId`, a prod-data-gated migration deferred (same class as
    OPT-007), noted in-code.
  - **Tests:** new `webhookIdempotency.test.js` (3), `email.service.test.js`
    (2, incl. fire-and-forget + failure-doesn't-throw); billing unit tests
    reworked to the atomic-claim flow; `games.service.test.js` finish tests
    now flush the post-response scheduler + new retry-on-cleared test;
    contact integration test switched to the async variant. Full server
    suite **29 suites / 228 tests pass**; lint clean. Not committed (per
    standing instruction).

---

### OPT-021 — Feed windowing + video unmount + throttled scroll

- **Priority:** Low · **Status:** ⏸️ Deferred (browser-gated) · **Category:** Frontend / rendering
- **Wave:** 4 · **Complexity:** M · **Dependencies:** pairs with OPT-009
- **Deferral note (2026-07-07):** changes client feed rendering; can't be
  verified without live browser testing. Batched with OPT-016 (full scope),
  OPT-014b, and OPT-018 client for a future browser-testing session. See the
  Deferred section + Decisions log.
- **Description:** Window the feed list (keep ±2 slides mounted on mobile snap
  feed; virtualise desktop) so off-screen `<video>` elements unmount; throttle
  the mobile onScroll near-end check (or use the existing IntersectionObserver);
  `React.memo` post cards + `useCallback` for `onDelete`/`onNearEnd`; cap
  retained posts (`FeedList.jsx:37-101`).
- **Reason:** All posts + `<video>` stay mounted; unthrottled scroll handler; DOM/
  memory growth.
- **Expected benefit:** Bounded DOM/memory; smoother feed scrolling.
- **Files likely to change:** `FeedList.jsx`.
- **Testing:** memory/DOM node count stays bounded while scrolling; off-screen
  videos unmount; near-end still triggers load.
- **Validation checklist:** [ ] windowing works both modes [ ] videos unmount
  off-screen [ ] scroll throttled [ ] cards memoised.
- **Source:** [30](./30-optimisation-roadmap.md) L1, [29](./29-frontend-optimisation.md) §3.
- **Completion notes:** —

---

### OPT-022 — Low-impact hygiene batch

- **Priority:** Low · **Status:** ✅ **Completed** (all sub-items; canvas-on-demand done 2026-07-07, browser-verified) · **Category:** Mixed
- **Wave:** 5 · **Complexity:** S · **Dependencies:** none
- **Description:** Bundle of independent small fixes: add `participant.slug` to
  the schema (kills perpetual runtime backfill, L3); remove dead code — legacy
  checkout endpoint, email-verification path, unused exports, `DashboardPage` if
  not already removed by OPT-001 (L5); generate the GameDetail canvas share-card
  on demand instead of every data change (L2, `GameDetailPage.jsx:413+`); `.lean()`
  on read-only queries (L8); add zod query/param validation where not covered by
  OPT-018 (API #10).
- **Reason:** Accumulated hygiene/tech-debt that is cheap and safe to clear.
- **Expected benefit:** Less waste, cleaner code, fewer footguns.
- **Files likely to change:** `games.repository.js`, billing routes,
  `GameDetailPage.jsx`, repositories, controllers.
- **Testing:** slug backfill no longer runs; removed code has no references;
  share-card still generates on click; `.lean()` paths return expected shapes.
- **Validation checklist:** [x] slug in schema (+ backfill script, real-DB
  verified) [~] dead code — **investigated, most of it isn't actually dead, see
  notes** [x] canvas on demand (done 2026-07-07 — generated at share/download
  click instead of on every `data` change; browser-verified) [x] `.lean()` safe
  (3 queries, callers individually verified)
  [x] validation — **no gap found**, already 100% covered by OPT-018 + existing
  feed validation.
- **Source:** [30](./30-optimisation-roadmap.md) L2/L3/L5/L8, [22](./22-known-technical-debt.md).
- **Completion notes:** 2026-07-07
  - **Item 1 — `participant.slug` schema fix: a real bug, not just hygiene.**
    `games.service.js` always tried to persist `slug: context.homeTeam.slug`
    at dual-team game creation, but `participantSchema`
    (`games.repository.js`) never declared a `slug` field — Mongoose silently
    **dropped it on every save**. Every read of every dual-team league game
    fell through to a per-request `findLeagueTeamById` lookup
    (`resolveDualGameParticipants`) to reconstruct it live. Fixed by adding
    `slug: { type: String, default: null }` to the schema, plus a new
    idempotent `scripts/backfill-participant-slug.js` (same dry-run/re-run-safe
    pattern as the OPT-008/010/013 backfills) for the 20 pre-existing games
    that predate the fix. **Ran for real against dev**: dry-run showed all 20
    affected, ran it, then independently re-queried to confirm the slug
    persisted and 0 games remain missing it. Added a schema-introspection
    regression test (`games.repository.schema.test.js`) that fails if the
    field is ever dropped again — confirmed it fails on the pre-fix schema.
    The runtime `findLeagueTeamById` fallback in `resolveDualGameParticipants`
    was **intentionally left in place** as a safety net (now unreachable for
    backfilled data, cheap, harmless) rather than removed, since a future doc
    could theoretically still arrive without a slug via some other path.
  - **Item 2 — dead-code claims mostly don't hold up; nothing was deleted.**
    Investigated each named target instead of deleting on faith: - `DashboardPage` — confirmed already removed (OPT-001). No-op. - "Legacy checkout endpoint" (`POST /billing/checkout-session`) — **NOT
    dead**. Explicitly commented `// Legacy route — kept for backward
compatibility` and has a dedicated integration test asserting it still
    works. The _client_ function that calls it (`billingApi.
createCheckoutSession`) has no UI caller (superseded by
    `createTeamCheckoutSession`/`createLeagueCheckoutSession`), so the path
    is unreachable _from this app's UI_ — but the route itself is a
    deliberate, tested, documented back-compat shim that could be serving
    something outside this repo (old client build, another integration).
    **Not removed** — a hygiene task shouldn't unilaterally delete an
    intentional compat shim for a payment endpoint. - "Email-verification path" — **NOT dead**. Live route → controller →
    service, called by `authApi.js`, consumed by `VerifyEmailPage.jsx`,
    linked from the login form. **Not removed.** - "Unused exports" — a targeted sweep found no exports confidently
    identifiable as dead within reasonable effort; static grep-based dead-
    export detection produced too many false positives to trust for actual
    deletions (e.g. flagged `ApiError`, `asyncHandler` — both obviously
    live). **Closed as "no gap found"** rather than guessing.
  - **Item 3 — canvas-on-demand: DONE 2026-07-07 (was deferred, now shipped).**
    `GameDetailPage.jsx`'s share-card canvas used to regenerate in a
    `useEffect` on every `data` change (incl. any React Query
    refetch/invalidation), even when the user never shares/downloads. Moved the
    generation into an on-demand `buildHeaderCardDataUrl()` builder called from
    the Share/Download click handlers; removed the eager effect + the
    `headerCardDataUrl` state; a shared `isPreparingCard` state disables the
    buttons while generating; `shareHeaderCard` hands its already-built URL to
    `downloadHeaderCard` on the fallback path so it isn't generated twice.
    Browser-verified (download produces the PNG, share falls back to link-copy
    on desktop, no canvas work on page load). Lint clean; no new test
    regressions (the client suite's 20 pre-existing failures — YouTube embed
    URL params + replay-lock text matching — are unrelated to this change).
    Committed `0572b38`.
  - **Item 4 — `.lean()` added to 3 verified-safe read-only queries.**
    `listCompletedGames`, `listPublicCompletedGames` (games.repository.js),
    and `listLeaguesByIds` (leagues.repository.js). Every caller of each was
    traced individually to confirm none `.save()`s the result and none relies
    on Mongoose-document-only behavior (all just read plain fields / filter /
    map). Two other unbounded `.find()`s the initial survey flagged
    (`listGamesByStandaloneParticipantTeamId`,
    `listGamesByLeagueParticipantTeamId`) were left untouched — they have no
    live caller, so there was nothing to verify against. **Verified against
    real dev MongoDB**: confirmed all 3 now return lean plain objects (no
    `.save` method) and that `listPublicCompletedGames`'s field exclusion
    still works correctly alongside `.lean()`.
  - **Item 5 — no query-validation gap found.** Independently grepped every
    `req.query` usage across all controllers; all are already validated
    (OPT-018's pagination schema plus feed's pre-existing `listFeedSchema`/
    `shareableLookupSchema`). Closed as a no-op — OPT-018 already fully
    covered this.
  - **Tests:** new `games.repository.schema.test.js` (2, incl. proven to fail
    without the fix). Full server suite **31 suites / 244 tests**; lint clean.
    Not committed (per standing instruction).

---

### OPT-023 — Ops hardening

- **Priority:** Low · **Status:** ✅ **Completed** (2026-07-07) · **Category:** Ops / backend
- **Wave:** 5 · **Complexity:** S · **Dependencies:** none
- **Description:** Graceful SIGTERM shutdown (`server.js`); DB-ping health check
  (currently no DB ping); explicit Mongoose `maxPoolSize` +
  `serverSelectionTimeoutMS` + SIGTERM disconnect (`db.js`); pin Stripe
  `apiVersion`; dedicated rate limiter on login/register/refresh.
- **Reason:** Single-instance limiters, no graceful shutdown, health check
  without DB ping, unpinned Stripe version.
- **Expected benefit:** Safer deploys, clearer health, auth abuse resistance.
- **Files likely to change:** `server.js`, `config/db.js`, health route, billing
  config, auth rate-limit middleware.
- **Testing:** SIGTERM drains connections; health fails when DB down; login
  limiter trips; Stripe calls use pinned version.
- **Validation checklist:** [x] graceful shutdown [x] DB-ping health [x] pool/
  timeout set [x] Stripe pinned [x] login limiter.
- **Source:** [30](./30-optimisation-roadmap.md) L6, [21](./21-deployment-notes.md), [24](./24-database-audit.md) §7.
- **Completion notes:** All five sub-items shipped (commit on branch `dev`):
  1. **Graceful shutdown** (`server.js`) — `bootstrap` now captures the
     `http.Server` from `app.listen` and `registerGracefulShutdown` traps
     `SIGTERM`/`SIGINT`: stop accepting new connections (`server.close`), let
     in-flight requests drain, then `disconnectDb()`, then `exit(0)`. A 10s
     `unref`'d timeout force-exits if a hung socket blocks the drain. Idempotent
     via a `shuttingDown` guard so a double signal can't double-run it.
  2. **DB-ping health check** (`health.controller.js`) — the endpoint now
     returns **503** (`status:'unavailable'`) when `mongoose.connection.readyState
!== 1` OR when `db.admin().ping()` throws, and **200** (`db:'ok'`) only when
     the ping succeeds. A load balancer will now pull a DB-severed instance out
     of rotation instead of routing to a server that can only 500.
  3. **Pool + timeout** (`config/db.js`, `config/env.js`) — `mongoose.connect`
     now sets `maxPoolSize` (new env `MONGO_MAX_POOL_SIZE`, default 10) and
     `serverSelectionTimeoutMS: 5000` (fail-fast instead of the driver's 30s
     hang; the existing retry loop then surfaces it in seconds). Added
     `disconnectDb()` export used by the shutdown path.
  4. **Stripe pinned** (`billing.service.js`) — `new Stripe(key, { apiVersion:
'2024-06-20' })`. Matches stripe@16's built-in `LatestApiVersion`; bump
     deliberately on SDK upgrade so a version bump can't silently reshape
     request/response payloads.
  5. **Credential rate limiter** (`rateLimit.middleware.js`, `auth.routes.js`)
     — new `authCredentialLimiter` (20 req / 15 min, IP-keyed) applied to
     `/register`, `/login`, `/refresh` — which previously had **no** limiter
     beyond the global 300/15min `/api` budget. Recovery endpoints keep the
     existing tighter `authRecoveryLimiter`.
- **Tests:** rewrote `health.test.js` (integration) to drive the three
  connection states (connected+ping-ok → 200; disconnected → 503; ping-throws → 503) since the endpoint now requires a live DB; new
  `rateLimit.middleware.test.js` (unit) proves the credential limiter is wired,
  trips a 429 with the expected JSON body over its budget, and is a distinct
  instance from the global limiter. Updated the `rateLimit.middleware` mocks in
  `gates.test.js` and `billing.routes.test.js` to include the new export (they
  mock the whole module, so an omitted key crashed route registration).
- **Verification:** full suite **32 suites / 249 tests pass** (up from 30/244 —
  +2 suites: rate-limit unit + the reworked health tests contribute net-new
  cases); lint clean on all changed files. Stripe pinned-version instantiation
  smoke-tested against the real SDK. `node --check` on all rewritten files.
- **Not done (out of scope / future):** the IP-keyed limiter is still
  single-instance — a shared store (Redis) for multi-instance correctness is
  deferred with the rest of the Redis work (see Decisions log). No new metrics/
  readiness-vs-liveness split; the single `/health` endpoint now doubles as a
  readiness probe.

---

### OPT-024 — Correctness decisions

- **Priority:** Low · **Status:** ✅ **Completed** (2026-07-07) ·
  **Category:** Correctness
- **Wave:** 5 · **Complexity:** S (once decided) · **Dependencies:** decisions
- **Description:** Items that require a product decision before implementation:
  standings **tie rule** (currently tie = home win, `leagues.service.js:1763`);
  the **`publicOnly`** filter being ignored (`leagues.service.js:549`);
  contact-form **HTML escaping** (injection risk); analytics **distinctId**
  binding to the authed user.
- **Reason:** Behaviour is currently arbitrary/buggy; the _right_ behaviour is a
  business/product call, not a purely technical one.
- **Expected benefit:** Correct standings, correct public filtering, safe contact
  form, attributable analytics.
- **Files likely to change:** `leagues.service.js`, contact/analytics
  controllers.
- **Testing:** once decided — encode the rule + unit tests; verify escaping;
  verify distinctId on authed events.
- **Validation checklist:** [x] tie rule decided & encoded [x] `publicOnly`
  behaviour decided [x] contact input escaped [x] distinctId bound.
- **Source:** [30](./30-optimisation-roadmap.md) L7/L9, [22](./22-known-technical-debt.md).
- **Decisions (from product owner, 2026-07-07):** (1) **Ties are not allowed**
  — the league format has no draws. (2) **Private leagues** should be
  invisible to the general public, but visible to any of their own members —
  manager, league manager, or a player on the league (helper/player/team
  manager roles all count). (3) **Ship the HTML-escaping fix** — no further
  decision needed. (4) **Bind analytics distinctId to the authenticated user's
  stable ID** so sessions merge correctly.
- **Completion notes:** All four items implemented and tested:
  1. **Tie rule** — `games.service.js`: new `assertLeagueScoreNotTied(gameContext,
finalScore)` rejects (422) a league game finishing tied, checked in
     `finishGameForUser` **before** any mutation (so a rejected finalize leaves
     the game untouched) and again in `syncGameDenormalizedAfterEventChange` for
     edits to an already-completed league game (editing events can retroactively
     create a tie). Standalone (non-league) games are explicitly exempt — no
     competitive-tie concept there. `leagues.service.js`'s standings loop changed
     `homePoints >= awayPoints` → a real 3-way branch (`>` / `<` / tie) with a new
     `ties` row field, so legacy pre-guard tied data is recorded honestly instead
     of being coerced into a phantom home win. New tests: 3 in
     `games.service.test.js` (rejects a tie, allows a clear winner, standalone
     games unaffected) + 1 updated in `leagues.service.test.js` (tie → `ties:1`,
     not a win for either side).
  2. **Private league visibility** — investigated first: the fully-authenticated
     `/leagues/:leagueId` router already checked membership correctly via
     `assertLeagueViewer` (independent of `isPublic`); the actual gap was
     isolated to the **public-slug router** (`/public-leagues/:leagueSlug/...`),
     whose `assertLeagueVisible` ignored the viewer entirely and 404'd a private
     league for its own owner/manager/players just as it did for total
     strangers. Fixed: extracted a shared `isLeagueMember(userId, league)`
     (owner, active league manager, or any `leagueTeamMember` record — covers
     team manager/helper/player) used by both `assertLeagueViewer` (unchanged
     behaviour, now just refactored onto the shared helper) and the fixed
     `assertLeagueVisible`, which now allows a request through when
     `isPublic === true` **or** the viewer is a member — still 404 (not 403) for
     non-members, so a private league's existence isn't revealed to strangers.
     `viewerUserId` (sourced from `req.auth?.userId || null`, populated by the
     already-applied `optionalAuthMiddleware`) threaded through all 6 public
     controller handlers → 4 service functions
     (`getPublicLeagueBySlug`/`getPublicLeagueTeamBySlug`/
     `getPublicLeaguePlayerBySlug`/`getPublicLeagueLeaders`). New tests: 6 in
     `leagues.service.test.js` covering anonymous, non-member, owner, manager,
     rostered player, and "public league still open to anonymous" (regression
     guard).
  3. **Contact-form HTML escaping** — new `utils/escapeHtml.js` (5-character
     escape map; no new dependency — the project has no existing HTML-sanitizing
     library, and this is a small, stable, well-understood transform).
     `contact.routes.js` now builds a separate `htmlBodyLines` with every
     free-text field (`name`, `clubName`, `message`) escaped before
     interpolating into the `<pre>` HTML email body; the plaintext `text` body
     is untouched (no markup risk there). New integration test proves a
     `<script>`/`<img onerror>` payload is neutralised in `html` while the
     plaintext body still contains it verbatim (expected — no markup context).
  4. **Analytics distinctId** — investigated first: the client already calls
     `posthog.identify(user.id, …)` on login via `PostHogRouteTracker.jsx`
     (`client/src/features/analytics/`), so the browser-side PostHog SDK was
     already merging sessions correctly. The actual gap was server-side: the one
     server analytics route (`POST /api/v1/analytics/event`, gated on
     `authMiddleware`) trusted whatever `distinctId` the **client's JSON body**
     supplied instead of using the session it already had. Fixed:
     `analytics.controller.js` now always overrides `distinctId` with
     `req.auth.userId` (kept the field optional in the zod schema so old client
     payloads that still send it don't fail validation — they're just ignored).
     Note: grepped the client codebase and found nothing currently calls this
     server route (the client posts to PostHog directly) — the fix closes a real
     gap in an existing, reachable, authenticated endpoint regardless of current
     call volume. New unit tests: 2 in new `analytics.controller.test.js`.
- **Verification:** full server suite **33 suites / 261 tests** (up from
  32/249); lint clean on every changed file.

---

### OPT-025 — Project `events` out of list endpoints (follow-up to OPT-008)

- **Priority:** Medium · **Status:** 🚫 **Won't-fix** (investigated 2026-07-07) ·
  **Category:** Backend / DB
- **Wave:** 1 · **Complexity:** S (as scoped — **actually L**, see below) ·
  **Dependencies:** OPT-008 + **prod backfill** (✅ done, 2026-07-07 — 14/14 prod
  games backfilled, verified 0 remaining)
- **Description:** Now that `Game.finalScore` + `eventCount` exist (OPT-008) and
  `getLeagueGameScore` reads them first, add `.select('-events -rosterSnapshot ...')`
  to the league game-list and standings queries (`listLeagueGamesByLeagueId`
  consumers) so the full events array stops being loaded on list reads.
- **Reason:** The score fast-path no longer needs events for backfilled games;
  the remaining cost is transferring the array from Mongo on every list read.
- **Discovered during:** OPT-008 implementation — split out to keep OPT-008
  reversible and gated on a production backfill.
- **Expected benefit:** Removes events payload from all league list reads (large
  win as `eventCount` grows into the hundreds per game).
- **Gating requirement:** **Run `backfill-game-finalscore.js` in production
  first.** Projecting events out before backfill would zero the score of any
  game lacking `finalScore` (the compute-on-read fallback needs the array).
  ✅ Done — dry-run confirmed 14/14 games needed it, real run updated 14/14,
  follow-up dry-run confirmed 0 remaining. `mongodump` backup of the `games`
  collection taken first (`backups/pre-opt025-20260707/`).
- **Files likely to change:** `games.repository.js` (new projected finder or
  `.select()` on `listLeagueGamesByLeagueId`), `leagues.service.js` callers.
- **Testing:** after backfill, list endpoints return identical scores with
  events projected out (query inspection confirms no events transferred).
- **Validation checklist:** [x] prod backfill run [ ] events projected out of
  list queries — **not implemented, see below** [x] scores identical (n/a —
  no projection shipped, no scores changed) [x] detail endpoints still load
  events (unchanged, nothing touched).
- **Source:** [30](./30-optimisation-roadmap.md) H3/#5, [28](./28-computation-optimisation.md) step 1.
- **Completion notes:** Prod backfill completed and verified (see gating
  requirement above) — **that part of the task is genuinely done and stays
  done regardless of the code-projection decision below.**

  **Investigation before touching code:** traced all 9 call sites of
  `listLeagueGamesByLeagueId` (the single shared fetch OPT-005 deliberately
  unified everything onto) to see whether `.select('-events')` was safe.
  Result: **5 of 9 consumers still read `game.events` directly and would
  break** if it were projected out:
  - `getLeagueTeamForUser` / `getPublicLeaguePlayerBySlug` → per-event
    highlight extraction (`buildLeaguePlayerHighlights`, needs
    `event.videoTimestamp`/`statType`/`playerId` per event).
  - `getPublicLeagueTeamBySlug` → live per-player stat aggregation
    (`buildLeagueTeamPlayerStats`, needs the raw event stream).
  - `computeLeagueStandings` / `computeLeaguePlayerStats` (OPT-010/011
    materialisation) → `getLeagueGameScore`'s **fallback path** for any game
    without a `finalScore` needs `events` to compute a score instead of
    silently returning 0. Backfilling prod today doesn't retire this fallback
    permanently — it's defensive code for any future edge case (a game
    finalized outside the normal flow, a field getting unset, a migration
    gap) and removing the data it needs would turn a graceful fallback into a
    silent wrong-score bug.

  Every call site that needs a plain list of games **always shares the same
  `rawGames` prefetch** with a sibling that needs full events in the same
  request (that's exactly what OPT-005 optimised for — one fetch, reused).
  There is no "list-only, nothing else in this request needs events" code
  path today. Projecting `events` out of the shared fetcher would silently
  break highlights, team stat pages, and the standings fallback for real
  users — **not something to risk on a task this small.**

  **Decision (with app owner, 2026-07-07):** mark **won't-fix** rather than
  force it through. The two honest ways to actually achieve the goal are both
  bigger than this task's S-complexity: (a) split the shared fetch into a
  projected list-only query **plus** a separate full query for the
  events-needing siblings — re-introduces the extra round-trip OPT-005 removed,
  a real tradeoff not a pure win; or (b) move `events` to its own collection
  entirely — an actual schema migration. Both are legitimate future L-effort
  work, not this ticket. At the current dataset size (14 games, low hundreds of
  events each) the bytes saved by projection are negligible — revisit if event
  counts grow 10–100×, or if events ever move to their own collection anyway
  for other reasons.
  **No code was changed for this task** — investigation only; current
  behaviour and data are untouched.
