// OPT-013 backfill: populate teamseasonsummaries by recomputing each
// standalone team's season summary from the live compute.
//
// Safe to re-run (idempotent): overwrites each team's summary with a fresh
// compute every time. Reads are self-backfilling anyway (compute-on-miss), so
// this is optional — but running it warms the collection and lets you verify
// materialised == live before relying on the fast path.
//
// Usage:
//   node src/scripts/backfill-team-season-summaries.js            # backfill all teams
//   node src/scripts/backfill-team-season-summaries.js --dry-run  # compute + parity report, no writes

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');

require('../modules/games/games.repository');
require('../modules/teams/teams.repository');

const {
  computeTeamSeasonSummary,
  recomputeTeamSeasonSummary,
} = require('../modules/teams/teams.service');

const Team = mongoose.model('Team');
const TeamSeasonSummary = mongoose.model('TeamSeasonSummary');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDb();

  const teams = await Team.find({}).select('_id name');
  let processed = 0;

  for (const team of teams) {
    const live = await computeTeamSeasonSummary(team._id);

    if (dryRun) {
      console.log(
        `[dry-run] ${team._id} (${team.name}): gamesCount=${live?.gamesCount ?? 0} points=${live?.points ?? 0}`
      );
    } else {
      const persisted = await recomputeTeamSeasonSummary(team._id);
      const stored = await TeamSeasonSummary.findOne({ teamId: team._id }).lean();
      const matches = JSON.stringify(stored?.summary) === JSON.stringify(live);
      console.log(
        `${team._id} (${team.name}): persisted gamesCount=${persisted?.gamesCount ?? 0}` +
          (matches ? '' : ' ⚠️ PARITY MISMATCH')
      );
    }
    processed += 1;
  }

  console.log(`${dryRun ? 'Reported' : 'Backfilled'} ${processed} teams.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Team season summary backfill failed');
  console.error(error);
  process.exitCode = 1;
});
