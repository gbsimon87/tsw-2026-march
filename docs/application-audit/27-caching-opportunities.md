# Caching Opportunities

> Part of the [Application Audit](./README.md) · July 2026

Current state (none anywhere): [18-caching-strategy](./18-caching-strategy.md).
This report lists concrete cacheable surfaces, the right layer for each, and why.

## Principle for this codebase

TSW's hot data (standings, stats, leaderboards) is **read-often,
write-rarely-and-predictably**: it changes only when a game completes or a
completed game's events are edited. That means the best "cache" is a
**database-persisted precomputed value updated on write** — no TTLs, no
invalidation guesswork, survives restarts, and reads become indexed point
lookups. Classic caches (memory/Redis/HTTP) are the interim or complementary
layer.

## Surface-by-surface

| Surface                                             | Change frequency            | Recommended layer                                                        | Why                                                                                  |
| --------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| League standings                                    | on game completion/edit     | **DB-materialised** (`leaguestandings`)                                  | exact invalidation points exist; read by 4+ endpoints                                |
| Player season stats / leaderboards / fantasy / DPOY | same                        | **DB-materialised** (`leagueplayerstats`); sort+slice at read            | O(T×G×E×R) → indexed find                                                            |
| Game final score + eventCount                       | on completion / event write | **denormalised fields on Game**                                          | removes events-loading from all list views                                           |
| Team season summaries (public team pages)           | on game completion          | DB-materialised or 60s memory cache                                      | same pattern, lower traffic                                                          |
| Public league/team/player pages (whole responses)   | as above                    | **HTTP `Cache-Control: public, max-age=30, stale-while-revalidate=300`** | anonymous, identical for all viewers; zero infra                                     |
| Completed game detail (`GET /games/:id`)            | rarely after completion     | HTTP long max-age + ETag once recap/summary settle                       | near-immutable                                                                       |
| Feed card display data                              | at post creation            | **denormalise into the Post doc**                                        | kills the read-time N+1                                                              |
| Explore/public-teams/opponents lists                | continuous but tolerant     | 60s in-process memory cache (LRU) until endpoints are rewritten          | stopgap for full scans                                                               |
| `/auth/me`                                          | per session                 | client cache (React Query `staleTime: 5m`)                               | one fetch per session, not per load                                                  |
| League/team/game detail in the client               | per mutation                | **React Query** keyed cache + `setQueryData` from mutation responses     | server already returns authoritative full payloads on mutations — free cache updates |
| Reference data (positions, stat types)              | never                       | client constants (already are) ✅                                        | —                                                                                    |

## Layer recommendations

1. **DB-persisted precomputation** — do first; see
   [28-computation-optimisation](./28-computation-optimisation.md) for the
   write-path design. Not a cache; removes the need for most server caching.
2. **React Query on the client** — second; detailed keys in
   [29-frontend-optimisation](./29-frontend-optimisation.md). Cuts duplicate
   fetch load on the API (league tabs, admin refetch-after-mutation) and
   gives request deduplication for free.
3. **HTTP caching for anonymous GETs** — trivial middleware; add
   `Vary: Cookie`-awareness (only cache when no auth cookie) or restrict to
   the public routers, which never personalise. CDN-compatible if the client
   is later fronted by one.
4. **In-process LRU+TTL** (e.g. `lru-cache`) — only as interim for leaders/
   explore before materialisation lands. Single instance today, so coherence
   is a non-issue; document that multi-instance deploys must revisit.
5. **Redis — not yet.** Adopt only when one of: multi-instance rate limiting,
   BullMQ queue, or cross-instance cache coherence becomes real. Everything
   above works without it.

## Invalidation map (for the materialised values)

| Write event                                    | Invalidates                                              |
| ---------------------------------------------- | -------------------------------------------------------- |
| Game finished / reopened / deleted             | standings, player stats, team summaries, game finalScore |
| Event append/edit/delete **on completed game** | same (in-progress games don't feed standings)            |
| League team created/archived/renamed           | standings row set / denormalised names                   |
| Roster changes, player claims                  | nothing materialised (display overlay stays read-time)   |

All of these funnel through a handful of service functions
(`finishGameForUser`, `appendEventForUser`, `updateEventForUser`,
`removeEventForUser`, `deleteGameForUser`, league-team CRUD) — a single
`recomputeLeagueAggregates(leagueId)` hook covers the map.
