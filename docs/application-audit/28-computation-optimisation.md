# Computation Optimisation — Read-time → Write-time

> Part of the [Application Audit](./README.md) · July 2026

The single most valuable structural change in this codebase. Today:

```
User opens league standings/leaders
→ load ALL league games (full events) + teams (+ players)
→ replay every event in JS
→ sort, return, discard
```

Target:

```
Game finished (or completed game edited)
→ recompute that league's aggregates once
→ store in leaguestandings / leagueplayerstats / Game.finalScore
→ every read is an indexed find
```

## Inventory of read-time computations

| Computation                                                    | Where                                                        | Cost                          | Move to write?                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| League standings                                               | `leagues.service.js:1713-1785`, called from 4 compositions   | O(G×E)                        | **Yes**                                                                                                                                                                 |
| Per-player team stats                                          | `buildLeagueTeamPlayerStats` `:1647-1703`                    | O(G×E×R)                      | **Yes**                                                                                                                                                                 |
| Leaders/fantasy/DPOY                                           | `:1981-2089`                                                 | O(T×G×E×R)                    | **Yes** (store per-player aggregates; score+sort at read)                                                                                                               |
| Player game rows + highlights                                  | `:768-850`                                                   | 2 full sweeps per player page | Yes (per-player-per-game stat lines) or cache                                                                                                                           |
| Game score                                                     | `getLeagueGameScore` `:1564`, `computeTeamPoints` (teams)    | O(E) per game per page, ≥2×   | **Yes** → `Game.finalScore` on completion                                                                                                                               |
| Game box score/summary/recap/highlights                        | `games.service.js:397-524`, `gameRecap.service.js`           | ~7–10 event passes per read   | **Partially**: freeze into the doc at completion; live games keep computing (they must) but need only **one** pass per request instead of 7–10 (consolidate the passes) |
| Team season summary (public team page)                         | `teams.service.js:275-344`                                   | O(G×E)                        | Yes (same pattern per Team)                                                                                                                                             |
| eventCount for lists                                           | `games.service.js:1030`                                      | loads all events              | **Yes** → counter field                                                                                                                                                 |
| Client-side recomputes (career totals, upcoming/recent splits) | `PublicPlayerPage.jsx:138-152`, `PublicTeamPage.jsx:130-143` | trivial                       | return from server once materialised                                                                                                                                    |

## Design

### New persistence

See [24-database-audit](./24-database-audit.md) for the `leaguestandings` and
`leagueplayerstats` schemas, plus `Game.finalScore`, `Game.eventCount`, and a
frozen `Game.boxScore` for completed games.

### Write hooks (all already flow through few functions)

- `finishGameForUser` (`games.service.js:1466+`) → set finalScore, freeze
  boxScore, then `recomputeLeagueAggregates(leagueId)` for league games /
  `recomputeTeamSummary(teamId)` for standalone.
- `appendEventForUser` / `updateEventForUser` / `removeEventForUser` — if the
  game is completed (edit-after-finish), re-trigger the same recompute;
  in-progress games only bump `eventCount`.
- `deleteGameForUser`, game reopen (status changes) → recompute.
- League-team create/archive/rename → recompute standings row set / names.

### Recompute implementation — reuse, don't rewrite

`recomputeLeagueAggregates(leagueId)` can literally call the existing
`getLeagueStandings` and leaderboard-accumulation code and persist the result.
Correctness stays identical to today; only the trigger moves. Run it
post-response (`setImmediate`/`queueMicrotask` + logging) so finishing a game
isn't slowed; a per-league in-flight guard (or reuse the AI-lock pattern)
avoids overlapping recomputes.

### Read path changes

- `getLeagueStandings` → `LeagueStandings.findOne({leagueId})` (fallback to
  live compute + persist when missing — this also serves as the backfill).
- Leaders → `LeaguePlayerStats.find({leagueId})` + fantasy/DPOY scoring +
  sort + slice (kept read-time: it's O(players), trivial, and lets weights
  change without recompute).
- League games list rows → use `Game.finalScore` (no event loading; combine
  with `.select('-events -rosterSnapshot -homeRosterSnapshot -awayRosterSnapshot')`).
- `getGameForUser` for completed games → serve frozen boxScore/recap.

### Consistency & migration

- Lazy backfill (compute-on-miss + persist) means **no migration script is
  strictly required**; an optional script can warm all leagues.
- Staleness window: post-response recompute means seconds at most; the league
  UI already tolerates this (standings aren't shown mid-request).
- Keep the live-compute code path behind the fallback — it is the source of
  truth for rebuilds and makes the change safely reversible.

## Sequencing

1. `Game.finalScore` + `eventCount` + projection fixes (small, immediately
   removes events-loading from all list endpoints).
2. `leaguestandings` materialisation (kills the 4× recompute).
3. `leagueplayerstats` (kills the leaders/team/player page rebuilds).
4. Frozen boxScore for completed games + consolidate live-game event passes.
5. Team season summaries (standalone teams).
