// OPT-008 backfill: populate Game.finalScore and Game.eventCount for
// pre-existing games so list endpoints can eventually stop loading the full
// events array.
//
// Safe to re-run (idempotent): recomputes and overwrites the two denormalised
// fields from the authoritative events array every time. Does not touch events.
//
// Usage:
//   node src/scripts/backfill-game-finalscore.js            # backfill all games
//   node src/scripts/backfill-game-finalscore.js --dry-run  # report only, no writes
//   node src/scripts/backfill-game-finalscore.js --completed-only

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { summarizeEvents, summarizeEventsBySide } = require('../modules/shared/statSummary');

require('../modules/games/games.repository');

const Game = mongoose.model('Game');

function computeFinalScore(game) {
  if (game.trackingMode === 'dual_team') {
    const summary = summarizeEventsBySide(game.events || []);
    return { home: summary.home.points, away: summary.away.points };
  }
  const summary = summarizeEvents(game.events || []);
  return { home: summary.points, away: summary.opponentPoints || 0 };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const completedOnly = process.argv.includes('--completed-only');

  await connectDb();

  const filter = completedOnly ? { status: 'completed' } : {};
  const cursor = Game.find(filter).cursor();

  let scanned = 0;
  let updated = 0;

  for (let game = await cursor.next(); game != null; game = await cursor.next()) {
    scanned += 1;
    const finalScore = computeFinalScore(game);
    const eventCount = Array.isArray(game.events) ? game.events.length : 0;

    const scoreChanged =
      !game.finalScore ||
      game.finalScore.home !== finalScore.home ||
      game.finalScore.away !== finalScore.away;
    const countChanged = game.eventCount !== eventCount;

    if (!scoreChanged && !countChanged) {
      continue;
    }

    updated += 1;
    if (dryRun) {
      console.log(
        `[dry-run] ${game._id}: finalScore=${JSON.stringify(finalScore)} eventCount=${eventCount}`
      );
      continue;
    }

    game.finalScore = finalScore;
    game.eventCount = eventCount;
    await game.save();
  }

  console.log(`Scanned ${scanned} games; ${dryRun ? 'would update' : 'updated'} ${updated}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Backfill failed');
  console.error(error);
  process.exitCode = 1;
});
