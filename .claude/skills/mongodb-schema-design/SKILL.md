---
name: mongodb-schema-design
description: Use when designing MongoDB schemas, writing Mongoose models, deciding between embedding vs referencing documents, adding indexes, writing aggregation pipelines, or reviewing/optimizing MongoDB queries for a MERN app. Trigger on mentions of "schema", "model", "collection", "Mongoose", "aggregation", "index", or "populate".
---

# MongoDB Schema Design (Mongoose)

## When to embed vs reference

- **Embed** when the sub-data is always accessed with the parent, has a bounded size (won't grow unbounded), and doesn't need to be queried independently. Example: a `shippingAddress` on an `Order`.
- **Reference** when the related data is large, grows unbounded (comments, orders, posts), is shared across multiple parents, or needs independent querying/pagination. Example: `Comment` documents referencing a `Post` by `postId`, not an array of comments embedded in the post.
- Rule of thumb: if an array could grow past ~100 items or grows indefinitely, reference instead of embed.

## Standard Mongoose model pattern

Always include:

1. Explicit `timestamps: true` in schema options — don't hand-roll `createdAt`/`updatedAt`.
2. `select: false` on sensitive fields (password hashes, tokens) so they're excluded by default.
3. Validation at the schema level (`required`, `min`, `max`, `enum`, custom `validate`) — don't rely solely on frontend/route validation.
4. An index on any field used in a `find`/`sort`/`filter` in production queries.

```js
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
```

## Indexing checklist

- Every field used in `.find({ field })`, `.sort({ field })`, or as a foreign-key reference should have an index.
- Compound indexes: order fields by equality-match fields first, then range/sort fields (ESR rule: Equality, Sort, Range).
- Use `.explain('executionStats')` to verify a query is using an index (`IXSCAN`) and not a full collection scan (`COLLSCAN`) before shipping.
- Don't over-index — every index adds write overhead. Only add what queries actually need.

## Aggregation pipelines

- Put `$match` as early as possible in the pipeline to reduce the working set before expensive stages like `$lookup` or `$group`.
- Use `$project` to drop unneeded fields before a `$lookup` to reduce memory use.
- For pagination inside aggregation, use `$facet` to get both paginated results and a total count in one query rather than two separate queries.
- See `references/aggregation-recipes.md` for common pipeline patterns (joins, grouping with counts, pagination).

## Common mistakes to catch in review

- Using `find()` then filtering in JS instead of filtering in the query — pushes work to the app server and pulls unnecessary data over the wire.
- Missing `.lean()` on read-only queries that don't need Mongoose document methods — `.lean()` returns plain JS objects and is significantly faster.
- Not handling `CastError` (invalid ObjectId) separately from `ValidationError` in error middleware.
- Using `findByIdAndUpdate` without `{ new: true, runValidators: true }` — without these, you get the stale document back and validators are skipped on update.
- Storing money as floating point `Number` instead of integer cents or a `Decimal128`.

## Population

- Use `.populate('field', 'onlyTheseFields')` to limit populated data instead of pulling the full referenced document.
- Avoid deep population chains (populating a populated field) in hot-path routes — consider denormalizing a small copy of frequently-needed fields instead (e.g., store `authorName` on a `Post` alongside `authorId`).
