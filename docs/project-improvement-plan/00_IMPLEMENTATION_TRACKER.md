# 00 — Implementation Tracker

> **The single source of truth for the TSW Project Improvement Initiative.**

> Created 2026-07-07 from a targeted investigation of 5 reported issues
> (TSW-001 through TSW-005). This is a **separate initiative** from the
> completed performance/hardening project tracked in
> [`../application-audit/000-OPTIMISATION-TRACKER.md`](../application-audit/000-OPTIMISATION-TRACKER.md)
> — that tracker is not modified by this work and remains the record for the
> OPT-### project.

---

## ⚠️ HOW TO USE THIS FILE — read before touching any code

**If you are an AI or developer picking up this project:**

1. **Read this tracker first.** It reflects the current state of every task.
2. Read [`01_MASTER_ROADMAP.md`](./01_MASTER_ROADMAP.md) for the dependency
   graph and why tasks are sequenced the way they are.
3. Read [`03_INVESTIGATION_REPORT.md`](./03_INVESTIGATION_REPORT.md) for the
   full root-cause evidence (file:line citations) behind every task — don't
   re-investigate from scratch if the report already answers it.
4. Pick the next task per the **Status dashboard** below (or ask if unsure).
5. **After finishing any task**: update this file — status, completion date,
   what changed (files + brief summary), any new discoveries, and whether any
   other task's scope/dependencies changed as a result. Also update
   [`02_ARCHITECTURE_NOTES.md`](./02_ARCHITECTURE_NOTES.md) or
   [`04_TECHNICAL_DEBT.md`](./04_TECHNICAL_DEBT.md) if the task surfaced a
   durable pattern or newly-discovered debt.
6. Never leave this tracker stale — it is worse than no tracker at all.

---

## 📊 Status dashboard

- **Overall status:** All 5 tasks are done, tested, and committed. `TSW-002`
  is also mobile-verified by the user (2026-07-08). This initiative's
  original 5-task scope is complete — see each task's Completion notes for
  deferred sub-scopes (player/team card staleness, league profile-page
  linking) that remain open as candidate follow-up work, not blockers.
- **Counts by status:**

| Status          | Count                                                     |
| --------------- | --------------------------------------------------------- |
| Not Started     | 0                                                         |
| Investigating   | 0                                                         |
| Ready           | 0                                                         |
| In Progress     | 0                                                         |
| Blocked         | 0                                                         |
| Awaiting Review | 0                                                         |
| Completed       | 5 (`TSW-001`, `TSW-002`, `TSW-003`, `TSW-004`, `TSW-005`) |

- **Recommended next task:** none — all 5 tasks complete. See
  [`02_ARCHITECTURE_NOTES.md`](./02_ARCHITECTURE_NOTES.md) for durable
  follow-up candidates surfaced along the way (card staleness refresh,
  league player/team profile routes for feed-card linking).

---

## 🗺️ Execution order & rationale

See [`01_MASTER_ROADMAP.md`](./01_MASTER_ROADMAP.md) for the full dependency
graph. Summary: **TSW-003 → TSW-004 → TSW-002 → TSW-001 → TSW-005.** TSW-003/
004 are cheapest and fully confirmed; TSW-002 is low-risk and file-adjacent to
TSW-004; TSW-001 needs a prod-log check before its fix can be scoped; TSW-005
is the largest and has a soft dependency on TSW-004 (shared rendering code,
now satisfied since TSW-004 shipped).

---

## 📋 Status board

| ID      | Title                                | Priority | Complexity | Risk   | Status       | Dependencies              |
| ------- | ------------------------------------ | -------- | ---------- | ------ | ------------ | ------------------------- |
| TSW-001 | Share to Pulse failure in production | High     | M          | Medium | ✅ Completed | none                      |
| TSW-002 | Key Moments mobile scroll            | Medium   | S          | Low    | ✅ Completed | none                      |
| TSW-003 | Production nav title                 | Low      | XS         | Low    | ✅ Completed | none                      |
| TSW-004 | FullScreen component stat rendering  | High     | S          | Low    | ✅ Completed | none                      |
| TSW-005 | FeedComposer league scope            | Medium   | L          | Medium | ✅ Completed | soft: TSW-004 (satisfied) |

---

## 🗂️ Task detail cards

### TSW-001 — Share to Pulse failure in production

- **Priority:** High · **Complexity:** M · **Risk:** Medium · **Status:** ✅ Completed (2026-07-08)
- **Dependencies:** none (independent of other tasks)
- **Description:** The "Share to Pulse" button in the Game Recap Highlights
  panel fails in production, flipping to "Failed to share". Reported as a
  League Admin permission issue.
- **Investigation summary** (full detail in
  [`03_INVESTIGATION_REPORT.md`](./03_INVESTIGATION_REPORT.md#tsw-001)):
  traced the full permission chain (button → `GameDetailPage.jsx` handler →
  `feed.controller.js` → `assertFeedPostingAllowed` → `assertCanShareHighlightClip`
  → `canAccessGame` → `canManageLeagueGame`) and **found no hardcoded
  ownerUserId-only bug** — league admins are correctly covered by
  `canManageLeagueGame`'s `findActiveLeagueManager` check. The real problem:
  `GameDetailPage.jsx`'s catch block **discards the actual server error**,
  collapsing every failure mode into a generic "Failed to share" with zero
  logging. Two concrete, already-visible candidate root causes:
  `feed.service.js` throws if `game.videoUrl` is falsy, or if
  `event.videoTimestamp` isn't a number — either would produce this exact
  symptom for specific games/events, independent of who clicks the button.
- **Why "Investigating" not "Ready":** the real cause can't be confirmed from
  static code reading alone — it needs a look at an actual failed request's
  response body/`requestId` in production (or reproducing it in
  staging/dev with a game known to be missing `videoUrl`/`videoTimestamp`).
- **Files likely to change:** `client/src/features/games/pages/GameDetailPage.jsx`
  (error surfacing, definitely); `server/src/modules/feed/feed.service.js` or
  `server/src/modules/leagues/leagues.service.js` (the actual fix, depending
  on what's confirmed).
- **Suggested AI model:** Sonnet for the error-surfacing fix; Opus to validate
  the root-cause hypothesis before committing to the second fix.
- **Testing requirements:** reproduce a "Failed to share" case (in prod via
  browser devtools, or in dev/staging with a fixture game missing
  `videoUrl`/`videoTimestamp`); confirm the real error is now visible
  (not swallowed); confirm the underlying issue is resolved for a real league
  admin sharing a real highlight.
- **Definition of Done:** the swallowed-error anti-pattern is fixed (real
  error surfaced + logged with `requestId`); the actual root cause is
  confirmed and fixed; a league admin can successfully share a highlight in
  production.
- **Completion notes (2026-07-08):** the user pulled the real Render prod
  log for a failed request and it immediately identified the true root
  cause — **not** a `videoUrl`/`videoTimestamp` data gap as hypothesized,
  and **not** a bug in `canManageLeagueGame`'s permission chain. The actual
  error was `403 "You must be part of a team or league to post"` thrown by
  `assertFeedPostingAllowed` (`billing.service.js`) — a _different_ gate
  than the one originally traced. That function checked `Team.exists`,
  `LeagueManager.exists({status:'active'})`, and `LeagueTeamMember.exists`,
  but **never `League.exists({ownerUserId})`**. League creation
  (`createLeagueFromCheckoutSession`) never auto-inserts a `LeagueManager`
  row for the owner — that's reserved for managers the owner explicitly adds
  via `addLeagueManagerByEmail`, which even rejects adding the owner
  themself ("That user is already the league owner"). So a pure league
  owner with no team and no explicit manager row failed all three checks.
  Every other authorization helper in `leagues.service.js`
  (`canManageLeagueGame`, `isLeagueMember`, `assertLeagueManagerOrOwner`,
  etc.) correctly ORs in an owner check — this billing-side gate was the one
  outlier missing it. Fix: added `League.exists({ ownerUserId: userId })`
  as a fourth OR'd condition in `assertFeedPostingAllowed`
  (`billing.service.js`). Also shipped the swallowed-error fix in
  `GameDetailPage.jsx`'s catch block regardless — it now surfaces the real
  `err.message` (falling back to "Failed to share" only if none) and logs
  `requestId` to the console, so this class of bug is self-diagnosing next
  time without needing prod log access. Added 5 unit tests for
  `assertFeedPostingAllowed` covering each of the four allow-paths plus the
  403 case (`billing.service.test.js`) — none existed before (the only prior
  test coverage mocked this function out entirely). Full server suite: 33
  suites/273 tests pass (was 33/268). Full client suite baseline unchanged
  at 20 pre-existing failures/118 passed. Lint clean. Committed `0669f1f`.
  **Lesson for future prod-only bugs:** the swallowed-error anti-pattern
  cost real diagnosis time here — static code tracing found a plausible but
  wrong root cause (the permission chain looked fine on paper) until the
  actual server log revealed a completely different gate had thrown. See
  [`02_ARCHITECTURE_NOTES.md`](./02_ARCHITECTURE_NOTES.md) for the durable
  note.

---

### TSW-002 — Key Moments doesn't scroll on mobile

- **Priority:** Medium · **Complexity:** S · **Risk:** Low · **Status:** ✅ Completed (2026-07-08, mobile-verified by user)
- **Dependencies:** none (sequenced after TSW-004 for file-adjacency
  convenience only, not a hard blocker)
- **Description:** Highlights scrolls correctly on mobile; Key Moments does
  not. Both live in `GameRecapPanel.jsx`.
- **Investigation summary** (full detail in
  [`03_INVESTIGATION_REPORT.md`](./03_INVESTIGATION_REPORT.md#tsw-002)):
  Highlights is a real horizontal flex scroller
  (`overflow-x-auto` + `shrink-0` fixed-width children). Key Moments is a
  plain vertical `<ul>` with no horizontal-scroll CSS at all — it was never
  built to scroll sideways, not a regression in an existing scroller.
- **Files likely to change:** `client/src/features/games/components/GameRecapPanel.jsx`;
  new shared scroll-row component (extracted from the Highlights pattern so
  both sections use one implementation).
- **Suggested AI model:** Sonnet.
- **Testing requirements:** manual mobile-viewport scroll test (devtools
  responsive mode; real-device check if available) on both Highlights and Key
  Moments after the fix — confirm both scroll identically.
- **Definition of Done:** Key Moments scrolls horizontally on mobile,
  matching Highlights' behavior; both sections share one scroll-row
  implementation (no duplicated CSS/structure).
- **Completion notes (2026-07-08):** extracted the proven Highlights scroll
  pattern into a local `HorizontalScrollRow` component in
  `GameRecapPanel.jsx` and applied it to both sections. Key Moments cards
  are now fixed-width (`w-56 shrink-0`) matching Highlights' `w-64` cards.
  Also fixed a mislabeled counter ("N highlights" on the Key Moments header
  — copy-paste leftover from Highlights — now correctly "N key moments").
  No existing test file for this component. Full client suite baseline
  unchanged at 20 pre-existing failures/118 passed. Lint clean. Committed
  `0ae08d8`. **User-verified on mobile** — Key Moments and Highlights both
  scroll correctly.
  **Follow-up scope extension (2026-07-08, same day):** user asked for the
  same treatment on **Top Performers**, which was a wrapping grid
  (`md:grid-cols-3 lg:grid-cols-1`), not a scroller either. Switched it to
  the same `HorizontalScrollRow` + fixed-width (`w-64 shrink-0`) card
  pattern. All three sections in the recap panel (Highlights, Key Moments,
  Top Performers) now behave consistently on mobile. Lint clean; baseline
  unchanged. Committed `45aa04d`.

---

### TSW-003 — Production navigation title shows "tsw-2026-march"

- **Priority:** Low · **Complexity:** XS · **Risk:** Low · **Status:** ✅ Completed (2026-07-08)
- **Dependencies:** none
- **Description:** Production displays the repo-name-shaped string
  "tsw-2026-march" as the app name in places driven by `VITE_APP_NAME`,
  instead of "TSW"/"The Sporty Way".
- **Investigation summary** (full detail in
  [`03_INVESTIGATION_REPORT.md`](./03_INVESTIGATION_REPORT.md#tsw-003)):
  `client/index.html`'s static `<title>` is already correct. The leak is
  `client/src/lib/env.js`'s Zod schema default
  (`VITE_APP_NAME: z.string().default('tsw-2026-march')`), which only fires
  when the env var is `undefined`. Both env files correctly set
  `VITE_APP_NAME=THE SPORTY WAY`. `render.yaml`'s prod client service
  declares `VITE_APP_NAME` as a key with no value (expects manual Render
  dashboard entry per this project's convention) — if that manual step was
  never done, the build gets `undefined` and falls through to the bad
  default.
- **Files likely to change:** `client/src/lib/env.js` (fix the default
  value); Render dashboard configuration for the prod client service (manual
  step, not a file — must be verified/set by whoever has Render access).
- **Suggested AI model:** Sonnet.
- **Testing requirements:** build the client, confirm the fallback value is
  now "The Sporty Way"; after next prod deploy, confirm the tab
  title/app-name displays correctly.
- **Definition of Done:** the Zod default no longer resembles a repo/package
  name; production displays "TSW"/"The Sporty Way" wherever `VITE_APP_NAME`
  is consumed, regardless of whether the Render dashboard var is set.
- **Completion notes (2026-07-08):** changed the Zod default in
  `client/src/lib/env.js` from `'tsw-2026-march'` to `'The Sporty Way'`.
  Committed `fbf11e7`. Lint clean; no test referenced the old default value.
  **Remaining manual step (not code, tracked here so it isn't lost):**
  whoever has Render dashboard access should still set `VITE_APP_NAME`
  explicitly for the prod client service to close the actual configuration
  gap — the code fix makes the failure mode harmless either way, but the
  dashboard var being unset is still worth fixing at the source.

---

### TSW-004 — FullScreen components render wrong stats

- **Priority:** High · **Complexity:** S · **Risk:** Low · **Status:** ✅ Completed (2026-07-08)
- **Dependencies:** none
- **Description:** Scores, averages, and statistics render incorrectly across
  the FullScreen\* feed components (FullScreenSlide, FullScreenTeamCard,
  FullScreenPost, FullScreenImagePost, FullScreenPlayerCard,
  FullScreenHighlightClipPost, and the game-card family).
- **Investigation summary** (full detail in
  [`03_INVESTIGATION_REPORT.md`](./03_INVESTIGATION_REPORT.md#tsw-004)):
  `feed.service.js`'s `buildGameCardSnapshot()` never sets a `recap` field,
  but `FullScreenGameCard.jsx`/`GameCardPost.jsx` read scores exclusively
  from `gameCard.recap.*`, defaulting every value to `0` once a post uses the
  persisted-snapshot fast path. Player/team card builders correctly populate
  their `summary.*` fields — **no bug found there.** Secondary finding: no
  refresh trigger exists for player/team card snapshots (they can go
  permanently stale after the underlying stats change), unlike game cards
  which have `refreshGameCardPostsForGame`. Also found duplicated
  points/winner-derivation logic between `GameCardPost.jsx` and
  `FullScreenGameCard.jsx`.
- **Scope for this pass:** (a) add the missing `recap` field to
  `buildGameCardSnapshot()`, mirroring what `getPublicGame`'s `buildGameRecap`
  already produces — this is the confirmed, narrow fix; (b) extract the
  duplicated points/winner-derivation logic into one shared helper while
  touching this code; (c) the player/team card staleness gap is a separate,
  lower-severity design question (what should trigger a refresh?) — confirm
  scope with the user before implementing, may be split into a follow-up task
  if it needs more design than a quick pass.
- **Files likely to change:** `server/src/modules/feed/feed.service.js`;
  `client/src/features/feed/components/posts/GameCardPost.jsx`;
  `client/src/features/feed/components/posts/FullScreenGameCard.jsx`.
- **Suggested AI model:** Sonnet for the fix; Opus to review the
  staleness-refresh design before implementing it (if pursued this pass).
- **Testing requirements:** share a game card, verify real scores render
  (not 0-0); verify existing player/team card rendering is unaffected
  (regression check, since those were confirmed correct); if the staleness
  fix is included, verify a shared player/team card updates after the
  underlying stats change.
- **Definition of Done:** shared game cards display real scores in both the
  feed and full-screen view; the duplicated derivation logic is consolidated;
  no regression in player/team card rendering.
- **Completion notes (2026-07-08):** fixed at the root — `payload` passed
  into `buildGameCardSnapshot()` is literally a `getPublicGame()` return
  value, which already computes `recap`; the function just never copied it
  into the snapshot it returns. One-line fix: `recap: payload.recap`.
  **Also found and fixed a second, compounding bug while verifying the
  first**: both consumer components detect dual-team mode via
  `!!gameCard?.participants`, but the old snapshot never included
  `participants` either — every cached dual-team (league) game card was
  rendering with the wrong recap branch on top of the 0-0 bug. Added
  `participants: isDualTeam ? payload.participants : null` alongside the
  `recap` fix.
  Extracted the duplicated home/away name+points+logo+winner derivation
  (verbatim between `GameCardPost.jsx` and `FullScreenGameCard.jsx`) into a
  shared `buildGameCardDisplay()` helper in `cardUtils.js` — both components
  now consume it instead of re-deriving.
  **Player/team card staleness sub-scope: deferred, not done this pass** —
  confirmed as a separate, lower-severity design question in the
  investigation; not pursued here to keep this fix narrow and low-risk. If
  it needs doing, split into a follow-up task (see
  [`02_ARCHITECTURE_NOTES.md`](./02_ARCHITECTURE_NOTES.md#card-snapshot-staleness-has-no-consistent-refresh-story)).
  Exported `buildGameCardSnapshot` for direct testing; added 2 unit tests
  (standalone + dual-team payload shapes) to `feed.service.test.js`. Full
  server suite 33 suites/268 tests pass (was 33/266); full client suite
  baseline unchanged at 20 pre-existing failures/118 passed (tracked
  separately as `OPT-026` in the OPT-### tracker). Lint clean. Committed
  `f7a2b9c`.

---

### TSW-005 — FeedComposer league scope

- **Priority:** Medium · **Complexity:** L · **Risk:** Medium · **Status:** Ready
- **Dependencies:** soft dependency on TSW-004 (shared card-rendering code —
  shipping TSW-004 first avoids touching the same rendering components twice
  in overlapping ways)
- **Description:** FeedComposer currently only supports posting standalone
  games/teams/players. Most users operate inside leagues. Investigate
  whether extending the composer is appropriate, or whether a full redesign
  would be cleaner.
- **Investigation summary** (full detail in
  [`03_INVESTIGATION_REPORT.md`](./03_INVESTIGATION_REPORT.md#tsw-005)):
  confirmed all three card-creating tabs query standalone `Game`/`Team`
  collections exclusively via `listShareableGames/Teams/Players` — zero
  league query path exists today. **Verdict: tractable as an additive
  change, not a rewrite.** The component is a plain single-file form with low
  coupling to the standalone data shape; nothing in its architecture
  justifies a rewrite.
- **Scope:** (a) new query branches in the three `listShareable*` functions
  to also surface league-scoped entities; (b) a league-scope dimension added
  to composer state (league selector, or split tabs into "My Teams"/
  "League"); (c) extend the `Post` sub-schemas to optionally carry a league
  reference; (d) extend card snapshot builders + FullScreen/feed rendering
  components to handle league-sourced cards (this is the TSW-004 overlap).
- **Files likely to change:** `server/src/modules/feed/feed.service.js`;
  `client/src/features/feed/components/FeedComposer.jsx`;
  `server/src/modules/feed/feed.repository.js`; the card-snapshot builders;
  the FullScreen*/`*CardPost` components.
- **Suggested AI model:** Sonnet for implementation; Opus to review the
  schema extension (adding a league reference to `Post` sub-schemas touches
  the data model) and the overall plan before starting, given this is the
  largest task.
- **Testing requirements:** create a post referencing a league team/game/
  player from the composer; verify it renders correctly in the feed and
  full-screen view; verify existing standalone-team posting still works
  unchanged (regression check).
- **Definition of Done:** a user can create a post from the composer
  referencing a league team, league game, or league player, and it renders
  correctly everywhere a standalone post would; no regression to existing
  standalone posting.
- **Completion notes (2026-07-08):** shipped as scoped — additive, not a
  rewrite. `listShareableGames/Teams/Players` now query league entities too
  (scoped via `leagues.service.js`'s existing `listLeaguesForUser(userId)`,
  reused rather than reimplemented), tagged `source: 'league'` on each result
  so the composer can distinguish them from standalone results. Required
  first threading `userId` through the controller → service call chain for
  these three endpoints, which had never taken a userId before (they were
  fully unscoped/global lookups pre-TSW-005 — a pre-existing gap, not
  something this task introduced or was in scope to fix for the standalone
  path).
  `game_card` needed **zero** schema/snapshot changes — `getPublicGame()` and
  `buildGameCardSnapshot()` already fully handled league games via the
  existing `participants`/`recap` fields (confirmed by investigation before
  writing any code). `player_card`/`team_card` gained sibling
  `leagueTeamId`/`leaguePlayerId` fields alongside `teamId`/`playerId`
  (mutually exclusive, enforced via a Zod `.refine` in `feed.validation.js`
  and schema comments in `feed.repository.js`), backed by two new
  card-snapshot-sized getters in `leagues.service.js` —
  `getPublicLeagueTeamById`/`getPublicLeaguePlayerById` — deliberately NOT
  reusing the existing slug-keyed `getPublicLeagueTeamBySlug`/
  `getPublicLeaguePlayerBySlug` functions, since those load full
  roster/games/standings for a team profile page (far more than a card
  snapshot reads); the new getters reuse the same underlying helpers
  (`sanitizeLeagueTeam`, `sanitizeLeaguePlayer`, `buildLeaguePlayerGameRows`,
  `buildLeaguePlayerSummary`, `summarizeEvents`) so both paths compute
  aggregates identically.
  Access control: sharing a league game/team/player requires active league
  membership (`canShareLeague(userId, leagueId)`, new function reusing
  `listLeaguesForUser`) — deliberately looser than the edit-time
  `canManageLeagueGame`/`assertLeagueManagerOrOwner` checks, since sharing is
  a lower-stakes, read-derived action (per explicit user decision during
  scoping — "any active member of that league", not "only managers of the
  specific teams playing"). See the Decisions log entry on authorization
  gate consistency this surfaced.
  Client: `FeedComposer.jsx`'s option labels append `" (League)"` for
  league-sourced results; `submit()` branches the `player`/`team` tabs'
  payload on the selected option's `source` field (the `game` tab needed no
  submit change — `gameId` is universal). Also fixed 4 render components
  (`PlayerCardPost.jsx`, `TeamCardPost.jsx`, `FullScreenPlayerCard.jsx`,
  `FullScreenTeamCard.jsx`) that previously wrapped their content in an
  unconditional `<Link to={playerUrl/teamUrl}>` — league cards' `playerUrl`/
  `teamUrl` are intentionally `null` (no league player/team profile route
  exists yet, see deferred sub-scope below), so all four now fall back to a
  non-clickable wrapper when the URL is null. The two FullScreen variants had
  **zero** existing null-guard at all (a latent bug for any future null
  value, not just league cards) — this fix closes that gap generally.
  **Deferred sub-scope, not done this pass:** league player/team profile
  routes for the feed to link to (`playerUrl`/`teamUrl` stay `null` for
  league cards) — out of scope for TSW-005 itself (linking targets a route
  that doesn't exist yet); tracked as a follow-up in
  [`02_ARCHITECTURE_NOTES.md`](./02_ARCHITECTURE_NOTES.md).
  Implementation split: server-side (schema, validation, service, 30 new
  unit tests across `feed.service.test.js`/`leagues.service.test.js`) done
  directly; client-side (`FeedComposer.jsx` wiring + the 4 render-component
  null-guards) delegated to Sonnet with a fully-specified contract, diff
  reviewed before commit. Full server suite: 33 suites/291 tests pass (was
  33/273). Full client suite baseline unchanged at 20 pre-existing
  failures/118 passed. Lint clean on every touched file. `pnpm build`
  succeeds. Committed `d2c35b0`.

---

## 🧭 Decisions log

Record every scope/architecture decision here with a date and rationale.

- **2026-07-08 — TSW-005: league entity sharing requires active league
  membership, not team-management rights.** When scoping who can share a
  league game/team/player to the feed, chose "any active member/manager/
  owner of that league" over "only managers of the specific team(s)
  involved" (both were viable — asked the user directly since this is a new
  authorization surface, not a bug fix with an obviously-correct existing
  pattern to mirror). **Why:** sharing is a lower-stakes, read-derived
  action than editing a game or managing a team, so the looser bound is
  appropriate; also keeps `canShareLeague` simple (one `listLeaguesForUser`
  lookup) instead of requiring per-entity ownership resolution.
- **2026-07-08 — TSW-005: league player/team profile linking deferred, not
  bundled into this pass.** League cards' `playerUrl`/`teamUrl` snapshot
  fields are `null` (no route exists yet for a league player/team profile
  reachable from the feed). Chose to ship the sharing capability now and
  defer the linking UX rather than block TSW-005 on designing a new route.
  **Why:** the two are separable — a user can already see a league card's
  name/stats/logo in the feed without it being clickable; making it
  clickable is additive follow-up work, not a blocker for the core feature.
  See [`02_ARCHITECTURE_NOTES.md`](./02_ARCHITECTURE_NOTES.md) for the
  tracked follow-up.
- **2026-07-08 — TSW-001's original root-cause hypothesis was wrong; the
  swallowed-error fix is what actually found the real bug.** Static code
  tracing pointed at `canManageLeagueGame`/`videoUrl`/`videoTimestamp` as
  candidates and found the permission chain looked correct on paper. The
  real cause — a missing `League.exists({ownerUserId})` check in a
  _different_ gate (`assertFeedPostingAllowed` in `billing.service.js`,
  not the `leagues.service.js` chain originally traced) — only surfaced
  once the user pulled the actual Render prod log for a failed request.
  **Why this matters:** confirms the investigation-sub-step requirement
  this task was flagged with was correct process, not overcaution — for
  prod-only bugs, a real log/requestId beats however much static tracing.
- **2026-07-08 — TSW-004's player/team card staleness sub-scope deferred, not
  bundled into the fix.** The investigation surfaced a real but separate
  issue (no refresh trigger for player/team card snapshots) while confirming
  the `recap`-omission bug. Chose to ship the narrow, fully-confirmed `recap`/
  `participants` fix on its own rather than bundle a design decision
  ("what should trigger a refresh?") into a low-risk task. **Why:** keeps
  TSW-004's diff small and easy to verify; the staleness question deserves
  its own scoping pass rather than being decided as a side-effect of an
  unrelated bug fix. See
  [`02_ARCHITECTURE_NOTES.md`](./02_ARCHITECTURE_NOTES.md#card-snapshot-staleness-has-no-consistent-refresh-story)
  for the durable note; revisit as a follow-up task if it becomes a priority.
- **2026-07-07 — TSW-005 verdict: extend, don't rewrite.** Investigated
  FeedComposer's current architecture (490-line single-file component, three
  structurally-identical search/select blocks, flat per-entity-type state)
  before assuming a redesign was needed. Found no deep coupling that would
  make an additive league-scope extension awkward — the gap is purely that
  the backend query functions are hardcoded to standalone collections, which
  is addable via new branches, not a structural blocker. **Why this
  matters:** the user's brief explicitly allowed for "don't hesitate to
  recommend a full rewrite if justified" — this documents that the evidence
  didn't support one.
- **2026-07-07 — TSW-001 needs a production data check before its fix is
  final.** Rather than guess at the root cause from code alone, flagged as
  "Investigating" so whoever picks it up checks the actual failed request's
  error/requestId in production first. The swallowed-error anti-pattern fix
  ships regardless (it's needed either way and will make future debugging of
  this class of issue much faster).

---

## 🏗️ Architecture changes log

Log new patterns, shared components/hooks, or schema changes as they're
introduced during this initiative.

- ✅ **changed (TSW-005, 2026-07-08)** `Post`'s `playerCard`/`teamCard`
  sub-schemas (`feed.repository.js`) gained optional `leagueTeamId`/
  `leaguePlayerId` fields (refs `LeagueTeam`/`LeaguePlayer`) alongside the
  existing `teamId`/`playerId` — mutually exclusive per card, enforced at
  the Zod/service layer, not the schema. `gameCardSchema` also gained
  `leagueTeamId` (tracks which league team a shared league game was shared
  from) but needed no `gameId` change — one `Game` doc covers both contexts.
- ✅ **built (TSW-005, 2026-07-08)** `getPublicLeagueTeamById(leagueTeamId)`
  / `getPublicLeaguePlayerById(leaguePlayerId)` in `leagues.service.js` —
  card-snapshot-sized ID-keyed siblings to the existing slug-keyed
  `getPublicLeagueTeamBySlug`/`getPublicLeaguePlayerBySlug` (which load full
  profile-page data: roster, games, standings). Reuse the same underlying
  aggregation helpers so both paths compute stats identically.
- ✅ **built (TSW-005, 2026-07-08)** `canShareLeague(userId, leagueId)` in
  `leagues.service.js` — the feed module's access check for league entity
  sharing (any active member/manager/owner), reusing `listLeaguesForUser`
  rather than a new query.
- ✅ **changed (TSW-001, 2026-07-08)** `assertFeedPostingAllowed` in
  `server/src/modules/billing/billing.service.js` now also checks
  `League.exists({ ownerUserId: userId })` alongside the existing
  `Team`/`LeagueManager`/`LeagueTeamMember` checks — matching the
  owner-OR-manager pattern already used everywhere else in
  `leagues.service.js`. No schema change.
- ✅ **built (TSW-004, 2026-07-08)** `buildGameCardDisplay(gameCard)` in
  `client/src/features/feed/components/posts/cardUtils.js` — the shared
  home/away name+points+logo+winner derivation for game cards, consumed by
  both `GameCardPost.jsx` and `FullScreenGameCard.jsx`. Also exported
  `buildGameCardSnapshot` from `feed.service.js` (previously internal-only)
  for direct unit testing.
- ✅ **changed (TSW-004, 2026-07-08)** `feed.service.js`'s
  `buildGameCardSnapshot()` now includes `recap` and `participants` in its
  returned snapshot — previously silently omitted both, which is why cached
  game cards rendered 0-0 (and dual-team cards used the wrong recap branch).
  No schema change — these were already present on the input `payload`
  (a `getPublicGame()` result); the fix just stops dropping them.
- ✅ **changed (TSW-003, 2026-07-08)** `client/src/lib/env.js`'s
  `VITE_APP_NAME` Zod default changed from `'tsw-2026-march'` to
  `'The Sporty Way'`.
- ✅ **built (TSW-002, 2026-07-08)** `HorizontalScrollRow` — a small local
  component in `GameRecapPanel.jsx` wrapping the `flex gap-3 overflow-x-auto
pb-2` scroll-container pattern. Consumed by Highlights, Key Moments, and
  (as of the same-day follow-up) Top Performers — all three sections in the
  recap panel now scroll identically on mobile. Local to this file for now
  (not extracted to a shared cross-feature component) since it has exactly
  one consumer file today — promote it if a horizontal-scroll use case
  appears outside `GameRecapPanel.jsx`.
