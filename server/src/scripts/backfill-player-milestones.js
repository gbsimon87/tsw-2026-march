// Player Milestones backfill (docs/player-milestones.md §9). Replays completed
// league games in chronological order through the same detection function used
// at finalize, with publishing disabled. The dedupeKey unique index makes every
// run idempotent.
//
// Run this only after backfill-league-seasons.js, because milestone career
// totals are assembled from the season-scoped LeaguePlayerStats materialisation.
//
// Usage:
//   node src/scripts/backfill-player-milestones.js --dry-run
//   node src/scripts/backfill-player-milestones.js

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');

require('../modules/auth/auth.repository');
require('../modules/leagues/leagues.repository');
require('../modules/feed/feed.repository');
require('../modules/games/games.repository');
require('../modules/milestones/milestones.repository');

const League = mongoose.model('League');

function chronologicalTime(game) {
  return new Date(game.completedAt || game.scheduledAt || game.createdAt || 0).getTime();
}

async function run({ dryRun }) {
  const { listLeagueGamesByLeagueId } = require('../modules/games/games.repository');
  const { detectForFinalizedGame } = require('../modules/milestones/milestones.service');

  // Records belong to players in every league. Visibility gates only Pulse
  // publishing and anonymous reads, never detection or backfill.
  const leagues = await League.find({}).select('_id name').lean();
  let totalGames = 0;
  let totalCreated = 0;

  for (const league of leagues) {
    const games = await listLeagueGamesByLeagueId(league._id);
    const completed = games
      .filter((game) => game.status === 'completed')
      .sort((a, b) => chronologicalTime(a) - chronologicalTime(b));

    for (const game of completed) {
      totalGames += 1;
      if (dryRun) continue;

      const { created } = await detectForFinalizedGame(game._id, { publish: false });
      totalCreated += created.length;
    }

    console.log(`${league.name}: ${completed.length} completed games processed`);
  }

  console.log(
    dryRun
      ? `DRY RUN: would replay ${totalGames} completed league games`
      : `Replayed ${totalGames} games, created ${totalCreated} milestones`
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDb();
  try {
    await run({ dryRun });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Player milestone backfill failed');
  console.error(error);
  process.exitCode = 1;
});
