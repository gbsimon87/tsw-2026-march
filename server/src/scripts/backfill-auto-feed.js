// Auto Feed Generation backfill (docs/auto-feed-generation/000-TRACKER.md):
// seeds auto-generated game_card/highlight_clip posts for already-completed
// public-league games — covers games finalised before AUTO_FEED_ENABLED was
// turned on, and games in a league that was private at finalise time but has
// since been made public (B1 in the tracker: auto-publish only fires at
// finalise, so those two cases never get auto-posts any other way).
//
// Idempotent: reuses feed.service.js#autoPublishForFinalizedGame, the same
// entry point the live finalise trigger calls — its own game-card/highlight
// dedup (partial unique index + unique eventId index) makes re-running this
// script safe.
//
// Usage:
//   node src/scripts/backfill-auto-feed.js
//   node src/scripts/backfill-auto-feed.js --dry-run

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');

require('../modules/auth/auth.repository');
require('../modules/leagues/leagues.repository');
require('../modules/feed/feed.repository');
require('../modules/games/games.repository');

const Game = mongoose.model('Game');
const League = mongoose.model('League');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDb();

  const publicLeagueIds = (
    await League.find({ isPublic: true, status: 'active' }, { _id: 1 }).lean()
  ).map((l) => l._id);

  const cursor = Game.find({
    gameContext: 'league',
    leagueId: { $in: publicLeagueIds },
    status: 'completed',
  })
    .select('_id')
    .cursor();

  let scanned = 0;
  let processed = 0;

  if (dryRun) {
    for (let game = await cursor.next(); game != null; game = await cursor.next()) {
      scanned += 1;
      console.log(`[dry-run] would auto-publish for game ${game._id}`);
    }
    console.log(`Scanned ${scanned} completed public-league games (dry-run, no writes).`);
    await mongoose.disconnect();
    return;
  }

  // Lazy require: feed.service.js requires games.service.js/leagues.service.js,
  // which in turn require repositories already registered above.
  const { autoPublishForFinalizedGame } = require('../modules/feed/feed.service');

  for (let game = await cursor.next(); game != null; game = await cursor.next()) {
    scanned += 1;
    try {
      await autoPublishForFinalizedGame(game._id);
      processed += 1;
    } catch (error) {
      console.error(`Failed to auto-publish for game ${game._id}:`, error.message);
    }
  }

  console.log(`Scanned ${scanned} completed public-league games; processed ${processed}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('backfill-auto-feed failed');
  console.error(error);
  process.exitCode = 1;
});
