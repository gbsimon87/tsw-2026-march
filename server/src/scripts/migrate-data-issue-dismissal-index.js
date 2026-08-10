// Data Health — unique index on LeagueDataIssueDismissal.
//
// Why this script exists at all: OPT-007 disables Mongoose autoIndex in
// production (see config/db.js), so a schema-declared index is created in
// dev/test only. Without this migration the unique constraint on
// { leagueId, seasonId, issueKey } would simply not exist in production, and
// the idempotent re-dismiss guarantee the API documents
// (docs/api.md, "re-dismissing is idempotent rather than an error") would hold
// in dev but not in prod: two concurrent upserts could each miss the other's
// document and insert a duplicate row.
//
// Step 1 — dedup check: find any (leagueId, seasonId, issueKey) group with more
//   than one document. Duplicates can only exist if the collection was written
//   without the index (i.e. exactly the situation this script repairs). They are
//   safe to auto-resolve — a dismissal carries no state beyond "an admin
//   dismissed this", so keeping the OLDEST and dropping the rest preserves the
//   original judgement and its `note`. Reported either way.
// Step 2 — index: create { leagueId: 1, seasonId: 1, issueKey: 1 } unique.
//   Matched by KEY SHAPE, never by name (same convention as
//   migrate-leaguestandings-season-index.js).
//
// - Idempotent: skips when the unique index is already present.
// - Reversible: drop the index.
// - --dry-run: reports duplicates and whether the index already exists, writes
//   nothing.
//
// Usage:
//   ENV_FILE=../env/server/.env.production node src/scripts/migrate-data-issue-dismissal-index.js --dry-run
//   ENV_FILE=../env/server/.env.production node src/scripts/migrate-data-issue-dismissal-index.js

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');

require('../modules/leagues/dataCompleteness.repository');

const COLLECTION_NAME = 'leaguedataissuedismissals';
const NEW_SHAPE = { leagueId: 1, seasonId: 1, issueKey: 1 };

function keyShapesEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

async function findDuplicateGroups(collection) {
  return collection
    .aggregate([
      {
        $group: {
          _id: { leagueId: '$leagueId', seasonId: '$seasonId', issueKey: '$issueKey' },
          ids: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDb();

  const collection = mongoose.connection.collection(COLLECTION_NAME);

  const existingIndexes = await collection.listIndexes().toArray();
  const alreadyMigrated = existingIndexes.some(
    (idx) => keyShapesEqual(idx.key, NEW_SHAPE) && idx.unique
  );

  if (alreadyMigrated) {
    console.log(`[skip] ${COLLECTION_NAME}: unique ${JSON.stringify(NEW_SHAPE)} already exists`);
    await disconnectDb();
    return;
  }

  // A unique index build fails outright if duplicates are present, so clear
  // them first — otherwise the migration aborts and the constraint never lands.
  const duplicateGroups = await findDuplicateGroups(collection);

  if (duplicateGroups.length > 0) {
    console.log(`[found] ${duplicateGroups.length} duplicate dismissal group(s)`);
    for (const group of duplicateGroups) {
      console.log(
        `  ${group._id.issueKey} (league ${group._id.leagueId}, season ${group._id.seasonId}): ${group.count} rows`
      );
    }
  } else {
    console.log(`[ok] ${COLLECTION_NAME}: no duplicates`);
  }

  if (dryRun) {
    const wouldDelete = duplicateGroups.reduce((sum, group) => sum + (group.count - 1), 0);
    console.log(
      `[dry-run] would delete ${wouldDelete} duplicate row(s) and create unique ${JSON.stringify(NEW_SHAPE)}`
    );
    await disconnectDb();
    return;
  }

  let deleted = 0;
  for (const group of duplicateGroups) {
    // Keep the oldest row: ObjectIds are monotonic by creation time, so the
    // smallest id is the original dismissal.
    const [, ...surplus] = group.ids.slice().sort((a, b) => (a > b ? 1 : -1));
    if (surplus.length === 0) continue;
    const result = await collection.deleteMany({ _id: { $in: surplus } });
    deleted += result?.deletedCount ?? 0;
  }

  if (deleted > 0) {
    console.log(`[deleted] ${deleted} duplicate dismissal row(s)`);
  }

  await collection.createIndex(NEW_SHAPE, { unique: true });
  console.log(`[created] ${COLLECTION_NAME}: unique ${JSON.stringify(NEW_SHAPE)}`);

  await disconnectDb();
}

main().catch((error) => {
  console.error('Data issue dismissal index migration failed');
  console.error(error);
  process.exitCode = 1;
});
