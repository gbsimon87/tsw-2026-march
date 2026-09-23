// DEVELOPMENT ONLY: default resets the database; --demo adds missing demo fixtures.
// Both modes require SEED_CONFIRM_DB and refuse production before connecting.
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { env } = require('../config/env');
const { SHOT_ZONE_IDS, STAT_TYPES, TEAM_SIDES } = require('../modules/shared/stats.constants');
const {
  DEFAULT_GAME_FORMAT,
  SEGMENT_KINDS,
  regulationSegmentCount,
} = require('../modules/shared/gameClock');

require('../modules/auth/auth.repository');
require('../modules/teams/teams.repository');
require('../modules/games/games.repository');
require('../modules/feed/feed.repository');
require('../modules/leagues/leagues.repository');
require('../modules/leagues/seasons.repository');
require('../modules/leagues/dataCompleteness.repository');
require('../modules/follows/follows.repository');
require('../modules/milestones/milestones.repository');

const User = mongoose.model('User');
const Session = mongoose.model('Session');
const AuthToken = mongoose.model('AuthToken');
const Team = mongoose.model('Team');
const Game = mongoose.model('Game');
const Post = mongoose.model('Post');
const League = mongoose.model('League');
const LeagueTeam = mongoose.model('LeagueTeam');
const LeaguePlayer = mongoose.model('LeaguePlayer');
const LeagueTeamMember = mongoose.model('LeagueTeamMember');
const LeagueJoinRequest = mongoose.model('LeagueJoinRequest');
const Season = mongoose.model('Season');
const LeagueStandings = mongoose.model('LeagueStandings');
const LeaguePlayerStats = mongoose.model('LeaguePlayerStats');
const LeagueDataIssueDismissal = mongoose.model('LeagueDataIssueDismissal');
const PlayerClaimRequest = mongoose.model('PlayerClaimRequest');
const Follow = mongoose.model('Follow');
const PlayerMilestone = mongoose.model('PlayerMilestone');

const {
  computeBoxScore,
  computeGameFinalScore,
  buildGameSummary,
  getPublicGame,
  HIGHLIGHT_STAT_TYPES,
} = require('../modules/games/games.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const TEAM_COLORS = ['#2563eb', '#dc2626', '#7c3aed', '#059669', '#ea580c'];

function buildFixtureImage(filename) {
  const origin = env.CLIENT_ORIGIN.split(',')[0].trim().replace(/\/$/, '');
  return {
    url: `${origin}/dev-fixtures/${filename}.svg`,
    publicId: null,
    width: 160,
    height: 160,
    mimeType: 'image/svg+xml',
  };
}

function buildSocialFixture(ownerUserId, { status = 'granted', player = false, index = 0 } = {}) {
  return {
    // Handles intentionally omitted: invented handles could tag real accounts.
    marketing: {
      status,
      recordedAt: status === 'unrecorded' ? null : new Date(),
      recordedByUserId: status === 'unrecorded' ? null : ownerUserId,
      note:
        status === 'unrecorded'
          ? null
          : 'Fictional development fixture; not permission for real people or footage.',
    },
    ...(player
      ? {
          ageCategory: index === 6 || index === 7 ? 'minor' : 'adult',
          guardianConsentAt: index === 6 ? new Date() : null,
        }
      : {}),
  };
}

function completeGameFixture(game, team = null) {
  if (game.trackingMode === 'dual_team') {
    const score = computeGameFinalScore(game);
    if (score.home === score.away) {
      const player = game.homeRosterSnapshot[0];
      const previous = game.events[game.events.length - 1];
      game.events.push({
        _id: new mongoose.Types.ObjectId(),
        playerId: player._id,
        statType: STAT_TYPES.FT_MADE,
        teamSide: TEAM_SIDES.HOME,
        occurredAt: new Date(new Date(previous?.occurredAt || game.scheduledAt).getTime() + 1000),
        segmentKind: previous?.segmentKind || SEGMENT_KINDS.REGULATION,
        segmentNumber: previous?.segmentNumber || 4,
        clockMillisecondsRemaining: previous?.clockMillisecondsRemaining ?? 0,
      });
    }
  }
  const participants =
    game.trackingMode === 'dual_team'
      ? {
          home: { teamDoc: { players: game.homeRosterSnapshot } },
          away: { teamDoc: { players: game.awayRosterSnapshot } },
        }
      : null;
  game.boxScore = computeBoxScore(game, team, { participants });
  game.gameSummary = buildGameSummary(game);
  game.finalScore = computeGameFinalScore(game);
  game.eventCount = game.events.length;
  return game;
}

function buildRoundRobin(teamCount) {
  const pairs = [];
  for (let home = 0; home < teamCount; home += 1) {
    for (let away = 0; away < teamCount; away += 1) {
      if (home !== away) pairs.push([home, away]);
    }
  }
  return pairs;
}

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

// Free-text venues (Game.venue, added with the Schedule Builder) so demo games
// show a location. Cycled per game by index — deterministic, so reseeding is
// still idempotent.
const DEMO_VENUES = [
  'Northside Community Center',
  'Harbor Athletic Club',
  'Summit High School Gym',
  'Cedar Park Fieldhouse',
];

// Every team plays eight completed games, four home and four away.
const FIVE_TEAM_SCHEDULE = buildRoundRobin(5);

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

// Each highlight clip is a distinct (videoUrl, videoTimestamp) pair rendered
// as a ~10s clip (HighlightClipPostCard/FullScreenHighlightClipPost embed
// videoTimestamp-5s..+5s) — "50 different videos" means 50 distinct clips,
// not 50 distinct YouTube uploads (only the 4 supplied URLs exist as sources).
const MIN_HIGHLIGHT_POSTS = 50;

function log(...args) {
  console.log(...args);
}

async function upsertUser({
  email,
  name,
  password,
  plan,
  roles = ['user'],
  onboardingRoles = ['player'],
}) {
  let user = await User.findOne({ email });
  if (user) {
    if (!user.isDemo) throw new Error(`Refusing to modify non-demo account ${email}`);
    if (!DRY_RUN && !user.isInternal) {
      user.isInternal = true;
      await user.save();
    }
    log(`  user ${email}: already exists, preserving credentials and roles`);
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
    roles,
    plan: plan || 'starter',
    isDemo: true,
    isInternal: true,
    avatar: buildFixtureImage('avatar'),
    onboarding: {
      status: 'completed',
      roles: onboardingRoles,
      completedSteps: [],
      updatedAt: new Date(),
    },
  });
  log(`  user ${email}: created`);
  return { user, created: true };
}

async function upsertLeague(blueprint, ownerUserId) {
  let league = await League.findOne({ slug: blueprint.slug });
  if (league) {
    if (String(league.ownerUserId) !== String(ownerUserId)) {
      throw new Error(`Refusing to modify league owned by another account: ${blueprint.slug}`);
    }
    log(`  league ${blueprint.slug}: already exists, preserving settings`);
    let season = league.currentSeasonId ? await Season.findById(league.currentSeasonId) : null;
    if (season && String(season.leagueId) !== String(league._id))
      throw new Error('Season belongs to another league');
    if (!season && !DRY_RUN) {
      season = await Season.findOne({ leagueId: league._id, status: 'active' });
      if (!season)
        season = await Season.create({
          leagueId: league._id,
          label: blueprint.seasonLabel,
          status: 'active',
          startedAt: new Date(Date.now() - 120 * DAY_MS),
          createdByUserId: ownerUserId,
        });
      league.currentSeasonId = season._id;
      await league.save();
    }
    return { league, season, created: false };
  }

  if (DRY_RUN) {
    log(`  [dry-run] would create league ${blueprint.slug} with an active season`);
    return { league: null, season: null, created: true };
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
    billingSource: 'comp',
    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    social: buildSocialFixture(ownerUserId, {
      status:
        blueprint.slug === 'demo-league'
          ? 'granted'
          : blueprint.slug === 'summit-city-hoops-circuit'
            ? 'declined'
            : 'unrecorded',
    }),
  });

  // League Seasons: every league needs a resolvable currentSeasonId (see
  // docs/league-seasons.md) — new seeded leagues get one
  // active season upfront, matching what backfill-league-seasons.js produces
  // for pre-existing leagues.
  const season = await Season.create({
    leagueId: league._id,
    label: blueprint.seasonLabel,
    status: 'active',
    startedAt: new Date(Date.now() - 120 * DAY_MS),
    createdByUserId: ownerUserId,
  });
  league.currentSeasonId = season._id;
  await league.save();

  log(`  league ${blueprint.slug}: created (season "${season.label}")`);
  return { league, season, created: true };
}

async function upsertLeagueTeam(league, teamName, index, slug) {
  let team = await LeagueTeam.findOne({ slug });
  if (team) {
    if (String(team.leagueId) !== String(league._id))
      throw new Error(`Team slug belongs to another league: ${slug}`);
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
    colors: ['#141414', TEAM_COLORS[index % TEAM_COLORS.length]],
    logo: buildFixtureImage(`team-${(index % TEAM_COLORS.length) + 1}`),
    social: buildSocialFixture(league.ownerUserId),
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
        social: buildSocialFixture(league.ownerUserId, {
          player: true,
          index: players.length,
          status:
            players.length === 5 ? 'declined' : players.length === 4 ? 'unrecorded' : 'granted',
        }),
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
    return true;
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
    logo: leagueTeam.logo || null,
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
    return { ...event, videoTimestamp: randomInt(10, 300) };
  });
}

function buildDemoLeagueGames(ownerUserId, league, seasonId, leagueTeamsWithPlayers, startDate) {
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

    const events = stampClockSnapshots(
      [...homeEvents, ...awayEvents].sort(
        (eventA, eventB) => new Date(eventA.occurredAt) - new Date(eventB.occurredAt)
      )
    );

    games.push(
      completeGameFixture({
        ownerUserId,
        gameContext: 'league',
        trackingMode: 'dual_team',
        leagueId: league._id,
        seasonId,
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
        venue: DEMO_VENUES[gameIndex % DEMO_VENUES.length],
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
        eventCount: events.length,
      })
    );
  });

  return games;
}

async function seedLeagueGames(
  league,
  seasonId,
  leagueTeamsWithPlayers,
  ownerUserId,
  historyStart = null
) {
  const startDate = historyStart ? new Date(historyStart) : new Date();
  startDate.setHours(0, 0, 0, 0);
  if (!historyStart) startDate.setDate(startDate.getDate() - 100);
  const games = buildDemoLeagueGames(
    ownerUserId,
    league,
    seasonId,
    leagueTeamsWithPlayers,
    startDate
  );
  let createdCount = 0;
  for (const game of games) {
    // Reuse old eight-game fixtures, and repair partially populated seeds.
    const key = {
      leagueId: league._id,
      seasonId,
      ownerUserId,
      homeLeagueTeamId: game.homeLeagueTeamId,
      awayLeagueTeamId: game.awayLeagueTeamId,
      status: 'completed',
    };
    if (await Game.exists(key)) continue;
    createdCount += 1;
    if (!DRY_RUN) await Game.create(game);
  }
  log(
    `  ${DRY_RUN ? '[dry-run] would create' : 'created'} ${createdCount} completed games for ${league.slug}`
  );
  return { createdCount };
}

async function seedUpcomingFixtures(league, seasonId, teams, ownerUserId) {
  for (let index = 0; index < 4; index += 1) {
    const home = teams[index];
    const away = teams[(index + 1) % teams.length];
    const title = `Development fixture · ${away.team.name} at ${home.team.name}`;
    const key = { leagueId: league._id, seasonId, ownerUserId, title };
    if (await Game.exists(key)) continue;
    const scheduledAt = new Date(Date.now() + (index + 1) * 7 * DAY_MS);
    scheduledAt.setHours(19, 0, 0, 0);
    await Game.create({
      ...key,
      gameContext: 'league',
      trackingMode: 'dual_team',
      status: 'scheduled',
      homeLeagueTeamId: home.team._id,
      awayLeagueTeamId: away.team._id,
      trackedLeagueTeamId: home.team._id,
      homeParticipant: buildParticipant(TEAM_SIDES.HOME, home.team),
      awayParticipant: buildParticipant(TEAM_SIDES.AWAY, away.team),
      scheduledAt,
      venue: DEMO_VENUES[index],
      events: [],
    });
  }
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
      plan: 'starter',
    });
    ownerUserId = commissioner?._id;
  }

  const { league, season } = await upsertLeague(blueprint, ownerUserId);
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
    }).map((player, index) => {
      const teammate =
        blueprint.slug === 'demo-league'
          ? DEMO_LEAGUE_TEAMMATES.find(
              (row) => row.teamIndex === teamIndex && row.jerseyNumber === player.jerseyNumber
            )
          : null;
      return {
        ...player,
        position: POSITIONS[index % POSITIONS.length],
        displayName:
          teamIndex === blueprint.demoUserTeamIndex && index === 0
            ? DEMO_USER.name
            : teammate?.name || player.displayName,
      };
    });

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
    const claimed = await claimPlayerForUser(claimTarget, demoUser._id, 'demo user');
    if (claimed) claimTarget.claimedByUserId = demoUser._id;

    if (claimed)
      await upsertLeagueTeamMember({
        leagueId: league._id,
        leagueTeamId: demoTeam.team._id,
        userId: demoUser._id,
        role: blueprint.demoUserRole,
        leaguePlayerId: claimTarget?._id || null,
      });
  }

  const teammates =
    blueprint.slug === 'demo-league' ? await seedDemoLeagueTeammates(leagueTeamsWithPlayers) : [];

  const { createdCount: gamesCreated } = await seedLeagueGames(
    league,
    season?._id || league.currentSeasonId,
    leagueTeamsWithPlayers,
    ownerUserId
  );

  await seedUpcomingFixtures(
    league,
    season?._id || league.currentSeasonId,
    leagueTeamsWithPlayers,
    ownerUserId
  );
  const { recomputeLeagueAggregates } = require('../modules/leagues/leagues.service');
  await recomputeLeagueAggregates(league._id, season?._id || league.currentSeasonId);

  if (blueprint.slug === 'demo-league') {
    const label = 'Previous Demo Season';
    let previous = await Season.findOne({ leagueId: league._id, label });
    if (!previous)
      previous = await Season.create({
        leagueId: league._id,
        label,
        status: 'completed',
        startedAt: new Date(Date.now() - 400 * DAY_MS),
        completedAt: new Date(Date.now() - 200 * DAY_MS),
        createdByUserId: ownerUserId,
      });
    await seedLeagueGames(
      league,
      previous._id,
      leagueTeamsWithPlayers,
      ownerUserId,
      new Date(Date.now() - 380 * DAY_MS)
    );
    await recomputeLeagueAggregates(league._id, previous._id);
  }

  log(
    `  summary: teams=${leagueTeamsWithPlayers.length} newPlayers=${playerCreatedCount} newGames=${gamesCreated}`
  );

  return { league, season, leagueTeamsWithPlayers, teammates };
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
      plan: 'starter',
    });
    if (DRY_RUN || !user) continue;

    const team = leagueTeamsWithPlayers[teammate.teamIndex];
    const leaguePlayer = team?.players?.find(
      (player) => player.jerseyNumber === teammate.jerseyNumber
    );
    const claimed = await claimPlayerForUser(leaguePlayer, user._id, teammate.name);
    if (claimed) leaguePlayer.claimedByUserId = user._id;
    if (team && claimed)
      await upsertLeagueTeamMember({
        leagueId: team.team.leagueId,
        leagueTeamId: team.team._id,
        userId: user._id,
        role: 'player',
        leaguePlayerId: leaguePlayer._id,
      });

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

  // Completed games only: a `scheduled` fixture from the Schedule Builder has no
  // events and no videoUrl, so it yields no highlights and would render a
  // game_card as a 0–0 result.
  const games = await Game.find({
    leagueId: league._id,
    seasonId: league.currentSeasonId,
    status: 'completed',
  }).sort({
    scheduledAt: 1,
  });
  if (games.length === 0) {
    log('  no completed games found for feed post generation, skipping');
    return { createdCount: 0 };
  }

  const existingHighlightCount = await Post.countDocuments({
    type: 'highlight_clip',
    'highlightClip.gameId': { $in: games.map((game) => game._id) },
  });
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

  {
    const supportingPosts = [];
    const [firstGame, secondGame] = games;
    const firstTeam = leagueTeamsWithPlayers[0];
    const secondTeam = leagueTeamsWithPlayers[1];

    if (firstGame) {
      supportingPosts.push({
        creatorUserId: pickPoster(posters, postIndex)._id,
        type: 'game_card',
        caption: pickPoster(FEED_CAPTIONS, (postIndex += 1)),
        gameCard: { gameId: firstGame._id, leagueTeamId: firstGame.homeLeagueTeamId },
      });
    }
    if (secondGame) {
      supportingPosts.push({
        creatorUserId: pickPoster(posters, (postIndex += 1))._id,
        type: 'game_card',
        caption: pickPoster(FEED_CAPTIONS, postIndex),
        gameCard: { gameId: secondGame._id, leagueTeamId: secondGame.awayLeagueTeamId },
      });
    }
    if (firstTeam?.players?.[0]) {
      supportingPosts.push({
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
      supportingPosts.push({
        creatorUserId: pickPoster(posters, (postIndex += 1))._id,
        type: 'team_card',
        caption: pickPoster(FEED_CAPTIONS, postIndex),
        teamCard: { leagueTeamId: secondTeam.team._id },
      });
    }
    for (const imageUrl of FEED_IMAGE_URLS) {
      supportingPosts.push({
        creatorUserId: pickPoster(posters, (postIndex += 1))._id,
        type: 'image',
        caption: pickPoster(FEED_CAPTIONS, postIndex),
        image: {
          url: imageUrl,
          publicId: null,
          width: 1200,
          height: 800,
          mimeType: 'image/jpeg',
        },
      });
    }
    for (const post of supportingPosts) {
      const key = { type: post.type, creatorUserId: { $in: posters.map((poster) => poster._id) } };
      if (post.gameCard) key['gameCard.gameId'] = post.gameCard.gameId;
      if (post.playerCard) key['playerCard.leaguePlayerId'] = post.playerCard.leaguePlayerId;
      if (post.teamCard) key['teamCard.leagueTeamId'] = post.teamCard.leagueTeamId;
      if (post.image) key['image.url'] = post.image.url;
      if (!(await Post.exists(key))) postsToInsert.push(post);
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

// Replay the actual fixture box scores chronologically, including prior seasons.
// Bulk-loaded career aggregates cannot identify which game crossed a threshold.
function buildMilestoneFixtures(games, players) {
  const { evaluateCatalog } = require('../modules/milestones/milestones.catalog');
  const { buildDedupeKey } = require('../modules/milestones/milestones.repository');
  const {
    TRACKED_STATS,
    buildCareerKey,
    extractBoxScoreLines,
  } = require('../modules/milestones/milestones.service');
  const playersById = new Map(players.map((player) => [String(player._id), player]));
  const careers = new Map();
  const docs = [];
  for (const game of [...games].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))) {
    for (const entry of extractBoxScoreLines(game)) {
      const player = playersById.get(String(entry.leaguePlayerId));
      if (!player) continue;
      const careerKey = buildCareerKey(player);
      const before = careers.get(careerKey) || { gamesCount: 0 };
      const after = { gamesCount: before.gamesCount + 1 };
      for (const stat of TRACKED_STATS) after[stat] = (before[stat] || 0) + (entry.line[stat] || 0);
      for (const milestone of evaluateCatalog(before, after, entry.line)) {
        docs.push({
          leagueId: game.leagueId,
          seasonId: game.seasonId,
          careerKey,
          leaguePlayerId: player._id,
          leagueTeamId: player.leagueTeamId,
          claimedByUserId: player.claimedByUserId || null,
          milestoneKey: milestone.key,
          family: milestone.family,
          tier: milestone.tier,
          statKey: milestone.statKey,
          value: milestone.value,
          label: milestone.label,
          rarityRank: milestone.rarityRank,
          sourceGameId: game._id,
          achievedAt: game.completedAt,
          dedupeKey: buildDedupeKey({
            careerKey,
            milestoneKey: milestone.key,
            family: milestone.family,
            sourceGameId: game._id,
          }),
        });
      }
      careers.set(careerKey, after);
    }
  }
  return docs;
}

async function enrichDemoLeague({ league, leagueTeamsWithPlayers, demoUser, teammates }) {
  const { createFollow } = require('../modules/follows/follows.repository');
  const {
    buildPlayerGameCardSnapshot,
    buildMilestoneCardSnapshot,
  } = require('../modules/feed/feed.service');
  const players = await LeaguePlayer.find({ leagueId: league._id });
  const games = await Game.find({
    leagueId: league._id,
    ownerUserId: demoUser._id,
    status: 'completed',
  }).sort({ completedAt: 1 });
  const teamsById = new Map(leagueTeamsWithPlayers.map(({ team }) => [String(team._id), team]));
  for (const game of games) {
    if (!game.boxScore || !game.gameSummary || !game.finalScore) {
      const fixture = completeGameFixture(game.toObject());
      await Game.updateOne(
        { _id: game._id },
        {
          $set: {
            events: fixture.events,
            finalScore: fixture.finalScore,
            boxScore: fixture.boxScore,
            gameSummary: fixture.gameSummary,
            eventCount: fixture.eventCount,
          },
        }
      );
      game.boxScore = fixture.boxScore;
    }
  }
  for (const milestone of buildMilestoneFixtures(games, players)) {
    await PlayerMilestone.updateOne(
      { dedupeKey: milestone.dedupeKey },
      { $setOnInsert: milestone },
      { upsert: true }
    );
  }
  const milestones = await PlayerMilestone.find({
    leagueId: league._id,
    claimedByUserId: demoUser._id,
  })
    .sort({ achievedAt: -1 })
    .limit(6);
  for (const milestone of milestones) {
    if (await Post.exists({ 'milestoneCard.milestoneId': milestone._id })) continue;
    const player = players.find((row) => String(row._id) === String(milestone.leaguePlayerId));
    const team = teamsById.get(String(milestone.leagueTeamId));
    const game = games.find((row) => String(row._id) === String(milestone.sourceGameId));
    if (!game) continue;
    const post = await Post.create({
      creatorUserId: demoUser._id,
      type: 'milestone',
      caption: 'A milestone from our fictional demo season.',
      milestoneCard: {
        milestoneId: milestone._id,
        leaguePlayerId: player._id,
        leagueTeamId: team._id,
        gameId: game._id,
        cardSnapshot: buildMilestoneCardSnapshot({
          milestone,
          player: { ...player.toObject(), avatar: demoUser.avatar },
          team,
          game,
        }),
      },
    });
    await PlayerMilestone.updateOne({ _id: milestone._id }, { $set: { postId: post._id } });
  }
  const demoPlayer = players.find((row) => String(row.claimedByUserId) === String(demoUser._id));
  if (demoPlayer) {
    const appearances = games
      .filter(
        (game) =>
          String(game.seasonId) === String(league.currentSeasonId) &&
          [game.homeLeagueTeamId, game.awayLeagueTeamId].some(
            (id) => String(id) === String(demoPlayer.leagueTeamId)
          )
      )
      .slice(-6);
    for (const game of appearances) {
      const key = {
        type: 'player_game_card',
        creatorUserId: demoUser._id,
        'playerGameCard.gameId': game._id,
        'playerGameCard.leaguePlayerId': demoPlayer._id,
      };
      if (await Post.exists(key)) continue;
      const cardSnapshot = buildPlayerGameCardSnapshot(await getPublicGame(String(game._id)), {
        leaguePlayerId: demoPlayer._id,
      });
      if (!cardSnapshot) throw new Error(`Missing demo player line for ${game._id}`);
      await Post.create({
        creatorUserId: demoUser._id,
        type: 'player_game_card',
        caption: 'Game night — fictional demo stats.',
        playerGameCard: {
          gameId: game._id,
          leaguePlayerId: demoPlayer._id,
          leagueTeamId: demoPlayer.leagueTeamId,
          cardSnapshot,
        },
      });
    }
  }
  const fan = await User.findOne({ email: 'demo-fan@tsw.demo', isDemo: true });
  const community = [demoUser, fan, ...teammates.map(({ user }) => user)].filter(Boolean);
  for (const user of community) {
    await createFollow({ followerUserId: user._id, targetType: 'league', targetId: league._id });
    for (const { team } of leagueTeamsWithPlayers.slice(0, 2)) {
      await createFollow({
        followerUserId: user._id,
        targetType: 'leagueTeam',
        targetId: team._id,
      });
    }
    for (const target of community
      .filter((row) => String(row._id) !== String(user._id))
      .slice(0, 3)) {
      await createFollow({ followerUserId: user._id, targetType: 'user', targetId: target._id });
    }
  }
}

async function seedDemoData() {
  assertDevTarget();
  log(DRY_RUN ? 'Running in --dry-run mode (no writes will be made)' : 'Seeding demo account...');

  const { user: demoUser } = await upsertUser({
    email: DEMO_USER.email,
    name: DEMO_USER.name,
    password: DEMO_USER.password,
    plan: 'starter',
    onboardingRoles: ['league_manager', 'player'],
  });

  await upsertUser({
    email: 'demo-operator@tsw.demo',
    name: 'Dev Social Operator',
    roles: ['user', 'platform_operator'],
    onboardingRoles: ['fan'],
  });
  await upsertUser({
    email: 'demo-fan@tsw.demo',
    name: 'Alex Courtside',
    onboardingRoles: ['fan'],
  });
  if (DRY_RUN)
    log(
      '[dry-run] Dataset: 3 leagues, 15 teams, 120 roster players, 60 current + 20 historical completed games, 12 upcoming fixtures; follows, earned milestones and social cards. Only missing records are inserted.'
    );

  let demoLeagueResult = null;
  for (const blueprint of LEAGUE_BLUEPRINTS) {
    const result = await seedLeague(blueprint, demoUser);
    if (blueprint.slug === 'demo-league') {
      demoLeagueResult = result;
    }
  }

  if (demoLeagueResult && demoUser) {
    log('Demo League feed content:');
    const teammates = demoLeagueResult.teammates;
    await enrichDemoLeague({ ...demoLeagueResult, demoUser });
    await seedDemoLeagueFeedPosts({
      league: demoLeagueResult.league,
      leagueTeamsWithPlayers: demoLeagueResult.leagueTeamsWithPlayers,
      demoUser,
      teammates,
    });
  }

  log('');
  log('Demo seed complete.');
  log(`Login email: ${DEMO_USER.email}`);
  log('Fictional fixtures only. No analytics events or Instagram delivery jobs were created.');
}

const seedConfig = {
  userCount: Number(process.env.SEED_USER_COUNT || 10),
  gamesPerUser: Number(process.env.SEED_GAMES_PER_USER || 20),
  playersPerTeam: Number(process.env.SEED_PLAYERS_PER_TEAM || 10),
  leaguePlayersPerTeam: Math.max(8, Number(process.env.SEED_LEAGUE_PLAYERS_PER_TEAM || 8)),
  postsCount: Number(process.env.SEED_POST_COUNT || 50),
  password: 'password',
};

const seedIdentityBlueprints = [
  { userName: 'Mason Carter', teamName: 'Northside Falcons' },
  { userName: 'Elena Brooks', teamName: 'Harbor Knights' },
  { userName: 'Julian Price', teamName: 'Summit Rangers' },
  { userName: 'Naomi Turner', teamName: 'Cedar Storm' },
  { userName: 'Isaiah Reed', teamName: 'River City Owls' },
  { userName: 'Camila Foster', teamName: 'Lakeshore Titans' },
  { userName: 'Gabriel Hayes', teamName: 'Westbrook Blaze' },
  { userName: 'Sienna Cooper', teamName: 'Pine Valley Wolves' },
  { userName: 'Dominic Bennett', teamName: 'Eastview Comets' },
  { userName: 'Ari Morgan', teamName: 'Metro Guardians' },
  { userName: 'Leah Collins', teamName: 'Granite Eagles' },
  { userName: 'Micah Sullivan', teamName: 'Hillcrest Vipers' },
  { userName: 'Zoe Ramirez', teamName: 'Canyon Strikers' },
  { userName: 'Caleb Ward', teamName: 'Southport Jets' },
  { userName: 'Mila Jenkins', teamName: 'Redwood Waves' },
  { userName: 'Owen Hughes', teamName: 'Stonebridge Royals' },
];

const playerNamePool = [
  'Avery Brooks',
  'Jordan Hayes',
  'Micah Reed',
  'Drew Turner',
  'Kai Bennett',
  'Noah Foster',
  'Evan Price',
  'Blake Cooper',
  'Logan Perry',
  'Riley Morgan',
  'Tessa Coleman',
  'Miles Griffin',
  'Nora Simmons',
  'Jace Bryant',
  'Lila Warren',
  'Calvin Ross',
  'Sadie Webb',
  'Theo Murphy',
  'Maya Stone',
  'Asher Bell',
  'Layla Ortiz',
  'Hudson James',
  'Ruby Powell',
  'Nathan Cruz',
  'Clara Hughes',
  'Roman Sanders',
  'Ivy Jenkins',
  'Declan Long',
  'Hazel Perry',
  'Eli Fisher',
  'Kendall Diaz',
  'Silas Ward',
  'Aria Nichols',
  'Jonah Brooks',
  'Piper Graham',
  'Xavier West',
  'Autumn Ford',
  'Colin Bryant',
  'Sydney Cook',
  'Lincoln Barnes',
  'Violet Stone',
  'Maddox Ruiz',
  'Stella Lawson',
  'Carter Dean',
  'Keira Ellis',
  'Rowan Burke',
  'Paisley Holt',
  'Wesley Wade',
  'Reese Dunn',
  'Sawyer Kelley',
  'Aaliyah Burke',
  'Landon Hart',
  'Vivian Lowe',
  'Emmett Miles',
  'Delilah Fox',
  'Grayson Lane',
  'Penelope Shaw',
  'Nolan Bishop',
  'Willow Reid',
  'Easton Kim',
];

const fallbackFirstNames = [
  'Aiden',
  'Bella',
  'Carson',
  'Daphne',
  'Emerson',
  'Finley',
  'Gianna',
  'Holden',
  'Isla',
  'Jasper',
  'Kiera',
  'Luca',
];

const fallbackLastNames = [
  'Adams',
  'Bishop',
  'Clark',
  'Dawson',
  'Ellis',
  'Franklin',
  'Griffin',
  'Hawkins',
  'Irwin',
  'Jamison',
  'Keller',
  'Lawson',
];

const fallbackTeamPrefixes = [
  'Summit',
  'Harbor',
  'Cedar',
  'Granite',
  'Southport',
  'Redwood',
  'Hillcrest',
  'Stonebridge',
  'Riverview',
  'Northgate',
  'Westfield',
  'Easton',
];

const fallbackTeamMascots = [
  'Rangers',
  'Knights',
  'Storm',
  'Titans',
  'Guardians',
  'Royals',
  'Falcons',
  'Wolves',
  'Blaze',
  'Comets',
  'Owls',
  'Jets',
];

const opponents = [
  'Northside Prep',
  'Harbor Hawks',
  'East City Kings',
  'Lakeside Crew',
  'Metro Elite',
  'Central Storm',
  'Westbrook Lions',
  'Pine Street Club',
  'Summit Heat',
  'River City Rams',
];

const seededLeagueBlueprint = {
  name: 'Metro Spring League',
  slug: 'metro-spring-league',
  seasonLabel: '2026 Spring',
  ownerEmail: 'user1@user1.com',
  // Six competitive teams playing a double round-robin. Six (not four) is what
  // makes the schedule produce 10 completed games per team, which is the
  // minimum that makes Season Trends meaningful — it compares the last five
  // games against the previous five.
  competitiveTeamNames: [
    'City Ballers',
    'Coastal Heat',
    'Skyline Elite',
    'Valley Storm',
    'Harbor Current',
    'Ironside Union',
  ],
  // Deliberately-imperfect teams that exist so the Data Health panel has real
  // targets. Kept separate from the competitive teams above so the league a
  // developer actually browses is complete: full rosters, full stats.
  fixtureTeamNames: {
    // Plays a real schedule, but carries one late signing who never appears in
    // a box score — the only no_appearances target in the seed (that check
    // requires the team to have played, so an unplayed team cannot provide it).
    lateSigning: 'Northgate Athletic',
    // Under-rostered and never plays: the roster_too_small target.
    shortRoster: 'Late Entry FC',
  },
};

// Venues are reused across fixtures so the "use a previous venue" picker on the
// game-creation screens has real options, and carry addresses so public game
// pages can render a map link.
// Extra managed teams owned by the league manager, so that account exercises
// both League admin and standalone-team management.
const ownerExtraTeamNames = ['Riverside Rockets', 'Old Town Saints'];

const seededVenues = [
  {
    name: 'Central Court',
    address: {
      addressLine1: '18 Sportsway',
      city: 'Manchester',
      state: 'Greater Manchester',
      postalCode: 'M1 4WX',
      country: 'United Kingdom',
    },
  },
  {
    name: 'Riverside Gym',
    address: {
      addressLine1: '4 Quay Road',
      city: 'Salford',
      state: 'Greater Manchester',
      postalCode: 'M50 3AZ',
      country: 'United Kingdom',
    },
  },
  {
    name: 'Northgate Arena',
    address: {
      addressLine1: '221 Northgate Street',
      city: 'Leeds',
      state: 'West Yorkshire',
      postalCode: 'LS2 8LX',
      country: 'United Kingdom',
    },
  },
];

// Data Health (docs/data-completeness.md) needs each severity tier represented in
// dev data, otherwise the tab renders only cosmetic Low warnings and the HIGH
// checks — the ones that mean "the standings are wrong" — can never be clicked
// through. These constants drive the deliberately-broken fixtures below.
const DATA_HEALTH_FIXTURES = {
  // Comfortably past the 48h grace period the checks apply to fixtures.
  overdueDaysAgo: 5,
  stuckDaysAgo: 3,
  missingBoxScoreDaysAgo: 4,
  // A healthy future fixture, so no_venue has a target and the panel also shows
  // that not every scheduled game is a problem.
  upcomingDaysAhead: 6,
  shortRosterSize: 3,
};

const feedImageUrls = [
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1518604666860-9ed391f76460?auto=format&fit=crop&w=1200&q=80',
];

const postCaptions = [
  'Big game energy tonight.',
  'Proud of this squad.',
  'Strong performance from the team.',
  'Another card worth sharing.',
  'Great night on the court.',
  'Locked in from start to finish.',
];

const zoneCoordinates = {
  [SHOT_ZONE_IDS.PAINT]: { x: 50, y: 18 },
  [SHOT_ZONE_IDS.MID_RANGE_LEFT]: { x: 29, y: 30 },
  [SHOT_ZONE_IDS.MID_RANGE_RIGHT]: { x: 71, y: 30 },
  [SHOT_ZONE_IDS.TOP_KEY]: { x: 50, y: 36 },
  [SHOT_ZONE_IDS.CORNER_LEFT_3]: { x: 10, y: 12 },
  [SHOT_ZONE_IDS.WING_LEFT_3]: { x: 23, y: 42 },
  [SHOT_ZONE_IDS.WING_RIGHT_3]: { x: 77, y: 42 },
  [SHOT_ZONE_IDS.CORNER_RIGHT_3]: { x: 90, y: 12 },
  [SHOT_ZONE_IDS.BACKCOURT]: { x: 50, y: 85 },
  [SHOT_ZONE_IDS.FREE_THROW_LINE]: { x: 50, y: 24 },
};

const twoPointZones = [
  SHOT_ZONE_IDS.PAINT,
  SHOT_ZONE_IDS.MID_RANGE_LEFT,
  SHOT_ZONE_IDS.MID_RANGE_RIGHT,
  SHOT_ZONE_IDS.TOP_KEY,
];

const threePointZones = [
  SHOT_ZONE_IDS.CORNER_LEFT_3,
  SHOT_ZONE_IDS.WING_LEFT_3,
  SHOT_ZONE_IDS.WING_RIGHT_3,
  SHOT_ZONE_IDS.CORNER_RIGHT_3,
  SHOT_ZONE_IDS.TOP_KEY,
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(values) {
  return values[randomInt(0, values.length - 1)];
}

function buildFallbackUserName(index) {
  const firstName = fallbackFirstNames[index % fallbackFirstNames.length];
  const lastName =
    fallbackLastNames[Math.floor(index / fallbackFirstNames.length) % fallbackLastNames.length];
  const cycle = Math.floor(index / (fallbackFirstNames.length * fallbackLastNames.length));

  return cycle > 0 ? `${firstName} ${lastName} ${cycle + 1}` : `${firstName} ${lastName}`;
}

function buildFallbackTeamName(index) {
  const prefix = fallbackTeamPrefixes[index % fallbackTeamPrefixes.length];
  const mascot =
    fallbackTeamMascots[
      Math.floor(index / fallbackTeamPrefixes.length) % fallbackTeamMascots.length
    ];
  const cycle = Math.floor(index / (fallbackTeamPrefixes.length * fallbackTeamMascots.length));

  return cycle > 0 ? `${prefix} ${mascot} ${cycle + 1}` : `${prefix} ${mascot}`;
}

function buildFallbackPlayerName(index) {
  const firstName = fallbackFirstNames[index % fallbackFirstNames.length];
  const lastName =
    fallbackLastNames[Math.floor(index / fallbackFirstNames.length) % fallbackLastNames.length];
  const cycle = Math.floor(index / (fallbackFirstNames.length * fallbackLastNames.length));

  return cycle > 0 ? `${firstName} ${lastName} ${cycle + 1}` : `${firstName} ${lastName}`;
}

// Onboarding gates where a user lands after signing in, so seeded accounts
// need a deliberate state. Most are 'completed' (sign in and go straight to the
// product); the last two are left mid-flow so the onboarding journey itself is
// testable without registering a throwaway account every time.
function buildSeedOnboarding(index, isLeagueOwner) {
  if (isLeagueOwner) {
    return {
      status: 'completed',
      roles: ['league_manager', 'team_manager'],
      completedSteps: ['roles', 'profiles'],
    };
  }

  if (index === seedConfig.userCount - 1) {
    // A brand-new account: signing in lands on role selection.
    return { status: 'not_started', roles: [], completedSteps: [] };
  }

  if (index === seedConfig.userCount - 2) {
    // Picked roles, never finished: resumes at the create/connect step and
    // keeps the "Finish setup" nav link visible.
    return { status: 'in_progress', roles: ['player'], completedSteps: ['roles'] };
  }

  return {
    status: 'completed',
    roles: index % 3 === 0 ? ['team_manager'] : index % 3 === 1 ? ['player'] : ['fan'],
    completedSteps: ['roles', 'profiles'],
  };
}

function createSeedUsers() {
  return Array.from({ length: seedConfig.userCount }, (_, index) => {
    const number = index + 1;
    const identity = seedIdentityBlueprints[index];
    const email = `user${number}@user${number}.com`;

    return {
      email,
      name: identity?.userName || buildFallbackUserName(index - seedIdentityBlueprints.length),
      teamName: identity?.teamName || buildFallbackTeamName(index - seedIdentityBlueprints.length),
      plan: 'starter',
      isDemo: true,
      onboarding: buildSeedOnboarding(index, email === seededLeagueBlueprint.ownerEmail),
    };
  });
}

// Only one standalone team per owner may be capacityType 'free' — the Team
// schema enforces it with a partial unique index. Additional owned teams are
// paid slots; granting them as 'comp' keeps them fully entitled in dev without
// inventing a Stripe subscription.
function buildSeedPaidTeamProfile(seedUser) {
  return {
    plan: 'team_pro',
    capacityType: 'paid',
    billingSource: 'comp',
    subscriptionStatus: 'active',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    billingEmail: seedUser.email,
  };
}

function buildSeedBillingProfile(seedUser) {
  return {
    plan: 'starter',
    capacityType: 'free',
    billingSource: 'comp',
    subscriptionStatus: 'inactive',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    billingEmail: seedUser.email,
  };
}

function createTrackedEvent(playerId, statType, zoneId, occurredAt, variant) {
  const base = zoneCoordinates[zoneId];

  return {
    playerId,
    statType,
    zoneId,
    x: Math.max(0, Math.min(100, base.x + ((variant % 3) - 1) * 3)),
    y: Math.max(0, Math.min(100, base.y + ((variant % 5) - 2) * 2)),
    occurredAt,
  };
}

function createReboundEvent(playerId, statType, occurredAt) {
  return {
    playerId,
    statType,
    occurredAt,
  };
}

function createAssistEvent(playerId, occurredAt) {
  return {
    playerId,
    statType: STAT_TYPES.AST,
    occurredAt,
  };
}

function createSimplePlayerEvent(playerId, statType, occurredAt) {
  return {
    playerId,
    statType,
    occurredAt,
  };
}

function createOpponentEvent(statType, occurredAt) {
  return {
    statType,
    occurredAt,
  };
}

// The event subschema requires a clock snapshot per event (segmentKind,
// segmentNumber, clockMillisecondsRemaining) since the configurable game clock
// landed. Seeded events carry no real clock, so spread them evenly across
// regulation: event i of n sits at the matching point of segment
// floor(i/n * segments), counting the segment clock down as it goes. Call this
// on the FINAL sorted event list — for dual-team games the two sides are merged
// first, so stamping per side would leave the merged clock non-monotonic.
function stampClockSnapshots(events, format = DEFAULT_GAME_FORMAT) {
  const total = events.length;
  if (total === 0) return events;

  const segments = regulationSegmentCount(format);
  const segmentMs = format.regulationSegmentDurationSeconds * 1000;

  return events.map((event, index) => {
    const position = (index / total) * segments;
    const segmentIndex = Math.min(segments - 1, Math.floor(position));
    const elapsedFraction = position - segmentIndex;

    return {
      ...event,
      segmentKind: SEGMENT_KINDS.REGULATION,
      segmentNumber: segmentIndex + 1,
      clockMillisecondsRemaining: Math.round(segmentMs * (1 - elapsedFraction)),
    };
  });
}

function buildPlayerBlueprints(teamIndex, options = {}) {
  const rosterSize = options.playersPerTeam || seedConfig.playersPerTeam;
  const names = [];
  const baseOffset = (teamIndex * rosterSize) % playerNamePool.length;

  for (let index = 0; index < rosterSize; index += 1) {
    let displayName = playerNamePool[(baseOffset + index) % playerNamePool.length];

    if (names.includes(displayName)) {
      displayName = buildFallbackPlayerName(teamIndex * rosterSize + index);
    }

    while (names.includes(displayName)) {
      displayName = `${displayName} ${index + 1}`;
    }

    names.push(displayName);
  }

  return names.map((displayName, index) => ({
    displayName,
    jerseyNumber: index + 1,
    isActive: true,
  }));
}

// Every game event carries a clock snapshot (segmentKind / segmentNumber /
// clockMillisecondsRemaining) — all three are required by the event schema.
// Seeded events have no real clock, so spread them evenly across regulation
// segments with a descending clock inside each one; this satisfies
// gameClock.validateSnapshot for the default 4x10:00 format.
function assignClockSnapshots(events, format = DEFAULT_GAME_FORMAT) {
  if (events.length === 0) {
    return events;
  }

  const segmentCount = regulationSegmentCount(format);
  const segmentMilliseconds = format.regulationSegmentDurationSeconds * 1000;
  const perSegment = Math.ceil(events.length / segmentCount);

  return events.map((event, index) => {
    const segmentIndex = Math.min(segmentCount - 1, Math.floor(index / perSegment));
    const indexInSegment = index - segmentIndex * perSegment;
    const countInSegment = Math.min(perSegment, events.length - segmentIndex * perSegment);
    const elapsedFraction = countInSegment <= 1 ? 0.5 : indexInSegment / countInSegment;

    return {
      ...event,
      segmentKind: SEGMENT_KINDS.REGULATION,
      segmentNumber: segmentIndex + 1,
      clockMillisecondsRemaining: Math.max(
        0,
        Math.round(segmentMilliseconds * (1 - elapsedFraction))
      ),
    };
  });
}

function buildGameEvents(players, scheduledAt) {
  const events = [];
  let minuteOffset = 0;

  const nextOccurredAt = () => {
    const occurredAt = new Date(scheduledAt.getTime() + minuteOffset * 60 * 1000);
    minuteOffset += 1;
    return occurredAt;
  };

  const pickAssisterId = (shooterId) => {
    const eligiblePlayers = players.filter((player) => String(player._id) !== String(shooterId));
    if (eligiblePlayers.length === 0) {
      return null;
    }

    return randomChoice(eligiblePlayers)._id;
  };

  for (const player of players) {
    const playerId = player._id;
    const fg2Made = randomInt(0, 4);
    const fg2Miss = randomInt(0, 4);
    const fg3Made = randomInt(0, 3);
    const fg3Miss = randomInt(0, 3);
    const ftMade = randomInt(0, 3);
    const ftMiss = randomInt(0, 2);
    const oreb = randomInt(0, 3);
    const dreb = randomInt(0, 4);
    const stl = randomInt(0, 3);
    const tov = randomInt(0, 4);
    const foul = randomInt(0, 4);

    for (let index = 0; index < fg2Made; index += 1) {
      events.push(
        createTrackedEvent(
          playerId,
          STAT_TYPES.FG2_MADE,
          randomChoice(twoPointZones),
          nextOccurredAt(),
          index + randomInt(0, 100)
        )
      );

      if (Math.random() < 0.6) {
        const assisterId = pickAssisterId(playerId);
        if (assisterId) {
          events.push(createAssistEvent(assisterId, nextOccurredAt()));
        }
      }
    }

    for (let index = 0; index < fg2Miss; index += 1) {
      events.push(
        createTrackedEvent(
          playerId,
          STAT_TYPES.FG2_MISS,
          randomChoice(twoPointZones),
          nextOccurredAt(),
          index + randomInt(0, 100)
        )
      );
    }

    for (let index = 0; index < fg3Made; index += 1) {
      events.push(
        createTrackedEvent(
          playerId,
          STAT_TYPES.FG3_MADE,
          randomChoice(threePointZones),
          nextOccurredAt(),
          index + randomInt(0, 100)
        )
      );

      if (Math.random() < 0.6) {
        const assisterId = pickAssisterId(playerId);
        if (assisterId) {
          events.push(createAssistEvent(assisterId, nextOccurredAt()));
        }
      }
    }

    for (let index = 0; index < fg3Miss; index += 1) {
      events.push(
        createTrackedEvent(
          playerId,
          STAT_TYPES.FG3_MISS,
          randomChoice(threePointZones),
          nextOccurredAt(),
          index + randomInt(0, 100)
        )
      );
    }

    for (let index = 0; index < ftMade; index += 1) {
      events.push(
        createTrackedEvent(
          playerId,
          STAT_TYPES.FT_MADE,
          SHOT_ZONE_IDS.FREE_THROW_LINE,
          nextOccurredAt(),
          index + randomInt(0, 100)
        )
      );
    }

    for (let index = 0; index < ftMiss; index += 1) {
      events.push(
        createTrackedEvent(
          playerId,
          STAT_TYPES.FT_MISS,
          SHOT_ZONE_IDS.FREE_THROW_LINE,
          nextOccurredAt(),
          index + randomInt(0, 100)
        )
      );
    }

    for (let index = 0; index < oreb; index += 1) {
      events.push(createReboundEvent(playerId, STAT_TYPES.OREB, nextOccurredAt()));
    }

    for (let index = 0; index < dreb; index += 1) {
      events.push(createReboundEvent(playerId, STAT_TYPES.DREB, nextOccurredAt()));
    }

    for (let index = 0; index < stl; index += 1) {
      events.push(createSimplePlayerEvent(playerId, STAT_TYPES.STL, nextOccurredAt()));
    }

    for (let index = 0; index < tov; index += 1) {
      events.push(createSimplePlayerEvent(playerId, STAT_TYPES.TOV, nextOccurredAt()));
    }

    for (let index = 0; index < foul; index += 1) {
      events.push(createSimplePlayerEvent(playerId, STAT_TYPES.FOUL, nextOccurredAt()));
    }
  }

  const oppFtMade = randomInt(4, 16);
  const oppFg2Made = randomInt(8, 24);
  const oppFg3Made = randomInt(1, 10);
  const oppReb = randomInt(4, 14);

  for (let index = 0; index < oppFtMade; index += 1) {
    events.push(createOpponentEvent(STAT_TYPES.OPP_FT_MADE, nextOccurredAt()));
  }

  for (let index = 0; index < oppFg2Made; index += 1) {
    events.push(createOpponentEvent(STAT_TYPES.OPP_FG2_MADE, nextOccurredAt()));
  }

  for (let index = 0; index < oppFg3Made; index += 1) {
    events.push(createOpponentEvent(STAT_TYPES.OPP_FG3_MADE, nextOccurredAt()));
  }

  for (let index = 0; index < oppReb; index += 1) {
    events.push(createOpponentEvent(STAT_TYPES.OPP_REB, nextOccurredAt()));
  }

  return assignClockSnapshots(
    events.sort((eventA, eventB) => new Date(eventA.occurredAt) - new Date(eventB.occurredAt))
  );
}

function buildGameDocs(userId, team) {
  const players = team.players.map((player) => ({
    _id: player._id,
    displayName: player.displayName,
  }));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(today);
  startDate.setFullYear(startDate.getFullYear() - 1);
  const totalSpanMs = endDate.getTime() - startDate.getTime();

  return Array.from({ length: seedConfig.gamesPerUser }, (_, gameIndex) => {
    const opponent = opponents[(gameIndex + randomInt(0, opponents.length - 1)) % opponents.length];
    const progress = seedConfig.gamesPerUser === 1 ? 1 : gameIndex / (seedConfig.gamesPerUser - 1);
    const scheduledAt = new Date(startDate.getTime() + totalSpanMs * progress);
    scheduledAt.setHours(18 + (gameIndex % 3), (gameIndex % 2) * 30, 0, 0);
    const completedAt = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000);

    return completeGameFixture(
      {
        ownerUserId: userId,
        teamId: team._id,
        title: `Game ${gameIndex + 1} vs ${opponent}`,
        opponent,
        status: 'completed',
        scheduledAt,
        completedAt,
        events: stampClockSnapshots(buildGameEvents(players, scheduledAt)),
      },
      team
    );
  });
}

function buildLeagueRosterSnapshot(players) {
  return players.map((player) => ({
    _id: new mongoose.Types.ObjectId(),
    leaguePlayerId: player._id,
    sourceType: 'league_player',
    sourcePlayerId: player._id,
    displayName: player.displayName,
    jerseyNumber: player.jerseyNumber ?? null,
    position: player.position ?? null,
    claimedByUserId: player.claimedByUserId ?? null,
    isClaimed: Boolean(player.claimedByUserId),
    isActive: Boolean(player.isActive),
  }));
}

function buildLeagueGameEvents(rosterSnapshot, scheduledAt) {
  const players = rosterSnapshot.map((player) => ({
    _id: player._id,
    displayName: player.displayName,
  }));

  return buildGameEvents(players, scheduledAt);
}

function attachTeamSide(events, teamSide) {
  return events.map((event) => ({
    ...event,
    teamSide,
  }));
}

function buildSeedLeagueGames(ownerUserId, league, leagueTeamsWithPlayers) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - 3);

  // Double round-robin: every team hosts every other team once and visits them
  // once, so each team finishes with 2*(n-1) completed games and an even split
  // of home and away fixtures for the standings to be worth reading.
  const matchups = [];
  for (let home = 0; home < leagueTeamsWithPlayers.length; home += 1) {
    for (let away = 0; away < leagueTeamsWithPlayers.length; away += 1) {
      if (home !== away) matchups.push([home, away]);
    }
  }

  const completedGames = matchups.map(([homeIndex, awayIndex], gameIndex) => {
    const home = leagueTeamsWithPlayers[homeIndex];
    const away = leagueTeamsWithPlayers[awayIndex];
    const endDate = new Date(today.getTime() - DAY_MS);
    const scheduledAt = new Date(
      startDate.getTime() +
        ((endDate.getTime() - startDate.getTime()) * gameIndex) / Math.max(1, matchups.length - 1)
    );
    scheduledAt.setHours(18 + (gameIndex % 3), gameIndex % 2 === 0 ? 0 : 30, 0, 0);
    const completedAt = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000);
    // The whole roster is snapshotted AND given events, so every player on a
    // competitive team has a populated stat line. `excludeFromBoxScore` marks
    // the one deliberate exception (the late-signing fixture team), where the
    // last player is left out of the snapshot entirely — LeaguePlayerStats is
    // built from the snapshot, so withholding only events would still give them
    // a gamesCount and defeat the no_appearances check.
    const homePlaying = home.excludeFromBoxScore ? home.players.slice(0, -1) : home.players;
    const awayPlaying = away.excludeFromBoxScore ? away.players.slice(0, -1) : away.players;
    const homeRosterSnapshot = buildLeagueRosterSnapshot(homePlaying);
    const awayRosterSnapshot = buildLeagueRosterSnapshot(awayPlaying);
    const homeEvents = attachTeamSide(
      buildLeagueGameEvents(homeRosterSnapshot, scheduledAt),
      TEAM_SIDES.HOME
    );
    const awayEvents = attachTeamSide(
      buildLeagueGameEvents(awayRosterSnapshot, scheduledAt),
      TEAM_SIDES.AWAY
    );
    const venue = seededVenues[gameIndex % seededVenues.length];

    return completeGameFixture({
      ownerUserId,
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: league._id,
      homeLeagueTeamId: home.team._id,
      awayLeagueTeamId: away.team._id,
      trackedLeagueTeamId: home.team._id,
      initialActiveSide: TEAM_SIDES.HOME,
      homeParticipant: {
        side: TEAM_SIDES.HOME,
        participantType: 'league_team',
        teamId: null,
        leagueTeamId: home.team._id,
        displayName: home.team.name,
        logo: home.team.logo || null,
        colors: home.team.colors || ['#0f172a', '#38bdf8'],
        billingSnapshot: { plan: 'league', subscriptionStatus: 'active' },
        entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
      },
      awayParticipant: {
        side: TEAM_SIDES.AWAY,
        participantType: 'league_team',
        teamId: null,
        leagueTeamId: away.team._id,
        displayName: away.team.name,
        logo: away.team.logo || null,
        colors: away.team.colors || ['#0f172a', '#38bdf8'],
        billingSnapshot: { plan: 'league', subscriptionStatus: 'active' },
        entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
      },
      title: `${away.team.name} at ${home.team.name}`,
      status: 'completed',
      scheduledAt,
      completedAt,
      venue: venue.name,
      venueAddress: venue.address,
      rosterSnapshot: homeRosterSnapshot,
      homeRosterSnapshot,
      awayRosterSnapshot,
      startingLineupPlayerIds: homeRosterSnapshot.slice(0, 5).map((player) => player._id),
      currentLineupPlayerIds: homeRosterSnapshot.slice(0, 5).map((player) => player._id),
      homeStartingLineupPlayerIds: homeRosterSnapshot.slice(0, 5).map((player) => player._id),
      homeCurrentLineupPlayerIds: homeRosterSnapshot.slice(0, 5).map((player) => player._id),
      awayStartingLineupPlayerIds: awayRosterSnapshot.slice(0, 5).map((player) => player._id),
      awayCurrentLineupPlayerIds: awayRosterSnapshot.slice(0, 5).map((player) => player._id),
      events: stampClockSnapshots(
        [...homeEvents, ...awayEvents].sort(
          (eventA, eventB) => new Date(eventA.occurredAt) - new Date(eventB.occurredAt)
        )
      ),
    });
  });

  return [...completedGames, ...buildDataHealthGames(ownerUserId, league, leagueTeamsWithPlayers)];
}

// Deliberately-broken league games so every Data Health severity tier has a
// target in dev. Each one is a state a real league reaches by accident:
// a fixture nobody played, a game left mid-tracking, a game finalised with no
// stats entered, and an upcoming fixture with no venue booked yet.
function buildDataHealthGames(ownerUserId, league, leagueTeamsWithPlayers) {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  function participant(entry, side) {
    return {
      side,
      participantType: 'league_team',
      teamId: null,
      leagueTeamId: entry.team._id,
      displayName: entry.team.name,
      logo: null,
      colors: entry.team.colors || ['#0f172a', '#38bdf8'],
      billingSnapshot: { plan: 'league', subscriptionStatus: 'active' },
      entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
    };
  }

  function baseGame(home, away, { status, scheduledAt, venue = null, completedAt = null }) {
    const venueAddress = venue
      ? (seededVenues.find((option) => option.name === venue)?.address ?? null)
      : null;
    const homeRosterSnapshot = buildLeagueRosterSnapshot(home.players);
    const awayRosterSnapshot = buildLeagueRosterSnapshot(away.players);

    return {
      ownerUserId,
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: league._id,
      homeLeagueTeamId: home.team._id,
      awayLeagueTeamId: away.team._id,
      trackedLeagueTeamId: home.team._id,
      initialActiveSide: TEAM_SIDES.HOME,
      homeParticipant: participant(home, TEAM_SIDES.HOME),
      awayParticipant: participant(away, TEAM_SIDES.AWAY),
      title: `${away.team.name} at ${home.team.name}`,
      status,
      scheduledAt,
      completedAt,
      venue,
      venueAddress,
      rosterSnapshot: homeRosterSnapshot,
      homeRosterSnapshot,
      awayRosterSnapshot,
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
      homeStartingLineupPlayerIds: [],
      homeCurrentLineupPlayerIds: [],
      awayStartingLineupPlayerIds: [],
      awayCurrentLineupPlayerIds: [],
      // Every fixture here is deliberately eventless — that is precisely what
      // makes missing_box_score fire, and fixtures never carry events anyway.
      events: [],
    };
  }

  const [ballers, heat, skyline, storm] = leagueTeamsWithPlayers;

  return [
    // HIGH — overdue_game: a fixture whose date passed and nobody started it.
    baseGame(ballers, heat, {
      status: 'scheduled',
      scheduledAt: new Date(now - DATA_HEALTH_FIXTURES.overdueDaysAgo * dayMs),
      venue: 'Central Court',
    }),
    // HIGH — stuck_in_progress: tracking started and was never finalised, so
    // the result is silently missing from the standings.
    baseGame(skyline, storm, {
      status: 'in_progress',
      scheduledAt: new Date(now - DATA_HEALTH_FIXTURES.stuckDaysAgo * dayMs),
      venue: 'Riverside Gym',
    }),
    // HIGH — missing_box_score: marked complete but no stats were ever entered.
    baseGame(heat, skyline, {
      status: 'completed',
      scheduledAt: new Date(now - DATA_HEALTH_FIXTURES.missingBoxScoreDaysAgo * dayMs),
      completedAt: new Date(
        now - DATA_HEALTH_FIXTURES.missingBoxScoreDaysAgo * dayMs + 2 * 60 * 60 * 1000
      ),
      venue: 'Central Court',
    }),
    // LOW — no_venue: an upcoming fixture with no location booked. Also proves
    // future fixtures are NOT flagged as overdue (the 48h grace period).
    baseGame(storm, ballers, {
      status: 'scheduled',
      scheduledAt: new Date(now + DATA_HEALTH_FIXTURES.upcomingDaysAhead * dayMs),
      venue: null,
    }),
  ];
}

async function upsertSeedUsers() {
  const seedUsers = createSeedUsers();
  const passwordHash = await bcrypt.hash(seedConfig.password, 12);
  const users = [];

  for (const seedUser of seedUsers) {
    let user = await User.findOne({ email: seedUser.email });

    if (!user) {
      user = await User.create({
        email: seedUser.email,
        name: seedUser.name,
        passwordHash,
        authProvider: 'local',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        roles: ['user'],
        isDemo: true,
        isInternal: true,
        plan: seedUser.plan,
        avatar: buildFixtureImage('avatar'),
        onboarding: seedUser.onboarding,
        // User.league* fields removed (Phase 6 / T-25): league billing lives on the
        // League doc; user-level league plan is resolver-derived, never stored.
      });
    } else {
      user.name = seedUser.name;
      user.passwordHash = passwordHash;
      user.authProvider = 'local';
      user.emailVerified = true;
      user.emailVerifiedAt = user.emailVerifiedAt || new Date();
      user.roles = ['user'];
      user.isDemo = true;
      user.isInternal = true;
      user.plan = seedUser.plan;
      user.onboarding = seedUser.onboarding;
      await user.save();
    }

    users.push({
      user,
      teamName: seedUser.teamName,
      plan: seedUser.plan,
      email: seedUser.email,
    });
  }

  return users;
}

// This script clears the entire database it connects to. It is a development-
// only tool, so it refuses to run anywhere that even looks like production and
// requires an exact database-name confirmation rather than trusting ENV_FILE.
function assertDevTarget({
  nodeEnv = env.NODE_ENV,
  appEnv = env.APP_ENV,
  uri = env.MONGO_URI || '',
  dbName = env.MONGO_DB_NAME || '',
  confirmedDbName = process.env.SEED_CONFIRM_DB || '',
} = {}) {
  const redactedUri = uri.replace(/\/\/[^@]*@/, '//***:***@');

  if (nodeEnv === 'production') {
    throw new Error(`Refusing to seed: NODE_ENV is production (${redactedUri})`);
  }

  if (appEnv === 'production') {
    throw new Error(`Refusing to seed: APP_ENV is production (${redactedUri})`);
  }

  // A production database name is the last line of defence if someone points a
  // development ENV_FILE at a live cluster.
  if (/prod/i.test(dbName)) {
    throw new Error(`Refusing to seed: database name looks like production (${dbName})`);
  }

  if (!/dev|test|local/i.test(dbName)) {
    throw new Error(
      `Refusing to seed: database name "${dbName}" is not recognisably a dev/test database. ` +
        'Rename it or set MONGO_DB_NAME explicitly before seeding.'
    );
  }

  if (!confirmedDbName) {
    throw new Error(
      'Refusing to seed: SEED_CONFIRM_DB is required and must exactly match MONGO_DB_NAME.'
    );
  }

  if (confirmedDbName !== dbName) {
    throw new Error(
      `Refusing to seed: SEED_CONFIRM_DB "${confirmedDbName}" does not match MONGO_DB_NAME "${dbName}".`
    );
  }

  return { redactedUri, dbName };
}

// Prefer a full drop so collections belonging to models this script no longer
// imports cannot survive and leave an impossible dev state. Some restricted
// Atlas users cannot drop a database, so the fallback clears every collection.
// autoIndex is on outside production, and indexes are recreated below.
async function resetSeedData() {
  try {
    await mongoose.connection.dropDatabase();
  } catch (error) {
    const dropDatabaseDenied =
      error?.code === 8000 &&
      /not allowed.*dropDatabase|dropDatabase.*not allowed/i.test(error.message);
    if (!dropDatabaseDenied) throw error;

    // Atlas roles commonly allow application reads/writes but deliberately deny
    // dropDatabase. Clear every ordinary collection instead, preserving indexes
    // and keeping the same exact-database safeguards enforced above.
    console.warn('dropDatabase is not permitted; clearing development collections instead...');
    const collections = await mongoose.connection.db
      .listCollections({}, { nameOnly: true })
      .toArray();
    for (const { name } of collections) {
      if (!name.startsWith('system.')) {
        await mongoose.connection.collection(name).deleteMany({});
      }
    }
  }
  // Recreate indexes up front so the first inserts are validated against the
  // real unique constraints (e.g. User.email) instead of silently duplicating.
  await Promise.all(
    [
      User,
      Session,
      AuthToken,
      Team,
      PlayerClaimRequest,
      Game,
      Post,
      League,
      LeagueTeam,
      LeaguePlayer,
      LeagueTeamMember,
      LeagueJoinRequest,
      Season,
      LeagueStandings,
      LeaguePlayerStats,
      LeagueDataIssueDismissal,
      Follow,
      PlayerMilestone,
    ].map((model) => model.createIndexes())
  );
}

async function seedLeagueForUser(userEntry) {
  const league = await League.create({
    ownerUserId: userEntry.user._id,
    name: seededLeagueBlueprint.name,
    slug: seededLeagueBlueprint.slug,
    description: 'Seeded league for local development and league management testing.',
    seasonLabel: seededLeagueBlueprint.seasonLabel,
    status: 'active',
    isPublic: true,
    plan: 'league',
    subscriptionStatus: 'active',
    billingSource: 'comp',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    social: buildSocialFixture(userEntry.user._id),
  });

  // League Seasons: every league game carries a seasonId, and the Data Health
  // panel resolves league.currentSeasonId. Without a Season the seeded league
  // reports "no active season" and none of its data can be audited.
  const season = await Season.create({
    leagueId: league._id,
    label: seededLeagueBlueprint.seasonLabel,
    status: 'active',
    startedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
    createdByUserId: userEntry.user._id,
  });
  league.currentSeasonId = season._id;
  await league.save();

  let leagueTeamCount = 0;
  let leaguePlayerCount = 0;
  let leagueGameCount = 0;
  let leagueEventCount = 0;
  const leagueTeamsWithPlayers = [];

  // Competitive teams first (they play the round-robin), then the two Data
  // Health fixture teams. Order matters: buildSeedLeagueGames schedules over
  // the competitive slice, and the fixture games address the rest by name.
  const teamPlan = [
    ...seededLeagueBlueprint.competitiveTeamNames.map((name) => ({
      name,
      kind: 'competitive',
    })),
    { name: seededLeagueBlueprint.fixtureTeamNames.lateSigning, kind: 'lateSigning' },
    { name: seededLeagueBlueprint.fixtureTeamNames.shortRoster, kind: 'shortRoster' },
  ];

  for (const [index, plan] of teamPlan.entries()) {
    const leagueTeam = await LeagueTeam.create({
      leagueId: league._id,
      name: plan.name,
      slug: `${seededLeagueBlueprint.slug}-${index + 1}`,
      colors: ['#0f172a', TEAM_COLORS[index % TEAM_COLORS.length]],
      logo: buildFixtureImage(`team-${(index % TEAM_COLORS.length) + 1}`),
      social: buildSocialFixture(userEntry.user._id),
      status: 'active',
    });

    // Competitive teams carry a full roster and every one of those players
    // records stats. The lateSigning fixture team carries one extra player who
    // is held out of every box score; the shortRoster team is deliberately
    // below the minimum and never plays.
    const rosterSize =
      plan.kind === 'shortRoster'
        ? DATA_HEALTH_FIXTURES.shortRosterSize
        : plan.kind === 'lateSigning'
          ? seedConfig.leaguePlayersPerTeam + 1
          : seedConfig.leaguePlayersPerTeam;

    const roster = buildPlayerBlueprints(100 + index, {
      playersPerTeam: rosterSize,
    }).map((player, playerIndex) => ({
      leagueId: league._id,
      leagueTeamId: leagueTeam._id,
      displayName: player.displayName,
      // LOW — missing_jersey: one player on the lateSigning fixture team has no
      // number. Competitive rosters are left complete so a developer browsing
      // the league does not see avoidable warnings on every team.
      jerseyNumber: plan.kind === 'lateSigning' && playerIndex === 0 ? null : player.jerseyNumber,
      position: POSITIONS[playerIndex % POSITIONS.length],
      social: buildSocialFixture(userEntry.user._id, { player: true }),
      isActive: true,
      claimedByUserId: null,
    }));

    const players = await LeaguePlayer.insertMany(roster, { ordered: true });
    leagueTeamsWithPlayers.push({
      team: leagueTeam,
      players,
      kind: plan.kind,
      // Consumed by buildSeedLeagueGames: hold the last player out of the
      // snapshot so no_appearances has exactly one target.
      excludeFromBoxScore: plan.kind === 'lateSigning',
    });
    leagueTeamCount += 1;
    leaguePlayerCount += roster.length;
  }

  // Everything except the deliberately under-rostered team plays the schedule.
  // The lateSigning fixture team has to play, because the no_appearances check
  // only fires for a team that has completed a game.
  const playingTeams = leagueTeamsWithPlayers.filter((entry) => entry.kind !== 'shortRoster');
  const leagueGames = await Game.insertMany(
    buildSeedLeagueGames(userEntry.user._id, league, playingTeams).map((game) => ({
      ...game,
      seasonId: season._id,
    })),
    { ordered: true }
  );
  leagueGameCount += leagueGames.length;
  leagueEventCount += leagueGames.reduce((total, game) => total + game.events.length, 0);

  // Materialize standings + per-player stats through the real recompute path.
  // Without this, LeaguePlayerStats is empty and the Data Health panel's
  // no_appearances check flags EVERY rostered player, burying the real issues.
  // Requiring lazily keeps the seed's module graph free of the service layer
  // until this point.
  const { recomputeLeagueAggregates } = require('../modules/leagues/leagues.service');
  await recomputeLeagueAggregates(league._id, season._id);

  return {
    league,
    season,
    leagueTeamCount,
    leaguePlayerCount,
    leagueGameCount,
    leagueEventCount,
  };
}

// Standalone player claiming: a user asks to be linked to a roster slot on a
// managed team and the team owner approves it. Seeding both an approved link
// and a pending request means My Sporty has a one-off profile to show and the
// Edit Team page has a request queue to act on, without anyone having to click
// through the flow first.
async function seedStandalonePlayerClaims(seededUsers, seededFeedEntries) {
  const owner = seededFeedEntries.find(
    (entry) => entry.email === seededLeagueBlueprint.ownerEmail && entry.team
  );
  if (!owner) return { approved: 0, pending: 0 };

  // Two different accounts so the approved and pending states are visibly
  // distinct, and neither is the owner (an owner claiming their own roster slot
  // is a different, uninteresting case).
  const [claimant, requester] = seededUsers.filter(
    (entry) => entry.email !== seededLeagueBlueprint.ownerEmail
  );
  if (!claimant || !requester) return { approved: 0, pending: 0 };

  const team = await Team.findById(owner.team._id);
  const [approvedPlayer, pendingPlayer] = team.players;
  if (!approvedPlayer || !pendingPlayer) return { approved: 0, pending: 0 };

  approvedPlayer.claimedByUserId = claimant.user._id;
  await team.save();

  await PlayerClaimRequest.create([
    {
      teamId: team._id,
      playerId: approvedPlayer._id,
      requesterUserId: claimant.user._id,
      status: 'approved',
      reviewedByUserId: owner.user._id,
      reviewedAt: new Date(),
    },
    {
      teamId: team._id,
      playerId: pendingPlayer._id,
      requesterUserId: requester.user._id,
      status: 'pending',
    },
  ]);

  return {
    approved: 1,
    pending: 1,
    teamName: team.name,
    claimantEmail: claimant.email,
    requesterEmail: requester.email,
  };
}

function buildSeedPosts(entries) {
  const posts = [];
  let imageCount = 0;
  let gameCardCount = 0;
  let playerCardCount = 0;
  let teamCardCount = 0;

  for (let index = 0; index < seedConfig.postsCount; index += 1) {
    const entry = entries[index % entries.length];
    const createdAt = new Date(Date.now() - index * 2 * 60 * 60 * 1000);
    const caption = postCaptions[index % postCaptions.length];
    const slot = index % 10;

    if (slot < 4) {
      imageCount += 1;
      posts.push({
        creatorUserId: entry.user._id,
        type: 'image',
        caption,
        image: {
          url: feedImageUrls[index % feedImageUrls.length],
          publicId: null,
          width: 1200,
          height: 800,
          mimeType: 'image/jpeg',
        },
        createdAt,
        updatedAt: createdAt,
      });
      continue;
    }

    if (slot < 7) {
      const game = entry.games[index % entry.games.length];
      gameCardCount += 1;
      posts.push({
        creatorUserId: entry.user._id,
        type: 'game_card',
        caption,
        gameCard: {
          gameId: game._id,
          teamId: entry.team._id,
        },
        createdAt,
        updatedAt: createdAt,
      });
      continue;
    }

    if (slot < 9) {
      const player = entry.team.players[index % entry.team.players.length];
      playerCardCount += 1;
      posts.push({
        creatorUserId: entry.user._id,
        type: 'player_card',
        caption,
        playerCard: {
          teamId: entry.team._id,
          playerId: player._id,
        },
        createdAt,
        updatedAt: createdAt,
      });
      continue;
    }

    teamCardCount += 1;
    posts.push({
      creatorUserId: entry.user._id,
      type: 'team_card',
      caption,
      teamCard: {
        teamId: entry.team._id,
      },
      createdAt,
      updatedAt: createdAt,
    });
  }

  return {
    posts,
    counts: {
      imageCount,
      gameCardCount,
      playerCardCount,
      teamCardCount,
    },
  };
}

async function main() {
  // Checked before connecting, so a misconfigured target never even opens a
  // connection to something it might drop.
  const target = assertDevTarget();
  if (DRY_RUN) {
    console.log(
      `DRY RUN: ${process.argv.includes('--demo') ? 'additive demo seed' : 'full development reset'} of ${target.dbName}. No connection or writes.`
    );
    console.log(
      'Demo dataset: 3 leagues, 15 teams, 120 roster players, 60 current and 20 historical completed games, 12 upcoming fixtures, community follows, earned milestones and social cards.'
    );
    if (!process.argv.includes('--demo'))
      console.log(
        `Reset also creates ${seedConfig.userCount} development users, their managed teams, Metro Spring League, claims and Pulse posts.`
      );
    return;
  }

  await connectDb();

  try {
    if (process.argv.includes('--demo')) {
      await seedDemoData();
      return;
    }
    console.log(`Seeding ${target.dbName} at ${target.redactedUri}`);
    console.log('Dropping existing database...');
    await resetSeedData();
    const seededUsers = await upsertSeedUsers();

    let teamCount = 0;
    let playerCount = 0;
    let gameCount = 0;
    let eventCount = 0;
    let postCount = 0;
    let leagueCount = 0;
    let leagueTeamCount = 0;
    let leaguePlayerCount = 0;
    let leagueGameCount = 0;
    let leagueEventCount = 0;
    let postTypeCounts = {
      imageCount: 0,
      gameCardCount: 0,
      playerCardCount: 0,
      teamCardCount: 0,
    };
    const seededFeedEntries = [];

    for (const [index, entry] of seededUsers.entries()) {
      const team = await Team.create({
        ownerUserId: entry.user._id,
        name: entry.teamName || `Team ${index + 1}`,
        logo: buildFixtureImage(`team-${(index % TEAM_COLORS.length) + 1}`),
        ...buildSeedBillingProfile(entry, index),
        social: buildSocialFixture(entry.user._id),
        players: buildPlayerBlueprints(index).map((player) => ({
          ...player,
          social: buildSocialFixture(entry.user._id, { player: true }),
        })),
      });

      const games = await Game.insertMany(buildGameDocs(entry.user._id, team), { ordered: true });
      seededFeedEntries.push({
        ...entry,
        team,
        games,
      });

      teamCount += 1;
      playerCount += team.players.length;
      gameCount += games.length;
      eventCount += games.reduce((total, game) => total + game.events.length, 0);
    }

    const primaryLeagueOwner = seededUsers.find(
      (entry) => entry.email === seededLeagueBlueprint.ownerEmail
    );

    // The league owner also runs managed teams outside the league, so the Admin
    // page shows both halves of the product for the account a developer signs
    // in with. These get the same full roster + completed-game treatment as
    // every other seeded team.
    if (primaryLeagueOwner) {
      for (const [extraIndex, extraTeamName] of ownerExtraTeamNames.entries()) {
        const extraTeam = await Team.create({
          ownerUserId: primaryLeagueOwner.user._id,
          name: extraTeamName,
          logo: buildFixtureImage(`team-${(extraIndex % TEAM_COLORS.length) + 1}`),
          ...buildSeedPaidTeamProfile(primaryLeagueOwner),
          social: buildSocialFixture(primaryLeagueOwner.user._id),
          homeVenue: {
            arenaName: seededVenues[extraIndex % seededVenues.length].name,
            ...seededVenues[extraIndex % seededVenues.length].address,
          },
          players: buildPlayerBlueprints(200 + extraIndex).map((player) => ({
            ...player,
            social: buildSocialFixture(primaryLeagueOwner.user._id, { player: true }),
          })),
        });

        const extraGames = await Game.insertMany(
          buildGameDocs(primaryLeagueOwner.user._id, extraTeam),
          { ordered: true }
        );

        seededFeedEntries.push({ ...primaryLeagueOwner, team: extraTeam, games: extraGames });
        teamCount += 1;
        playerCount += extraTeam.players.length;
        gameCount += extraGames.length;
        eventCount += extraGames.reduce((total, game) => total + game.events.length, 0);
      }
    }
    if (primaryLeagueOwner) {
      const seededLeague = await seedLeagueForUser(primaryLeagueOwner);
      leagueCount += 1;
      leagueTeamCount += seededLeague.leagueTeamCount;
      leaguePlayerCount += seededLeague.leaguePlayerCount;
      leagueGameCount += seededLeague.leagueGameCount;
      leagueEventCount += seededLeague.leagueEventCount;
    }

    const claimSummary = await seedStandalonePlayerClaims(seededUsers, seededFeedEntries);

    const seededPosts = buildSeedPosts(seededFeedEntries);
    await Post.insertMany(seededPosts.posts, { ordered: true });
    postCount = seededPosts.posts.length;
    postTypeCounts = seededPosts.counts;

    await seedDemoData();

    console.log('Seed complete');
    console.log(`Users: ${seededUsers.length}`);
    console.log(`Teams: ${teamCount}`);
    console.log(`Leagues: ${leagueCount}`);
    console.log(`League Teams: ${leagueTeamCount}`);
    console.log(`League Players: ${leaguePlayerCount}`);
    console.log(`League Games: ${leagueGameCount}`);
    console.log(`League Events: ${leagueEventCount}`);
    console.log(
      `Seeded League Owner: ${seededLeagueBlueprint.ownerEmail} (league premium, ${seedConfig.leaguePlayersPerTeam} players per league team)`
    );
    console.log(
      `Standalone Teams: ${teamCount} (${seededUsers.length} free, ${ownerExtraTeamNames.length} comped paid capacity)`
    );
    console.log(`Players: ${playerCount}`);
    console.log(`Games: ${gameCount}`);
    console.log(`Events: ${eventCount}`);
    console.log(`Posts: ${postCount}`);
    console.log(`Image Posts: ${postTypeCounts.imageCount}`);
    console.log(`Game Card Posts: ${postTypeCounts.gameCardCount}`);
    console.log(`Player Card Posts: ${postTypeCounts.playerCardCount}`);
    console.log(`Team Card Posts: ${postTypeCounts.teamCardCount}`);
    console.log('');
    console.log('='.repeat(64));
    console.log('SIGN IN WITH');
    console.log(`  Email:    ${seededLeagueBlueprint.ownerEmail}`);
    console.log(`  Password: ${seedConfig.password}`);
    console.log('');
    console.log(`  Manages:  ${seededLeagueBlueprint.name} (${leagueTeamCount} teams)`);
    console.log(`  Plus:     ${ownerExtraTeamNames.join(', ')} (managed teams)`);
    console.log('='.repeat(64));
    console.log('');

    if (claimSummary.pending) {
      console.log(
        `Player claims on ${claimSummary.teamName}: 1 approved (${claimSummary.claimantEmail}), ` +
          `1 pending review (${claimSummary.requesterEmail})`
      );
    }

    console.log('All logins (password is the same for every account):');
    for (const entry of seededUsers) {
      const state = entry.user.onboarding?.status || 'completed';
      const note = state === 'completed' ? '' : `  [onboarding: ${state}]`;
      console.log(`- ${entry.email} (${entry.plan})${note}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed failed');
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  assertDevTarget,
  buildMilestoneFixtures,
  buildRoundRobin,
  buildSocialFixture,
  completeGameFixture,
  buildDemoLeagueGames,
  seedLeagueGames,
  upsertUser,
  seedDemoData,
  buildSeedLeagueGames,
  buildGameDocs,
  randomInt,
  randomChoice,
  playerNamePool,
  fallbackTeamPrefixes,
  fallbackTeamMascots,
  opponents,
  buildPlayerBlueprints,
  buildLeagueRosterSnapshot,
  buildLeagueGameEvents,
  attachTeamSide,
  stampClockSnapshots,
};
