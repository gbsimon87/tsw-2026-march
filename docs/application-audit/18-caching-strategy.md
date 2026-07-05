# Caching Strategy

> Part of the [Application Audit](./README.md) · July 2026

## Current state: there is no caching, anywhere

Verified across both apps:

- **Server**: no Redis, no in-memory cache, no memoisation of derived data, no
  `Cache-Control`/`ETag` headers on API responses. A grep for
  `cache|memo|redis|ttl` in the service layer returns zero hits. Every request
  recomputes everything from Mongo.
- **Client**: no React Query/SWR, no fetch cache, no localStorage/sessionStorage
  data cache. `client/src/lib/apiClient.js` is a bare fetch wrapper; every page
  mount refetches, and sibling pages refetch the same league/team data on each
  navigation.
- **Database**: no materialised/derived collections; standings, player stats,
  and leaderboards are recomputed from raw `Game.events` on every read.
- **CDN/HTTP**: Cloudinary assets do get CDN caching by nature of their URLs,
  but API responses (including fully public, heavy ones like league leaders)
  carry no cache headers.

The only cache-like construct is the CSRF token cookie, and the only
"precomputed" values are the Stripe entitlement snapshots embedded on game
participants.

## Consequences

1. Server CPU scales with (games × events) per league-page request rather than
   O(1) reads — the dominant scalability risk
   ([28-computation-optimisation](./28-computation-optimisation.md)).
2. Public endpoints are the most expensive **and** the most cacheable — worst
   possible pairing.
3. Client navigation feels slower than necessary (every tab switch = network
   round-trip) and multiplies server load.

## Recommended layers (in order of value; full rationale in [27-caching-opportunities](./27-caching-opportunities.md))

1. **Database-persisted precomputation (write-time materialisation)** — not
   strictly a cache, but it eliminates the biggest recomputation. Standings and
   per-player season aggregates stored on write, invalidated by game
   completion/event edits.
2. **Client cache: React Query** — query-keyed cache with
   staleTime, killing duplicate fetches across league tabs/pages and enabling
   optimistic tracker updates. Biggest UX win per unit effort.
3. **HTTP caching on public GETs** — `Cache-Control: public, max-age=30,
stale-while-revalidate=300` on `/public-leagues/*`, `/public/teams/*`,
   `GET /games/:id` for completed games (immutable-ish). Works today with zero
   infra; Render/CDN can honour it.
4. **In-process memory cache (LRU + TTL)** for hot derived data if
   materialisation is deferred — e.g. 30s TTL on league leaders. One instance
   deploy today, so no coherence problem yet.
5. **Redis** — only when (a) multi-instance deploys arrive (it would also fix
   the in-memory rate limiters) or (b) a queue (BullMQ) is adopted. Not
   justified by caching alone at current scale.

## What NOT to cache

- Auth/session endpoints, join-request state, billing state (webhook-driven,
  must be fresh), anything returning viewer-specific `canManage`/`viewerContext`
  payloads — unless keyed per user.
