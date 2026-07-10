// League Seasons backfill (Stage 1, step 3 — run AFTER
// backfill-league-seasons.js has run to completion so every league has a
// resolvable currentSeasonId): swaps the additive, non-unique
// {leagueId, seasonId} indexes added to leaguestandings/leagueplayerstats for
// the real unique compound indexes.
//
// Matches indexes by KEY SHAPE, never by name (see migrate-drop-dead-indexes.js
// for the same convention). Safe to re-run (idempotent): skips any index that's
// already in its target shape.
//
// Usage:
//   node src/scripts/migrate-leaguestandings-season-index.js            # migrate for real
//   node src/scripts/migrate-leaguestandings-season-index.js --dry-run  # report only

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');

require('../modules/leagues/leagues.repository');

function keyShapesEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

async function migrateCollection({ collectionName, oldShape, newShape, newOptions }) {
  const dryRun = process.argv.includes('--dry-run');
  const collection = mongoose.connection.collection(collectionName);
  const existingIndexes = await collection.listIndexes().toArray();

  const alreadyMigrated = existingIndexes.some(
    (idx) => keyShapesEqual(idx.key, newShape) && idx.unique
  );
  if (alreadyMigrated) {
    console.log(`[skip] ${collectionName}: unique ${JSON.stringify(newShape)} already exists`);
    return;
  }

  const oldMatch = existingIndexes.find((idx) => keyShapesEqual(idx.key, oldShape));

  if (dryRun) {
    console.log(
      `[dry-run] ${collectionName}: would drop "${oldMatch?.name ?? '(not found)'}" and create unique ${JSON.stringify(newShape)}`
    );
    return;
  }

  if (oldMatch) {
    await collection.dropIndex(oldMatch.name);
    console.log(`[dropped] ${collectionName}: "${oldMatch.name}"`);
  }

  await collection.createIndex(newShape, { unique: true, ...newOptions });
  console.log(`[created] ${collectionName}: unique ${JSON.stringify(newShape)}`);
}

async function main() {
  await connectDb();

  await migrateCollection({
    collectionName: 'leaguestandings',
    oldShape: { leagueId: 1, seasonId: 1 },
    newShape: { leagueId: 1, seasonId: 1 },
  });

  await migrateCollection({
    collectionName: 'leagueplayerstats',
    oldShape: { leagueId: 1, seasonId: 1, leagueTeamId: 1, leaguePlayerId: 1 },
    newShape: { leagueId: 1, seasonId: 1, leagueTeamId: 1, leaguePlayerId: 1 },
  });

  await disconnectDb();
}

main().catch((error) => {
  console.error('Standings/player-stats season index migration failed');
  console.error(error);
  process.exitCode = 1;
});
