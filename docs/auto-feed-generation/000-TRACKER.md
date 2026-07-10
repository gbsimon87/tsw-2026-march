# Auto Feed Generation — Project Tracker

> Living tracker for the **Automatic Feed Population from Finalised Games**
> feature. Update the dashboard and task statuses as work proceeds.
> Full design/rationale lives in the approved plan (see the "Implementation
> game plan" the tracker was created from). The code is the source of truth —
> if this doc disagrees with the code, fix the doc.

---

## Project overview

When a game is **finalised in a public, active league**, the backend
automatically publishes Feed content to "The Pulse" (`/pulse`) with no human
action, keeping the feed fresh when users aren't posting:

- One `game_card` recap post per finalised public-league game (always, idempotent).
- One `highlight_clip` post per video-eligible event (only when the game has a
  YouTube `videoUrl` + per-event `videoTimestamp` + an eligible `statType`),
  capped per game.

**Scope decisions (locked):**

- **Authorship** — a dedicated reserved **system User** owns all auto-generated
  posts (`Post.creatorUserId` is required; no bot author exists today).
- **Post types** — `game_card` + `highlight_clip` only. **No** `video` type —
  there is no video-encoding pipeline; highlights are YouTube URL + timestamp
  windows.
- **Scope** — **public leagues only.** Standalone (non-league) games are
  excluded — they have no privacy flag and were never opted in.

**Enforcement of the public-league rule:** a single `isLeaguePublic(leagueId)`
guard at the top of the new `autoPublishForFinalizedGame(gameId)` in
`feed.service.js` — the same helper the manual share paths use.

**Reversal on going private (B2, resolved):** when an owner/league manager
flips a league from public to private, `updateLeagueForUser` fires a
best-effort post-response call to `reverseAutoPostsForLeague(leagueId)`, which
deletes only the system-authored auto posts for that league's games — a
user's manually-shared cards/clips for the same games are left untouched.

**Key integration points:**

- Trigger: reuse the post-response `setImmediate` pattern in
  `finishGameForUser` (`games.service.js`) — no queue/cron introduced.
- Idempotency: new partial unique index for auto game-cards + existing unique
  sparse `highlightClip.eventId` index; catch-and-skip on Mongo E11000.
- No client changes required — auto-posts are ordinary `game_card` /
  `highlight_clip` documents already rendered by `FeedList.jsx`.

---

## Implementation phases

| Phase | Title                          | Summary                                                                                              |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 0     | Design sign-off & tracker      | Approved plan + this tracker. No code.                                                               |
| 1     | System user foundation         | Reserved system User, `getSystemUserId()`, login rejection, seed wiring.                             |
| 2     | Auto game-card generation      | `autoPublishForFinalizedGame` gate + `game_card` path, partial unique index, `setImmediate` trigger. |
| 3     | Auto highlight-clip generation | Extend to `highlight_clip` via `buildGameHighlights` + dedup + per-game cap.                         |
| 4     | Hardening & polish             | Logging/metrics, idempotent backfill script, optional system-author badge.                           |
| 5     | Docs & rollout                 | Update README/PROJECT-KNOWLEDGE/api/permissions; feature-flag rollout dev→staging→prod.              |

---

## Milestone checklist

- [x] **M0** — Plan approved & tracker created _(this doc)_
- [x] **M1** — System user exists, cannot log in, seeded via script
- [x] **M2** — Finalising a public-league game auto-creates exactly one game-card (idempotent)
- [x] **M3** — Highlight clips auto-created for eligible events (capped, deduped)
- [x] **M3.5** — Auto posts reversed when a public league flips to private (B2)
- [x] **M4** — Backfill script written + auto-publish outcome logging in place
- [x] **M5** — Docs updated (README/PROJECT-KNOWLEDGE/permissions.md); live-Mongo smoke test passed (15/15 checks); **feature NOT yet enabled** in any environment (`AUTO_FEED_ENABLED` stays off pending the actual rollout step — see Deployment row)

---

## Task breakdown

Priority: **P0** = required for MVP · **P1** = needed before prod · **P2** = nice-to-have.
Status: `todo | in-progress | blocked | done`.

| ID   | Phase    | Task                                                                                                                                                  | Priority | Status | Notes                                                                                                                                                                                                                                                                                    |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0.1 | 0        | Write approved implementation plan                                                                                                                    | P0       | done   |                                                                                                                                                                                                                                                                                          |
| T0.2 | 0        | Create this tracker + dashboard                                                                                                                       | P0       | done   |                                                                                                                                                                                                                                                                                          |
| T1.1 | 1        | Add `authProvider:'system'` to User schema/enum                                                                                                       | P0       | done   | `auth.repository.js`                                                                                                                                                                                                                                                                     |
| T1.2 | 1        | Reject system-account login in `auth.service.js`                                                                                                      | P0       | done   | Explicit guard added; passwordless check already covered it too                                                                                                                                                                                                                          |
| T1.3 | 1        | `getSystemUserId()` helper (cached, idempotent lookup)                                                                                                | P0       | done   | `auth.service.js`, cached module-level after first lookup                                                                                                                                                                                                                                |
| T1.4 | 1        | `scripts/ensure-system-user.js` (idempotent, `--dry-run`)                                                                                             | P0       | done   |                                                                                                                                                                                                                                                                                          |
| T1.5 | 1        | Wire system user into `seed.js` / `seed-demo-account.js`                                                                                              | P1       | todo   | Deferred — script is standalone-runnable for now                                                                                                                                                                                                                                         |
| T1.6 | 1        | Tests: script idempotency + login rejection                                                                                                           | P0       | done   | `auth.service.test.js` (5 new/updated tests)                                                                                                                                                                                                                                             |
| T2.1 | 2        | Add `gameCard.auto` field + partial unique index                                                                                                      | P0       | done   | `feed.repository.js`                                                                                                                                                                                                                                                                     |
| T2.2 | 2        | `findAutoGameCardPost(gameId)` repository helper                                                                                                      | P0       | done   |                                                                                                                                                                                                                                                                                          |
| T2.3 | 2        | `autoCreateGameCardPost(systemUserId, game)`                                                                                                          | P0       | done   | Mirrors `createGameCardPostForUser`, skips billing gate                                                                                                                                                                                                                                  |
| T2.4 | 2        | `autoPublishForFinalizedGame(gameId)` + `isLeaguePublic` gate                                                                                         | P0       | done   | Single enforcement point, `feed.service.js`                                                                                                                                                                                                                                              |
| T2.5 | 2        | `scheduleAutoFeedForGame` trigger in `finishGameForUser`                                                                                              | P0       | done   | `setImmediate`, try/catch + Pino log, gated by `AUTO_FEED_ENABLED`                                                                                                                                                                                                                       |
| T2.6 | 2        | Tests: gate matrix + game-card idempotency                                                                                                            | P0       | done   | `feed.service.test.js` + `games.service.test.js`                                                                                                                                                                                                                                         |
| T3.1 | 3        | Highlight-eligible event filtering + `findSharedEventIds` dedup                                                                                       | P0       | done   | Filters events directly (`HIGHLIGHT_STAT_TYPES` + numeric `videoTimestamp`) rather than reusing `buildGameHighlights`, since that helper needs a `playersById` roster map not readily available at auto-publish time; `playerName` is optional on `highlightClip` so this is a non-issue |
| T3.2 | 3        | Per-game highlight cap + priority ordering + log on cap                                                                                               | P1       | done   | Cap = 5; priority FG3_MADE > FG2_MADE > AST > STL > BLK > FT_MADE > misses                                                                                                                                                                                                               |
| T3.3 | 3        | E11000 catch-and-skip on concurrent clip inserts                                                                                                      | P0       | done   | Uses existing unique `eventId` index                                                                                                                                                                                                                                                     |
| T3.4 | 3        | Tests: eligibility, cap, dedup, concurrency                                                                                                           | P0       | done   | `feed.service.test.js` (8 new tests)                                                                                                                                                                                                                                                     |
| T3.5 | 3.5 (B2) | `listLeagueGameIdsByLeagueId` lean id lookup                                                                                                          | P0       | done   | `games.repository.js`                                                                                                                                                                                                                                                                    |
| T3.6 | 3.5 (B2) | `deleteAutoPostsForGameIds(gameIds, systemUserId)` repository helper                                                                                  | P0       | done   | `feed.repository.js` — scopes highlight_clip deletion to the system user so manual shares survive                                                                                                                                                                                        |
| T3.7 | 3.5 (B2) | `reverseAutoPostsForLeague(leagueId)` service function                                                                                                | P0       | done   | `feed.service.js`                                                                                                                                                                                                                                                                        |
| T3.8 | 3.5 (B2) | Wire reversal into `updateLeagueForUser` on public→private flip                                                                                       | P0       | done   | `leagues.service.js`, lazy-required + best-effort (errors logged, don't block the update)                                                                                                                                                                                                |
| T3.9 | 3.5 (B2) | Tests: reversal fires only on public→private, not private→private/public→public/no-op updates, and a reversal failure doesn't break the league update | P0       | done   | `leagues.service.test.js` (5 tests) + `feed.service.test.js` (2 tests)                                                                                                                                                                                                                   |
| T4.1 | 4        | Structured logging + metrics (created/skipped/capped)                                                                                                 | P1       | done   | `autoPublishForFinalizedGame` logs a single Pino summary per game (gameCardPostId, highlightClipsCreated/Skipped/Capped); per-game cap already logged from Phase 3                                                                                                                       |
| T4.2 | 4        | `scripts/backfill-auto-feed.js` (idempotent, `--dry-run`)                                                                                             | P1       | done   | Iterates completed games in public/active leagues, calls `autoPublishForFinalizedGame` per game (same idempotent entry point the live trigger uses)                                                                                                                                      |
| T4.3 | 4        | Optional system-author badge in feed                                                                                                                  | P2       | todo   | Client, Vitest render test — deferred, not required for the feature to function                                                                                                                                                                                                          |
| T5.1 | 5        | `AUTO_FEED_ENABLED` env flag (Zod, default false)                                                                                                     | P0       | done   | `config/env.js`, defaults off                                                                                                                                                                                                                                                            |
| T5.2 | 5        | Update README / PROJECT-KNOWLEDGE / permissions.md                                                                                                    | P1       | done   | No `api.md` change — feature adds no new endpoints, it's purely internal to `finishGameForUser`                                                                                                                                                                                          |
| T5.3 | 5        | Rollout dev → staging → prod                                                                                                                          | P0       | todo   | Per CONTRIBUTING branch flow; live-Mongo smoke test passed (see Notes) — remaining work is enabling `AUTO_FEED_ENABLED` per environment, not more code                                                                                                                                   |

---

## Blockers

Open questions from the plan that should be resolved before/while implementing.
Each has an assumed default so work can proceed if unanswered.

| #   | Question                                                                              | Assumed default                                                                                                                                                                                                                                                                                                                    | Status                     |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| B1  | Finalise-only trigger for v1? (not on later public-flag flips / completed-game edits) | Yes — finalise only; backfill covers the rest                                                                                                                                                                                                                                                                                      | shipped as assumed         |
| B2  | Remove existing auto-posts when a league is set **private**?                          | **Yes, confirmed by user 2026-07-10.** Implemented: `reverseAutoPostsForLeague` deletes only system-authored auto posts (game-cards flagged `auto:true`, highlight_clips authored by the system user) for that league's games; manual shares are untouched. Fires best-effort from `updateLeagueForUser` on a public→private flip. | resolved & shipped         |
| B3  | Highlight cap value + priority ordering                                               | Shipped: 5 per game; FG3_MADE > FG2_MADE > AST > STL > BLK > FT_MADE > misses                                                                                                                                                                                                                                                      | resolved                   |
| B4  | Caption text for auto game-cards                                                      | Shipped: `null` (no caption) — client card renderer doesn't require one; a generated recap-style caption can be added later without a schema change                                                                                                                                                                                | resolved (simplified)      |
| B5  | System-user display identity (name + avatar)                                          | Shipped: name `"TSW"`, `email: system@tsw.internal`, no avatar set yet                                                                                                                                                                                                                                                             | resolved (avatar deferred) |

No open blockers remain. All of Phases 1–4 and Phase 5's docs are implemented
and verified against a live MongoDB instance (see Notes). Only actually
enabling `AUTO_FEED_ENABLED` in dev/staging/prod (T5.3) is outstanding.

---

## Notes

- **No background infrastructure** (queue/cron) is added — this is deliberate,
  matching `PROJECT-KNOWLEDGE.md` §11. All async work stays on post-response
  `setImmediate`, consistent with the existing `scheduleFeedCardRefreshForGame`.
- **TSW-004 regression guard:** auto game-cards must go through the existing
  `buildGameCardSnapshot` path so the `recap` field is populated — otherwise
  cards render `0-0`. Cover with a snapshot key-set test.
- **Billing bypass** for the system user is scoped to the auto path only; do not
  weaken `assertFeedPostingAllowed` on any user-facing route.
- **Highlights are not encoded video** — the "Media Generation" dashboard row is
  intentionally minimal (YouTube URL + timestamp windows only).
- **B2 reversal is scoped, not a blanket delete**: `deleteAutoPostsForGameIds`
  only removes `game_card` posts flagged `gameCard.auto: true` and
  `highlight_clip` posts authored by the system user — a real user's manual
  shares for the same games are never touched, even if the league that made
  them possible later goes private again in the future (re-publishing).
- **Live-Mongo smoke test completed (2026-07-10)**, against a local `mongod`
  (v8.0.20, separate from any dev/prod data): ran the real service functions
  (not mocks) through the full lifecycle — 15/15 checks passed:
  1. System user created via `getSystemUserId()`, `authProvider: 'system'`, and
     confirmed unable to log in.
  2. Finalising a real dual-team public-league game (via
     `gamesService.finishGameForUser`, exercising the actual post-response
     `setImmediate` trigger — not a direct service call) produced exactly one
     auto game-card (`gameCard.auto: true`, authored by the system user) and
     three eligible highlight clips (video-eligible events correctly
     filtered/created; the one event with no `videoTimestamp` was correctly
     excluded).
     2b. **Caught and fixed a test-harness bug, not a product bug**: the first
     smoke-test run under-waited for the `setImmediate` chain's real DB I/O
     latency and mis-asserted highlight-clip count against a wrong fixture
     expectation — both were smoke-test authoring mistakes, fixed by using a
     timer-based flush and correcting the expected count. Documented here
     since it's the kind of false-negative a live-DB test can produce if the
     async trigger isn't awaited for long enough.
  3. Re-running `autoPublishForFinalizedGame` directly on the same game
     (simulating a finalize retry) created **zero** additional posts —
     idempotency confirmed against real unique indexes, not mocked ones.
  4. Manually sharing a `game_card` for the same game, then flipping the
     league private, left exactly the manual post and removed the auto
     game-card + all 3 auto highlight clips — B2 reversal confirmed scoped
     correctly.
  5. Flipping the league back public and re-running auto-publish recreated
     the auto game-card — confirms the backfill/republish scenario (B1) works.
  6. A standalone game finalize and a private-league game finalize both
     produced **zero** auto posts even with `AUTO_FEED_ENABLED=true` — the
     gate holds under real DB conditions.
  7. `backfill-auto-feed.js --dry-run` correctly identified exactly the one
     completed public-league game (excluding the private-league and
     standalone games); running it for real afterward created **zero**
     additional posts (already-idempotent via the unique indexes) — confirmed
     safe to re-run against live data.

---

## Progress dashboard

> Update `Status`, `Progress`, `Owner`, and `Notes` as work proceeds.
> Statuses: `Not started | In progress | Blocked | Done`.

| Area                 | Status                     | Progress | Owner | Notes                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------- | -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Overall Progress** | In progress                | **~97%** | —     | Phases 1–4 implemented, unit-tested, and live-Mongo smoke-tested on `feature/auto-feed-generation`; only actually enabling the flag in an environment (T5.3) remains                                                                                               |
| Planning             | Done                       | 100%     | —     | Plan approved; all blockers (B1–B5) resolved, none open                                                                                                                                                                                                            |
| Backend              | Done                       | 100%     | —     | System user, `autoPublishForFinalizedGame` gate, game-card + highlight-clip auto-generation, B2 reversal on going-private, `setImmediate` trigger, backfill script — all behind `AUTO_FEED_ENABLED` (default off)                                                  |
| Feed Integration     | Done                       | 100%     | —     | No client changes needed; auto-posts are ordinary `game_card`/`highlight_clip` docs already rendered by `FeedList.jsx`                                                                                                                                             |
| Media Generation     | Not applicable (by design) | —        | —     | Minimal by design — YouTube URL + timestamp windows, **no encoding**                                                                                                                                                                                               |
| Permissions          | Done                       | 100%     | —     | Public-league gate (`isLeaguePublic`) enforced once in `autoPublishForFinalizedGame`; system-user login rejection in `auth.service.js`; B2 reversal scoped to system-authored content only                                                                         |
| Testing              | Done                       | 100%     | —     | 359/359 server unit tests pass (33 new across auth/feed/games/leagues service tests); `pnpm lint`/`check-env`/client build all pass; **15/15 live-Mongo smoke-test checks pass** (2026-07-10, real service functions against real `mongod`, not mocks) — see Notes |
| Documentation        | Done                       | 100%     | —     | Tracker current; README, PROJECT-KNOWLEDGE.md (§4, §11, §12), permissions.md all updated. No `api.md` change needed (no new endpoints)                                                                                                                             |
| Deployment           | Not started                | 0%       | —     | `AUTO_FEED_ENABLED` flag exists, defaults off; live smoke test passed (see Testing row) — the only remaining work is the actual dev → staging → prod rollout (T5.3), which is an operational/deploy step, not further code                                         |
