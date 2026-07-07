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

- **Overall status:** Investigation complete for all 5 issues. TSW-003 and
  TSW-004 have confirmed, narrow root causes and are being implemented in the
  same pass that created this tracker. TSW-002 is Ready. TSW-001 needs a
  production-data investigation sub-step before its fix can be finalized.
  TSW-005 is the largest task (Ready, ordered last).
- **Counts by status:**

| Status          | Count                    |
| --------------- | ------------------------ |
| Not Started     | 0                        |
| Investigating   | 1 (`TSW-001`)            |
| Ready           | 2 (`TSW-002`, `TSW-005`) |
| In Progress     | 2 (`TSW-003`, `TSW-004`) |
| Blocked         | 0                        |
| Awaiting Review | 0                        |
| Completed       | 0                        |

- **Recommended next task:** `TSW-003` and `TSW-004` are in progress in this
  pass. After those ship, do `TSW-002` (low-risk, adjacent files), then
  `TSW-001` (needs the prod-investigation sub-step first), then `TSW-005`
  (largest, benefits from TSW-004 being done).

---

## 🗺️ Execution order & rationale

See [`01_MASTER_ROADMAP.md`](./01_MASTER_ROADMAP.md) for the full dependency
graph. Summary: **TSW-003 → TSW-004 → TSW-002 → TSW-001 → TSW-005.** TSW-003/
004 are cheapest and fully confirmed; TSW-002 is low-risk and file-adjacent to
TSW-004; TSW-001 needs a prod-log check before its fix can be scoped; TSW-005
is the largest and has a soft dependency on TSW-004 (shared rendering code).

---

## 📋 Status board

| ID      | Title                                | Priority | Complexity | Risk   | Status        | Dependencies                   |
| ------- | ------------------------------------ | -------- | ---------- | ------ | ------------- | ------------------------------ |
| TSW-001 | Share to Pulse failure in production | High     | M          | Medium | Investigating | none                           |
| TSW-002 | Key Moments mobile scroll            | Medium   | S          | Low    | Ready         | none (sequenced after TSW-004) |
| TSW-003 | Production nav title                 | Low      | XS         | Low    | In Progress   | none                           |
| TSW-004 | FullScreen component stat rendering  | High     | S          | Low    | In Progress   | none                           |
| TSW-005 | FeedComposer league scope            | Medium   | L          | Medium | Ready         | soft: TSW-004                  |

---

## 🗂️ Task detail cards

### TSW-001 — Share to Pulse failure in production

- **Priority:** High · **Complexity:** M · **Risk:** Medium · **Status:** Investigating
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
- **Completion notes:** —

---

### TSW-002 — Key Moments doesn't scroll on mobile

- **Priority:** Medium · **Complexity:** S · **Risk:** Low · **Status:** Ready
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
- **Completion notes:** —

---

### TSW-003 — Production navigation title shows "tsw-2026-march"

- **Priority:** Low · **Complexity:** XS · **Risk:** Low · **Status:** In Progress
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
- **Completion notes:** —

---

### TSW-004 — FullScreen components render wrong stats

- **Priority:** High · **Complexity:** S · **Risk:** Low · **Status:** In Progress
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
- **Completion notes:** —

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
- **Completion notes:** —

---

## 🧭 Decisions log

Record every scope/architecture decision here with a date and rationale.

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

_(empty — populated as tasks ship)_
