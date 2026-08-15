// Read-only migration-state report. Answers one question: has the league-season
// migration (docs/league-seasons.md) actually completed in this environment, or
// is it still mid-expand?
//
// This script only counts documents and lists indexes. It performs no writes of
// any kind and is safe to run against production.
//
// Usage:
//   ENV_FILE=../env/server/.env.production node src/scripts/check-migration-state.js

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');

require('../modules/games/games.repository');
require('../modules/leagues/leagues.repository');
require('../modules/leagues/seasons.repository');
require('../modules/milestones/milestones.repository');

const League = mongoose.model('League');
const Game = mongoose.model('Game');
const LeagueStandings = mongoose.model('LeagueStandings');
const LeaguePlayerStats = mongoose.model('LeaguePlayerStats');
const PlayerMilestone = mongoose.model('PlayerMilestone');

function line(label, value) {
  console.log(`  ${label.padEnd(46)} ${value}`);
}

// The seasons backfill is complete when nothing is left holding a null
// seasonId. Any non-zero count here means legacy rows are still live.
async function reportSeasonState() {
  const [leaguesWithoutSeason, totalLeagues, gamesWithoutSeason, standings, playerStats] =
    await Promise.all([
      League.countDocuments({ currentSeasonId: null }),
      League.countDocuments({}),
      Game.countDocuments({ gameContext: 'league', seasonId: null }),
      LeagueStandings.countDocuments({ seasonId: null }),
      LeaguePlayerStats.countDocuments({ seasonId: null }),
    ]);

  console.log('\nLeague seasons migration');
  line('Leagues total', totalLeagues);
  line('Leagues with no currentSeasonId', leaguesWithoutSeason);
  line('League games with seasonId: null', gamesWithoutSeason);
  line('LeagueStandings with seasonId: null', standings);
  line('LeaguePlayerStats with seasonId: null', playerStats);

  return leaguesWithoutSeason + gamesWithoutSeason + standings + playerStats;
}

// migrate-leaguestandings-season-index.js swaps the interim non-unique
// {leagueId, seasonId} indexes for unique ones. Matching by key shape rather
// than name mirrors that script's own convention.
async function reportIndexState() {
  console.log('\nSeason index migration');

  const targets = [
    { model: LeagueStandings, label: 'leaguestandings', key: ['leagueId', 'seasonId'] },
    {
      model: LeaguePlayerStats,
      label: 'leagueplayerstats',
      key: ['leagueId', 'seasonId', 'leagueTeamId', 'leaguePlayerId'],
    },
  ];

  let interimRemaining = 0;

  for (const target of targets) {
    const indexes = await target.model.collection.indexes();
    const match = indexes.find(
      (index) => JSON.stringify(Object.keys(index.key)) === JSON.stringify(target.key)
    );

    if (!match) {
      line(`${target.label} {${target.key.join(', ')}}`, 'MISSING');
      continue;
    }

    const unique = match.unique === true;
    if (!unique) interimRemaining += 1;
    line(
      `${target.label} {${target.key.join(', ')}}`,
      unique ? 'unique (migrated)' : 'NON-UNIQUE (interim)'
    );
  }

  return interimRemaining;
}

// Milestone idempotency depends entirely on the dedupeKey unique index, and
// autoIndex is off in production, so its absence is worth surfacing.
async function reportMilestoneState() {
  console.log('\nPlayer milestones');

  const total = await PlayerMilestone.countDocuments({});
  line('PlayerMilestone records', total);

  const indexes = await PlayerMilestone.collection.indexes();
  const dedupe = indexes.find((index) => Object.keys(index.key).includes('dedupeKey'));
  line('dedupeKey unique index', dedupe?.unique === true ? 'present' : 'MISSING');

  // Games finalized before the box score was frozen on completion (OPT-012)
  // yield no milestones and are silently skipped by the backfill.
  const missingBoxScore = await Game.countDocuments({
    gameContext: 'league',
    status: 'completed',
    boxScore: null,
  });
  line('Completed league games with no boxScore', missingBoxScore);
}

async function main() {
  await connectDb();

  try {
    console.log(`\nDatabase: ${mongoose.connection.name}`);
    console.log('Read-only report. No documents are modified.');

    const legacyRows = await reportSeasonState();
    const interimIndexes = await reportIndexState();
    await reportMilestoneState();

    console.log('\nVerdict');
    if (legacyRows === 0 && interimIndexes === 0) {
      console.log('  The league-season migration is complete in this database.');
      console.log('  The backfill scripts have no remaining work here.');
    } else if (legacyRows > 0) {
      console.log(`  ${legacyRows} document(s) still carry a null seasonId.`);
      console.log('  backfill-league-seasons.js has NOT completed here. Keep it.');
    } else {
      console.log('  Data is migrated, but interim non-unique indexes remain.');
      console.log('  migrate-leaguestandings-season-index.js has not run. Keep it.');
    }
    console.log('');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Migration state check failed');
  console.error(error);
  process.exitCode = 1;
});
