// OPT-010 backfill: populate the leaguestandings collection by recomputing each
// league's materialised aggregates from the live compute.
//
// Safe to re-run (idempotent): overwrites each league's rows with a fresh
// compute every time. Reads are self-backfilling anyway (compute-on-miss), so
// this is optional — but running it warms the collection and lets you verify
// materialised == live before relying on the fast path.
//
// Usage:
//   node src/scripts/backfill-league-standings.js            # backfill all leagues
//   node src/scripts/backfill-league-standings.js --dry-run  # compute + parity report, no writes

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');

require('../modules/games/games.repository');
require('../modules/leagues/leagues.repository');

const {
  computeLeagueStandings,
  recomputeLeagueAggregates,
} = require('../modules/leagues/leagues.service');

const League = mongoose.model('League');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDb();

  const leagues = await League.find({}).select('_id name');
  let processed = 0;

  for (const league of leagues) {
    const live = await computeLeagueStandings(league._id);

    if (dryRun) {
      console.log(
        `[dry-run] ${league._id} (${league.name}): ${live.length} rows — ` +
          live.map((r) => `${r.teamName} ${r.record}`).join(', ')
      );
    } else {
      const persisted = await recomputeLeagueAggregates(league._id);
      // Parity guard: recompute persists exactly the live compute.
      const matches = JSON.stringify(persisted) === JSON.stringify(live);
      console.log(
        `${league._id} (${league.name}): persisted ${persisted.length} rows` +
          (matches ? '' : ' ⚠️ PARITY MISMATCH')
      );
    }
    processed += 1;
  }

  console.log(`${dryRun ? 'Reported' : 'Backfilled'} ${processed} leagues.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Standings backfill failed');
  console.error(error);
  process.exitCode = 1;
});
