const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { SHOT_ZONE_IDS, STAT_TYPES } = require('../modules/shared/stats.constants');

require('../modules/auth/auth.repository');
require('../modules/teams/teams.repository');
require('../modules/games/games.repository');

const User = mongoose.model('User');
const Session = mongoose.model('Session');
const AuthToken = mongoose.model('AuthToken');
const Team = mongoose.model('Team');
const Game = mongoose.model('Game');

const seedConfig = {
  userCount: Number(process.env.SEED_USER_COUNT || 10),
  gamesPerUser: Number(process.env.SEED_GAMES_PER_USER || 20),
  playersPerTeam: Number(process.env.SEED_PLAYERS_PER_TEAM || 10),
  password: process.env.SEED_USER_PASSWORD || 'password',
};

const playerBlueprints = [
  { displayName: 'Avery Brooks', jerseyNumber: 1 },
  { displayName: 'Jordan Hayes', jerseyNumber: 2 },
  { displayName: 'Micah Reed', jerseyNumber: 3 },
  { displayName: 'Drew Turner', jerseyNumber: 4 },
  { displayName: 'Kai Bennett', jerseyNumber: 5 },
  { displayName: 'Noah Foster', jerseyNumber: 6 },
  { displayName: 'Evan Price', jerseyNumber: 7 },
  { displayName: 'Blake Cooper', jerseyNumber: 8 },
  { displayName: 'Logan Perry', jerseyNumber: 9 },
  { displayName: 'Riley Morgan', jerseyNumber: 10 },
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

function createSeedUsers() {
  return Array.from({ length: seedConfig.userCount }, (_, index) => {
    const number = index + 1;

    return {
      email: `user${number}@user${number}.com`,
      name: `User ${number}`,
      teamName: `Team ${number}`,
    };
  });
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
      });
    } else {
      user.name = seedUser.name;
      user.passwordHash = passwordHash;
      user.authProvider = 'local';
      user.emailVerified = true;
      user.emailVerifiedAt = user.emailVerifiedAt || new Date();
      user.roles = ['user'];
      await user.save();
    }

    users.push({
      user,
      teamName: seedUser.teamName,
    });
  }

  return users;
}

async function resetSeedData(userIds) {
  await Promise.all([
    Game.deleteMany({ ownerUserId: { $in: userIds } }),
    Team.deleteMany({ ownerUserId: { $in: userIds } }),
    Session.deleteMany({ userId: { $in: userIds } }),
    AuthToken.deleteMany({ userId: { $in: userIds } }),
  ]);
}

async function main() {
  await connectDb();

  try {
    const seededUsers = await upsertSeedUsers();
    const userIds = seededUsers.map((entry) => entry.user._id);
    await resetSeedData(userIds);

    let teamCount = 0;
    let playerCount = 0;
    let gameCount = 0;
    let eventCount = 0;

    for (const [index, entry] of seededUsers.entries()) {
      const team = await Team.create({
        ownerUserId: entry.user._id,
        name: entry.teamName || `Team ${index + 1}`,
        players: playerBlueprints.slice(0, seedConfig.playersPerTeam).map((player) => ({
          ...player,
          isActive: true,
        })),
      });

      const games = await Game.insertMany(buildGameDocs(entry.user._id, team), { ordered: true });

      teamCount += 1;
      playerCount += team.players.length;
      gameCount += games.length;
      eventCount += games.reduce((total, game) => total + game.events.length, 0);
    }

    console.log('Seed complete');
    console.log(`Users: ${seededUsers.length}`);
    console.log(`Password: ${seedConfig.password}`);
    console.log(`Teams: ${teamCount}`);
    console.log(`Players: ${playerCount}`);
    console.log(`Games: ${gameCount}`);
    console.log(`Events: ${eventCount}`);
    console.log('Logins:');
    for (const entry of seededUsers) {
      console.log(`- ${entry.user.email}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed');
  console.error(error);
  process.exitCode = 1;
});
