const mongoose = require('mongoose');
const { applyIdCursor, buildCursorPage } = require('../../utils/pagination');
const { paginationQuerySchema } = require('../../modules/shared/pagination.validation');

function oid() {
  return new mongoose.Types.ObjectId();
}

describe('pagination helpers (OPT-018)', () => {
  describe('applyIdCursor', () => {
    test('returns the query unchanged on the first page (no cursor)', () => {
      const query = { ownerUserId: 'u1' };
      expect(applyIdCursor(query, null)).toBe(query);
      expect(applyIdCursor(query, undefined)).toBe(query);
    });

    test('merges an $lt _id clause without mutating the original query', () => {
      const query = { ownerUserId: 'u1' };
      const id = oid();
      const next = applyIdCursor(query, String(id));

      expect(query).toEqual({ ownerUserId: 'u1' }); // untouched
      expect(next.ownerUserId).toBe('u1');
      expect(next._id.$lt).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(String(next._id.$lt)).toBe(String(id));
    });

    test('rejects an invalid cursor with a 400-tagged error', () => {
      try {
        applyIdCursor({}, 'not-an-object-id');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.message).toBe('Invalid cursor');
        expect(err.status).toBe(400);
      }
    });
  });

  describe('buildCursorPage', () => {
    test('emits nextCursor when the over-fetch shows a further page', () => {
      // limit=2, repo fetched limit+1=3 rows.
      const rows = [{ _id: oid() }, { _id: oid() }, { _id: oid() }];
      const { items, nextCursor } = buildCursorPage(rows, 2);

      expect(items).toHaveLength(2);
      expect(items).toEqual([rows[0], rows[1]]); // the extra row is trimmed
      expect(nextCursor).toBe(String(rows[1]._id)); // cursor = last EMITTED item
    });

    test('nextCursor is null when the batch did not exceed the limit', () => {
      const rows = [{ _id: oid() }, { _id: oid() }];
      const { items, nextCursor } = buildCursorPage(rows, 2);

      expect(items).toHaveLength(2);
      expect(nextCursor).toBeNull();
    });

    test('handles an empty result set', () => {
      const { items, nextCursor } = buildCursorPage([], 20);
      expect(items).toEqual([]);
      expect(nextCursor).toBeNull();
    });

    test('paging with the returned cursor never drops or duplicates rows', () => {
      // Simulate a full collection of 5 ids (descending, newest first) and page
      // through it at limit=2 using the helper's own cursor each time.
      const ids = [oid(), oid(), oid(), oid(), oid()].sort((a, b) =>
        String(b._id ?? b) > String(a._id ?? a) ? 1 : -1
      );
      const all = ids.map((id) => ({ _id: id }));

      function fetchPage(cursor, limit) {
        // mimic: Game.find(applyIdCursor(query, cursor)).sort({_id:-1}).limit(limit+1)
        let pool = all;
        if (cursor) {
          pool = all.filter((r) => String(r._id) < String(cursor));
        }
        return pool.slice(0, limit + 1);
      }

      const seen = [];
      let cursor = null;
      for (let guard = 0; guard < 10; guard += 1) {
        const rows = fetchPage(cursor, 2);
        const page = buildCursorPage(rows, 2);
        seen.push(...page.items.map((r) => String(r._id)));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      const expected = all.map((r) => String(r._id));
      expect(seen).toEqual(expected); // exact order, no dup, no drop
      expect(new Set(seen).size).toBe(expected.length);
    });
  });

  describe('paginationQuerySchema', () => {
    test('defaults limit to 20 and leaves cursor absent when query is empty', () => {
      expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 });
    });

    test('coerces a numeric-string limit', () => {
      expect(paginationQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    });

    test('rejects a limit above the max', () => {
      expect(() => paginationQuerySchema.parse({ limit: '999' })).toThrow();
    });

    test('rejects a non-positive limit', () => {
      expect(() => paginationQuerySchema.parse({ limit: '0' })).toThrow();
      expect(() => paginationQuerySchema.parse({ limit: '-5' })).toThrow();
    });

    test('accepts a valid 24-hex cursor and rejects a malformed one', () => {
      const valid = new mongoose.Types.ObjectId().toString();
      expect(paginationQuerySchema.parse({ cursor: valid }).cursor).toBe(valid);
      expect(() => paginationQuerySchema.parse({ cursor: 'nope' })).toThrow();
    });
  });
});
