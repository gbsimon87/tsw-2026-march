// OPT-007 migration: drop indexes proven dead by static analysis (no query
// anywhere in the codebase filters on them), plus 4 that are fully redundant
// because their field already starts a compound index ({field:1, createdAt:-1}
// covers any query the single-field version could have served).
//
// Matches indexes by their KEY SHAPE (the actual {field: 1} definition on the
// live collection), never by name — safe even if a name differs from the
// local convention (e.g. a differently-versioned Mongo/Atlas). Only ever
// drops an index whose key shape is an EXACT single-field match for one of
// the candidates below; never touches a compound or an index it doesn't
// recognise.
//
// Safe to re-run (idempotent): skips any candidate that's already gone.
//
// Usage:
//   node src/scripts/migrate-drop-dead-indexes.js            # drop for real
//   node src/scripts/migrate-drop-dead-indexes.js --dry-run  # report only

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');

require('../modules/games/games.repository');

// Each candidate's key shape must match EXACTLY (same fields, same direction,
// nothing extra) — a compound sharing a prefix is a different shape and is
// intentionally left untouched.
const DEAD_INDEX_KEY_SHAPES = [
  { homeTeamId: 1 }, // redundant — covered by {homeTeamId:1, createdAt:-1}
  { awayTeamId: 1 }, // redundant — covered by {awayTeamId:1, createdAt:-1}
  { homeLeagueTeamId: 1 }, // redundant — covered by {homeLeagueTeamId:1, createdAt:-1}
  { awayLeagueTeamId: 1 }, // redundant — covered by {awayLeagueTeamId:1, createdAt:-1}
  { 'events.teamSide': 1 }, // unqueried multikey index — write cost on every event append
  { 'homeParticipant.teamId': 1 }, // unqueried
  { 'awayParticipant.teamId': 1 }, // unqueried
  { 'homeParticipant.leagueTeamId': 1 }, // unqueried
  { 'awayParticipant.leagueTeamId': 1 }, // unqueried
];

function keyShapesEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDb();

  const collection = mongoose.connection.collection('games');
  const existingIndexes = await collection.listIndexes().toArray();

  let dropped = 0;
  let skipped = 0;

  for (const candidateKey of DEAD_INDEX_KEY_SHAPES) {
    const match = existingIndexes.find((idx) => keyShapesEqual(idx.key, candidateKey));

    if (!match) {
      skipped += 1;
      console.log(`[skip] no live index matches ${JSON.stringify(candidateKey)} (already gone)`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would drop "${match.name}" (${JSON.stringify(match.key)})`);
      dropped += 1;
      continue;
    }

    await collection.dropIndex(match.name);
    console.log(`[dropped] "${match.name}" (${JSON.stringify(match.key)})`);
    dropped += 1;
  }

  console.log(
    `${dryRun ? 'Would drop' : 'Dropped'} ${dropped} index(es); ${skipped} already absent.`
  );
  await disconnectDb();
}

main().catch((error) => {
  console.error('Index migration failed');
  console.error(error);
  process.exitCode = 1;
});
