# Aggregation Recipes (TSW)

Reminder: the house rule is **materialize, don't rewrite stat loops into `$group`**
(see the tracker's Decisions log). Use aggregation for ad-hoc reads — counts,
lookups, shareable search — not for the hot standings/player-stat paths, which are
materialized via `modules/shared/statSummary.js` + compute-on-miss.

## Keyset pagination is preferred over `$skip`/`$facet`

For list endpoints, prefer the keyset helpers in `utils/pagination.js`
(`_id: -1` cursor) over `$skip`-based aggregation — `$skip` degrades on large
offsets. Only reach for `$facet` when you genuinely need a total count in the same
round-trip on a non-paginated admin view.

```js
// $facet: paginated data + total count in one query (use sparingly)
const [result] = await Game.aggregate([
  { $match: { ownerUserId } },
  { $sort: { createdAt: -1 } },
  {
    $facet: {
      data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      totalCount: [{ $count: 'count' }],
    },
  },
]);
const total = result.totalCount[0]?.count ?? 0;
```

## Batch hydrate references (the OPT-017 pattern — avoid N+1)

Instead of one query per post/creator, collect ids and `$in` once
(`findUsersByIds` in `auth.repository.js`):

```js
const creatorIds = [...new Set(posts.map((p) => p.creatorId))];
const creators = await User.find({ _id: { $in: creatorIds } }).lean();
```

## Join + reshape (when you can't denormalize)

```js
await LeagueGame.aggregate([
  { $match: { leagueId } },
  { $lookup: { from: 'leagueteams', localField: 'homeTeamId', foreignField: '_id', as: 'home' } },
  { $unwind: '$home' },
  { $project: { finalScore: 1, scheduledAt: 1, 'home.name': 1, 'home.slug': 1 } },
]);
```

## Counts (e.g. events per game, games per team)

```js
await Game.aggregate([
  { $match: { teamId } },
  { $group: { _id: '$status', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]);
```

Prefer projecting `-events` / using the denormalized `Game.eventCount` (OPT-008)
over unwinding the embedded events array when you only need a count.
