const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { SHOT_ZONE_IDS, STAT_TYPES, TEAM_SIDES } = require('../modules/shared/stats.constants');

require('../modules/auth/auth.repository');
require('../modules/teams/teams.repository');
require('../modules/games/games.repository');
require('../modules/feed/feed.repository');
require('../modules/leagues/leagues.repository');

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
  teamNames: ['City Ballers', 'Coastal Heat', 'Skyline Elite', 'Valley Storm'],
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

function createSeedUsers() {
  return Array.from({ length: seedConfig.userCount }, (_, index) => {
    const number = index + 1;
    // Canonical plan ids (Phase 6): 'team_pro' / 'starter'.
    const plan = index % 2 === 0 ? 'team_pro' : 'starter';
    const identity = seedIdentityBlueprints[index];

    return {
      email: `user${number}@user${number}.com`,
      name: identity?.userName || buildFallbackUserName(index - seedIdentityBlueprints.length),
      teamName: identity?.teamName || buildFallbackTeamName(index - seedIdentityBlueprints.length),
      plan,
    };
  });
}

function buildSeedBillingProfile(seedUser, index) {
  if (seedUser.plan === 'team_pro') {
    return {
      plan: 'team_pro',
      subscriptionStatus: 'active',
      stripeCustomerId: `cus_seed_${index + 1}`,
      stripeSubscriptionId: `sub_seed_${index + 1}`,
      stripePriceId: process.env.STRIPE_PRICE_ID_TEAM_MONTHLY || 'price_seed_team_pro_monthly',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      billingEmail: seedUser.email,
    };
  }

  return {
    plan: 'starter',
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

  return events.sort((eventA, eventB) => new Date(eventA.occurredAt) - new Date(eventB.occurredAt));
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

    return {
      ownerUserId: userId,
      teamId: team._id,
      title: `Game ${gameIndex + 1} vs ${opponent}`,
      opponent,
      status: 'completed',
      scheduledAt,
      completedAt,
      events: buildGameEvents(players, scheduledAt),
    };
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

  const matchups = [
    [0, 1],
    [2, 3],
    [0, 2],
    [1, 3],
    [0, 3],
    [1, 2],
  ];

  return matchups.map(([homeIndex, awayIndex], gameIndex) => {
    const home = leagueTeamsWithPlayers[homeIndex];
    const away = leagueTeamsWithPlayers[awayIndex];
    const scheduledAt = new Date(startDate.getTime() + gameIndex * 5 * 24 * 60 * 60 * 1000);
    scheduledAt.setHours(18 + (gameIndex % 3), gameIndex % 2 === 0 ? 0 : 30, 0, 0);
    const completedAt = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000);
    const homeRosterSnapshot = buildLeagueRosterSnapshot(home.players);
    const awayRosterSnapshot = buildLeagueRosterSnapshot(away.players);
    const homeEvents = attachTeamSide(
      buildLeagueGameEvents(homeRosterSnapshot.slice(0, 8), scheduledAt),
      TEAM_SIDES.HOME
    );
    const awayEvents = attachTeamSide(
      buildLeagueGameEvents(awayRosterSnapshot.slice(0, 8), scheduledAt),
      TEAM_SIDES.AWAY
    );

    return {
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
        logo: null,
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
        logo: null,
        colors: away.team.colors || ['#0f172a', '#38bdf8'],
        billingSnapshot: { plan: 'league', subscriptionStatus: 'active' },
        entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
      },
      title: `${away.team.name} at ${home.team.name}`,
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
      events: [...homeEvents, ...awayEvents].sort(
        (eventA, eventB) => new Date(eventA.occurredAt) - new Date(eventB.occurredAt)
      ),
    };
  });
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
        plan: seedUser.plan,
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
      user.plan = seedUser.plan;
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

async function resetSeedData() {
  await Promise.all([
    Post.deleteMany({}),
    Game.deleteMany({}),
    LeagueJoinRequest.deleteMany({}),
    LeagueTeamMember.deleteMany({}),
    LeaguePlayer.deleteMany({}),
    LeagueTeam.deleteMany({}),
    League.deleteMany({}),
    Team.deleteMany({}),
    Session.deleteMany({}),
    AuthToken.deleteMany({}),
    User.deleteMany({}),
  ]);
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
    stripeCustomerId: 'cus_seed_league_1',
    stripeSubscriptionId: 'sub_seed_league_1',
    stripePriceId: process.env.STRIPE_PRICE_ID_LEAGUE_MONTHLY || 'price_seed_league_monthly',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
  });

  let leagueTeamCount = 0;
  let leaguePlayerCount = 0;
  let leagueGameCount = 0;
  let leagueEventCount = 0;
  const leagueTeamsWithPlayers = [];

  for (const [index, teamName] of seededLeagueBlueprint.teamNames.entries()) {
    const leagueTeam = await LeagueTeam.create({
      leagueId: league._id,
      name: teamName,
      slug: `${seededLeagueBlueprint.slug}-${index + 1}`,
      colors: ['#0f172a', '#38bdf8'],
      status: 'active',
    });

    const roster = buildPlayerBlueprints(100 + index, {
      playersPerTeam: seedConfig.leaguePlayersPerTeam,
    }).map((player) => ({
      leagueId: league._id,
      leagueTeamId: leagueTeam._id,
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber,
      position: null,
      isActive: true,
      claimedByUserId: null,
    }));

    const players = await LeaguePlayer.insertMany(roster, { ordered: true });
    leagueTeamsWithPlayers.push({
      team: leagueTeam,
      players,
    });
    leagueTeamCount += 1;
    leaguePlayerCount += roster.length;
  }

  const leagueGames = await Game.insertMany(
    buildSeedLeagueGames(userEntry.user._id, league, leagueTeamsWithPlayers),
    { ordered: true }
  );
  leagueGameCount += leagueGames.length;
  leagueEventCount += leagueGames.reduce((total, game) => total + game.events.length, 0);

  return {
    league,
    leagueTeamCount,
    leaguePlayerCount,
    leagueGameCount,
    leagueEventCount,
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
          publicId: `seed/image/${index + 1}`,
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
  await connectDb();

  try {
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
        ...buildSeedBillingProfile(entry, index),
        players: buildPlayerBlueprints(index),
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
    if (primaryLeagueOwner) {
      const seededLeague = await seedLeagueForUser(primaryLeagueOwner);
      leagueCount += 1;
      leagueTeamCount += seededLeague.leagueTeamCount;
      leaguePlayerCount += seededLeague.leaguePlayerCount;
      leagueGameCount += seededLeague.leagueGameCount;
      leagueEventCount += seededLeague.leagueEventCount;
    }

    const seededPosts = buildSeedPosts(seededFeedEntries);
    await Post.insertMany(seededPosts.posts, { ordered: true });
    postCount = seededPosts.posts.length;
    postTypeCounts = seededPosts.counts;

    console.log('Seed complete');
    console.log(`Users: ${seededUsers.length}`);
    console.log(`Password: ${seedConfig.password}`);
    console.log(`Teams: ${teamCount}`);
    console.log(`Leagues: ${leagueCount}`);
    console.log(`League Teams: ${leagueTeamCount}`);
    console.log(`League Players: ${leaguePlayerCount}`);
    console.log(`League Games: ${leagueGameCount}`);
    console.log(`League Events: ${leagueEventCount}`);
    console.log(
      `Seeded League Owner: ${seededLeagueBlueprint.ownerEmail} (league premium, ${seedConfig.leaguePlayersPerTeam} players per league team)`
    );
    console.log(`Starter Teams: ${seededUsers.filter((entry) => entry.plan === 'starter').length}`);
    console.log(
      `Team Pro Teams: ${seededUsers.filter((entry) => entry.plan === 'team_pro').length}`
    );
    console.log(`Players: ${playerCount}`);
    console.log(`Games: ${gameCount}`);
    console.log(`Events: ${eventCount}`);
    console.log(`Posts: ${postCount}`);
    console.log(`Image Posts: ${postTypeCounts.imageCount}`);
    console.log(`Game Card Posts: ${postTypeCounts.gameCardCount}`);
    console.log(`Player Card Posts: ${postTypeCounts.playerCardCount}`);
    console.log(`Team Card Posts: ${postTypeCounts.teamCardCount}`);
    console.log('Logins:');
    for (const entry of seededUsers) {
      console.log(`- ${entry.email} (${entry.plan})`);
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
};
