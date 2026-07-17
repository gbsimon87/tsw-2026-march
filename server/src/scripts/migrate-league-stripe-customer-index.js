// Phase 6 / T-26 — unique sparse index on League.stripeCustomerId.
//
// Closes the league-create race (audit §1): the checkout webhook currently dedups
// by customer id in application code; a DB-level unique index makes the create path
// idempotent even under concurrent deliveries.
//
// Step 1 — dedup check: find Leagues sharing a non-null stripeCustomerId. If any,
//   ABORT with a report (billing data must be resolved by hand, never auto-merged).
// Step 2 — index: create { stripeCustomerId: 1 } unique + SPARSE (sparse so the many
//   null customer ids don't collide). Matched by KEY SHAPE, never by name (same
//   convention as migrate-leaguestandings-season-index.js) — skip if equivalent exists.
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

function keyShapesEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

async function findDuplicateCustomerIds(collection) {
  return collection
    .aggregate([
      { $match: { stripeCustomerId: { $ne: null } } },
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
    await disconnectDb();
    process.exitCode = 1;
    return;
  }
  console.log('[ok] no duplicate stripeCustomerId values.');

  // Step 2 — index (key-shape match; skip if an equivalent unique index exists).
  const existing = await collection.listIndexes().toArray();
  const already = existing.some((idx) => keyShapesEqual(idx.key, NEW_SHAPE) && idx.unique);
  if (already) {
    console.log('[skip] unique { stripeCustomerId: 1 } already exists.');
    await disconnectDb();
    return;
  }

  if (dryRun) {
    console.log('[dry-run] would create unique + sparse { stripeCustomerId: 1 }.');
    await disconnectDb();
    return;
  }

  await collection.createIndex(NEW_SHAPE, { unique: true, sparse: true });
  console.log('[created] unique + sparse { stripeCustomerId: 1 }.');

  await disconnectDb();
}

main().catch((error) => {
  console.error('League stripeCustomerId index migration failed');
  console.error(error);
  process.exitCode = 1;
});
