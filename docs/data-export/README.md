# CSV Data Export ("Get My Data Out")

**Status:** v1 built (see [STATUS-DASHBOARD.md](./STATUS-DASHBOARD.md) and
[IMPLEMENTATION-TRACKER.md](./IMPLEMENTATION-TRACKER.md)).
**Backlog origin:** Product Opportunities Board — Tier 1, item #1 (the
recommended first-sprint lead).

## Why

The most-requested "get my data out" ask. Every exportable stat is already
computed and materialized server-side, but users had no way to pull it out.
This feature adds server-side CSV export from the three places users live:

- **MySporty** — an individual player exports their own stats across **all** their
  claimed league player profiles (a user may hold many).
- **Admin — league owner / manager** (AdminLeaguePage) — standings, statistical
  leaders, per-player stats, and games for the current season.
- **Admin — team manager** (AdminLeagueTeamPage) — a single team's player stats and
  games for the current season.

## Architecture

- **Server-side generation, CSV only.** This introduces the first
  `Content-Disposition` / `res.attachment` response in the codebase; every other
  handler returns JSON via `utils/apiResponse.js`.
- **New `export` module** (`server/src/modules/export/`) orchestrates across the
  `leagues` domain rather than scattering endpoints into each module. The MySporty
  export is inherently cross-domain, and concentrating the one non-JSON response
  shape here keeps it reviewable. The module owns **no** collections — the service
  only calls existing `leagues.service` functions.
- **Dependency-free CSV util** (`server/src/utils/csv.js`) — RFC-4180 escaping, no
  new npm dependency.

### Endpoints (all behind `authMiddleware`, base `/api/v1`)

| Route                                                                                                      | Auth gate (reused)           | Contents                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `GET /export/my-sporty`                                                                                    | signed-in user               | One section: every claimed profile with season averages (`mysporty-stats-<date>.csv`) |
| `GET /export/leagues/:leagueId/season/:seasonId?dataset=standings\|leaders\|players\|games\|gamelogs\|all` | `assertLeagueManagerOrOwner` | Standings / leaders / player stats / games / per-game player game-logs                |
| `GET /export/leagues/:leagueId/teams/:leagueTeamId/season/:seasonId`                                       | `assertTeamManagerOrOwner`   | That team's player stats + games + per-game game-logs                                 |

### Reuse (no new data logic)

- MySporty → `assembleLeagueProfilesForUser(userId)` (`leagues.service.js`) — already
  returns one entry per claimed profile, handling multiple profiles per user.
- Standings → `getLeagueStandings`; per-player → `getLeaguePlayerStats` +
  `deriveLeaguePlayerScores`; season-scoped games + per-game box scores →
  `getLeagueSeasonGames` (added to `leagues.service.js`, wraps the existing
  season-filtered `listLeagueGamesByLeagueId` + `listLeagueGames`).
- Per-game game-logs are derived from each completed game's frozen `boxScore`
  (one-sided `{ players, teamTotals }` and dual-team `{ home, away }` shapes).
- Auth → the canonical `assert*` gates, now exported from `leagues.service.js`.

## Client

- `apiClient.getBlob(path)` — cookie-auth blob fetch with the same 401→refresh→retry
  behaviour as `request()`; parses the download filename from `Content-Disposition`.
- `lib/downloadFile.js` `downloadBlob(blob, filename)` — the object-URL→anchor→click
  pattern (mirrors `useShareImage`).
- `features/export/` — `exportApi`, `useExportCsv` (a `useMutation`; download is an
  imperative action, not cached state), and `ExportCsvButton` (single button, or a
  dataset dropdown for the league export).

## GameDetailPage cleanup (bundled)

The game detail header had redundant image-share controls. The legacy **Share** and
**Download** image-card buttons (and their SVG recap-card pipeline —
`buildHeaderCardDataUrl`, `createRecapCardDataUrl`, `createPngFileFromSvgDataUrl`,
etc.) were removed in favour of the single canonical **"Share as image"**
(`ShareImageButton`). **Print** and **Pulse** were kept.

## Follow-ups (delivered 2026-07-12)

- **Full per-game per-player box-score export** — a "Game Logs" section (one row per
  player per completed game) on both the league export (`?dataset=gamelogs`, folded
  into `all`) and the team export, derived from each game's frozen `boxScore`.
- **Season-filtered games** — the league/team Games and Game Logs sections are now
  scoped to the requested season via `getLeagueSeasonGames`, consistent with
  standings/leaders/players.
- **Dead-code cleanup** — removed the now-unused `features/games/recapCardImage.js`
  (+ its test/snapshot), orphaned by the GameDetail share-button consolidation.

## Scope / deferred (v1)

- CSV only. PDF post-game report is a separate Tier 2 item (#7).
- Standalone-team roster-player export is out of scope (only `LeaguePlayer` profiles
  link to users today).
