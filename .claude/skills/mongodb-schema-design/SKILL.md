---
name: mongodb-schema-design
description: Use when adding or changing a Mongoose schema, deciding embed vs reference, adding indexes, writing aggregations, or reviewing/optimizing queries in this project. Trigger on "schema", "model", "collection", "Mongoose", "aggregation", "index", "populate", ".lean()", or "materialize".
---

# TSW MongoDB / Mongoose Patterns

Schemas here are **defined inline inside `server/src/modules/<domain>/<domain>.repository.js`**
— there is no `models/` directory. Guard registration so tests can re-import:

```js
const teamSchema = new mongoose.Schema(
  {
    /* ... */
  },
  { timestamps: true }
);
const Team = mongoose.models.Team || mongoose.model('Team', teamSchema);
```

The 15 collections and their owning modules are listed in
`docs/PROJECT-KNOWLEDGE.md` §5. Read it before adding a new one.

## Embed vs reference — how this repo actually decides

- **Game events are embedded** in the `Game` document (an array on the doc), not a
  separate collection. Box scores, recaps, replay, and public summaries are all
  derived from that embedded event list. Follow this pattern for data that is
  always read with its parent and bounded per game.
- **Leagues reference**: `LeagueTeam`, `LeaguePlayer`, `LeagueTeamMember`,
  `LeagueJoinRequest`, `LeagueManager`, `LeagueStandings`, `LeaguePlayerStats` are
  all separate collections keyed by `leagueId` — they grow, are queried
  independently, and are materialized separately.
- Rule of thumb, as applied here: unbounded or independently-queried → reference;
  bounded and always-co-read → embed.

## Standard schema conventions

1. `{ timestamps: true }` in options — never hand-roll `createdAt`/`updatedAt`.
2. `select: false` on secrets (hashed tokens, refresh-token hashes).
3. Schema-level validation (`required`, `enum`, `default`) — the `Game` stat/zone
   enums come from `modules/shared/stats.constants.js`; reuse those constants,
   don't re-list literals.
4. Compound indexes for real query paths, e.g.
   `gameSchema.index({ ownerUserId: 1, teamId: 1, createdAt: -1 })`.
5. **TTL indexes** on ephemeral docs: `Session.expiresAt` and `AuthToken.expiresAt`
   use `{ expireAfterSeconds: 0 }`.
6. **Optimistic concurrency** is enabled on the `Game` schema
   (`optimisticConcurrency: true`) so concurrent co-tracker saves throw a
   `VersionError` (→ 409). Preserve this on any change to the event-append path.

## Read patterns used here

- **`.lean()`** on read-only list/public queries (they return plain objects, no
  save). Only add `.lean()` after confirming the caller never `.save()`s the result
  — trace it, don't assume.
- **Keyset (cursor) pagination** via `utils/pagination.js` (`applyIdCursor`,
  `buildCursorPage`, pages on `_id: -1`, `DEFAULT_PAGE_LIMIT=20`,
  `MAX_PAGE_LIMIT=50`). Repos paginate **only when a `limit` is passed**, so
  internal callers stay unbounded. Response adds `nextCursor` beside the existing
  array key.
- **Materialization over read-time compute** (the standing OPT direction):
  standings (`LeagueStandings`), league player stats (`LeaguePlayerStats`), team
  season summaries (`TeamSeasonSummary`), and frozen
  `Game.finalScore`/`eventCount`/`boxScore`/`gameSummary`. The pattern is:
  **compute-on-miss + persist** (self-healing, reversible, no migration) with a
  **post-response `setImmediate` recompute** fired from write triggers, guarded by
  an in-flight dirty-flag so a concurrent write isn't dropped. Reuse the shared
  accumulator in `modules/shared/statSummary.js` — do not duplicate stat loops.

## Aggregation

- `$match` first; `$project` to drop fields before `$lookup`/`$group`.
- The house decision (Decisions log) is **materialize, don't rewrite stat JS loops
  into `$group`** — aggregation stays for ad-hoc reads (counts, shareable search),
  not for the hot standings/stats paths.

## Mistakes to catch in review

- `find()` then filter in JS instead of filtering in the query (the public-scan bug
  fixed in OPT-004 — use projected/limited finders like `listPublicCompletedGames`).
- Missing `.lean()` on a genuinely read-only path (or adding it where the result is
  later `.save()`d).
- `findByIdAndUpdate` without `{ new: true, runValidators: true }`.
- Adding a field to a sub-schema (e.g. `participant`) but forgetting it must be
  **declared** — Mongoose silently drops undeclared fields on save (the OPT-022
  `participant.slug` bug). New persisted field → new schema path + a backfill script.
- Webhook idempotency: use the atomic `claim*WebhookEvent` gated `findOneAndUpdate`
  (`utils/webhookIdempotency.js`), never read-check-write.

## References

- `references/aggregation-recipes.md` — pipeline patterns.
