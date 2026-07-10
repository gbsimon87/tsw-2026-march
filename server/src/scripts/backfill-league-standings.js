// OPT-010/011 backfill: populate leaguestandings + leagueplayerstats by
// recomputing each league's materialised aggregates from the live compute.
//
// Safe to re-run (idempotent): overwrites each league's rows with a fresh
// compute every time. Reads are self-backfilling anyway (compute-on-miss), so
// this is optional — but running it warms the collections and lets you verify
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
  computeLeaguePlayerStats,
  recomputeLeagueAggregates,
} = require('../modules/leagues/leagues.service');

const League = mongoose.model('League');
const LeaguePlayerStats = mongoose.model('LeaguePlayerStats');

function normalizePlayerRows(rows) {
  return rows
    .map((row) => ({
      leagueTeamId: String(row.leagueTeamId),
      leaguePlayerId: String(row.leaguePlayerId),
      gamesCount: row.gamesCount,
      points: row.points,
      reb: row.reb,
      ast: row.ast,
      stl: row.stl,
      blk: row.blk,
      tov: row.tov,
      foul: row.foul,
      ftm: row.ftm,
      fta: row.fta,
      fg2m: row.fg2m,
      fg2a: row.fg2a,
      fg3m: row.fg3m,
      fg3a: row.fg3a,
    }))
    .sort((a, b) => a.leaguePlayerId.localeCompare(b.leaguePlayerId));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDb();

  // League Seasons (docs/league-seasons/000-SEASONS-TRACKER.md): standings/
  // player-stats are now scoped per (league, season) — this script only
  // (re)computes each league's CURRENT season. Leagues without a
  // currentSeasonId yet haven't run backfill-league-seasons.js — skip them.
  const leagues = await League.find({ currentSeasonId: { $ne: null } }).select(
    '_id name currentSeasonId'
  );
  let processed = 0;

  for (const league of leagues) {
    const seasonId = league.currentSeasonId;
    const liveStandings = await computeLeagueStandings(league._id, seasonId);
    const livePlayerStats = await computeLeaguePlayerStats(league._id, seasonId);

    if (dryRun) {
      console.log(
        `[dry-run] ${league._id} (${league.name}): ${liveStandings.length} standings rows — ` +
          liveStandings.map((r) => `${r.teamName} ${r.record}`).join(', ')
      );
      console.log(`  ${livePlayerStats.length} player-stat rows would be persisted`);
    } else {
      const persistedStandings = await recomputeLeagueAggregates(league._id, seasonId);
      const persistedPlayerStats = await LeaguePlayerStats.find({
        leagueId: league._id,
        seasonId,
      }).lean();

      const standingsMatch = JSON.stringify(persistedStandings) === JSON.stringify(liveStandings);
      const playerStatsMatch =
        JSON.stringify(normalizePlayerRows(persistedPlayerStats)) ===
        JSON.stringify(normalizePlayerRows(livePlayerStats));

      console.log(
        `${league._id} (${league.name}): persisted ${persistedStandings.length} standings rows` +
          (standingsMatch ? '' : ' ⚠️ STANDINGS PARITY MISMATCH')
      );
      console.log(
        `  persisted ${persistedPlayerStats.length} player-stat rows` +
          (playerStatsMatch ? '' : ' ⚠️ PLAYER STATS PARITY MISMATCH')
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
