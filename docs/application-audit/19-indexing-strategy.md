# Indexing Strategy

> Part of the [Application Audit](./README.md) · July 2026

Sources: schema definitions in `*.repository.js` files + **live index inventory
from the dev Atlas DB `tsw_2026_dev`** (inspected 2026-07-04; live indexes match
the code). Headline numbers: **73 indexes across 12 collections** for 136
documents; index storage (~2.4 MB) is 11× data size. The dataset is tiny, so
this is about write-amplification and hygiene at scale, not current pain.

## The games collection: 23 indexes (needs pruning)

Live inventory:

```
_id_, ownerUserId_1, teamId_1, gameContext_1, trackingMode_1, leagueId_1,
homeLeagueTeamId_1, awayLeagueTeamId_1, trackedLeagueTeamId_1, homeTeamId_1,
awayTeamId_1, homeParticipant.teamId_1, homeParticipant.leagueTeamId_1,
awayParticipant.teamId_1, awayParticipant.leagueTeamId_1, status_1,
events.teamSide_1, ownerUserId_1_teamId_1_createdAt_-1,
homeTeamId_1_createdAt_-1, awayTeamId_1_createdAt_-1,
homeLeagueTeamId_1_createdAt_-1, awayLeagueTeamId_1_createdAt_-1,
aiSummaryGenerationLockId_1
```

### Drop candidates (verify with `$indexStats` in prod first)

| Index                                                                                       | Reason                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events.teamSide_1`                                                                         | **Multikey over every event of every game** — one index entry per event (hundreds per game), no query filters on `events.teamSide`. Worst index in the system: pure write amplification on the hottest write path (event append). |
| `ownerUserId_1`, `homeTeamId_1`, `awayTeamId_1`, `homeLeagueTeamId_1`, `awayLeagueTeamId_1` | Exact prefixes of their compound `..._createdAt_-1` twins — redundant.                                                                                                                                                            |
| `teamId_1`                                                                                  | Prefix-covered by `ownerUserId_1_teamId_1_createdAt_-1` only when ownerUserId present; standalone `{teamId}` queries exist (team public pages), so **keep** unless queries always add ownerUserId. Verify.                        |
| `trackingMode_1`, `status_1`, `gameContext_1`                                               | Low-cardinality single-field indexes; `gameContext` is only ever queried together with `leagueId` (explain plan confirms the planner picks `leagueId_1` and rejects `gameContext_1`). Replace with the compound below.            |
| `homeParticipant.teamId_1`, `awayParticipant.teamId_1`, `...leagueTeamId_1` ×2              | Only needed if participant-based lookups are actually issued — the repository exports for these are unused within the module. Verify then drop.                                                                                   |

### Add

| Index                                                                                                                | Serves                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{leagueId: 1, status: 1}` (or `{leagueId:1, gameContext:1}`)                                                        | `listLeagueGamesByLeagueId` — the standings/leaderboard query (`Game.find({gameContext:'league', leagueId})`), currently an IXSCAN on `leagueId_1` + filter. |
| `{status: 1, scheduledAt: -1, completedAt: -1, createdAt: -1}` — but only if `listCompletedGames` full-scans survive | Better: eliminate the full-scan endpoints instead ([23-api-audit](./23-api-audit.md)).                                                                       |

Net effect: games can go from 23 indexes to ~10 with strictly better coverage,
meaningfully cutting event-append write cost.

## Other collections (live = code, all reasonable)

- **teams**: drop `ownerUserId_1` (prefix of `ownerUserId_1_name_1`).
- **leagues**: drop `ownerUserId_1` (prefix of `ownerUserId_1_status_1`);
  keep `slug_1` (unique lookups), `status_1` is marginal (public-league listing
  filters `{isPublic, status}` — consider `{isPublic:1, status:1}` if that list
  grows).
- **leagueplayers**: add `{leagueTeamId: 1, isActive: 1}` — the roster query
  shape; drop single `leagueTeamId_1` when added.
- **leagueteammembers**: `listLeagueTeamManagersByLeague` queries
  `{leagueId, role, status}` — not covered by the existing compound
  (`leagueTeamId_1_userId_1_status_1`). Add `{leagueId:1, role:1, status:1}`
  if that path becomes hot; drop redundant `status_1` single.
- **leaguejoinrequests / leaguemanagers**: fine; singles on `status` are
  marginal.
- **posts**: fine (`_id` cursor pagination needs no extra index;
  `highlightClip.eventId` unique sparse is load-bearing).
- **sessions / authtokens**: TTL indexes are load-bearing; keep.

## Explain-plan verification (live)

`{gameContext:'league', leagueId}` → winning plan IXSCAN `leagueId_1` +
FETCH-filter on gameContext; planner **rejected** `gameContext_1` and the
AND_SORTED intersection — confirming `gameContext_1` earns nothing and a
`{leagueId, ...}` compound is the right shape.

## Process recommendations

1. Before dropping anything in prod, run `$indexStats` for a week and confirm
   zero ops on the candidates.
2. Mongoose `autoIndex` should be disabled in production (`db.js` currently
   uses defaults) and index changes applied via migration script — avoids
   surprise foreground builds on deploy.
3. Re-check after the materialisation work ([28](./28-computation-optimisation.md))
   — precomputed standings/stat docs bring their own (small) index needs and
   remove the pressure for game-side compounds.
