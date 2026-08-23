// Replace a league's one-sided scheduled fixtures with dual-team equivalents,
// so BOTH teams can be tracked in GameTrackPage.
//
// WHY THIS EXISTS: the Schedule Builder hardcodes trackingMode 'one_sided'
// (leagues.service.js bulkCreateLeagueGamesForUser), and trackingMode is absent
// from updateGameSchema, so it cannot be changed through the API. The app also
// has no path that creates a *scheduled* dual-team game — its dual-team league
// create path hardcodes status 'in_progress'. This script composes that shape:
// scheduled + dual_team + participants.
//
// THIS SCRIPT DELETES DOCUMENTS. Scope is narrow and heavily guarded:
//   * only Games whose leagueId is the named league, AND
//   * status 'scheduled', AND trackingMode 'one_sided', AND zero events, AND
//   * whose _id appears in the verified snapshot taken before the run.
// Deletes are issued by an explicit _id list, never by a filter. Anything that
// fails a guard aborts the whole run before a single write. Nothing outside the
// `games` collection is read-modify-written: the league, season, teams, players,
// logos, memberships and join requests are never touched.
//
// Order of operations is insert-then-delete on purpose. If the insert fails, the
// original fixtures are still there (safe direction). If the delete fails, the
// schedule holds visible duplicates and a rerun cleans them up — recoverable
// either way. A half-finished run never leaves the season with no fixtures.
//
// Roster snapshots are deliberately created EMPTY. repairGameRosterSnapshots
// (games.service.js) backfills an empty snapshot from the live league roster the
// first time a game is read while 'in_progress', and starting the clock flips
// 'scheduled' → 'in_progress'. Freezing today's rosters into a fixture months
// out would capture the wrong roster; leaving them empty captures the right one
// on match day.
//
// Usage:
//   ENV_FILE=../env/server/.env.production node src/scripts/retrack-league-games-dual.js \
//     --slug=dorset-basketball-association --snapshot=../backups/<file>.json --dry-run
//   ... --yes    to apply
//
// --snapshot is MANDATORY: the run aborts unless the fixtures currently in the
// database exactly match the ones captured in that snapshot file.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');
const { env } = require('../config/env');
const { DEFAULT_GAME_FORMAT, SPORTS, createReadyClock } = require('../modules/shared/gameClock');
const { TEAM_SIDES } = require('../modules/shared/stats.constants');
const { transformCloudinaryUrl } = require('../modules/shared/cloudinaryUrl');
const { getLeagueBillingSummary } = require('../modules/billing/billing.service');
const { resolveForLeague } = require('../modules/billing/entitlements.service');

require('../modules/auth/auth.repository');
require('../modules/leagues/leagues.repository');
require('../modules/leagues/seasons.repository');
require('../modules/games/games.repository');

const League = mongoose.model('League');
const LeagueTeam = mongoose.model('LeagueTeam');
const Game = mongoose.model('Game');

function arg(name) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const SLUG = arg('slug');
const SNAPSHOT = arg('snapshot');
const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRMED = process.argv.includes('--yes');

function log(...args) {
  console.log(...args);
}

// Mirrors sanitizeLogo in games.service.js:125 — the participant sub-schema
// stores only { url, width, height }, with the Cloudinary transform applied.
function sanitizeLogo(logo) {
  if (!logo?.url) return null;
  return {
    url: transformCloudinaryUrl(logo.url),
    width: logo.width ?? null,
    height: logo.height ?? null,
  };
}

function londonLabel(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

// Mirrors the participant sub-document built by the app's dual-team league
// create path (games.service.js:1313) so a fixture from this script is
// indistinguishable from one created in the app.
function buildParticipant(side, team, league) {
  return {
    side,
    participantType: 'league_team',
    teamId: null,
    leagueTeamId: team._id,
    slug: team.slug || null,
    displayName: team.name,
    logo: sanitizeLogo(team.logo),
    colors: Array.isArray(team.colors) ? team.colors : [],
    billingSnapshot: getLeagueBillingSummary(league),
    entitlementsSnapshot: resolveForLeague(league).entitlements,
  };
}

async function main() {
  if (!process.env.ENV_FILE) {
    throw new Error('ENV_FILE is required. Refusing to guess which database to write to.');
  }
  if (!SLUG) throw new Error('--slug=<league-slug> is required.');
  if (!SNAPSHOT) {
    throw new Error(
      '--snapshot=<file.json> is required. Run export-league-snapshot.js first; this script will not delete anything without a verified snapshot.'
    );
  }
  if (!DRY_RUN && !CONFIRMED) {
    throw new Error(
      'Refusing to write without an explicit flag. Pass --dry-run to preview, or --yes to apply.'
    );
  }

  const snapshotPath = path.resolve(process.cwd(), SNAPSHOT);
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot file not found: ${snapshotPath}`);
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

  await connectDb();

  const host = String(env.MONGO_URI || '').replace(/^(mongodb(?:\+srv)?:\/\/)[^@]*@/, '$1***@');
  log('\nTarget:  ', { dbName: env.MONGO_DB_NAME, nodeEnv: env.NODE_ENV, uri: host });
  log('Snapshot:', snapshotPath);
  log(DRY_RUN ? 'Mode:     DRY RUN — no writes will be issued\n' : 'Mode:     APPLY\n');

  // ─── Guard: snapshot must describe THIS database and league ────────────────

  if (snapshot.meta?.database !== env.MONGO_DB_NAME) {
    throw new Error(
      `Snapshot was taken from '${snapshot.meta?.database}' but this run targets '${env.MONGO_DB_NAME}'. Aborting.`
    );
  }
  if (snapshot.meta?.leagueSlug !== SLUG) {
    throw new Error(
      `Snapshot is for league '${snapshot.meta?.leagueSlug}' but --slug is '${SLUG}'. Aborting.`
    );
  }

  const league = await League.findOne({ slug: SLUG }).lean();
  if (!league) throw new Error(`No league found with slug '${SLUG}'.`);
  if (String(league._id) !== String(snapshot.meta.leagueId)) {
    throw new Error(
      `League _id changed since the snapshot (${snapshot.meta.leagueId} → ${league._id}). Aborting.`
    );
  }
  if (!league.currentSeasonId) throw new Error('League has no active season. Aborting.');

  const teams = await LeagueTeam.find({ leagueId: league._id }).lean();
  const teamsById = new Map(teams.map((team) => [String(team._id), team]));
  log(
    `League: ${league.name} (${league._id}) — ${teams.length} teams, season ${league.currentSeasonId}`
  );

  // ─── Identify exactly what to replace ──────────────────────────────────────

  const allGames = await Game.find({ leagueId: league._id }).lean();
  const snapshotGameIds = new Set((snapshot.games || []).map((game) => String(game._id)));

  const replaceable = [];
  const untouched = [];

  for (const game of allGames) {
    const reasons = [];
    if (game.status !== 'scheduled') reasons.push(`status=${game.status}`);
    if (game.trackingMode !== 'one_sided') reasons.push(`trackingMode=${game.trackingMode}`);
    if ((game.events || []).length > 0) reasons.push(`${game.events.length} events`);
    if (!snapshotGameIds.has(String(game._id))) reasons.push('not in snapshot');
    if (!game.homeLeagueTeamId || !game.awayLeagueTeamId) reasons.push('missing a side');
    if (reasons.length) {
      untouched.push({ game, reasons });
    } else {
      replaceable.push(game);
    }
  }

  log(`\nGames in league: ${allGames.length}`);
  log(`  replaceable:   ${replaceable.length}`);
  log(`  left alone:    ${untouched.length}`);
  for (const { game, reasons } of untouched) {
    log(`     - ${game._id} "${game.title}" → ${reasons.join(', ')}`);
  }

  if (!replaceable.length) {
    log('\nNothing to replace. Exiting without any write.\n');
    await disconnectDb();
    return;
  }

  // Every replaceable game must resolve both of its teams, or we abort entirely
  // rather than write a partial schedule.
  for (const game of replaceable) {
    for (const id of [game.homeLeagueTeamId, game.awayLeagueTeamId]) {
      if (!teamsById.has(String(id))) {
        throw new Error(
          `Game ${game._id} references league team ${id}, which is not in this league. Aborting.`
        );
      }
    }
  }

  // ─── Build the replacements ────────────────────────────────────────────────

  const gameFormat = { ...(league.defaultGameFormat || DEFAULT_GAME_FORMAT) };

  // Fixtures that already have a dual-team twin (same sides, same kickoff) —
  // the fingerprint of a previous run that inserted but failed before deleting.
  // Recreating them would duplicate the schedule, so they are skipped and only
  // their one-sided originals get cleaned up.
  const fingerprint = (home, away, scheduledAt) =>
    `${String(home)}|${String(away)}|${new Date(scheduledAt).toISOString()}`;
  const existingDual = new Set(
    allGames
      .filter((game) => game.trackingMode === 'dual_team' && game.scheduledAt)
      .map((game) => fingerprint(game.homeLeagueTeamId, game.awayLeagueTeamId, game.scheduledAt))
  );

  const alreadyDual = replaceable.filter((game) =>
    existingDual.has(fingerprint(game.homeLeagueTeamId, game.awayLeagueTeamId, game.scheduledAt))
  );
  if (alreadyDual.length) {
    log(
      `\n${alreadyDual.length} fixture(s) already have a dual_team twin from an earlier run — ` +
        'skipping their recreation, cleaning up the one_sided originals only:'
    );
    for (const game of alreadyDual) log(`  ~ ${game._id} "${game.title}"`);
  }

  const toCreate = replaceable.filter(
    (game) =>
      !existingDual.has(fingerprint(game.homeLeagueTeamId, game.awayLeagueTeamId, game.scheduledAt))
  );

  const replacements = toCreate.map((game) => {
    const homeTeam = teamsById.get(String(game.homeLeagueTeamId));
    const awayTeam = teamsById.get(String(game.awayLeagueTeamId));

    return {
      sport: SPORTS.BASKETBALL,
      gameFormat,
      clock: createReadyClock(gameFormat),
      // Preserve the original fixture's owner rather than reassigning it.
      ownerUserId: game.ownerUserId,
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: league._id,
      seasonId: game.seasonId || league.currentSeasonId,
      homeLeagueTeamId: homeTeam._id,
      awayLeagueTeamId: awayTeam._id,
      // Dual-team games still carry a tracked side; home matches
      // initialActiveSide, exactly as the app's dual-team create path does.
      trackedLeagueTeamId: homeTeam._id,
      initialActiveSide: TEAM_SIDES.HOME,
      homeParticipant: buildParticipant(TEAM_SIDES.HOME, homeTeam, league),
      awayParticipant: buildParticipant(TEAM_SIDES.AWAY, awayTeam, league),
      // Intentionally empty — see the header note on repairGameRosterSnapshots.
      homeRosterSnapshot: [],
      awayRosterSnapshot: [],
      title: game.title,
      scheduledAt: game.scheduledAt,
      venue: game.venue,
      status: 'scheduled',
    };
  });

  log('\nReplacements (one_sided → dual_team, same date/venue/sides/title):');
  for (const doc of replacements) {
    log(`  ${londonLabel(doc.scheduledAt)}  ${doc.title}`);
    log(
      `      home: ${doc.homeParticipant.displayName}  (logo ${doc.homeParticipant.logo ? 'yes' : 'none'})`
    );
    log(
      `      away: ${doc.awayParticipant.displayName}  (logo ${doc.awayParticipant.logo ? 'yes' : 'none'})`
    );
    log(`      venue: ${doc.venue || '(none)'}`);
  }

  const idsToDelete = replaceable.map((game) => game._id);
  log(`\nWould delete ${idsToDelete.length} game(s) by explicit _id:`);
  for (const id of idsToDelete) log(`  - ${id}`);

  const before = { games: await Game.countDocuments({ leagueId: league._id }) };

  if (DRY_RUN) {
    log('\nCounts (league games) before:', before);
    log('Delta:                        { games: 0 } — dry run issues no writes');
    log(
      '\nOther collections touched: NONE (league, season, teams, players, members, join requests, logos untouched)'
    );
    log('\nDRY RUN complete. No writes were issued. Re-run with --yes to apply.\n');
    await disconnectDb();
    return;
  }

  // ─── Apply: insert first, then delete by explicit _id ──────────────────────

  const inserted = replacements.length ? await Game.insertMany(replacements) : [];
  log(`\n[insert] ${inserted.length} dual_team fixture(s) created`);
  for (const game of inserted) log(`  + ${game._id}  ${game.title}`);

  if (inserted.length !== replacements.length) {
    throw new Error(
      `Expected to insert ${replacements.length} games but inserted ${inserted.length}. NOT deleting the originals. Investigate before rerunning.`
    );
  }

  const deleted = await Game.deleteMany({
    _id: { $in: idsToDelete },
    // Re-assert the guards at delete time so a concurrent edit (someone starting
    // a game, or an event landing) removes it from the delete set instead of
    // being destroyed.
    leagueId: league._id,
    status: 'scheduled',
    trackingMode: 'one_sided',
    // Must mirror the JS guard above exactly. `{ $size: 0 }` alone does NOT
    // match a document whose `events` field is absent, so a doc the guard
    // considered safe could survive the delete and leave a duplicate behind.
    $or: [{ events: { $size: 0 } }, { events: { $exists: false } }],
  });
  log(`\n[delete] ${deleted.deletedCount} original one_sided fixture(s) removed`);

  if (deleted.deletedCount !== idsToDelete.length) {
    log(
      `\nWARNING: expected to delete ${idsToDelete.length} but deleted ${deleted.deletedCount}. ` +
        'The remainder no longer matched the safety guards (likely edited concurrently). ' +
        'They are still present — inspect them and rerun if appropriate.'
    );
  }

  const after = { games: await Game.countDocuments({ leagueId: league._id }) };
  log('\nCounts (league games) before:', before);
  log('Counts (league games) after: ', after);
  log('\nOther collections touched: NONE');
  log(`\nDone. Both teams are now trackable for ${replaceable.length} fixture(s).\n`);

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
