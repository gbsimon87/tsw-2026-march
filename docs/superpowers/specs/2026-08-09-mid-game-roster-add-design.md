# Mid-Game Roster Add — Design

> Add a missed player to a team's roster from within `GameTrackPage`, without
> leaving the live tracking screen. Date: 2026-08-09.
> Branch: `feature/mid-game-roster-add`.

## Problem

Players are sometimes missed when a team is first created. Today the only fix is
to abandon the tracking screen, go to the admin roster page, add the player, and
come back — and for league games, even that does not make the player trackable in
the game already in progress, because league games freeze their roster at
creation time.

## Decisions

| #   | Decision               | Choice                                                                  |
| --- | ---------------------- | ----------------------------------------------------------------------- |
| 1   | Scope                  | **Both** league and standalone games                                    |
| 2   | Effect on current game | Add to the persistent roster **and** append to the live game's snapshot |
| 3   | Permissions            | Reuse the **existing roster gates** — no widening                       |
| 4   | Fields collected       | **Name + optional jersey number** (no position)                         |
| 5   | Lineup effect          | **Bench only** — tracker subs them in via the existing flow             |

Completed games are out of scope: appending to a finalised game would invalidate
its frozen `finalScore`/`boxScore` and the materialized league stats. The add is
allowed only while `status` is `in_progress` or `scheduled`.

## Architecture: three cases, not two

The roster read path differs per game shape, which decides the work per case:

| Game shape                       | Roster read path                                         | Work required                             |
| -------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| Standalone, single-team          | `team.players` read **live** from the `Team` doc         | Roster write only — **no game write**     |
| League, single-team tracked      | `game.rosterSnapshot`, frozen                            | Roster write **+** snapshot append        |
| Dual-team (league or standalone) | `game.homeRosterSnapshot` / `awayRosterSnapshot`, frozen | Roster write **+** append to correct side |

The standalone single-team case needs no new server-side game logic:
`resolveGameTeamContext` (`games.service.js`) reads
`team.players.map(sanitizePlayer)` live, so a roster write plus a client refetch
is sufficient. The frozen-snapshot cases carry the real work.

`repairGameRosterSnapshots` (`games.service.js`) already reconciles an **empty**
snapshot against the live roster on load, and only when the game is
`in_progress`. It will not perform this feature's job, but it establishes that
"snapshot may need reconciling with the live roster" is an accepted concept in
this codebase. The new append belongs next to it rather than in a separate
concept elsewhere.

## Server

### Endpoint

`POST /games/:gameId/roster`

Game-scoped rather than reusing the league/team roster routes, because the
snapshot append must happen together with the roster write — the tracking client
should not orchestrate two calls — and team identity should be derived from the
game, never trusted from a tracking client's body.

Request: `{ side?: 'home' | 'away', displayName, jerseyNumber? }`
(`side` is required only for dual-team games.)

Response: `{ player }` plus the refreshed roster for the affected side.

Validation: a new Zod schema in `games.validation.js`, reusing the existing
`displayName` and `jerseyNumber` rules (int 0–999, nullable). Jersey is optional
so it never blocks a hurried add.

### Service — `addPlayerToGameRoster` in `games.service.js`

1. Load the game; reject unless `status` is `in_progress` or `scheduled` → `409`.
2. Resolve the target team from the game and `side` — never from the request body.
3. Delegate the durable roster write to the **existing** service function, which
   carries its permission gate with it:
   - League → `leaguesService.addPlayerToLeagueTeam(userId, leagueId, leagueTeamId, payload)`
     (gates `assertTeamManagerOrOwner`, enforces the duplicate-name `409`, runs
     `ensureLeagueEditable`).
   - Standalone → `teamsService.addPlayerToTeam(userId, teamId, payload)`
     (gates team ownership, and runs `scheduleTeamSeasonSummaryRecompute` —
     required for roster changes per the OPT-013 comment).
4. For snapshot-backed games only, append the returned player to the correct
   snapshot array using `buildLeagueRosterSnapshot`'s exact field shape, and save
   the game.
5. Return the player and the refreshed side roster.

Reusing the two existing add-player services is the load-bearing decision: the
permission gates, duplicate-name `409`s, and season-summary recompute are
inherited rather than reimplemented. This directly heeds the §4 lesson (from
TSW-001) that a gate rewritten from scratch is the one that forgets the
owner OR-clause.

### Ordering and concurrency

- **Roster write first, snapshot second.** If the snapshot append fails, the
  result is a real roster player with no game row — recoverable, and adjacent to
  what `repairGameRosterSnapshots` already handles. The reverse order would put a
  phantom in the game with no `LeaguePlayer` behind it, breaking the
  `leaguePlayerId` linkage that `LeaguePlayerStats` and public player pages rely
  on.
- **`VersionError` retry.** The `Game` schema uses `optimisticConcurrency`
  (§5), so the snapshot save can conflict with a co-tracker's simultaneous event
  save. Retry the append **once** with a freshly loaded game: it is a pure
  append and safe to replay. Preferable to surfacing a confusing `409` mid-game.

## Client

`GameTrackPage.jsx` is ~3,158 lines, and §11 names its decomposition as the
deliberately-last OPT-014b item. This work does **not** decompose it and does
**not** migrate it to TanStack Query — that is tracked work with its own risk
profile, and bundling it here would make the diff unreviewable.

Additions:

- **`AddRosterPlayerDialog`** in `features/games/components/` — name + optional
  jersey, hand-rolled per the `useAuthForm` convention (not react-hook-form),
  with inline server-error display so the duplicate-name `409` surfaces verbatim
  rather than as a generic string (§11's swallowed-error debt).
- **Two triggers**: the bench/roster area during tracking, and the existing
  empty-roster dead-end — currently _"No players found on this roster. Go to
  Teams to add players before tracking."_ — which becomes an actionable button.
- **Permission gating** on the same `viewerContext` data the page already uses
  for other admin affordances, so a helper never sees a button that would `403`.
  Client checks remain UX-only; the server gate is authoritative.
- **On success** the player is appended to local roster state and lands **on the
  bench**. No lineup mutation and no `SUB_IN` event — the tracker subs them in
  through the existing substitution flow. This avoids inventing a second path
  into substitution that would have to choose who comes off, and keeps
  `SUB_IN`/`SUB_OUT` pairing (the order-sensitive part of the event model)
  untouched.
- **Styling** follows the page's current slate/sky-blue `PageHeader` palette,
  **not** the scoreboard redesign, per §9.1's "don't spread the new palette
  opportunistically".
- An `addRosterPlayer` method joins the existing `gamesApi` singleton.

The existing "Select exactly 5 players for the starting five" validation is left
untouched: if a roster is empty and fewer than five players are added, tracking
correctly stays blocked.

## Testing

**Server** (Jest + Supertest, `server/src/tests/`):

- Unit: `addPlayerToGameRoster` across all three game shapes; helper rejected on
  a league game; `409` on a completed game; duplicate-name passthrough;
  `VersionError` retry.
- Integration: the real route for the league dual-team case, asserting the player
  is both a real `LeaguePlayer` **and** present in the correct side's snapshot.
  The two-write invariant is exactly what a mocked unit test misses — the §1
  v1.5 lesson (a missing export that 500'd every request while every mocked test
  passed) is why one unmocked path is required here.

**Client** (Vitest + RTL, colocated `*.test.jsx`): the dialog renders, validates,
submits, surfaces a server error inline; the empty-roster state exposes the
button. Per §8, several admin test trees lack a `QueryClientProvider`;
`GameTrackPage` fetches imperatively, so this stays consistent by not
introducing a query hook.

## Error handling

House pattern throughout: `ApiError(status, message)` thrown from the service,
normalized by `error.middleware.js`. Notable statuses: `409` completed game,
`409` duplicate active name, `403` insufficient roster permission, `404`
game/team not found.

## Out of scope

- Completed games (would require recompute + feed-card refresh triggers).
- Editing or removing players mid-game — add only.
- Position field.
- Immediate sub-in prompt.
- `GameTrackPage` decomposition / TanStack Query migration (OPT-014b).
- Widening the roster-write permission to helpers.
