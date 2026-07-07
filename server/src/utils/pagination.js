// OPT-018: shared keyset (cursor) pagination helpers.
//
// Every list endpoint pages on `_id` descending — ObjectIds are monotonic by
// creation time, so `_id: -1` is the same newest-first order the owner lists
// already used (`createdAt: -1`) but with a unique, tie-free keyset field.
// `$lt: cursor` fetches everything strictly older than the last-seen id, so
// pages never overlap or drop rows even as new docs are inserted at the head.
//
// Usage in a repository:
//   return Game.find(applyIdCursor(query, cursor)).sort({ _id: -1 }).limit(limit + 1);
// then in the service:
//   return buildCursorPage(rows, limit);   // -> { items, nextCursor }
//
// The repo over-fetches by one (`limit + 1`) so the service can tell whether a
// further page exists without a second count query.

const mongoose = require('mongoose');

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

// Merge an `_id < cursor` clause into an existing query object (non-mutating).
// A falsy cursor returns the query unchanged (first page).
function applyIdCursor(query, cursor) {
  if (!cursor) return query;
  return { ...query, _id: { $lt: toObjectId(cursor) } };
}

// Turn an over-fetched (limit + 1) row array into a bounded page plus the
// cursor for the next one. `nextCursor` is null when there is no further page.
function buildCursorPage(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? String(last._id) : null;
  return { items, nextCursor };
}

function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const error = new Error('Invalid cursor');
    error.status = 400;
    throw error;
  }
  return new mongoose.Types.ObjectId(value);
}

module.exports = {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  applyIdCursor,
  buildCursorPage,
};
