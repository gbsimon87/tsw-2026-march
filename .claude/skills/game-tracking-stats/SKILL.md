---
name: game-tracking-stats
description: Use when working on live game tracking, court/shot inference, event recording, or derived stats (box score, recap, replay, materialization) in this project. Trigger on "GameTrackPage", "court tap", "zoneId", "shot inference", "box score", "event log", "substitution", "lineup", "statSummary", "finalScore", "boxScore", or "gameSummary".
---

# TSW Live Tracking & Derived Stats

The most app-specific, highest-risk flow in TSW: tap court → infer shot →
record event → derive every downstream view from the embedded event list.
Read `docs/PROJECT-KNOWLEDGE.md` §5 and §10 first for the materialization
philosophy — this skill covers the mechanics.

## The pipeline

```
InteractiveCourtImage.jsx (tap/click, normalized 0..100 coords)
  → courtInference.js: inferCourtSelection() classifies zoneId + shot family (FG2/FG3)
  → GameTrackPage.jsx: builds event payload, prompts assist/rebound follow-up
  → POST /games/:gameId/events → games.controller.js → games.service.js
  → insertEvent() appends to Game.events, recalculates lineup/score/box score
  → syncGameDenormalizedAfterEventChange() refreshes finalScore/eventCount/boxScore
  → setImmediate: league standings / team season summary / feed-card recompute
```

Every read view (box score, recap, replay, public pages, shareable cards) is
**computed from `Game.events`**, never stored redundantly except as the frozen
denormalized fields (`finalScore`, `eventCount`, `boxScore`, `gameSummary`).

## Court inference (`client/src/features/games/court/`)

- `courtGeometry.js` — court dimensions/zone boundary math.
- `courtImageCalibration.js` — draggable calibration overlay maps raw
  pixel taps to normalized `x`/`y` (0..100); has a built-in debug overlay.
- `courtInference.js`:
  - `inferCourtSelection(rawX, rawY, calibration)` → `{ x, y, zoneId, shotFamily }`.
    Shot family (`FG2`/`FG3`) and nearest hoop are derived from zone + court half.
  - `buildShotStatType(shotFamily, outcome)` → maps to `STAT_TYPES.FG2_MADE` etc.
  - `buildFreeThrowPayload(hoopSide, outcome, calibration)` — FTs use **fixed**
    `FREE_THROW_LINE` coordinates, they don't go through zone inference.
- Coordinates are always normalized `0..100`, stored per-event as `zoneId`/`x`/`y`
  (`modules/shared/stats.constants.js` `SHOT_ZONE_IDS`).

## Stat types & the event model (`modules/shared/stats.constants.js`)

`STAT_TYPES`: `FT_MADE/MISS`, `FG2_MADE/MISS`, `FG3_MADE/MISS`,
`OPP_FT_MADE`, `OPP_FG2_MADE`, `OPP_FG3_MADE`, `OPP_REB`, `AST`, `OREB`,
`DREB`, `STL`, `BLK`, `TOV`, `FOUL`, `SUB_IN`, `SUB_OUT`.

**Assist/rebound are separate, independent events, not server-enforced
pairings.** The client (`GameTrackPage.jsx`) prompts "who assisted?" after a
made 2PT/3PT and "who rebounded / opponent rebound?" after a miss, then POSTs
a second event. The server does not validate that an `AST` event followed a
made shot, or that a rebound followed a miss — if you add new event types or
change the follow-up-prompt UX, keep this loose coupling in mind; don't assume
service-layer pairing invariants that don't exist.

**Substitutions (`SUB_IN`/`SUB_OUT`) update on-court lineup as a side effect**
of event insertion (`games.service.js` `insertEvent`/`recalculateCurrentLineup`).
`SUB_OUT` requires exactly 5 players currently on court; both sides validate
`lineupIds.length !== 5`. If you touch substitution logic, check both the
`insertEvent` path and the mirrored validation further down the file (`removeEventForUser`/event-delete recalculates lineup state too — it isn't append-only).

**Opponent events carry no player** — `OPP_REB`, `OPP_FG2_MADE`, etc. are
recorded without `playerId` since opponents aren't rostered (standalone games).
`isOpponentEvent(statType)` in `games.service.js` is the switch to extend if
you add a new opponent stat type.

## Deriving stats (`modules/shared/statSummary.js`)

Shared accumulator — **reuse this, don't write a new stat-reduction loop**:

- `summarizeEvents`/`summarizeEventsOneSided`/`summarizeEventsBySide` — entry
  points depending on whether the game is standalone (one tracked team) or a
  league dual-team game.
- `applyEventToTeamStatSummary` / `applyEventToFullTeamStatSummary` /
  `applyEventToPlayerStatLine` — the actual per-event-type accumulation logic.
  If you add a new `STAT_TYPES` value, it must be threaded through **all**
  applicable accumulators here or it will silently be missing from box
  scores/recaps/season stats even though the event was recorded.
- `createEmpty*` / `finalize*` pairs — finalize derives rate stats (FG%, PPG)
  from raw counts; don't compute percentages inline elsewhere.

`games.service.js` composes these into higher-level views:

- `computeBoxScore` / `buildBoxScoreForSide` — per-team box score.
- `computeGameFinalScore` — final score from events (frozen into
  `Game.finalScore` once completed).
- `buildGameSummary` — recap-level aggregate (top performers, key moments).
- `buildGameHighlights` — feeds the recap "key moments" section.

## Frozen/materialized fields — the compute-on-miss + persist pattern

`Game.finalScore`, `Game.eventCount`, `Game.boxScore`, `Game.gameSummary` are
computed once and frozen, not recomputed on every read (OPT-012). When you
change event-derived logic:

1. Update the compute function (`statSummary.js` / `games.service.js`).
2. Confirm the write-trigger path (`syncGameDenormalizedAfterEventChange`,
   called after event insert/update/delete) recomputes and re-persists the
   frozen field — a stale frozen value silently wins over live compute.
3. If the change affects **cards already shared to the feed**, check
   `scheduleFeedCardRefreshForGame` — `game_card` snapshots refresh on score
   change; `player_card`/`team_card` snapshots do **not** auto-refresh (known
   debt, PROJECT-KNOWLEDGE.md §11) and will drift stale on their own.
4. If it affects league standings or season summaries, confirm
   `scheduleLeagueRecomputeForGame`/`scheduleTeamSummaryRecomputeForGame` fire
   — these run `setImmediate` (post-response) with an in-flight dirty-flag, so
   don't assume synchronous consistency in a test that checks standings
   immediately after an event POST.

## Optimistic concurrency

`Game` has `optimisticConcurrency: true` — two co-trackers saving
concurrently throws `VersionError`, translated to `409`. Any new write path
that loads-then-saves a `Game` doc must let this propagate (don't swallow
`VersionError`); the client should treat `409` on event POST as "reload and
retry," not a generic error.

## Common bugs to check for when changing this flow

- New `STAT_TYPES` value added to the constant but missing from one of the
  `statSummary.js` accumulators → stat silently doesn't appear in box
  score/recap/season totals (same class of bug as the TSW-004 snapshot-shape
  lesson in PROJECT-KNOWLEDGE.md §5 — verify against every consuming view, not
  just what you remembered to update).
- Event insertion order matters for substitution/lineup state — `insertEvent`
  supports `insertBeforeEventId` for recovery/backfill; a new event-mutation
  path that appends instead of respecting insertion order will corrupt
  lineup replay.
- Zone/coordinate changes: `x`/`y` must stay normalized `0..100` — court image
  aspect ratio changes on the client should go through calibration, not a
  hardcoded scale factor.
- `GameTrackPage.jsx` is the largest, most imperative-fetch file in the client
  (deliberately last in the OPT-014b TanStack Query migration) — don't assume
  it follows the `useQuery` patterns used elsewhere; check
  `react-component-patterns` skill for the target pattern only if you're
  actively migrating this page, not as ambient guidance while just fixing a
  tracking bug.
