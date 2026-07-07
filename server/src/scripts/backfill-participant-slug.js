// OPT-022 backfill: populate homeParticipant.slug / awayParticipant.slug for
// pre-existing dual-team league games.
//
// `participantSchema` never declared a `slug` field, so Mongoose silently
// dropped it on every save even though games.service.js always tried to write
// it at creation time — every read fell through to a per-request
// findLeagueTeamById lookup (resolveDualGameParticipants) to fill it in live.
// Adding the field to the schema (this task) makes NEW games persist it for
// real; this script backfills EXISTING games from their linked LeagueTeam.
//
// Safe to re-run (idempotent): only writes games that are still missing a
// slug and whose linked league team has one.
//
// Usage:
//   node src/scripts/backfill-participant-slug.js            # backfill all
//   node src/scripts/backfill-participant-slug.js --dry-run  # report only

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');

require('../modules/leagues/leagues.repository');
require('../modules/games/games.repository');

const Game = mongoose.model('Game');
const LeagueTeam = mongoose.model('LeagueTeam');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDb();

  const cursor = Game.find({
    trackingMode: 'dual_team',
    $or: [
      { 'homeParticipant.leagueTeamId': { $ne: null }, 'homeParticipant.slug': null },
      { 'awayParticipant.leagueTeamId': { $ne: null }, 'awayParticipant.slug': null },
    ],
  }).cursor();

  let scanned = 0;
  let updated = 0;

  for (let game = await cursor.next(); game != null; game = await cursor.next()) {
    scanned += 1;
    let changed = false;

    if (!game.homeParticipant?.slug && game.homeParticipant?.leagueTeamId) {
      const homeTeam = await LeagueTeam.findById(game.homeParticipant.leagueTeamId)
        .select('slug')
        .lean();
      if (homeTeam?.slug) {
        game.homeParticipant.slug = homeTeam.slug;
        changed = true;
      }
    }

    if (!game.awayParticipant?.slug && game.awayParticipant?.leagueTeamId) {
      const awayTeam = await LeagueTeam.findById(game.awayParticipant.leagueTeamId)
        .select('slug')
        .lean();
      if (awayTeam?.slug) {
        game.awayParticipant.slug = awayTeam.slug;
        changed = true;
      }
    }

    if (!changed) {
      continue;
    }

    updated += 1;
    if (dryRun) {
      console.log(
        `[dry-run] ${game._id}: home.slug=${game.homeParticipant?.slug} away.slug=${game.awayParticipant?.slug}`
      );
      continue;
    }

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
