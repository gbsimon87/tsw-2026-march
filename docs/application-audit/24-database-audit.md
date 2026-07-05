# Database Audit

> Part of the [Application Audit](./README.md) · July 2026

Schema reference: [03-database-overview](./03-database-overview.md).
Index detail: [19-indexing-strategy](./19-indexing-strategy.md).

## Hot collections

| Collection                     | Read pressure                                                                         | Write pressure                                        |
| ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `games`                        | every league/team/player/game/feed-card view — usually **full docs including events** | every tracked stat = full-doc save against 23 indexes |
| `leagueteams`, `leagueplayers` | loaded repeatedly per league request (up to 3×)                                       | low                                                   |
| `users`                        | N+1 lookups everywhere; `/auth/me` per SPA load                                       | low                                                   |
| `posts`                        | feed pages (fine — keyset cursor)                                                     | low                                                   |
| `sessions`                     | login/refresh                                                                         | TTL-managed                                           |

## Top findings

### 1. No aggregation pipeline usage — all derived data computed in Node

Every standings/stat/leaderboard view loads raw docs and iterates in JS. This
is the defining performance characteristic of the backend. The fix is **not**
to translate these loops into `$group` pipelines run per request — it's to
stop computing on read at all ([28-computation-optimisation](./28-computation-optimisation.md)).
Aggregation still has a role for the remaining ad-hoc reads (event counts,
roster counts, shareable search).

### 2. `Game.events` unbounded embedded array

~200–600 events/game keeps documents well under 16MB, so **embedding is the
right model** for tracking (events are always written/read with their game).
The problems are access-pattern ones:

- List endpoints must project events out (`.select('-events')`).
- Event appends should use `$push` instead of full-doc saves
  (`games.service.js:1184-1198`) — also removes the lineup-clobber race.
- Maintain denormalised `eventCount`, and materialise `homePoints/awayPoints`
  on completion so no reader needs events for scores.

### 3. Missing precomputed values (denormalisation opportunities)

| Value                  | Currently                                                                    | Materialise as                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Game final score       | summed from events per read, ≥2× per league page (`leagues.service.js:1564`) | `finalScore: {home, away}` set on completion + event edits to completed games                                                                                      |
| League standings       | O(G×E) rebuild ×4 call sites                                                 | `leaguestandings` doc per league (or array on League), updated on game completion/edit                                                                             |
| Player season stats    | O(G×E×R) rebuild per team/player/leader page                                 | `leagueplayerstats` docs `{leagueId, leagueTeamId, leaguePlayerId, gamesCount, pts, reb, ast, stl, blk, tov, fg2m/a, fg3m/a}` — fantasy/DPOY scores derive at read |
| `eventCount`           | `$size` over loaded array                                                    | int field maintained on append/delete                                                                                                                              |
| Feed card display data | re-resolved per feed read via full public pipelines                          | denormalised at post-creation                                                                                                                                      |

### 4. Data duplication that already exists (accept/verify)

Participant display data (name, logo, colors) and billing/entitlement
snapshots on games; roster snapshots ×3 per game. These are sensible
write-time denormalisations — the pattern just needs to be **finished**
(add `slug` to the participant schema so the runtime backfill dies).

### 5. Schema issues

- `participant.slug` missing (silent drop) — add to schema.
- Dead user-level league billing fields — remove.
- `processedWebhookEventIds` fine (capped 25) but update non-atomically —
  switch to `$addToSet`+`$slice` or a `webhook_events` collection.
- Tie = home win in standings (`leagues.service.js:1763`) — decide and encode.

### 6. Index findings (summary; full list in [19](./19-indexing-strategy.md))

- **Drop**: `events.teamSide_1` (multikey, unqueried, taxes every event append),
  5+ single-field prefixes of compounds (games, teams, leagues), low-value
  low-cardinality singles (`trackingMode_1`, `gameContext_1`).
- **Add**: `{leagueId, status}` on games; `{leagueTeamId, isActive}` on
  leagueplayers; `{leagueId, role, status}` on leagueteammembers if manager
  listing grows.
- Disable `autoIndex` in prod; verify drops with `$indexStats`.

### 7. Connection hygiene

`mongoose.connect(MONGO_URI, {dbName})` with driver defaults
(`server/src/config/db.js`) — set explicit `maxPoolSize` (Render instance
sizing), `serverSelectionTimeoutMS` ~10s, and add SIGTERM disconnect. Use
`.lean()` on read-only service paths (every sanitize function copies fields
anyway — hydrated documents are pure overhead on hot reads).

## Proposed new collections (for the materialisation work)

```
leaguestandings   { leagueId (unique), rows: [{leagueTeamId, wins, losses,
                    pointsFor, pointsAgainst, diff}], updatedAt }
leagueplayerstats { leagueId, leagueTeamId, leaguePlayerId (compound unique),
                    gamesCount, pts, reb, ast, stl, blk, tov,
                    fg2m, fg2a, fg3m, fg3a, ftm, fta, updatedAt }
```

Indexes: `{leagueId:1}` on both; `{leagueId:1, leagueTeamId:1}` on stats.
Rebuild path: a `rebuildLeagueAggregates(leagueId)` function (reusing the
existing read-time code!) invoked on game completion/reopen/delete and on
event edits to completed games — see [28](./28-computation-optimisation.md).
