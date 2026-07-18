// Phase 6 / T-26 — unique sparse index on League.stripeCustomerId.
//
// Closes the league-create race (audit §1): the checkout webhook currently dedups
// by customer id in application code; a DB-level unique index makes the create path
// idempotent even under concurrent deliveries.
//
// Step 1 — dedup check: find Leagues sharing a non-null stripeCustomerId. If any,
//   ABORT with a report (billing data must be resolved by hand, never auto-merged).
// Step 2 — index: create { stripeCustomerId: 1 } unique + PARTIAL (partialFilter
//   stripeCustomerId is a string). Audit C3: a SPARSE index only skips docs where
//   the field is *missing* — but the schema defaults stripeCustomerId to null, so
//   nearly every league stores an explicit null and a sparse unique index would
//   abort with E11000 on the second null. A partial index on { $type:'string' }
//   indexes only real customer ids. Matched by KEY SHAPE + partialFilter, never by
//   name (same convention as migrate-leaguestandings-season-index.js).
//
// - Reversible: drop the index.
// - --dry-run: reports would-be dupes and whether the index already exists.
//
// Usage:
//   node src/scripts/migrate-league-stripe-customer-index.js --dry-run
//   node src/scripts/migrate-league-stripe-customer-index.js

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');

require('../modules/leagues/leagues.repository');

const NEW_SHAPE = { stripeCustomerId: 1 };
// Audit C3: index only real (string) customer ids, not the explicit null the
// schema default writes to nearly every league doc.
const PARTIAL_FILTER = { stripeCustomerId: { $type: 'string' } };

function keyShapesEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

async function findDuplicateCustomerIds(collection) {
  return collection
    .aggregate([
      // Match the SAME predicate the partial index uses (audit C3): only string
      // customer ids can collide — an explicit-null pileup is fine under a partial.
      { $match: { stripeCustomerId: { $type: 'string' } } },
      { $group: { _id: '$stripeCustomerId', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDb();

  const collection = mongoose.connection.collection('leagues');

  // Step 1 — dedup check (always, even on a real run).
  const dupes = await findDuplicateCustomerIds(collection);
  if (dupes.length > 0) {
    console.error('[abort] Leagues share a stripeCustomerId — resolve manually before indexing:');
    for (const d of dupes) {
      console.error(`  ${d._id}: ${d.count} leagues (${d.ids.join(', ')})`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('[ok] no duplicate stripeCustomerId values.');

  // Step 2 — index (key-shape + partialFilter match; skip if equivalent exists).
  const existing = await collection.listIndexes().toArray();
  const already = existing.some(
    (idx) =>
      keyShapesEqual(idx.key, NEW_SHAPE) &&
      idx.unique &&
      JSON.stringify(idx.partialFilterExpression) === JSON.stringify(PARTIAL_FILTER)
  );
  if (already) {
    console.log('[skip] unique + partial { stripeCustomerId: 1 } already exists.');
    return;
  }

  if (dryRun) {
    console.log('[dry-run] would create unique + partial { stripeCustomerId: 1 }.');
    return;
  }

  await collection.createIndex(NEW_SHAPE, {
    unique: true,
    partialFilterExpression: PARTIAL_FILTER,
  });
  console.log('[created] unique + partial { stripeCustomerId: 1 }.');
}

main()
  .catch((error) => {
    console.error('League stripeCustomerId index migration failed');
    console.error(error);
    process.exitCode = 1;
  })
  // Audit H5: always disconnect so a failed run exits instead of hanging.
  .finally(() => disconnectDb().catch(() => {}));
