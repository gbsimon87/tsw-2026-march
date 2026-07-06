# 000 — Optimisation Master Tracker

> **The single source of truth for the TSW optimisation project.**
> Created 2026-07-04 from the [Application Audit](./README.md). This file sorts
> first in the folder on purpose — it is the entry point for all optimisation
> work.

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

- **Overall status:** `Wave 0 done (minus prod-gated OPT-007). Waves 1–2 complete AND adversarially verified (2026-07-06: 4 bugs found+fixed, see Verification log). Wave 3 underway (OPT-015, OPT-017 done).`
- **Current wave:** Wave 3. Branch `dev` (see note in Decisions log re: `feat/opt-wave-0`).
- **Recommended next task:** **`OPT-016`** (GameTrackPage decomposition — deps: OPT-015 ✅ now met) — the natural follow-on, wiring the client to consume the slim delta with optimistic updates. **`OPT-014`** (React Query) is independent and can go anytime. Gated/blocked: **`OPT-007`** (prod `$indexStats`), **`OPT-025`** (prod backfill), **`OPT-024`** (product decisions). (Done: OPT-001–006, 008–013, 015, 017.)
- **Dataset context:** tiny today (~17 games, 136 docs in dev). Nothing is
  slow _now_; the P1 items are **scaling cliffs**, the frontend items are felt
  by every user immediately. Prioritise accordingly.

**Counts by status** (25 tasks total; OPT-025 added during OPT-008):

| Status      | Count                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Not Started | 10                                                                                                    |
| In Progress | 0                                                                                                     |
| Blocked     | 1 (`OPT-024`, awaiting product decisions)                                                             |
| Completed   | 14 (`001`, `002`, `003`, `004`, `005`, `006`, `008`, `009`, `010`, `011`, `012`, `013`, `015`, `017`) |
| Deferred    | 0                                                                                                     |

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
| OPT-007 | Index hygiene                                  | 0    | Medium   | S          | Not Started  | — (verify first)   |
| OPT-008 | `Game.finalScore` + `eventCount` + projections | 1    | High     | M          | ✅ Completed | OPT-006            |
| OPT-009 | Async video transcode + video hygiene          | 1    | Medium   | S          | ✅ Completed | OPT-002            |
| OPT-010 | `leaguestandings` materialisation              | 2    | High     | L          | ✅ Completed | OPT-006, OPT-008   |
| OPT-011 | `leagueplayerstats` materialisation            | 2    | High     | L          | ✅ Completed | OPT-010            |
| OPT-012 | Frozen `Game.boxScore` + single event pass     | 2    | Medium   | M          | ✅ Scoped    | OPT-008            |
| OPT-013 | Team season summaries (standalone)             | 2    | Medium   | M          | ✅ Completed | OPT-006            |
| OPT-014 | React Query on the client                      | 3    | High     | M          | Not Started  | (OPT-010, OPT-011) |
| OPT-015 | Slim event-append hot path                     | 3    | Medium   | M          | ✅ Scoped    | OPT-008            |
| OPT-016 | GameTrackPage decomposition + memo             | 3    | Medium   | M/L        | Not Started  | OPT-015            |
| OPT-017 | Feed hydration batching + denormalise          | 3    | Medium   | M          | ✅ Completed | —                  |
| OPT-018 | Pagination everywhere                          | 4    | Medium   | M          | Not Started  | —                  |
| OPT-019 | HTTP caching for anonymous GETs                | 4    | Medium   | S          | Not Started  | OPT-010, OPT-011   |
| OPT-020 | Blocking integrations off request path         | 4    | Medium   | S          | Not Started  | —                  |
| OPT-021 | Feed windowing + video unmount                 | 4    | Low      | M          | Not Started  | (OPT-009)          |
| OPT-022 | Low-impact hygiene batch                       | 5    | Low      | S          | Not Started  | —                  |
| OPT-023 | Ops hardening                                  | 5    | Low      | S          | Not Started  | —                  |
| OPT-024 | Correctness decisions                          | 5    | Low      | S          | **Blocked**  | product decision   |
| OPT-025 | Project `events` out of list endpoints         | 1    | Medium   | S          | Not Started  | OPT-008 + backfill |

_Deps in (parentheses) are "benefits from / stronger after" rather than hard
blockers._

---

## ✅ Completed

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
  now ×1 each). `publicOnly` behaviour preserved (bug still tracked in OPT-024).
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
- **OPT-003** — `<CloudinaryImage>` component + **full rollout**. _2026-07-05._
  Branch `feat/opt-wave-0`. Component built (11 tests) and **all 64 `<img>` sites
  migrated** across 34 files (7 manual + 57 via a 6-agent parallel workflow).
  Cloudinary images get responsive `srcset`/`sizes`; static/YouTube images get
  lazy + dimensions only; heroes are eager. Zero plain `<img>` remain; build
  passes; no new test failures. See its card.

## 🔄 In Progress

_None._

## ⛔ Blocked

- **OPT-024** — needs product/owner decisions (tie-break rule, `publicOnly`
  intended behaviour) before implementation. See its card.

## ⏸️ Deferred

_None yet._

---

## 🧭 Decisions log

Record every architectural / scope decision here with a date and rationale.

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
- **2026-07-04 — Tie-break rule: PENDING.** Standings currently treat a tie as
  a home win (`leagues.service.js:1763`). Correct behaviour needs a product
  decision (OPT-024).
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

## 🔎 Verification log

Post-completion adversarial verification passes. Each entry lists what was
audited, what was found, and what was corrected.

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
- _(planned)_ React Query `QueryClientProvider` (OPT-014).

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
teams/games fetches per request. ⚠️ Note: the `publicOnly` games filter is
unchanged (still a no-op — separate OPT-024 decision).

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
    (and still ignores) the `publicOnly` flag — that pre-existing bug is tracked
    separately in **OPT-024** and was intentionally NOT changed here.
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

- **Priority:** Medium · **Status:** Not Started · **Category:** Database
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
- **Validation checklist:** [ ] verification window passed [ ] drops applied via
  migration [ ] new indexes used by planner [ ] prod autoIndex off.
- **Source:** [30](./30-optimisation-roadmap.md) M5, [19](./19-indexing-strategy.md).
- **Completion notes:** —

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

- **Priority:** High · **Status:** Not Started · **Category:** Frontend / caching
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
- **Validation checklist:** [ ] provider added [ ] keys per doc §2 [ ] mutations
  `setQueryData` [ ] feed uses `useInfiniteQuery` [ ] no regressions per page.
- **Source:** [30](./30-optimisation-roadmap.md) H4, [29](./29-frontend-optimisation.md) §2, [27](./27-caching-opportunities.md).
- **Completion notes:** —

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

- **Priority:** Medium · **Status:** Not Started · **Category:** Frontend / rendering
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
- **Validation checklist:** [ ] children memoised [ ] handlers stable [ ]
  optimistic updates reconcile [ ] no functional regression.
- **Source:** [30](./30-optimisation-roadmap.md) M7, [29](./29-frontend-optimisation.md) §3.
- **Completion notes:** —

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

- **Priority:** Medium · **Status:** Not Started · **Category:** Backend + client
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
- **Validation checklist:** [ ] keyset cursor on all lists [ ] client paginates
  [ ] query validation added [ ] no dropped/duplicated items across pages.
- **Source:** [30](./30-optimisation-roadmap.md) M6, [23](./23-api-audit.md) #9/#10.
- **Completion notes:** —

---

### OPT-019 — HTTP caching for anonymous public GETs

- **Priority:** Medium · **Status:** Not Started · **Category:** Backend / caching
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
- **Validation checklist:** [ ] headers on public routes only [ ] no caching of
  authed responses [ ] ETag on completed game detail.
- **Source:** [30](./30-optimisation-roadmap.md) M8, [27](./27-caching-opportunities.md).
- **Completion notes:** —

---

### OPT-020 — Move blocking integrations off the request path

- **Priority:** Medium · **Status:** Not Started · **Category:** Backend
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
- **Validation checklist:** [ ] AI post-response + lock TTL [ ] email async
  [ ] webhook `$addToSet` idempotent [ ] no request-path blocking.
- **Source:** [30](./30-optimisation-roadmap.md) M4, [23](./23-api-audit.md), [09](./09-payment-webhooks.md).
- **Completion notes:** —

---

### OPT-021 — Feed windowing + video unmount + throttled scroll

- **Priority:** Low · **Status:** Not Started · **Category:** Frontend / rendering
- **Wave:** 4 · **Complexity:** M · **Dependencies:** pairs with OPT-009
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

- **Priority:** Low · **Status:** Not Started · **Category:** Mixed
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
- **Validation checklist:** [ ] slug in schema [ ] dead code removed cleanly
  [ ] canvas on demand [ ] `.lean()` safe [ ] validation added.
- **Source:** [30](./30-optimisation-roadmap.md) L2/L3/L5/L8, [22](./22-known-technical-debt.md).
- **Completion notes:** —

---

### OPT-023 — Ops hardening

- **Priority:** Low · **Status:** Not Started · **Category:** Ops / backend
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
- **Validation checklist:** [ ] graceful shutdown [ ] DB-ping health [ ] pool/
  timeout set [ ] Stripe pinned [ ] login limiter.
- **Source:** [30](./30-optimisation-roadmap.md) L6, [21](./21-deployment-notes.md), [24](./24-database-audit.md) §7.
- **Completion notes:** —

---

### OPT-024 — Correctness decisions (Blocked)

- **Priority:** Low · **Status:** **Blocked** (needs product/owner decision) ·
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
- **Blocker:** Needs answers to: How should ties break? What should `publicOnly`
  include? (Escaping + distinctId binding can proceed independently if split
  out.)
- **Files likely to change:** `leagues.service.js`, contact/analytics
  controllers.
- **Testing:** once decided — encode the rule + unit tests; verify escaping;
  verify distinctId on authed events.
- **Validation checklist:** [ ] tie rule decided & encoded [ ] `publicOnly`
  behaviour decided [ ] contact input escaped [ ] distinctId bound.
- **Source:** [30](./30-optimisation-roadmap.md) L7/L9, [22](./22-known-technical-debt.md).
- **Completion notes:** —

---

### OPT-025 — Project `events` out of list endpoints (follow-up to OPT-008)

- **Priority:** Medium · **Status:** Not Started · **Category:** Backend / DB
- **Wave:** 1 · **Complexity:** S · **Dependencies:** OPT-008 + **prod backfill**
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
- **Files likely to change:** `games.repository.js` (new projected finder or
  `.select()` on `listLeagueGamesByLeagueId`), `leagues.service.js` callers.
- **Testing:** after backfill, list endpoints return identical scores with
  events projected out (query inspection confirms no events transferred).
- **Validation checklist:** [ ] prod backfill run [ ] events projected out of
  list queries [ ] scores identical [ ] detail endpoints still load events.
- **Source:** [30](./30-optimisation-roadmap.md) H3/#5, [28](./28-computation-optimisation.md) step 1.
- **Completion notes:** —
