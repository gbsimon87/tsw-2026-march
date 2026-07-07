# Common Aggregation Pipeline Recipes

## Paginated results + total count in one query

```js
const [result] = await Order.aggregate([
  { $match: { userId } },
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

## Join + reshape (replaces manual populate + map)

```js
await Order.aggregate([
  { $match: { status: 'pending' } },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user',
    },
  },
  { $unwind: '$user' },
  {
    $project: {
      total: 1,
      status: 1,
      'user.name': 1,
      'user.email': 1,
    },
  },
]);
```

## Group with counts (e.g., orders per status)

```js
await Order.aggregate([
  { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
  { $sort: { count: -1 } },
]);
```

## Date bucketing (e.g., signups per day)

```js
await User.aggregate([
  {
    $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      count: { $sum: 1 },
    },
  },
  { $sort: { _id: 1 } },
]);
```
