# Game Clock And Basketball Period Tracking Plan

Status: discovery and code verification complete. Two prerequisite refactors
must land before feature work begins. Most product decisions are complete; the
few remaining clock-transition questions are listed at the end. Implementation
not started.

This document plans a persistent game clock for basketball games, configurable
league defaults, per-game overrides, and period/time metadata on every tracked
stat event. Existing scoring, box-score, recap, lineup, replay, and
optimistic-concurrency behavior must continue to work.

Every file/line reference below was verified against the working tree on
2026-08-12 (branch `feat/shot-clock`). Line numbers drift as code changes —
treat them as "the code that does X", and re-grep if a reference does not match.

## How To Use This Document

Work top to bottom. The order is load-bearing:

1. **Prerequisites (P1, P2)** — two refactors that are correct on their own
   merits and currently block clean clock work. Land these first, each as its
   own commit with tests green. Do not begin Unit 1 until both are done.
2. **Units 1-11** — the feature itself, server before client, matching the
   delivery order in Clean Cutover And Delivery Order.
3. Each unit lists its **files**, the **exact known traps**, and its **done
   condition**. Tick the Implementation Tracker in the same commit as the unit.

Before starting any unit, re-read the "Verified Code Facts" section for that
area. Those facts are the ones that most commonly cause a mid-implementation
surprise.

## Goals

- Let a league owner choose the league's default basketball game format when
  configuring a new league in `AdminNewLeaguePage.jsx`.
- Let only the league owner change that default later in the Settings tab of
  `AdminLeaguePage.jsx`; the change affects future games only.
- Support regulation games played as either two halves or four quarters.
- Let an authorized user override the league default while creating an
  individual league game in `AdminNewLeagueGamePage.jsx`.
- Apply the league default to bulk-scheduled games without a schedule-wide
  override.
- Give standalone games an explicit basketball format rather than silently
  creating games with no clock configuration.
- Show a persistent, controllable countdown clock in `GameTrackPage.jsx`,
  including inside the fullscreen tracking overlay.
- Store the regulation/overtime segment and displayed time remaining on every
  newly tracked event, including shots, quick stats, opponent aggregate stats,
  substitutions, and chained follow-up events.
- Preserve enough domain structure to add other sports later without making
  basketball labels (`quarter` and `half`) the names of generic storage or API
  concepts.

## Non-goals For The First Delivery

- Possession arrow, shot clock, timeouts, fouls-to-give, or other scoreboard
  controls.
- Period-split box scores or public play-by-play grouping unless added as a
  separate future feature. This delivery shows period/time in the authenticated
  tracker event list and passes the structured data through the API, but does
  not add public grouping or filtering.
- Supporting a second sport in the UI. The storage model should be ready for a
  sport discriminator, but only basketball rules will be valid initially.
- Client-side version/If-Match concurrency. `sanitizeGame()` deliberately does
  not expose `__v`, so reload-on-409 is the only reconciliation strategy
  available and the only one this delivery implements.

---

# Prerequisites

These two refactors are **not** part of the clock feature. Each fixes a real
existing defect and each removes a class of hiccup from the feature work. Land
both, with tests, before Unit 1.

## P1 — Funnel every event append through one payload builder

### Why this is first

`buildEventPayload()` exists at
[GameTrackPage.jsx:671-677](../client/src/features/games/pages/GameTrackPage.jsx#L671-L677)
and is the natural place to attach a clock snapshot. But it is **bypassed by
the two highest-risk call sites**, and the follow-up prompt path only uses it on
one of two branches. If the clock snapshot is added to `buildEventPayload()`
as-is, opponent points and substitutions will silently ship untagged events —
exactly the "partially tagged events" failure this plan is meant to avoid.

This is also a live bug independent of the clock: **opponent points and
substitutions do not reliably receive `videoTimestamp` today**, so those events
cannot be located in replay. Routing through the builder is necessary but not
sufficient: the substitution flow must also capture the video time when the
first player is selected, rather than waiting for the final `Record Sub` tap.

### Verified current state

| Handler                              | Line(s)                          | Routes through `buildEventPayload`?                                                                                                   |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Shot (`addShotEvent`)                | payload ~928-945, submit 977-981 | Yes — but court fields are duplicated inline at 936-938 and 946-950 instead of using `buildCourtFields`                               |
| Free throw (`addFreeThrowEvent`)     | 1015-1022, submit 1041-1045      | Yes                                                                                                                                   |
| Rebound (`addReboundEvent`)          | 771-775                          | Yes                                                                                                                                   |
| Quick stat                           | 1088-1097, submit 1140-1145      | Yes                                                                                                                                   |
| Opponent points (`addOpponentScore`) | 1162-1182                        | **No** — raw `gamesApi.appendEvent(gameId, { statType, ...buildCourtFields(selectedShot) })`. No `videoTimestamp`, no `teamSide`.     |
| Substitution (`saveSubstitution`)    | 1298-1312                        | **No** — two sequential `appendEvent` calls with a hand-built `commonPayload = { teamSide, relatedTeamSide }`. No `videoTimestamp`.   |
| Follow-up prompts                    | ~870-900                         | **Mixed** — one branch calls `buildEventPayload` (~889), the other hand-builds by spreading `followUpCourt` + `playerSide` (~878-882) |

Insert-before is a mode flag, not a separate builder: `insertBeforeEventId`
state at line 324; each of shot/FT/rebound/quick-stat branches on
`const isInsert = Boolean(insertBeforeEventId)` (771, 946, 1024, 1088) and
selects `gamesApi.insertEventBefore(...)` vs `appendEvent(...)` (804-805,
979-980, 1043-1044, 1143-1144). **Follow-up prompts, opponent points, and
substitutions do not support insert-before at all.**

### Work

1. Make `buildEventPayload()` the single construction point for every appended
   event. Route `addOpponentScore` and `saveSubstitution` through it. Collapse
   the follow-up prompt's two branches to one that also uses it.
2. Replace the inline court-field duplication in `addShotEvent` with
   `buildCourtFields`.
3. Introduce one submit helper that encapsulates the
   `isInsert ? insertEventBefore : appendEvent` choice, so the branch exists
   once rather than four times.
4. Preserve today's per-handler differences deliberately, not accidentally:
   - Substitutions legitimately carry `relatedTeamSide`; keep it.
   - Substitutions are two events (SUB_OUT then SUB_IN) and must remain two
     calls sharing one payload base.
   - Opponent aggregate events have no `playerId`. Note that
     `appendEventForUser` **rejects opponent aggregate events on the dual-team
     path** ([games.service.js:1678](../server/src/modules/games/games.service.js#L1678)),
     so `teamSide` must not be blindly added for that stat family — verify
     against `appendOpponentEventSchema`
     ([games.validation.js:204](../server/src/modules/games/games.validation.js#L204))
     before changing what is sent.
5. Make the builder preserve an explicitly supplied `teamSide` (for a linked
   event attributed to the other team) and use `activeSide` only as a fallback.
   The current `{ ...payload, teamSide: activeSide }` ordering would otherwise
   misattribute dual-team follow-ups after this refactor.
6. Add a video-only entry snapshot for non-court multi-tap flows. For a
   substitution, capture `videoCurrentTimeRef.current` when the first outgoing
   or incoming player is selected, share it across SUB_OUT/SUB_IN, and clear it
   when the flow is completed or abandoned. Unit 11 extends this same snapshot
   to official game time.

### Trap

`buildEventPayload` currently adds `teamSide: activeSide` for all dual-team
events. Adding it to opponent aggregate events will trip the server's own
rejection at games.service.js:1678. Gate that addition by stat family.

### Done condition

- Every `gamesApi.appendEvent` / `insertEventBefore` call in
  `GameTrackPage.jsx` receives its payload from `buildEventPayload`.
- New client tests assert `videoTimestamp` is present on opponent-point and
  substitution payloads, and that both substitution events share the timestamp
  captured on the first selection (regression coverage for the bug being
  fixed).
- The existing 1,427-line `GameTrackPage` test file passes unchanged except for
  assertions intentionally updated by the two payload fixes.
- `pnpm --filter client test` green.

## P2 — Extract the score header and render it in fullscreen

### Why this is first

The original plan asserted the clock "belongs in this persistent header so it
remains visible across Court, Subs, Events, More, video, mobile entry, and
fullscreen modes." **That is not true of the current markup.** There is no
header component, there are two divergent inline variants, and the header is
not rendered inside the fullscreen tracking overlay at all. Adding clock markup
to both inline variants and then again to the overlay would triple the
surface area.

### Verified current state

- No extracted component. The score header is inline JSX in two variants:
  - Dual-team: [GameTrackPage.jsx:1841-1911](../client/src/features/games/pages/GameTrackPage.jsx#L1841-L1911)
    — two tappable team buttons (`changeActiveSide`), `gameSummary.homePoints` /
    `awayPoints`, logos, active side highlighted indigo.
  - One-sided: [GameTrackPage.jsx:1912-1975](../client/src/features/games/pages/GameTrackPage.jsx#L1912-L1975)
    — `gameSummary.teamPoints` vs `gameSummary.opponentPoints`, plus a
    REB/AST/FG2%/FG3% strip.
- `gameSummary` fallback computed at lines 1367-1370.
- Not `sticky` — the whole page is `fixed inset-0 flex flex-col` (line 1831),
  so the header is pinned by layout, not by positioning.
- Fullscreen is the **tracking overlay**, not a header mode:
  `isTrackingFullscreen` state (line 316),
  `openTrackingOverlay`/`closeTrackingOverlay` (708-727), body scroll lock
  (487-495), overlay render at line 3147. **The score header is not rendered
  inside the overlay.**
- A separate, unrelated `GameDetailHeader.jsx` exists in
  `client/src/features/games/components/` — it serves the detail page, not the
  tracker. Do not reuse or rename it.

### Work

1. Extract `GameTrackScoreHeader` into
   `client/src/features/games/components/GameTrackScoreHeader.jsx`, taking both
   layouts behind a `trackingMode` prop (or two named sub-components inside one
   file). Behavior must be byte-for-byte identical to today, including the
   active-side tap targets and the one-sided stat strip.
2. Render it in the fullscreen tracking overlay (line ~3147) in addition to the
   main layout, so a single later change adds the clock to both.
3. Keep props narrow and stable: `game`, `gameSummary`, `activeSide`,
   `onChangeActiveSide`, `isDualTeam`. Do not pass the whole page's state bag —
   the clock will add exactly one more prop group in Unit 9.

### Trap

The dual-team variant's team buttons call `changeActiveSide`, which drives the
lineup-setup auto-switch effect at lines 579-589. Extraction must not change
when that effect fires. Snapshot-test both variants before and after.

### Done condition

- Header markup exists in exactly one file and is rendered in both the main
  layout and the fullscreen overlay.
- Existing tracker snapshots updated only where the extraction changed DOM
  nesting, with the diff reviewed as intentional.
- A new test asserts the score header is present while
  `isTrackingFullscreen` is true.
- `pnpm --filter client test` green.

---

# Verified Code Facts

Read the subsection for the area you are about to touch. These are the specific
things that break implementations.

## Game document and events

- `Game` schema:
  [games.repository.js:136-265](../server/src/modules/games/games.repository.js#L136-L265).
  `optimisticConcurrency: true` at line 263 — `save()` performs a `__v` check
  and throws Mongoose `VersionError`.
- Embedded event subschema `shotEventSchema`:
  [games.repository.js:40-104](../server/src/modules/games/games.repository.js#L40-L104).
  Fields: `playerId`, `statType` (enum of 19 STAT_TYPES incl. SUB_IN/SUB_OUT),
  `zoneId` (enum of 10), `x`/`y` (0-100), `relatedPlayerId`, `teamSide`,
  `relatedTeamSide`, `videoTimestamp` (min 0), `occurredAt` (Date, default now).
  Options `{ _id: true }` at line 103.
- **STRICT MODE TRAP.** The subschema is not `strict: false`, so unknown fields
  are **silently dropped**. There is already an `OPT-022` comment at
  [games.repository.js:13-19](../server/src/modules/games/games.repository.js#L13-L19)
  documenting exactly this failure for `participant.slug`. Adding fields to Zod
  validation alone does nothing.
- **HAND-ENUMERATED FIELD LISTS TRAP.** `appendEventForUser` does not spread the
  payload; it constructs the event object explicitly at
  [games.service.js:1743-1750](../server/src/modules/games/games.service.js#L1743-L1750)
  (dual-team) and again at
  [1826-1836](../server/src/modules/games/games.service.js#L1826-L1836)
  (one-sided). `updateEventForUser`
  ([1924-1957](../server/src/modules/games/games.service.js#L1924-L1957))
  patches a fixed list of keys guarded by `!== undefined`. **Three separate
  literal field lists** must gain the new keys, plus the schema, plus
  `sanitizeEvent`. Five places total.
- Events are an unbounded embedded array:
  `events: { type: [shotEventSchema], default: [] }` at
  [games.repository.js:221](../server/src/modules/games/games.repository.js#L221).
  No cap, no bounds check, no index on `events.*` (indexes deliberately dropped,
  lines 86-89). Every clock command rewrites the whole document, so keep the
  16MB ceiling in mind; three small fields per event is not a problem at
  realistic event counts, but a per-tick write would be.
- Materialized/derived fields on `Game`: `finalScore` (227-236), `eventCount`
  (237), `boxScore` (Mixed, 247), `gameSummary` (Mixed, 248), `aiSummary` (249).
  There is **no** `statSummary` field on `Game` — `statSummary` is a shared pure
  module at `server/src/modules/shared/statSummary.js`.
- Status enum: `'scheduled' | 'in_progress' | 'completed'`
  ([games.repository.js:202](../server/src/modules/games/games.repository.js#L202),
  default `in_progress`).

## Response boundaries

- `sanitizeEvent`
  ([games.service.js:40-54](../server/src/modules/games/games.service.js#L40-L54))
  returns `id, playerId, relatedPlayerId, teamSide, relatedTeamSide, statType,
zoneId, x, y, videoTimestamp, occurredAt`.
- `sanitizeGame`
  ([games.service.js:291-339](../server/src/modules/games/games.service.js#L291-L339))
  deliberately omits `__v`, `finalScore`, `eventCount`, `boxScore`, and
  `gameSummary`. **Do not add `__v`.** This is why reload-on-409 is the only
  reconciliation strategy.
- `updateEventForUser` returns `buildSlimGameEventDelta`
  ([games.service.js:1449](../server/src/modules/games/games.service.js#L1449)),
  not the full game. `appendEventForUser` returns full `getGameForUser`.

## Concurrency

- `saveGameEventMutation`
  ([games.service.js:280-289](../server/src/modules/games/games.service.js#L280-L289))
  wraps `saveGame` and maps `error.name === 'VersionError'` to
  `ApiError(409, 'This game was updated by someone else. Reload and try again.')`.
  Used by `appendEventForUser` (1845), `removeEventForUser` (1907),
  `updateEventForUser` (1942).
- **`finishGameForUser` does NOT use it.**
  [games.service.js:2025](../server/src/modules/games/games.service.js#L2025)
  calls plain `saveGame`, so a version conflict there surfaces as a raw 500.
  Unit 5 adds a clock write to this path and must fix this.

## Validation shapes

- `createGameSchema`
  ([games.validation.js:86-91](../server/src/modules/games/games.validation.js#L86-L91))
  is a plain `z.union` of four object schemas — `standaloneGameSchema` (37),
  `standaloneDualGameSchema` (45), `leagueGameSchema` (61),
  `leagueDualGameSchema` (73). **Not** a `discriminatedUnion`. None are
  `.strict()`, so extra body keys pass and are silently not forwarded.
- `appendEventSchema`
  ([games.validation.js:211-216](../server/src/modules/games/games.validation.js#L211-L216))
  is a `z.union` of `appendTrackedShotEventSchema` (179),
  `appendNonShotEventSchema` (192), `appendSubstitutionEventSchema` (197),
  `appendOpponentEventSchema` (204).
- `updateEventSchema` (223-231): all-optional `playerId, teamSide, statType,
zoneId, x, y, videoTimestamp` (nullable), with no non-empty refine.
- **UNION ERROR TRAP.** Adding a nested `gameFormat` object independently to
  four `z.union` members means one typo inside it produces an unreadable
  four-branch union error instead of a field error. The safer composition is a
  reusable outer envelope intersected with the existing variant union;
  see Unit 2. The same applies to the event snapshot across four append
  members.

## Leagues

- `League` schema:
  [leagues.repository.js:16-68](../server/src/modules/leagues/leagues.repository.js#L16-L68).
  `timestamps: true`, **no** `optimisticConcurrency`.
- `createLeagueSchema`
  ([leagues.validation.js:6-11](../server/src/modules/leagues/leagues.validation.js#L6-L11)):
  `name` required; `slug`/`description`/`seasonLabel` optional. Note it does not
  declare `isPublic` even though the service reads `payload.isPublic`.
- `updateLeagueSchema` (13-23): optional `name, slug, description, seasonLabel,
isPublic` plus a non-empty refine.
- **STRIPE STUB TRAP.** `createLeagueForUser`
  ([leagues.service.js:541-583](../server/src/modules/leagues/leagues.service.js#L541-L583))
  does **not** create a League. It finds the most recent `League` named
  `'My League'` for the owner — created earlier by the Stripe checkout webhook —
  402s if absent, then mutates `name/slug/description/seasonLabel/status/isPublic`
  and saves the stub. **A league therefore exists with no `defaultGameFormat`
  in the current code between checkout and form submit.** Configuring this stub
  is the normal creation path, not an edge case; the new League schema default
  must make the stub clock-aware as soon as the webhook creates it.
- Permission helpers in `leagues.service.js`: `assertLeagueOwner` (331) —
  **404s on non-owner, does not 403**; `assertLeagueManagerOrOwner` (339);
  `ensureLeagueEditable` (353); `ensureSeasonEditable` (363);
  `canManageLeagueGame` (2596) — owner, league manager, **or manager of either
  team**; `canFinalizeLeagueGame` (2615) — owner or league manager only;
  `canEditCompletedLeagueGame` (2625).
- `bulkCreateLeagueGamesForUser`
  ([leagues.service.js:2395-2460](../server/src/modules/leagues/leagues.service.js#L2395-L2460)):
  asserts manager-or-owner, requires `league.currentSeasonId`, maps rows to
  `gameContext: 'league'`, `trackingMode: 'one_sided'`,
  `trackedLeagueTeamId = homeTeam._id`, `status: 'scheduled'`; optional
  `deleteReplaceableLeagueGames`; then `insertManyGames`.

## Routes

`games.routes.js` is 37 lines. Public `GET /:gameId` with
`optionalAuthMiddleware` + `publicCacheMiddleware` comes **first** (13-18), then
`gamesRouter.use(authMiddleware)` (19) gates everything below: `POST /` (20),
`GET /` (21), `PATCH /:gameId` (22), `POST /:gameId/lineup` (23),
`POST /:gameId/roster` (24), `POST /:gameId/events` (25),
`POST /:gameId/events/:eventId/insert-before` (26-29),
`PATCH /:gameId/events/:eventId` (30), `DELETE /:gameId/events/:eventId` (31),
`POST /:gameId/finish` (32), `DELETE /:gameId` (33).

New clock routes must be registered **after** line 19 so they are authenticated.

## Scheduled-game ordering inversion

This is the single largest hidden scope item in the original plan.

- The tracker route has no status guard:
  [AppRouter.jsx:372](../client/src/app/router/AppRouter.jsx#L372).
- `canTrackGame`
  ([AdminLeaguePage.jsx:179-190](../client/src/features/leagues/pages/AdminLeaguePage.jsx#L179-L190))
  checks **role only**, not `game.status`. `GamesListPage.jsx:150` renders a
  Track link for every game.
- `setGameLineup`
  ([games.service.js:1862-1870](../server/src/modules/games/games.service.js#L1862-L1870))
  throws **400 "Cannot change lineup on a game that has not started"** when
  `status !== 'in_progress'`.
- The event path has the same guard at
  [games.service.js:995](../server/src/modules/games/games.service.js#L995).
- Roster **is** editable while scheduled:
  `ROSTER_EDITABLE_STATUSES = new Set(['in_progress', 'scheduled'])` at
  [games.service.js:807](../server/src/modules/games/games.service.js#L807).

**The inversion:** this plan requires a starting lineup _before_ the clock may
start (product decision 5), but the server requires `in_progress` _before_ a
lineup may be set. A bulk-scheduled game today therefore renders the lineup
screen and Save Lineup always fails. Unit 5 resolves this explicitly — see
"Resolving the scheduled-game inversion".

## Tracker fetching and video

- `GameTrackPage.jsx` is **3,206 lines**; its test file is 1,427 lines.
- **No TanStack Query.** `loadGame` (line 415) calls `gamesApi.getById`, plus a
  conditional `teamsApi.getById` roster fallback (431-441), invoked by a
  `useEffect` at 483-485. State lives in local `useState` `data`; every mutation
  response goes through `updateData(response, label)` (called at 812, 903, 986,
  1150, 1174, 1265, 1318).
- **VIDEO CAPTURE TRAP.** `videoCurrentTimeRef` (344) is fed by a `postMessage`
  listener (350-373) that only trusts
  `event.source === videoIframeRef.current.contentWindow` and reads YouTube
  `infoDelivery` → `info.currentTime`. It is snapshotted into
  `currentVideoTimestamp` state **only inside `onCourtSelect`** (705-709). So
  non-court flows — quick stats, opponent points, substitutions — have no video
  timestamp at all today. The "capture both snapshots at the first stat-entry
  tap" model requires a new capture point for non-court entry, which is a
  behavior change to video timestamps as well as a clock addition. Budget for
  it and test it.
- `pauseVideoOnEntry`: state at 339-341, backed by localStorage key
  `'gameTrack.pauseVideoOnEntry'` (default `true`); toggle
  `togglePauseVideoOnEntry` at 397-407 (turning it off calls `playVideo()`);
  `pauseVideo`/`playVideo` postMessage helpers at 410-422. Consumers:
  `onCourtSelect` (699-701), `clearEventPicker` resume (763-765), UI handler at
  2117-2118, toggle UI at 2718-2726.
- Undo: `undoLastEvent()` (1218-1230) takes the last event from
  `data.game.events` and calls `removeEvent(lastEvent.id)` — a server delete, no
  local optimism. Button at line 2522.
- Optimistic UI is transition-only (pickers close before the request resolves,
  chained through `inflightRef` at 343) and rolls back only via `.catch` →
  `setError` + `clearEventPicker()`.
- Starting lineup: `LineupPicker` component at line 101 (allows 1–5 active,
  unique players). `homeLineupReady`/`awayLineupReady`, `lineupSetupStep`
  (569-576), auto-switch effect (579-589), full-screen gate render (1989-2012),
  second inline picker for one-sided games (2317-2335). Every entry path calls
  `requireLineup()` (635-652) from `onCourtSelect` (689),
  `openTrackingOverlay` (710), `requirePlayerSelection` (659),
  `saveSubstitution` (1285).

## Client API modules and navigation

- `gamesApi.js` (49 lines): `create`, `update`, `list`, `getById`,
  `appendEvent`, `insertEventBefore`, `setLineup`, `addRosterPlayer`,
  `updateEvent`, `removeEvent`, `finish`, `deleteGame`. A clock function must be
  added here.
- `leaguesApi.js` has `update` (PATCH `/leagues/:id`) already.
- `AdminLeaguePage.jsx` (1,461 lines) has a **Settings tab** (`TABS` at line 26,
  settings entry 92-94, tab buttons 780-800) and already calls
  `leaguesApi.update` one field at a time — `{ isPublic }` at line 424,
  `{ name }` at line 487. There is no settings form submit; follow the existing
  inline-save idiom.
- `AdminNewLeagueGamePage.jsx` (571 lines) **does** load the full league:
  `Promise.all([leaguesApi.getById(leagueId), leaguesApi.listTeams(leagueId)])`
  at 252-253. No extra request needed for the default.
- `AdminNewLeaguePage.jsx` (141 lines): `leaguesApi.create({ name, seasonLabel,
description })` at line 23; 402 redirects to `/pricing` (36).
- `NewGamePage.jsx` (289 lines): `gamesApi.create(payload)` at line 90.
- `AdminLeagueSchedulePage.jsx` (591 lines): `leaguesApi.bulkCreateGames` at
  line 242.
- **NAVIGATION BLOCKING TRAP.** There is **no `useBlocker` anywhere in
  `client/src`**. The only existing guard is a `beforeunload` listener at
  [AdminLeagueSchedulePage.jsx:127-128](../client/src/features/leagues/pages/AdminLeagueSchedulePage.jsx#L127-L128).
  Installed `react-router-dom` resolves to 6.30.3 and exports `useBlocker`, but
  [AppProviders.jsx](../client/src/app/providers/AppProviders.jsx) mounts a
  declarative `BrowserRouter`. `useBlocker` calls the data-router context and
  will throw under this provider. Product decision 14 therefore requires a
  scoped migration to `createBrowserRouter` + `RouterProvider`; a
  `beforeunload`-only fallback does not satisfy the approved in-app UX. Unit 10
  owns that migration and its route/auth/analytics regression tests.

---

# Approved Product Model

The exact code names below may be adjusted during implementation, but the
separation of immutable game rules, mutable clock state, and immutable event
snapshots is approved.

## League default

Add a basketball-specific value under a sport-neutral container on `League`:

```js
sport: 'basketball'
defaultGameFormat: {
  regulationSegmentType: 'quarter', // 'quarter' | 'half'
  regulationSegmentDurationSeconds: 600,
  overtimeDurationSeconds: 300,
}
```

New leagues default to four 10-minute quarters and 5-minute overtime. The
league creation form and owner-only league Settings section allow whole-minute
values per quarter/half and per overtime. Selecting halves changes the
regulation count to two; selecting quarters changes it to four.

**`regulationSegmentCount` is neither accepted nor persisted.** It is fully
derived from `regulationSegmentType` (`quarter` → 4, `half` → 2) by shared pure
utilities. Storing a derivable field creates the exact type/count mismatch that
then needs its own validation branch and tests.

Durations are integer seconds. Setup forms accept whole minutes from 1 through
60 inclusive for both regulation segments and overtime, then convert to
seconds at the API boundary. League responses include `sport` and
`defaultGameFormat`.

Because of the Stripe stub trap, set the `defaultGameFormat` **default at the
Mongoose schema level** so the webhook-created stub already has it. The schema
default supports the application's current checkout-to-configuration workflow.

## Per-game rules snapshot

Copy the resolved rules onto every new `Game`:

```js
sport: 'basketball'
gameFormat: {
  regulationSegmentType: 'quarter',
  regulationSegmentDurationSeconds: 600,
  overtimeDurationSeconds: 300,
}
```

This is a snapshot, not a live reference to the league. Changing a league
default later must affect only games created afterward. `gameFormat` is a
create-only field and is not added to `PATCH /games/:gameId`, so it is immutable
for the entire life of a game rather than becoming conditionally editable.

## Mutable clock state

Persist an anchored clock rather than saving once per second:

```js
clock: {
  status: 'ready', // 'ready' | 'running' | 'paused' | 'segment_complete'
  segmentKind: 'regulation', // 'regulation' | 'overtime'
  segmentNumber: 1,          // 1-based within its kind
  remainingMilliseconds: 600000,
  runningSince: null,
}
```

When running, effective time remaining is:

```text
max(0, remainingMilliseconds - (now - runningSince))
```

The server normalizes this value before every clock command and event write.
Every initial tracker response and every tracker mutation response also carries
a top-level `serverTime` value. At receipt, the client records that value with
`performance.now()` and estimates current server time from monotonic elapsed
time; it must not assume the device's wall clock matches the server. The display
is derived from that estimate instead of decrementing local state, so tab
throttling and a user changing the device clock do not introduce drift. Clock
persistence happens only on commands and other game mutations, never every tick
— the whole `Game` document (including the unbounded events array) is rewritten
on each save.

If a read observes an anchored running clock whose effective remaining time is
zero, the response presents a normalized `segment_complete`/zero clock without
turning the GET into a database write. The next authenticated clock or event
mutation persists that normalization through the normal optimistic-concurrency
path.

## Event snapshot

Add required fields to the embedded event schema:

```js
segmentKind: 'regulation',
segmentNumber: 1,
clockMillisecondsRemaining: 427000,
```

Labels are derived from the game's format:

- quarter + regulation 1 => `Q1`
- half + regulation 2 => `H2`
- overtime 1 => `OT1`

Do not store display strings such as `Q1` on every event. The structured fields
remain useful for future sports and localization.

## Clock And Event Behavior

1. A newly created game starts at segment 1 with a full clock in `ready` state.
2. A non-empty starting lineup is required for each tracked team before the
   game clock may start. Lineups may contain 1–5 active, unique players. When
   either lineup has fewer than five, `Start game` opens the reusable warning
   modal so the tracker can continue as-is or return to add more players.
3. The tracker shows the current segment, `MM:SS`, tenths below one minute,
   and Start/Pause controls after the initial game start.
4. Start and pause are server commands. The response supplies the **full
   sanitized game**, the existing dual-team `lineups` block, and server time;
   the client immediately reconciles to it. This is required because
   `updateData()` shallow-merges the top-level response, replaces
   `response.game` wholesale, and reads `response.lineups` to preserve selected
   players in dual-team mode. Returning only `{ game: { clock } }` would erase
   the rest of the game, while omitting `lineups` would reset tracker selection
   state.
5. Reaching `00:00` changes the displayed state to segment complete. Moving to
   the next regulation segment is an explicit scorer action, guarded against
   accidental taps.
6. After the last regulation segment, an authorized scorer may finish the game
   early or manually start overtime. Overtimes use the configured duration,
   may repeat without a fixed limit, and are labeled `OT1`, `OT2`, and so on.
7. A normal stat action captures the displayed segment/time at the first user
   action. Follow-up events reuse that snapshot.
8. The server validates the snapshot against the game's format and persists it
   with the event. Every append request supplies all three fields; omitted or
   partial tuples are rejected. Regulation segment numbers must be within the
   derived regulation count, overtime numbers are 1-based, and remaining time
   must be within that segment's configured duration.
9. Insert-before defaults to the target event's segment/time, not the live
   clock. The event editor exposes segment/time fields so an authorized user can
   correct imported, inserted, or mis-timed events.
10. Deleting or editing an event does not rewind the live clock.
11. Finishing is allowed before the final period reaches zero, with a warning.
    Finishing stops and normalizes the clock before the game is frozen.
12. Paused clock state is durable, so a user can intentionally pause tracking,
    leave, and resume the same segment/time on another day. Navigating away
    while running prompts with `Pause and exit` or `Keep tracking`. A normal
    refresh does not pause the authoritative clock.
13. For a bulk-created `scheduled` game, preparation must make its roster
    snapshot and lineup editable before clock start. The first `Start game`
    command transitions it to `in_progress`. See "Resolving the scheduled-game
    inversion" in Unit 5 — this requires a server change, not just a new route.
14. If the browser, tab, or device closes unexpectedly while running, reopening
    shows a recovery prompt with the elapsed clock value. The user must either
    accept it or correct the time before tracking continues. The client cannot
    reliably distinguish a crash from every kind of close, so use this
    deterministic rule: loading a running game prompts unless a per-game
    `sessionStorage` marker and the Navigation Timing API identify the load as
    a same-tab reload. That suppresses the prompt for an ordinary refresh while
    still prompting a different tab/device. Accepting only dismisses the gate;
    correcting issues `set_time`. No event may be submitted while the gate is
    open.
15. At a period transition, the current five carries into the next half,
    quarter, or overtime. The tracker does not force another lineup step; users
    may use the existing substitution controls when they want to change players.

## Official game time versus video time

These are separate clocks with different meanings and must never overwrite or
be derived from one another:

- `videoTimestamp` is elapsed time within the linked YouTube video. It locates
  the clip for replay/highlights and counts upward from the start of the video.
- `clockMillisecondsRemaining` is official basketball time remaining in the
  current half, quarter, or overtime. It counts downward and can stop while the
  video continues through dead balls.

An event may store both values. The first stat-entry tap captures both snapshots
at that moment, and chained events reuse both. When the existing
pause-video-on-entry preference is enabled, opening stat entry also temporarily
pauses the game clock if it was running. Completing the entry resumes both; it
must not start a clock that was already paused. Manual video pauses remain
independent because official basketball time can stop while video continues
through dead balls.

Represent the temporary behavior as one entry-session object containing both
snapshots and `clockWasRunning`. Create it once on the first tap; do not infer
resume behavior from whatever the live clock happens to say later. Completing
**or cancelling** the flow resumes the clock only when `clockWasRunning` is
true. Queue the pause, event append(s), and conditional resume through the
existing mutation chain so a pause failure cannot be followed by a misleading
resume. If the append fails, keep the clock paused and show an explicit retry or
resume choice rather than silently losing more game time.

Remember that video timestamps are currently captured only on court tap
(see Verified Code Facts → Tracker fetching and video). Extending capture to
non-court entry changes video-timestamp behavior too.

---

# Implementation Units

## Unit 1 — Domain constants and pure utilities

**Files:** new shared module(s) on the server for format constants/bounds and
clock normalization; new client utility module for form conversion, segment
labels, effective remaining time, and display formatting.

**Work:** basketball format constants, the explicit 1-60-minute duration
bounds, `quarter`→4 / `half`→2 derivation,
`effectiveRemainingMilliseconds(clock, now)`, segment label derivation
(`Q1`/`H2`/`OT1`), `MM:SS` formatting at 60 seconds and above,
`SS.t`/`0.0` below 60 seconds, whole-minute↔seconds form conversion, and the
client's server-time/monotonic-time synchronization helper.

**Traps:** `now` must be injectable for tests. Keep these modules free of
Mongoose and React imports so both sides can unit-test them in isolation from
the 3,206-line tracker.

**Done:** unit tests cover both format types, both bound edges, clamp-at-zero,
running vs paused normalization, and every label case.

## Unit 2 — Validation composition refactor (blocking for Units 3 and 6)

**Files:** `games.validation.js`, `leagues.validation.js`.

**Work:** factor `gameFormat` into one reusable schema and compose it as an
outer object envelope intersected with the existing create-game variant union.
Factor the required event snapshot tuple the same way around the existing
append variant union. Require explicit `gameContext` and `trackingMode` on every
create-game request and update all first-party callers in the same cutover.

Do **not** attempt `z.discriminatedUnion` on both `gameContext` and
`trackingMode`: Zod 3 accepts one discriminator key, and neither field uniquely
identifies all four current variants. The clock command schema in Unit 5 may
use `z.discriminatedUnion('action', ...)` because that is a genuine single-key
discriminator.

**Why before the feature units:** adding a nested object to a four-member plain
`z.union` yields an unreadable four-branch error on any typo, which will cost
more debugging time than this refactor costs to write.

**Traps:** no union member is currently `.strict()`, so extra keys pass silently
today. The envelope/intersection must retain the parsed `gameFormat`/snapshot
fields rather than letting the inner object schemas strip them. Existing error
shapes may change and their test diffs must be reviewed as intentional.

**Done:** existing games/leagues validation tests pass with reviewed error-shape
updates; new tests assert malformed `gameFormat` and omitted/partial event
tuples produce field-level errors rather than four-branch union errors; create
requests with omitted discriminators are rejected.

## Unit 3 — League backend

**Files:** `leagues.repository.js`, `leagues.validation.js`,
`leagues.service.js`.

**Work:** add `sport` and `defaultGameFormat` to the League schema **with
schema-level defaults**; extend `createLeagueSchema` and `updateLeagueSchema`;
persist in `createLeagueForUser`; sanitize into league responses.

**Traps:**

- The Stripe stub trap. `createLeagueForUser` mutates a pre-existing
  `'My League'` document; schema-level defaults are what make that stub valid.
- `assertLeagueOwner` **404s**. For owner-only `defaultGameFormat` edits, add a
  targeted **403** rather than routing through that helper, because league
  managers legitimately update other fields on the same endpoint.
- `updateLeagueSchema` has a non-empty refine — confirm a
  `defaultGameFormat`-only body satisfies it.
- Do not accept `regulationSegmentCount` in either schema.

**Done:** schema-introspection test for the new fields and their defaults; Zod
tests for both format types, duration bounds, and rejected
`regulationSegmentCount`; authorization test proving a league manager gets 403
on `defaultGameFormat` while still succeeding on `name`.

## Unit 4 — Game backend format snapshot

**Files:** `games.repository.js`, `games.validation.js`, `games.service.js`,
`leagues.service.js` (bulk path).

**Work:** add `sport`, `gameFormat`, and `clock` to the Game schema; resolve the
format server-side on create (league default → per-game override → standalone
default); apply the resolved default in `bulkCreateLeagueGamesForUser`; expose
all three in `sanitizeGame`; keep `gameFormat` create-only by omitting it from
the update-game schema and service. Make all three Game fields required without
a generic repository default; each creation service must supply the resolved
values so a missing creation path fails loudly instead of silently receiving
the wrong league rules.

**Traps:**

- Never trust a client-supplied league default; resolve from the League
  document.
- `bulkCreateLeagueGamesForUser` builds documents inline (2395-2460) and calls
  `insertManyGames` — the resolved format must be injected in that mapping, and
  `insertMany` bypasses some middleware, so verify defaults actually land.
- `sanitizeGame` omits derived fields by design; add only `sport`, `gameFormat`,
  and `clock`. **Do not add `__v`.**

**Done:** schema-introspection tests; service tests for league-default
inheritance vs per-game override across single and bulk paths; create-only
immutability test; repository/service tests reject format-less games rather
than maintaining a legacy execution path.

## Unit 5 — Clock backend

**Files:** `games.routes.js`, `games.controller.js`, `games.validation.js`,
`games.service.js`.

**Work:** `PATCH /games/:gameId/clock` registered **after** the
`gamesRouter.use(authMiddleware)` line, with a discriminated command schema:

```js
{ action: 'start' }
{ action: 'pause' }
{ action: 'set_time', remainingMilliseconds: 312000 }
{ action: 'next_segment' }
{ action: 'start_overtime' }
```

The service reuses game access rules, rejects completed games, normalizes a
running clock before applying a command, routes saves through
`saveGameEventMutation` for consistent 409s, and returns the full sanitized
game, current dual-team `lineups`, and top-level `serverTime` without rebuilding
recap data. A partial `game` object is unsafe because the tracker's
`updateData()` replaces that nested object rather than deep-merging it; omitting
dual-team `lineups` is also unsafe because `updateData()` consumes them.

**Also in this unit — fix `finishGameForUser`.** It calls plain `saveGame` at
[games.service.js:2025](../server/src/modules/games/games.service.js#L2025) and
currently surfaces a raw `VersionError` as a 500. Adding a clock write to that
path makes the gap worse; route it through `saveGameEventMutation`.

**Authorization:** all five commands, including `set_time`, use the existing
game-tracking permission. This follows confirmed product decision 18: anyone
currently authorized to track may operate/correct the clock and edit an
event's period/time. Do not substitute `canFinalizeLeagueGame`; that would
contradict the approved answer for team managers.

### Resolving the scheduled-game inversion

Product decision 5 requires a lineup before clock start; `setGameLineup`
requires `in_progress` before a lineup. Resolve this by relaxing
`setGameLineup` to accept `scheduled` as well as `in_progress`, mirroring
`ROSTER_EDITABLE_STATUSES` which already permits `scheduled`
(games.service.js:807). `Start game` then remains one command that validates the
required lineup(s), transitions `scheduled` → `in_progress`, and starts the
clock. This also fixes the existing dead end where a bulk-scheduled game shows
a lineup screen whose Save always 400s. Keep the event-path status guard at
games.service.js:995 intact — events still require `in_progress`.

**Traps:** the public `GET /:gameId` route is registered before the auth
middleware; keep the clock route below line 19. Every clock command rewrites the
entire Game document including the events array.

**Done:** clock tests with an injected fake `now` covering start, pause, resume,
elapsed normalization, clamp at zero, `set_time`, `next_segment`, regulation
completion, overtime, scheduled→in_progress transition, finish, completed-game
rejection, and 409 behavior. Authorization tests for all five actions, including
a team manager allowed to use both `set_time` and `pause`. A test proving
`finishGameForUser` now returns 409, not 500, on a version conflict.

## Unit 6 — Event backend

**Files:** `games.repository.js`, `games.validation.js`, `games.service.js`.

**Work:** add the three required snapshot fields to `shotEventSchema`; require
them in append validation; stamp them in **all** append paths; include them in
`sanitizeEvent`; add correction support to `updateEventForUser`. Append always
requires the full tuple. Update validation allows an event edit unrelated to
time, but if any snapshot field is present, all three are required and replaced
together.

**Traps — this unit has the most. Five places, not one:**

1. `shotEventSchema` ([games.repository.js:40-104](../server/src/modules/games/games.repository.js#L40-L104))
   — strict mode means an unlisted field is silently dropped (see `OPT-022`).
2. `appendEventForUser` dual-team literal
   ([games.service.js:1743-1750](../server/src/modules/games/games.service.js#L1743-L1750))
   — hand-enumerated, does not spread.
3. `appendEventForUser` one-sided literal
   ([games.service.js:1826-1836](../server/src/modules/games/games.service.js#L1826-L1836)).
4. `updateEventForUser` `!== undefined` patch list
   ([games.service.js:1924-1957](../server/src/modules/games/games.service.js#L1924-L1957)).
5. `sanitizeEvent`
   ([games.service.js:40-54](../server/src/modules/games/games.service.js#L40-L54)).

Also: insert-before shares `appendEventSchema` and `appendEventForUser` via
`options.insertBeforeEventId`, and `insertEvent`
([1630-1644](../server/src/modules/games/games.service.js#L1630-L1644)) splices
the payload — so the snapshot must survive that path too. SUB_IN/SUB_OUT
inserts are blocked at line 1670; do not accidentally unblock them.

**Done:** tests proving every stat family (tracked shot, non-shot,
substitution, opponent aggregate) persists the snapshot; a test proving chained
events share one snapshot; an insert-before test; tests proving omitted or
partial tuples are rejected; a test proving a snapshot inconsistent with the
game's `gameFormat` is rejected.

## Unit 7 — Shared frontend controls

**Files:** new format-control component and clock display/control component in
`client/src/features/games/components/` (or a shared location if the league
forms need it — the format control is used by both leagues and games pages).

**Work:** a basketball game-format control exposing Format
(`Quarters`/`Halves`), regulation segment duration, and overtime duration as
whole-minute values; a clock display/controls component consuming Unit 1's
utilities.

**Traps:** the format control is shared by league and game forms, which live in
different feature folders (`leagues/` and `games/`). Place it where neither
imports across a feature boundary awkwardly, consistent with existing
conventions. Do not accept or emit `regulationSegmentCount`.

**Done:** component unit tests with fake timers for the clock display (running,
paused, segment-complete, tenths under a minute, zero) and accessible-label
assertions.

## Unit 8 — League frontend

**Files:** `AdminNewLeaguePage.jsx`, `AdminLeaguePage.jsx`.

**Work:** add format fields to the create form and send the full default in
`leaguesApi.create()`; add owner-only controls to the existing Settings tab.

**Traps:** `AdminLeaguePage` has **no settings form submit** — it saves one
field at a time via `leaguesApi.update` (lines 424, 487). Follow that idiom.
League managers must see values read-only with no edit controls. The 402→
`/pricing` redirect in `AdminNewLeaguePage` (line 36) must keep working.

**Done:** tests for submitted create payload defaults, owner-only edit controls,
and manager read-only rendering.

## Unit 9 — Game-create frontend

**Files:** `AdminNewLeagueGamePage.jsx`, `NewGamePage.jsx`,
`AdminLeagueSchedulePage.jsx`.

**Work:** initialize the format from `league.defaultGameFormat` (already loaded
at lines 252-253) and allow an override; add the same controls to `NewGamePage`
with the standalone default; leave the schedule builder inheriting the
server-side default with no batch override.

**Done:** tests for league-default loading and override, standalone submission,
and schedule-builder inheritance with no batch control present.

## Unit 10 — Tracker clock

**Files:** `GameTrackPage.jsx`, `GameTrackScoreHeader.jsx` (from P2),
`gamesApi.js`.

**Work:** add a clock function to `gamesApi`; render the clock component inside
the extracted header so it appears in both the main layout and the fullscreen
overlay; keep server state in `data.game.clock` with only pending-command,
error, and animation-tick state local; disable conflicting controls while a
clock mutation is in flight; reload on 409; add the `Start game` button after
lineups are ready; add the unclean-exit recovery prompt; pair
pause-video-on-entry with the clock while remembering what was running
beforehand. First migrate the app provider/router composition from
`BrowserRouter` to `createBrowserRouter` + `RouterProvider` so `useBlocker` can
implement the approved in-app navigation prompt. Keep auth and route analytics
inside router context and preserve the current lazy/Suspense behavior.

**Traps:**

- `useBlocker` exists in installed react-router 6.30.3 but throws under the
  current declarative `BrowserRouter`; the data-router migration is required,
  not optional. Put it in its own reviewed commit immediately before the rest
  of Unit 10, with smoke coverage for auth, lazy routes, redirects, and
  `PostHogRouteTracker`.
- The in-app blocked-navigation dialog maps `Pause and exit` to: issue the
  server pause, then `blocker.proceed()` only after success. `Keep tracking`
  calls `blocker.reset()`. Hard reload/close uses the browser's native
  `beforeunload` warning; choosing to leave never attempts an unreliable async
  pause, so the authoritative clock keeps running.
- Reload-on-409 is the only option; `__v` is not exposed.
- Mutation responses must go through the existing `updateData` helper, not a
  parallel state path, and must contain the full sanitized `game` object plus
  dual-team `lineups`.
- `changeActiveSide` feeds the lineup auto-switch effect (579-589); the clock
  must not perturb it.
- The clock's animation tick derives from synchronized server time plus
  `performance.now()`, never by decrementing local state or trusting the device
  wall clock.
- Recovery gating follows the deterministic reload-marker rule in Clock And
  Event Behavior item 14; test a same-tab refresh separately from a fresh tab.

**Done:** tests for clock rendering in one-sided and dual-team layouts and
inside the fullscreen overlay; resume-after-reload; pause; zero; segment labels;
409 reload path; recovery prompt gating stat entry; same-tab refresh without a
recovery prompt; fresh-session recovery; in-app and hard-navigation guards;
video-pause pairing that does not start an already-paused clock.

## Unit 11 — Tracker event tagging

**Files:** `GameTrackPage.jsx`.

**Work:** add `captureClockSnapshot()` and attach it in the now-single
`buildEventPayload` (from P1). Capture once when a stat flow begins and retain it
in shot/follow-up prompt state; do not recalculate for assist, rebound,
turnover/steal, foul, or substitution companion requests. Seed insert-before
snapshots from the selected event. Show segment/time in the recent-events
metadata and the edit dialog.

**Traps:**

- P1 must be complete, or opponent points and substitutions ship untagged.
- Video timestamps are captured only on court tap today; adding non-court
  capture is a deliberate behavior change requiring its own tests.
- Follow-up prompt state must carry the snapshot, since the clock keeps running
  between the primary event and the follow-up.

**Done:** payload-tagging tests across shots, free throws, rebounds, quick
stats, opponent points, substitutions, follow-ups, insert-before, and event
edits; a test proving a chained pair shares one snapshot; period-transition
tests proving the current five carries over without a mandatory lineup prompt.

---

# Clean Cutover And Delivery Order

- There is no legacy no-clock execution path. At cutover, every supported
  League has `sport` and `defaultGameFormat`, every supported Game has `sport`,
  `gameFormat`, and `clock`, and every supported event has the complete period
  snapshot tuple.
- Pre-clock documents are not read, repaired, backfilled, or tested by this
  feature. The deployment environment must contain only conforming data (for
  example through a separate reset or one-time operational conversion outside
  this plan) before the new application is made available.
- Client and server deploy together. The server immediately rejects obsolete
  create-game discriminators and event bodies without clock snapshots; there is
  no tolerant API phase.
- Keep `defaultGameFormat` as a **Mongoose schema default** so a newly created
  Stripe webhook league stub is valid during the current checkout flow before
  its configuration form is submitted. This is current workflow support, not a
  legacy-data fallback.
- Implementation order remains prerequisites P1/P2 → server/schema Units 1-6 →
  client Units 7-11, but those steps are not independently deployed to
  production.
- Update `docs/PROJECT-KNOWLEDGE.md` and `docs/api.md` when implementation ships.

# Testing And Verification

## Server

- Schema-introspection tests for League default, Game format/clock, and embedded
  event snapshot fields — including a test that a stray field on an event **is**
  dropped, documenting the strict-mode behavior deliberately.
- Zod tests for halves, quarters, duration bounds, rejected client-supplied
  `regulationSegmentCount`, overtime, clock commands, and event correction
  fields.
- A test asserting a malformed `gameFormat` yields a field-level error rather
  than a four-branch union error.
- Service tests for league-default inheritance versus per-game override across
  single and bulk creation paths, including `insertMany` default application.
- Clock tests with an injected fake `now`: start, pause, resume, elapsed
  normalization, clamp at zero, set time, next segment, regulation completion,
  overtime, scheduled→in_progress transition, finish, completed-game rejection,
  and 409 behavior.
- A test proving `finishGameForUser` returns 409 rather than 500 on a version
  conflict.
- Event tests proving every stat family receives the correct snapshot, that
  insert-before preserves it, and that chained events can share one snapshot.
- Rejection tests proving format-less games and events with missing snapshot
  fields are outside the supported schema/API contract.
- Authorization tests: every existing tracker role, including a team manager,
  may use `set_time` and other clock commands; league manager 403 (not 404) on
  `defaultGameFormat`.

## Client

- P1 regression tests: opponent-point and substitution payloads carry
  `videoTimestamp`.
- P2 test: score header renders inside the fullscreen tracking overlay.
- `AdminNewLeaguePage` tests for defaults and submitted payload.
- `AdminLeaguePage` tests for owner-only edit controls and manager read-only
  rendering, following the existing one-field-at-a-time save idiom.
- `AdminNewLeagueGamePage` tests for loading a league default and overriding it.
- `NewGamePage` tests for standalone format submission.
- Schedule-builder tests for server-side default inheritance and absence of a
  batch override.
- Clock component tests using fake timers, including resume after reload,
  pause, zero, segment labels, server/device-clock skew, data-router navigation
  guard, same-tab refresh, unclean-exit recovery, and accessible controls.
- `GameTrackPage` tests for clock rendering in one-sided/dual-team layouts and
  in fullscreen, and for payload tagging across shots, quick stats, opponent
  points, substitutions, follow-ups, insert-before, and event edits.
- Video-assisted tracker tests proving automatic stat-entry pause/resume affects
  the game clock only when the clock was already running, and covering the new
  non-court video-timestamp capture point.
- Period-transition tests proving the current five carries over without a
  mandatory lineup prompt and can still be changed through substitutions.
- Regression tests for score, lineup, video timestamp, undo, completed-game
  editing, and finish behavior.

## Repository checks

Run the targeted suites while iterating, followed by:

```bash
pnpm check-env
pnpm check-secrets
pnpm lint
pnpm test
pnpm build
```

Perform manual responsive QA on the tracker with and without video at mobile
and desktop widths. Also verify refresh/resume, fullscreen overlay, and two
simultaneous authorized tracker sessions.

# Implementation Tracker

Update this section in the same commit as each completed unit. Use `[~]` only
for actively in-progress work and `[x]` only after tests for that unit pass.

- [x] Discovery: map league, game, schedule, tracker, and event mutation paths.
- [x] Planning: document the proposed model, clean cutover, tests, and open
      decisions.
- [x] Product decisions: creation defaults, overrides, resume, video
      interaction, permissions, periods, overtime, correction behavior, and
      cutover recorded.
- [x] Code verification: confirm every claim against the working tree; record
      strict-mode, hand-enumerated field lists, Stripe stub, scheduled-game
      inversion, union-schema, `useBlocker`, and video-capture traps.
- [x] **P1 (prerequisite): funnel every event append through one payload
      builder; fix missing `videoTimestamp` on opponent points and substitutions.**
- [x] **P2 (prerequisite): extract `GameTrackScoreHeader` and render it in the
      fullscreen tracking overlay.**
- [x] Unit 1 — Domain constants/utilities: formats, bounds, labels, effective
      clock.
- [x] Unit 2 — Validation composition refactor: reusable envelopes for
      `gameFormat` and the required atomic event snapshot; reject obsolete client
      shapes.
- [x] Unit 3 — League backend: schema defaults, validation, persistence,
      sanitization, owner-only 403.
- [x] Unit 4 — Game backend: format snapshot, league inheritance/override, bulk
      inheritance, sanitization, immutability.
- [x] Unit 5 — Clock backend: commands, route/controller/service, existing
      tracker authorization, scheduled-game inversion resolution,
      `finishGameForUser` 409 fix.
- [x] Unit 6 — Event backend: five field-list sites, required snapshots,
      append/insert/edit, sanitization.
- [x] Unit 7 — Shared frontend: format control and clock display/controls.
- [x] Unit 8 — League frontend: create form and owner-only settings.
- [x] Unit 9 — Game-create frontend: league default, override, standalone,
      schedule inheritance.
- [~] Unit 10 — Tracker clock: scoped data-router migration, header integration,
  server-time reconciliation, navigation guard, recovery prompt, video pairing.
- [~] Unit 11 — Tracker event tagging: all primary, follow-up, substitution,
  opponent, insert, and edit flows.
- [x] Clean cutover: required data contract, coordinated client/server release,
      and obsolete-request rejection.
- [x] Documentation: update project knowledge and API reference.
- [~] Verification: automated client/server tests, environment validation,
  secret scan, lint, and production builds pass; responsive manual QA,
  refresh/resume QA, fullscreen QA, and concurrent-tracker QA remain.

# Confirmed Product Decisions

1. Duration is configured per regulation segment, not as total game duration.
2. Defaults are four 10-minute quarters and five-minute overtime.
3. Setup uses whole minutes; the live clock shows tenths below one minute.
4. The clock stops at zero and requires an explicit next-period action.
   A running or paused quarter, half, or overtime can also be finished manually
   when the tracker clock trails the real game.
5. At least one starter per tracked team is required before `Start game`
   enables. A 1–4-player lineup is valid but requires explicit confirmation;
   the warning can continue as-is or return to lineup editing.
6. A game may finish before the last period reaches zero, with a warning.
7. Overtime starts manually, uses the configured duration, and supports
   repeated `OT1`, `OT2`, and later periods.
8. Standalone games receive the same clock and format controls.
9. Bulk schedules inherit the league default without an override.
10. Only league owners may edit the future-game default in league Settings,
    enforced with a targeted 403.
11. Backward compatibility is out of scope. The released application supports
    only Leagues, Games, and events conforming to the new clock-aware schemas;
    obsolete clients and pre-clock documents are not tolerated.
12. This delivery shows period/time only in the tracker event list, not new
    public play-by-play/replay grouping.
13. An event uses the clock and video snapshots from the initial stat-entry tap;
    linked follow-up events share those snapshots.
14. Navigating away with a running clock prompts for `Pause and exit` or
    `Keep tracking`; an ordinary refresh keeps it running. The required scoped
    data-router migration is part of Unit 10.
15. Reopening after an unexpected close shows a recovery prompt to accept or
    correct the elapsed clock before tracking continues.
16. The current five carries into later periods. No lineup confirmation is
    forced; users may make changes through existing tracker controls.
17. Pause-video-on-entry also pauses/resumes a running game clock, while manual
    video pause remains independent.
18. Existing game-tracking permissions govern every clock operation, including
    `set_time`, and event period/time edits.

# Resolved Transition And Correction Behavior

1. A new regulation period or overtime enters `ready` and waits for `Start`.
2. Corrections accept tenths of a second, matching the live display.
3. Recovery correction leaves the clock paused for an explicit restart.
4. The atomic `correct` command repairs period kind, period number, and
   remaining milliseconds together.
