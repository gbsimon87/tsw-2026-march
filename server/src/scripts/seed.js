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
  email: (process.env.SEED_USER_EMAIL || 'seed.coach@tsw.local').toLowerCase(),
  password: process.env.SEED_USER_PASSWORD || 'Password123!',
  name: process.env.SEED_USER_NAME || 'Seed Coach',
  teamName: process.env.SEED_TEAM_NAME || 'City Ballers',
  gameCount: 100,
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

function pushRepeatedEvents(events, count, buildEvent) {
  for (let index = 0; index < count; index += 1) {
    events.push(buildEvent(index));
  }
}

function buildGameEvents(players, gameIndex, scheduledAt) {
  const events = [];
  let minuteOffset = 0;
  const playerIds = players.map((player) => player._id);

  const nextAssisterId = (playerIndex, variant) => {
    if (playerIds.length < 2) {
      return null;
    }

    return playerIds[(playerIndex + variant + 1) % playerIds.length];
  };

  for (const [playerIndex, player] of players.entries()) {
    const rotationSeed = gameIndex + playerIndex;
    const fg2Made = 1 + (rotationSeed % 2);
    const fg2Miss = 1 + (rotationSeed % 3 === 0 ? 1 : 0);
    const fg3Made = 1 + (rotationSeed % 4 === 0 ? 1 : 0);
    const fg3Miss = 1 + (rotationSeed % 2 === 0 ? 1 : 0);
    const ftMade = 1 + (rotationSeed % 3 === 1 ? 1 : 0);
    const ftMiss = 1 + (rotationSeed % 5 === 0 ? 1 : 0);
    const oreb = 1 + (rotationSeed % 4 === 2 ? 1 : 0);
    const dreb = 1 + (rotationSeed % 3 === 2 ? 1 : 0);
    const playerId = player._id;

    const nextOccurredAt = () => {
      const occurredAt = new Date(scheduledAt.getTime() + minuteOffset * 60 * 1000);
      minuteOffset += 1;
      return occurredAt;
    };

    pushRepeatedEvents(events, fg2Made, (variant) =>
      createTrackedEvent(
        playerId,
        STAT_TYPES.FG2_MADE,
        twoPointZones[(rotationSeed + variant) % twoPointZones.length],
        nextOccurredAt(),
        rotationSeed + variant
      )
    );

    pushRepeatedEvents(events, Math.max(0, fg2Made - 1), (variant) =>
      createAssistEvent(nextAssisterId(playerIndex, rotationSeed + variant), nextOccurredAt())
    );

    pushRepeatedEvents(events, fg2Miss, (variant) =>
      createTrackedEvent(
        playerId,
        STAT_TYPES.FG2_MISS,
        twoPointZones[(rotationSeed + variant + 1) % twoPointZones.length],
        nextOccurredAt(),
        rotationSeed + variant + 5
      )
    );

    pushRepeatedEvents(events, fg3Made, (variant) =>
      createTrackedEvent(
        playerId,
        STAT_TYPES.FG3_MADE,
        threePointZones[(rotationSeed + variant) % threePointZones.length],
        nextOccurredAt(),
        rotationSeed + variant + 10
      )
    );

    pushRepeatedEvents(events, fg3Made, (variant) =>
      createAssistEvent(nextAssisterId(playerIndex, rotationSeed + variant + 10), nextOccurredAt())
    );

    pushRepeatedEvents(events, fg3Miss, (variant) =>
      createTrackedEvent(
        playerId,
        STAT_TYPES.FG3_MISS,
        threePointZones[(rotationSeed + variant + 2) % threePointZones.length],
        nextOccurredAt(),
        rotationSeed + variant + 15
      )
    );

    pushRepeatedEvents(events, ftMade, (variant) =>
      createTrackedEvent(
        playerId,
        STAT_TYPES.FT_MADE,
        SHOT_ZONE_IDS.FREE_THROW_LINE,
        nextOccurredAt(),
        rotationSeed + variant + 20
      )
    );

    pushRepeatedEvents(events, ftMiss, (variant) =>
      createTrackedEvent(
        playerId,
        STAT_TYPES.FT_MISS,
        SHOT_ZONE_IDS.FREE_THROW_LINE,
        nextOccurredAt(),
        rotationSeed + variant + 25
      )
    );

    pushRepeatedEvents(events, oreb, () =>
      createReboundEvent(playerId, STAT_TYPES.OREB, nextOccurredAt())
    );

    pushRepeatedEvents(events, dreb, () =>
      createReboundEvent(playerId, STAT_TYPES.DREB, nextOccurredAt())
    );
  }

  return events;
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

  return Array.from({ length: seedConfig.gameCount }, (_, gameIndex) => {
    const opponent = opponents[gameIndex % opponents.length];
    const progress = seedConfig.gameCount === 1 ? 1 : gameIndex / (seedConfig.gameCount - 1);
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
      events: buildGameEvents(players, gameIndex, scheduledAt),
    };
  });
}

async function upsertSeedUser() {
  const passwordHash = await bcrypt.hash(seedConfig.password, 12);
  let user = await User.findOne({ email: seedConfig.email });

  if (!user) {
    user = await User.create({
      email: seedConfig.email,
      name: seedConfig.name,
      passwordHash,
      authProvider: 'local',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      roles: ['user'],
    });
    return user;
  }

  user.name = seedConfig.name;
  user.passwordHash = passwordHash;
  user.authProvider = 'local';
  user.emailVerified = true;
  user.emailVerifiedAt = user.emailVerifiedAt || new Date();
  user.roles = ['user'];
  await user.save();
  return user;
}

async function resetSeedData(userId) {
  await Promise.all([
    Game.deleteMany({ ownerUserId: userId }),
    Team.deleteMany({ ownerUserId: userId }),
    Session.deleteMany({ userId }),
    AuthToken.deleteMany({ userId }),
  ]);
}

async function main() {
  await connectDb();

  try {
    const user = await upsertSeedUser();
    await resetSeedData(user._id);

    const team = await Team.create({
      ownerUserId: user._id,
      name: seedConfig.teamName,
      players: playerBlueprints.map((player) => ({
        ...player,
        isActive: true,
      })),
    });

    const games = await Game.insertMany(buildGameDocs(user._id, team), { ordered: true });

    console.log('Seed complete');
    console.log(`User: ${user.email}`);
    console.log(`Password: ${seedConfig.password}`);
    console.log(`Team: ${team.name}`);
    console.log(`Players: ${team.players.length}`);
    console.log(`Games: ${games.length}`);
    console.log(`Events: ${games.reduce((total, game) => total + game.events.length, 0)}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed');
  console.error(error);
  mongoose.disconnect().finally(() => {
    process.exit(1);
  });
});
