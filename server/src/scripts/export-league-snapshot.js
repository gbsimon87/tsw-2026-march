// Read-only snapshot of everything scoped to one league, written to a JSON file.
//
// Intended as the safety net before any destructive league operation: capture
// first, verify the capture, then act. Nothing in this file writes to the
// database — the only side effect is the output file.
//
// Captures raw documents (not sanitized API shapes) so a restore can rebuild
// byte-equivalent docs, including the Cloudinary `logo` sub-documents that a
// re-upload would otherwise be needed to recover. Cloudinary assets themselves
// are never touched by deleting Mongo docs, so a restored logo keeps working.
//
// Also captures a minimal id→email map for every user referenced by the league
// data, so a restore can remap ownerUserId / claimedByUserId / userId after new
// _ids are minted.
//
// Usage:
//   ENV_FILE=../env/server/.env.production node src/scripts/export-league-snapshot.js --slug=dorset-basketball-association
//   ... --slug=<slug> --out=/some/dir     (default: <repo>/backups, which is gitignored)

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');
const { env } = require('../config/env');

require('../modules/auth/auth.repository');
require('../modules/leagues/leagues.repository');
require('../modules/leagues/seasons.repository');
require('../modules/games/games.repository');
require('../modules/milestones/milestones.repository');
require('../modules/feed/feed.repository');

function arg(name) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const SLUG = arg('slug');
// backups/ is gitignored — a production snapshot carries real emails, so it must
// never default anywhere git-tracked.
const OUT_DIR = arg('out') || path.resolve(__dirname, '../../../backups');

function log(...args) {
  console.log(...args);
}

async function main() {
  if (!process.env.ENV_FILE) {
    throw new Error('ENV_FILE is required. Refusing to guess which database to read from.');
  }
  if (!SLUG) {
    throw new Error('--slug=<league-slug> is required.');
  }

  await connectDb();

  const host = String(env.MONGO_URI || '').replace(/^(mongodb(?:\+srv)?:\/\/)[^@]*@/, '$1***@');
  log('\nTarget:', { dbName: env.MONGO_DB_NAME, nodeEnv: env.NODE_ENV, uri: host });
  log('Mode:   READ-ONLY snapshot\n');

  const M = (name) => mongoose.model(name);
  const league = await M('League').findOne({ slug: SLUG }).lean();
  if (!league) {
    throw new Error(`No league found with slug '${SLUG}'.`);
  }

  const leagueId = league._id;
  const byLeague = { leagueId };

  const teams = await M('LeagueTeam').find(byLeague).lean();
  const games = await M('Game').find(byLeague).lean();
  const gameIds = games.map((game) => game._id);
  const teamIds = teams.map((team) => team._id);
  const leaguePlayers = await M('LeaguePlayer').find(byLeague).lean();
  const playerIds = leaguePlayers.map((player) => player._id);

  const data = {
    league,
    seasons: await M('Season').find(byLeague).lean(),
    leagueTeams: teams,
    leaguePlayers,
    leagueTeamMembers: await M('LeagueTeamMember').find(byLeague).lean(),
    leagueManagers: await M('LeagueManager').find(byLeague).lean(),
    leagueJoinRequests: await M('LeagueJoinRequest').find(byLeague).lean(),
    leagueStandings: await M('LeagueStandings').find(byLeague).lean(),
    leaguePlayerStats: await M('LeaguePlayerStats').find(byLeague).lean(),
    games,
    playerMilestones: await M('PlayerMilestone').find(byLeague).lean(),
    // A Post has NO top-level leagueId or gameId — it references this league's
    // data only through its nested card sub-documents (feed.repository.js), so
    // those exact paths have to be queried. Querying a bare `leagueId`/`gameId`
    // silently matches nothing and would report 0 posts however many exist.
    posts: await M('Post')
      .find({
        $or: [
          { 'gameCard.gameId': { $in: gameIds } },
          { 'gameCard.leagueTeamId': { $in: teamIds } },
          { 'highlightClip.gameId': { $in: gameIds } },
          { 'playerCard.leagueTeamId': { $in: teamIds } },
          { 'playerCard.leaguePlayerId': { $in: playerIds } },
          { 'teamCard.leagueTeamId': { $in: teamIds } },
          { 'milestoneCard.gameId': { $in: gameIds } },
          { 'milestoneCard.leagueTeamId': { $in: teamIds } },
          { 'milestoneCard.leaguePlayerId': { $in: playerIds } },
        ],
      })
      .lean(),
    leagueDataIssueDismissals: await mongoose.connection.db
      .collection('leaguedataissuedismissals')
      .find(byLeague)
      .toArray(),
  };

  // Every user id referenced anywhere in the capture, resolved to an email so a
  // restore can find the same person again after ids change.
  const userIds = new Set();
  const collect = (value) => {
    if (value) userIds.add(String(value));
  };
  collect(league.ownerUserId);
  for (const season of data.seasons) collect(season.createdByUserId);
  for (const player of data.leaguePlayers) collect(player.claimedByUserId);
  for (const member of data.leagueTeamMembers) {
    collect(member.userId);
    collect(member.createdByUserId);
  }
  for (const manager of data.leagueManagers) collect(manager.userId);
  for (const request of data.leagueJoinRequests) {
    collect(request.requesterUserId);
    collect(request.reviewedByUserId);
  }
  for (const game of games) collect(game.ownerUserId);

  const users = await M('User')
    .find({ _id: { $in: [...userIds].map((id) => new mongoose.Types.ObjectId(id)) } })
    .select('_id email name authProvider')
    .lean();

  const manifest = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.length : 1])
  );

  const logoCount =
    (league.logo ? 1 : 0) + teams.filter((team) => team.logo && team.logo.publicId).length;

  const snapshot = {
    meta: {
      capturedAt: new Date().toISOString(),
      database: env.MONGO_DB_NAME,
      nodeEnv: env.NODE_ENV,
      leagueSlug: SLUG,
      leagueId: String(leagueId),
      leagueName: league.name,
      manifest,
      cloudinaryLogosCaptured: logoCount,
      note: 'Raw Mongoose documents. Cloudinary assets are external and unaffected by Mongo deletes; restoring a logo sub-document restores the working image.',
    },
    users,
    ...data,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(OUT_DIR, `league-${SLUG}-${env.MONGO_DB_NAME}-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));

  log('Captured:');
  for (const [key, count] of Object.entries(manifest)) {
    log(`  ${String(count).padStart(4)}  ${key}`);
  }
  log(`\n  ${String(users.length).padStart(4)}  users (referenced, id→email only)`);
  log(`  ${String(logoCount).padStart(4)}  Cloudinary logo sub-documents`);

  const bytes = fs.statSync(outFile).size;
  log(`\nWrote ${outFile}`);
  log(`      ${(bytes / 1024).toFixed(1)} KB\n`);

  await disconnectDb();
}

main().catch(async (error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  try {
    await disconnectDb();
  } catch {
    // already disconnected
  }
  process.exit(1);
});
