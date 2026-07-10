// League Seasons backfill (Stage 1 of docs/league-seasons/000-SEASONS-TRACKER.md):
// creates one Season per pre-existing League (status: 'active'), sets
// League.currentSeasonId, and reassigns every existing league Game's seasonId
// to that season. Run BEFORE migrate-leaguestandings-season-index.js.
//
// Safe to re-run (idempotent): leagues that already have currentSeasonId are
// skipped entirely.
//
// Usage:
//   node src/scripts/backfill-league-seasons.js            # backfill all leagues
//   node src/scripts/backfill-league-seasons.js --dry-run  # report only, no writes

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');

require('../modules/games/games.repository');
require('../modules/leagues/leagues.repository');
require('../modules/leagues/seasons.repository');

const League = mongoose.model('League');
const Game = mongoose.model('Game');
const Season = mongoose.model('Season');
const LeagueStandings = mongoose.model('LeagueStandings');
const LeaguePlayerStats = mongoose.model('LeaguePlayerStats');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDb();

  const leagues = await League.find({ currentSeasonId: null }).select(
    '_id name seasonLabel ownerUserId createdAt'
  );
  let processed = 0;

  for (const league of leagues) {
    const gamesToReassign = await Game.countDocuments({
      gameContext: 'league',
      leagueId: league._id,
      seasonId: null,
    });

    if (dryRun) {
      console.log(
        `[dry-run] ${league._id} (${league.name}): would create Season "${
          league.seasonLabel || 'Season 1'
        }", reassign ${gamesToReassign} games, and clear legacy standings/player-stats docs`
      );
      processed += 1;
      continue;
    }

    const season = await Season.create({
      leagueId: league._id,
      label: league.seasonLabel || 'Season 1',
      status: 'active',
      startedAt: league.createdAt,
      createdByUserId: league.ownerUserId,
    });

    await Game.updateMany(
      { gameContext: 'league', leagueId: league._id, seasonId: null },
      { $set: { seasonId: season._id } }
    );

    league.currentSeasonId = season._id;
    await league.save();

    // Legacy {leagueId}-only-keyed docs (from before seasonId existed) — clear
    // so the next read compute-on-miss's a correctly (leagueId, seasonId)-keyed
    // doc instead of leaving an orphaned pre-migration row behind.
    await LeagueStandings.deleteMany({ leagueId: league._id, seasonId: null });
    await LeaguePlayerStats.deleteMany({ leagueId: league._id, seasonId: null });

    console.log(
      `${league._id} (${league.name}): created season ${season._id}, reassigned ${gamesToReassign} games`
    );
    processed += 1;
  }

  console.log(`${dryRun ? 'Reported' : 'Backfilled'} ${processed} leagues.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('League seasons backfill failed');
  console.error(error);
  process.exitCode = 1;
});
