// Demo-account generator: creates one demo user, 3 leagues (5 teams x 8
// players each), completed games with full stat events, and per-game/
// per-event video fields so the highlight/replay feature is demonstrable.
//
// Unlike seed.js this is ADDITIVE and IDEMPOTENT: it never deletes anything,
// only touches documents it created or the demo user's own rows, and every
// entity is keyed by a deterministic natural key (email/slug/jersey number/
// team-pairing) so re-running is a no-op except for anything genuinely
// missing. Safe to run repeatedly, and designed to eventually run against
// production behind the ALLOW_DEMO_SEED guard below.
//
// One deliberate exception: if a User already exists at DEMO_USER.email, its
// password/plan/verification are overwritten to match the demo spec (so the
// documented login always works), but nothing else on that account is
// touched or deleted.
//
// See docs/demo-data-generation/ for the full plan, tracker, and decisions.
//
// Usage:
//   node src/scripts/seed-demo-account.js            # create/update demo data
//   node src/scripts/seed-demo-account.js --dry-run  # report planned writes only

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { env } = require('../config/env');
const { TEAM_SIDES } = require('../modules/shared/stats.constants');

require('../modules/auth/auth.repository');
require('../modules/games/games.repository');
require('../modules/leagues/leagues.repository');
require('../modules/feed/feed.repository');

const {
  randomInt,
  buildPlayerBlueprints,
  buildLeagueRosterSnapshot,
  buildLeagueGameEvents,
  attachTeamSide,
} = require('./seed.js');
const { computeGameFinalScore, HIGHLIGHT_STAT_TYPES } = require('../modules/games/games.service');

const User = mongoose.model('User');
const Game = mongoose.model('Game');
const League = mongoose.model('League');
const LeagueTeam = mongoose.model('LeagueTeam');
const LeaguePlayer = mongoose.model('LeaguePlayer');
const LeagueTeamMember = mongoose.model('LeagueTeamMember');
const Post = mongoose.model('Post');

const DRY_RUN = process.argv.includes('--dry-run');

const DEMO_USER = {
  email: 'testuser@gmail.com',
  password: 'password1!2@3#',
  name: 'Demo Sporty',
};

const PLAYERS_PER_TEAM = 8;

const DEMO_VIDEO_URLS = [
  'https://www.youtube.com/watch?v=8UfBBSix-2k&list=PLfzFSJruPfo3iheqrUgQxxpG3RLXo2lRa&t=1699s',
  'https://www.youtube.com/watch?v=2LmCnX--5_I&list=PLfzFSJruPfo3iheqrUgQxxpG3RLXo2lRa&index=2',
  'https://www.youtube.com/watch?v=FCbW3fDNKes',
  'https://www.youtube.com/watch?v=Ei1t2b_-z2Q',
];

let videoUrlCounter = 0;
function nextVideoUrl() {
  const url = DEMO_VIDEO_URLS[videoUrlCounter % DEMO_VIDEO_URLS.length];
  videoUrlCounter += 1;
  return url;
}

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SF', 'C'];

// A 5-team round-robin-ish schedule guaranteeing every team (indices 0-4)
// appears in at least 3 games. Each pair is [homeIndex, awayIndex].
const FIVE_TEAM_SCHEDULE = [
  [0, 1],
  [2, 3],
  [4, 0],
  [1, 2],
  [3, 4],
  [0, 2],
  [1, 3],
  [2, 4],
];

const LEAGUE_BLUEPRINTS = [
  {
    slug: 'demo-league',
    name: 'Demo League',
    seasonLabel: '2026 Demo Season',
    ownerRole: 'demo-user',
    demoUserRole: 'player', // demo user owns it AND is a rostered player-coach
    demoUserTeamIndex: 0,
    teamNames: [
      'Northside Falcons',
      'Harbor Knights',
      'Summit Rangers',
      'Cedar Storm',
      'River City Owls',
    ],
  },
  {
    slug: 'harborview-rec-league',
    name: 'Harborview Rec League',
    seasonLabel: '2026 Winter Season',
    ownerRole: 'commissioner',
    commissionerEmail: 'demo-commissioner-2@tsw.demo',
    commissionerName: 'Priya Anand',
    demoUserRole: 'manager',
    demoUserTeamIndex: 0,
    teamNames: [
      'Lakeshore Titans',
      'Westbrook Blaze',
      'Pine Valley Wolves',
      'Eastview Comets',
      'Metro Guardians',
    ],
  },
  {
    slug: 'summit-city-hoops-circuit',
    name: 'Summit City Hoops Circuit',
    seasonLabel: '2026 Spring Circuit',
    ownerRole: 'commissioner',
    commissionerEmail: 'demo-commissioner-3@tsw.demo',
    commissionerName: 'Marcus Webb',
    demoUserRole: 'player',
    demoUserTeamIndex: 2,
    teamNames: [
      'Granite Eagles',
      'Hillcrest Vipers',
      'Canyon Strikers',
      'Southport Jets',
      'Redwood Waves',
    ],
  },
];

// Synthetic Demo League teammates so The Pulse feed shows posts from more
// than one account. Each is claimed onto a distinct LeaguePlayer slot (deterministic
// team/jersey targets below) — same trusted-script direct-claim pattern used
// for the demo user's own profile claim.
const DEMO_LEAGUE_TEAMMATES = [
  { email: 'demo-teammate-1@tsw.demo', name: 'Jordan Hayes', teamIndex: 0, jerseyNumber: 2 },
  { email: 'demo-teammate-2@tsw.demo', name: 'Riley Morgan', teamIndex: 0, jerseyNumber: 3 },
  { email: 'demo-teammate-3@tsw.demo', name: 'Tessa Coleman', teamIndex: 1, jerseyNumber: 1 },
  { email: 'demo-teammate-4@tsw.demo', name: 'Miles Griffin', teamIndex: 2, jerseyNumber: 1 },
];

const FEED_IMAGE_URLS = [
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1518604666860-9ed391f76460?auto=format&fit=crop&w=1200&q=80',
];

const FEED_CAPTIONS = [
  'Big game energy tonight.',
  'Proud of this squad.',
  'Strong performance from the team.',
  'What a finish.',
  'Great night on the court.',
  'Locked in from start to finish.',
  'That one is going in the highlight reel.',
  'Team effort all the way.',
];

const MIN_HIGHLIGHT_POSTS = 20;

function log(...args) {
  console.log(...args);
}

async function upsertUser({ email, name, password, plan, forceCredentials }) {
  let user = await User.findOne({ email });
  if (user) {
    if (!forceCredentials) {
      log(`  user ${email}: already exists, skipping`);
      return { user, created: false };
    }

    if (DRY_RUN) {
      log(`  [dry-run] would reset credentials/plan on existing user ${email}`);
      return { user, created: false };
    }

    user.passwordHash = await bcrypt.hash(password || DEMO_USER.password, 12);
    user.authProvider = 'local';
    user.emailVerified = true;
    user.emailVerifiedAt = user.emailVerifiedAt || new Date();
    user.plan = plan || 'pro';
    await user.save();
    log(`  user ${email}: existing account found, credentials/plan updated to match demo spec`);
    return { user, created: false };
  }

  if (DRY_RUN) {
    log(`  [dry-run] would create user ${email}`);
    return { user: null, created: true };
  }

  const passwordHash = await bcrypt.hash(password || DEMO_USER.password, 12);
  user = await User.create({
    email,
    name,
    passwordHash,
    authProvider: 'local',
    emailVerified: true,
    emailVerifiedAt: new Date(),
    roles: ['user'],
    plan: plan || 'pro',
  });
  log(`  user ${email}: created`);
  return { user, created: true };
}

async function upsertLeague(blueprint, ownerUserId) {
  let league = await League.findOne({ slug: blueprint.slug });
  if (league) {
    log(`  league ${blueprint.slug}: already exists, skipping`);
    return { league, created: false };
  }

  if (DRY_RUN) {
    log(`  [dry-run] would create league ${blueprint.slug}`);
    return { league: null, created: true };
  }

  league = await League.create({
    ownerUserId,
    name: blueprint.name,
    slug: blueprint.slug,
    description: `${blueprint.name} — demo data for exploring TSW's league features.`,
    seasonLabel: blueprint.seasonLabel,
    status: 'active',
    isPublic: true,
    plan: 'league',
    subscriptionStatus: 'active',
    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
  });
  log(`  league ${blueprint.slug}: created`);
  return { league, created: true };
}

async function upsertLeagueTeam(league, teamName, index, slug) {
  let team = await LeagueTeam.findOne({ slug });
  if (team) {
    return { team, created: false };
  }

  if (DRY_RUN) {
    log(`    [dry-run] would create league team ${slug}`);
    return { team: null, created: true };
  }

  team = await LeagueTeam.create({
    leagueId: league._id,
    name: teamName,
    slug,
    colors: ['#141414', '#F4A300'],
    status: 'active',
  });
  return { team, created: true };
}

async function upsertLeaguePlayers(league, leagueTeam, blueprints) {
  const players = [];
  let createdCount = 0;

  for (const blueprint of blueprints) {
    let player = await LeaguePlayer.findOne({
      leagueTeamId: leagueTeam._id,
      jerseyNumber: blueprint.jerseyNumber,
    });

    if (!player) {
      if (DRY_RUN) {
        log(`      [dry-run] would create player ${blueprint.displayName}`);
        continue;
      }

      player = await LeaguePlayer.create({
        leagueId: league._id,
        leagueTeamId: leagueTeam._id,
        displayName: blueprint.displayName,
        jerseyNumber: blueprint.jerseyNumber,
        position: blueprint.position,
        isActive: true,
        claimedByUserId: null,
      });
      createdCount += 1;
    }

    players.push(player);
  }

  return { players, createdCount };
}

async function claimPlayerForUser(leaguePlayer, userId, userLabel) {
  if (!leaguePlayer) return false;

  const alreadyClaimedByUser = await LeaguePlayer.findOne({
    _id: leaguePlayer._id,
    claimedByUserId: userId,
  });
  if (alreadyClaimedByUser) {
    log(`  player profile ${leaguePlayer.displayName}: already claimed by ${userLabel}, skipping`);
    return false;
  }

  if (DRY_RUN) {
    log(`  [dry-run] would claim player profile ${leaguePlayer.displayName} for ${userLabel}`);
    return true;
  }

  const result = await LeaguePlayer.updateOne(
    { _id: leaguePlayer._id, claimedByUserId: null },
    { $set: { claimedByUserId: userId } }
  );

  if (result.modifiedCount > 0) {
    log(`  player profile ${leaguePlayer.displayName}: claimed for ${userLabel}`);
    return true;
  }

  log(`  player profile ${leaguePlayer.displayName}: already claimed by someone else, skipping`);
  return false;
}

async function upsertLeagueTeamMember({ leagueId, leagueTeamId, userId, role, leaguePlayerId }) {
  if (DRY_RUN) {
    log(`  [dry-run] would upsert league team member (role=${role})`);
    return;
  }

  await LeagueTeamMember.findOneAndUpdate(
    { leagueId, leagueTeamId, userId },
    {
      $setOnInsert: {
        leagueId,
        leagueTeamId,
        userId,
        role,
        leaguePlayerId: leaguePlayerId || null,
        status: 'active',
        createdByUserId: userId,
      },
    },
    { upsert: true, new: true }
  );
}

function buildParticipant(side, leagueTeam) {
  return {
    side,
    participantType: 'league_team',
    teamId: null,
    leagueTeamId: leagueTeam._id,
    displayName: leagueTeam.name,
    logo: null,
    colors: leagueTeam.colors || ['#141414', '#F4A300'],
    billingSnapshot: { plan: 'league', subscriptionStatus: 'active' },
    entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
  };
}

// Injects a varied videoTimestamp onto every event whose statType is
// highlight-eligible, matching exactly what buildGameHighlights filters on
// (games.service.js). Non-highlightable stat types are left untouched.
function injectVideoTimestamps(events) {
  return events.map((event) => {
    if (!HIGHLIGHT_STAT_TYPES.has(event.statType)) {
      return event;
    }
    return { ...event, videoTimestamp: randomInt(0, 5400) };
  });
}

// Nudges a tied final score by adding one made free throw's worth of points
// to the home side — league games can never be persisted as a tie
// (games.service.js: assertLeagueScoreNotTied).
function breakTieIfNeeded(finalScore) {
  if (finalScore.home === finalScore.away) {
    return { home: finalScore.home + 1, away: finalScore.away };
  }
  return finalScore;
}

function buildDemoLeagueGames(ownerUserId, league, leagueTeamsWithPlayers, startDate) {
  const games = [];

  FIVE_TEAM_SCHEDULE.forEach(([homeIndex, awayIndex], gameIndex) => {
    const home = leagueTeamsWithPlayers[homeIndex];
    const away = leagueTeamsWithPlayers[awayIndex];

    const scheduledAt = new Date(startDate.getTime() + gameIndex * 4 * 24 * 60 * 60 * 1000);
    scheduledAt.setHours(18 + (gameIndex % 3), gameIndex % 2 === 0 ? 0 : 30, 0, 0);
    const completedAt = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000);

    const homeRosterSnapshot = buildLeagueRosterSnapshot(home.players);
    const awayRosterSnapshot = buildLeagueRosterSnapshot(away.players);

    const homeEvents = injectVideoTimestamps(
      attachTeamSide(buildLeagueGameEvents(homeRosterSnapshot, scheduledAt), TEAM_SIDES.HOME)
    );
    const awayEvents = injectVideoTimestamps(
      attachTeamSide(buildLeagueGameEvents(awayRosterSnapshot, scheduledAt), TEAM_SIDES.AWAY)
    );

    const events = [...homeEvents, ...awayEvents].sort(
      (eventA, eventB) => new Date(eventA.occurredAt) - new Date(eventB.occurredAt)
    );

    const finalScore = breakTieIfNeeded(
      computeGameFinalScore({ trackingMode: 'dual_team', events })
    );

    games.push({
      ownerUserId,
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: league._id,
      homeLeagueTeamId: home.team._id,
      awayLeagueTeamId: away.team._id,
      trackedLeagueTeamId: home.team._id,
      initialActiveSide: TEAM_SIDES.HOME,
      homeParticipant: buildParticipant(TEAM_SIDES.HOME, home.team),
      awayParticipant: buildParticipant(TEAM_SIDES.AWAY, away.team),
      title: `${away.team.name} at ${home.team.name}`,
      videoUrl: nextVideoUrl(),
      status: 'completed',
      scheduledAt,
      completedAt,
      rosterSnapshot: homeRosterSnapshot,
      homeRosterSnapshot,
      awayRosterSnapshot,
      startingLineupPlayerIds: homeRosterSnapshot.slice(0, 5).map((player) => player._id),
      currentLineupPlayerIds: homeRosterSnapshot.slice(0, 5).map((player) => player._id),
      homeStartingLineupPlayerIds: homeRosterSnapshot.slice(0, 5).map((player) => player._id),
      homeCurrentLineupPlayerIds: homeRosterSnapshot.slice(0, 5).map((player) => player._id),
      awayStartingLineupPlayerIds: awayRosterSnapshot.slice(0, 5).map((player) => player._id),
      awayCurrentLineupPlayerIds: awayRosterSnapshot.slice(0, 5).map((player) => player._id),
      events,
      finalScore,
      eventCount: events.length,
    });
  });

  return games;
}

async function seedLeagueGames(league, leagueTeamsWithPlayers, ownerUserId) {
  const existingCount = await Game.countDocuments({ leagueId: league._id });
  const expectedCount = FIVE_TEAM_SCHEDULE.length;

  if (existingCount >= expectedCount) {
    log(`  games for league ${league.slug}: already have ${existingCount}, skipping`);
    return { createdCount: 0 };
  }

  if (DRY_RUN) {
    log(
      `  [dry-run] would create ${expectedCount - existingCount} games for league ${league.slug}`
    );
    return { createdCount: expectedCount - existingCount };
  }

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setMonth(startDate.getMonth() - 3);

  const games = buildDemoLeagueGames(ownerUserId, league, leagueTeamsWithPlayers, startDate);

  const created = await Game.insertMany(games, { ordered: true });
  log(`  games for league ${league.slug}: created ${created.length}`);
  return { createdCount: created.length };
}

async function seedLeague(blueprint, demoUser) {
  log(`League: ${blueprint.name}`);

  let ownerUserId;
  if (blueprint.ownerRole === 'demo-user') {
    ownerUserId = demoUser?._id;
  } else {
    const { user: commissioner } = await upsertUser({
      email: blueprint.commissionerEmail,
      name: blueprint.commissionerName,
      password: 'password1!2@3#',
      plan: 'pro',
    });
    ownerUserId = commissioner?._id;
  }

  const { league } = await upsertLeague(blueprint, ownerUserId);
  if (DRY_RUN && !league) {
    return null;
  }

  const leagueTeamsWithPlayers = [];
  let playerCreatedCount = 0;

  for (const [teamIndex, teamName] of blueprint.teamNames.entries()) {
    const slug = `${blueprint.slug}-${teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const { team } = await upsertLeagueTeam(league, teamName, teamIndex, slug);
    if (DRY_RUN && !team) {
      continue;
    }

    const blueprints = buildPlayerBlueprints(teamIndex, {
      playersPerTeam: PLAYERS_PER_TEAM,
    }).map((player, index) => ({ ...player, position: POSITIONS[index % POSITIONS.length] }));

    const { players, createdCount } = await upsertLeaguePlayers(league, team, blueprints);
    playerCreatedCount += createdCount;
    leagueTeamsWithPlayers.push({ team, players });
  }

  if (DRY_RUN) {
    return null;
  }

  // Claim a player profile + add the demo user's league role, on the team
  // designated in the blueprint.
  if (demoUser) {
    const demoTeam = leagueTeamsWithPlayers[blueprint.demoUserTeamIndex];
    const claimTarget = demoTeam?.players?.[0];
    await claimPlayerForUser(claimTarget, demoUser._id, 'demo user');

    await upsertLeagueTeamMember({
      leagueId: league._id,
      leagueTeamId: demoTeam.team._id,
      userId: demoUser._id,
      role: blueprint.demoUserRole,
      leaguePlayerId: claimTarget?._id || null,
    });
  }

  const { createdCount: gamesCreated } = await seedLeagueGames(
    league,
    leagueTeamsWithPlayers,
    ownerUserId
  );

  log(
    `  summary: teams=${leagueTeamsWithPlayers.length} newPlayers=${playerCreatedCount} newGames=${gamesCreated}`
  );

  return { league, leagueTeamsWithPlayers };
}

// Claims each Demo League teammate onto a distinct LeaguePlayer slot (deterministic
// team/jersey targets from DEMO_LEAGUE_TEAMMATES) so The Pulse feed can show posts
// authored by more than just the demo account. Same trusted-script direct-claim
// pattern as the demo user's own profile claim, reused per teammate.
async function seedDemoLeagueTeammates(leagueTeamsWithPlayers) {
  const teammates = [];

  for (const teammate of DEMO_LEAGUE_TEAMMATES) {
    const { user } = await upsertUser({
      email: teammate.email,
      name: teammate.name,
      password: 'password1!2@3#',
      plan: 'free',
    });
    if (DRY_RUN || !user) continue;

    const team = leagueTeamsWithPlayers[teammate.teamIndex];
    const leaguePlayer = team?.players?.find(
      (player) => player.jerseyNumber === teammate.jerseyNumber
    );
    await claimPlayerForUser(leaguePlayer, user._id, teammate.name);

    teammates.push({ user, leaguePlayer, team: team?.team });
  }

  return teammates;
}

// Deterministic pick — same (gameIndex, playerIndex) pair always yields the
// same poster/index into a shared pool, so reseeding produces identical posts.
function pickPoster(posters, index) {
  return posters[index % posters.length];
}

// Builds >= MIN_HIGHLIGHT_POSTS highlight_clip posts spread across multiple
// Demo League games and posters, plus a supporting mix of image/game_card/
// player_card/team_card posts, so The Pulse feed looks like an active,
// multi-user community rather than one account's activity log. Inserted
// directly via Mongoose (same trust level as seed.js's own Post.insertMany),
// bypassing createHighlightClipPostForUser's ownership/claim assertion since a
// seed script isn't a real user's browser session.
async function seedDemoLeagueFeedPosts({ league, leagueTeamsWithPlayers, demoUser, teammates }) {
  const posters = [demoUser, ...teammates.map((teammate) => teammate.user)].filter(Boolean);
  if (posters.length === 0) {
    log('  no posters available, skipping feed post generation');
    return { createdCount: 0 };
  }

  const games = await Game.find({ leagueId: league._id }).sort({ scheduledAt: 1 });
  if (games.length === 0) {
    log('  no games found for feed post generation, skipping');
    return { createdCount: 0 };
  }

  const existingHighlightCount = await Post.countDocuments({
    type: 'highlight_clip',
    'highlightClip.gameId': { $in: games.map((game) => game._id) },
  });
  const existingOtherCount = await Post.countDocuments({
    type: { $in: ['image', 'game_card', 'player_card', 'team_card'] },
    creatorUserId: { $in: posters.map((poster) => poster._id) },
  });

  if (existingHighlightCount >= MIN_HIGHLIGHT_POSTS && existingOtherCount > 0) {
    log(
      `  feed posts: already have ${existingHighlightCount} highlight + ${existingOtherCount} other posts, skipping`
    );
    return { createdCount: 0 };
  }

  const postsToInsert = [];
  let postIndex = 0;

  if (existingHighlightCount < MIN_HIGHLIGHT_POSTS) {
    let highlightCount = existingHighlightCount;

    // Round-robin across games (one candidate event per game per pass) so
    // highlights are spread across multiple games rather than exhausting the
    // first game's (much longer) event list before moving to the next.
    const gameHighlightQueues = games.map((game) => ({
      game,
      events: (game.events || []).filter(
        (event) =>
          HIGHLIGHT_STAT_TYPES.has(event.statType) && typeof event.videoTimestamp === 'number'
      ),
      cursor: 0,
    }));

    let exhaustedQueues = 0;
    while (highlightCount < MIN_HIGHLIGHT_POSTS && exhaustedQueues < gameHighlightQueues.length) {
      exhaustedQueues = 0;

      for (const queue of gameHighlightQueues) {
        if (highlightCount >= MIN_HIGHLIGHT_POSTS) break;

        if (queue.cursor >= queue.events.length) {
          exhaustedQueues += 1;
          continue;
        }

        const event = queue.events[queue.cursor];
        queue.cursor += 1;

        const existingClip = await Post.findOne({ 'highlightClip.eventId': String(event._id) });
        if (existingClip) continue;

        const { game } = queue;
        const poster = pickPoster(posters, postIndex);
        postIndex += 1;

        const rosterPlayer = [
          ...(game.homeRosterSnapshot || []),
          ...(game.awayRosterSnapshot || []),
        ].find((player) => String(player._id) === String(event.playerId));

        postsToInsert.push({
          creatorUserId: poster._id,
          type: 'highlight_clip',
          caption: pickPoster(FEED_CAPTIONS, postIndex),
          highlightClip: {
            gameId: game._id,
            eventId: String(event._id),
            videoUrl: game.videoUrl,
            videoTimestamp: event.videoTimestamp,
            statType: event.statType,
            playerId: event.playerId ? String(event.playerId) : null,
            playerName: rosterPlayer?.displayName || null,
            gameTitle: game.title,
          },
        });
        highlightCount += 1;
      }
    }
  }

  if (existingOtherCount === 0) {
    const [firstGame, secondGame] = games;
    const firstTeam = leagueTeamsWithPlayers[0];
    const secondTeam = leagueTeamsWithPlayers[1];

    if (firstGame) {
      postsToInsert.push({
        creatorUserId: pickPoster(posters, postIndex)._id,
        type: 'game_card',
        caption: pickPoster(FEED_CAPTIONS, (postIndex += 1)),
        gameCard: { gameId: firstGame._id, leagueTeamId: firstGame.homeLeagueTeamId },
      });
    }
    if (secondGame) {
      postsToInsert.push({
        creatorUserId: pickPoster(posters, (postIndex += 1))._id,
        type: 'game_card',
        caption: pickPoster(FEED_CAPTIONS, postIndex),
        gameCard: { gameId: secondGame._id, leagueTeamId: secondGame.awayLeagueTeamId },
      });
    }
    if (firstTeam?.players?.[0]) {
      postsToInsert.push({
        creatorUserId: pickPoster(posters, (postIndex += 1))._id,
        type: 'player_card',
        caption: pickPoster(FEED_CAPTIONS, postIndex),
        playerCard: {
          leagueTeamId: firstTeam.team._id,
          leaguePlayerId: firstTeam.players[0]._id,
        },
      });
    }
    if (secondTeam?.team) {
      postsToInsert.push({
        creatorUserId: pickPoster(posters, (postIndex += 1))._id,
        type: 'team_card',
        caption: pickPoster(FEED_CAPTIONS, postIndex),
        teamCard: { leagueTeamId: secondTeam.team._id },
      });
    }
    for (const imageUrl of FEED_IMAGE_URLS) {
      postsToInsert.push({
        creatorUserId: pickPoster(posters, (postIndex += 1))._id,
        type: 'image',
        caption: pickPoster(FEED_CAPTIONS, postIndex),
        image: {
          url: imageUrl,
          publicId: `demo/image/${postIndex}`,
          width: 1200,
          height: 800,
          mimeType: 'image/jpeg',
        },
      });
    }
  }

  if (postsToInsert.length === 0) {
    log('  feed posts: nothing new to create');
    return { createdCount: 0 };
  }

  if (DRY_RUN) {
    log(`  [dry-run] would create ${postsToInsert.length} feed posts`);
    return { createdCount: postsToInsert.length };
  }

  const created = await Post.insertMany(postsToInsert, { ordered: true });
  log(`  feed posts: created ${created.length}`);
  return { createdCount: created.length };
}

async function main() {
  if (env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error(
      'Refusing to run seed-demo-account.js against production without ALLOW_DEMO_SEED=true.'
    );
    process.exitCode = 1;
    return;
  }

  await connectDb();

  try {
    log(DRY_RUN ? 'Running in --dry-run mode (no writes will be made)' : 'Seeding demo account...');

    const { user: demoUser } = await upsertUser({
      email: DEMO_USER.email,
      name: DEMO_USER.name,
      password: DEMO_USER.password,
      plan: 'pro',
      forceCredentials: true,
    });

    let demoLeagueResult = null;
    for (const blueprint of LEAGUE_BLUEPRINTS) {
      const result = await seedLeague(blueprint, demoUser);
      if (blueprint.slug === 'demo-league') {
        demoLeagueResult = result;
      }
    }

    if (demoLeagueResult && demoUser) {
      log('Demo League feed content:');
      const teammates = await seedDemoLeagueTeammates(demoLeagueResult.leagueTeamsWithPlayers);
      await seedDemoLeagueFeedPosts({
        league: demoLeagueResult.league,
        leagueTeamsWithPlayers: demoLeagueResult.leagueTeamsWithPlayers,
        demoUser,
        teammates,
      });
    }

    log('');
    log('Demo seed complete.');
    log(`Login: ${DEMO_USER.email} / ${DEMO_USER.password}`);
    log(
      'Reminder: run `node src/scripts/backfill-league-standings.js` to warm materialized standings/player-stats (optional — compute-on-miss serves the same data live).'
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Demo seed failed');
    console.error(error);
    process.exitCode = 1;
  });
}
