const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { SHOT_ZONE_IDS, STAT_TYPES, TEAM_SIDES } = require('../modules/shared/stats.constants');

require('../modules/auth/auth.repository');
require('../modules/games/games.repository');
require('../modules/leagues/leagues.repository');

const Game = mongoose.model('Game');
const League = mongoose.model('League');
const LeagueTeam = mongoose.model('LeagueTeam');
const LeaguePlayer = mongoose.model('LeaguePlayer');

const LEAGUE_ID = process.env.SEED_WE_BALL_LEAGUE_ID || '69f8b3b1980e925c0271330d';
const OWNER_USER_ID = process.env.SEED_WE_BALL_OWNER_USER_ID || '69f8b36c980e925c02713302';
const LEAGUE_SLUG = process.env.SEED_WE_BALL_LEAGUE_SLUG || 'we-ball-saturday';

function scriptPath(fileName) {
  return path.resolve(__dirname, fileName);
}

const TEAM_ROSTERS = {
  'free-agents': {
    name: 'Free Agents',
    players: [
      'Ringer 1',
      'Ringer 2',
      'Ringer 3',
      'Ringer 4',
      'Ringer 5',
      'Ringer 6',
      'Ringer 7',
      'Ringer 8',
      'Ringer 9',
      'Ringer 10',
      'Ringer 11',
      'Ringer 12',
    ],
  },
  'pinky-and-the-brain': {
    name: 'Pinky and the Brain',
    players: [
      'Anthony',
      'Lauren',
      'Raf',
      'Jack',
      'Jacques',
      'Tadas',
      'Parth',
      'Kariem',
      'Ringer 9',
      'Ringer 10',
      'Ringer 11',
      'Ringer 12',
    ],
  },
  'blues-clues': {
    name: 'Blues Clues',
    players: [
      'Samy',
      'Mike',
      'Ringer 3',
      'Karma',
      'Andrew',
      'Andreas',
      'Chris',
      'Caitlin',
      'Ringer 9',
      'Ringer 10',
      'Ringer 11',
      'Ringer 12',
    ],
  },
  'washed-up-ballers': {
    name: 'Washed Up Ballers',
    players: [
      'Joe',
      'Tesfa',
      'Ben',
      'Zach',
      'Kennedy',
      'Cam',
      'Pat',
      'Z',
      'Ringer 9',
      'Ringer 10',
      'Ringer 11',
      'Ringer 12',
    ],
  },
};

const GAME_CONFIGS = [
  {
    title: 'Free Agents vs Pinky and the Brain - 2026-04-25 10:30',
    homeSlug: 'free-agents',
    awaySlug: 'pinky-and-the-brain',
    scheduledAt: '2026-04-25T09:30:00.000Z',
    videoUrl: 'https://youtu.be/8UfBBSix-2k?si=Ts_p12v3XQYL1sTc',
    playByPlayPath: scriptPath('we-ball-game-1.tsv'),
  },
  {
    title: 'Blues Clues vs Washed Up Ballers - 2026-04-25 11:30',
    homeSlug: 'blues-clues',
    awaySlug: 'washed-up-ballers',
    scheduledAt: '2026-04-25T10:30:00.000Z',
    videoUrl: 'https://youtu.be/2LmCnX--5_I?si=J9XpWDoesm9vZ7e_',
    playByPlayPath: scriptPath('we-ball-game-2.tsv'),
  },
];

const TEAM_ALIASES = new Map([
  ['free agents', 'free-agents'],
  ['pinky and the brain', 'pinky-and-the-brain'],
  ['pink and the brain', 'pinky-and-the-brain'],
  ['pinky & the brain', 'pinky-and-the-brain'],
  ['pinky and the brains', 'pinky-and-the-brain'],
  ['blues clues', 'blues-clues'],
  ['washed up ballers', 'washed-up-ballers'],
]);

const SHOT_DEFAULTS = {
  [STAT_TYPES.FT_MADE]: { zoneId: SHOT_ZONE_IDS.FREE_THROW_LINE, x: 50, y: 28 },
  [STAT_TYPES.FT_MISS]: { zoneId: SHOT_ZONE_IDS.FREE_THROW_LINE, x: 50, y: 28 },
  [STAT_TYPES.FG2_MADE]: { zoneId: SHOT_ZONE_IDS.PAINT, x: 50, y: 18 },
  [STAT_TYPES.FG2_MISS]: { zoneId: SHOT_ZONE_IDS.PAINT, x: 50, y: 18 },
  [STAT_TYPES.FG3_MADE]: { zoneId: SHOT_ZONE_IDS.WING_RIGHT_3, x: 77, y: 42 },
  [STAT_TYPES.FG3_MISS]: { zoneId: SHOT_ZONE_IDS.WING_RIGHT_3, x: 77, y: 42 },
};

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseStat(value) {
  const normalized = normalize(value);
  if (normalized === '2pt field goal made') return STAT_TYPES.FG2_MADE;
  if (normalized === '2pt field goal miss') return STAT_TYPES.FG2_MISS;
  if (normalized === '3pt field goal made') return STAT_TYPES.FG3_MADE;
  if (normalized === '3pt field goal miss') return STAT_TYPES.FG3_MISS;
  if (normalized === 'ft - made') return STAT_TYPES.FT_MADE;
  if (normalized === 'ft - miss') return STAT_TYPES.FT_MISS;
  if (normalized === 'assist') return STAT_TYPES.AST;
  if (normalized === 'rebound - offensive') return STAT_TYPES.OREB;
  if (normalized === 'rebound - defensive') return STAT_TYPES.DREB;
  if (normalized === 'steal') return STAT_TYPES.STL;
  if (normalized === 'block') return STAT_TYPES.BLK;
  if (normalized === 'turnover') return STAT_TYPES.TOV;
  if (normalized === 'foul') return STAT_TYPES.FOUL;
  throw new Error(`Unsupported statistic "${value}"`);
}

function freeThrowEventCount(statType, note) {
  if (statType !== STAT_TYPES.FT_MADE) {
    return 1;
  }
  return /2\s*(pt|point|points|pts)/i.test(String(note || '')) ? 2 : 1;
}

function parsePlayByPlay(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^play by play/i.test(line))
    .filter((line) => !/^team name\s+/i.test(line))
    .filter((line) => !/^[12](st|nd)\s+half$/i.test(line))
    .map((line, index) => {
      const columns = line.split('\t').map((column) => column.trim());
      if (columns.length < 3) {
        throw new Error(`${filePath}:${index + 1} expected tab-separated team, jersey, statistic`);
      }
      return {
        sourceLine: index + 1,
        teamSlug: TEAM_ALIASES.get(normalize(columns[0])),
        teamName: columns[0],
        jerseyNumber: Number(columns[1]),
        statType: parseStat(columns[2]),
        note: columns[3] || '',
      };
    });
}

function buildRosterSnapshot(players) {
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

function buildParticipant(team, side) {
  return {
    side,
    participantType: 'league_team',
    teamId: null,
    leagueTeamId: team._id,
    displayName: team.name,
    logo: team.logo?.url
      ? {
          url: team.logo.url,
          width: team.logo.width ?? null,
          height: team.logo.height ?? null,
        }
      : null,
    colors: Array.isArray(team.colors) ? team.colors : [],
    billingSnapshot: { plan: 'pro', subscriptionStatus: 'active' },
    entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
  };
}

function buildEvents(rows, gameConfig, rosterSnapshotsBySlug) {
  const startedAt = new Date(gameConfig.scheduledAt);
  let eventIndex = 0;
  const events = [];

  for (const row of rows) {
    if (!row.teamSlug) {
      throw new Error(`Unknown team "${row.teamName}" on play-by-play line ${row.sourceLine}`);
    }
    const teamSide =
      row.teamSlug === gameConfig.homeSlug
        ? TEAM_SIDES.HOME
        : row.teamSlug === gameConfig.awaySlug
          ? TEAM_SIDES.AWAY
          : null;
    if (!teamSide) {
      throw new Error(`Team "${row.teamName}" is not in ${gameConfig.title}`);
    }
    const player = rosterSnapshotsBySlug
      .get(row.teamSlug)
      .find((candidate) => Number(candidate.jerseyNumber) === row.jerseyNumber);
    if (!player) {
      throw new Error(`No #${row.jerseyNumber} found for ${row.teamName}`);
    }

    const eventCount = freeThrowEventCount(row.statType, row.note);
    for (let count = 0; count < eventCount; count += 1) {
      const shotDefaults = SHOT_DEFAULTS[row.statType] || {};
      events.push({
        playerId: player._id,
        teamSide,
        statType: row.statType,
        ...shotDefaults,
        occurredAt: new Date(startedAt.getTime() + eventIndex * 20 * 1000),
      });
      eventIndex += 1;
    }
  }

  return events;
}

async function upsertPlayers(league, teamsBySlug) {
  const playersByTeamSlug = new Map();

  for (const [teamSlug, roster] of Object.entries(TEAM_ROSTERS)) {
    const team = teamsBySlug.get(teamSlug);
    if (!team) {
      throw new Error(`Missing league team ${teamSlug}`);
    }

    const players = [];
    for (const [index, displayName] of roster.players.entries()) {
      const jerseyNumber = index + 1;
      const player = await LeaguePlayer.findOneAndUpdate(
        { leagueId: league._id, leagueTeamId: team._id, jerseyNumber },
        {
          $set: {
            leagueId: league._id,
            leagueTeamId: team._id,
            displayName,
            jerseyNumber,
            position: null,
            isActive: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      players.push(player);
    }
    playersByTeamSlug.set(teamSlug, players);
  }

  return playersByTeamSlug;
}

async function createGame(gameConfig, teamsBySlug, playersByTeamSlug) {
  const homeTeam = teamsBySlug.get(gameConfig.homeSlug);
  const awayTeam = teamsBySlug.get(gameConfig.awaySlug);
  const homeRosterSnapshot = buildRosterSnapshot(playersByTeamSlug.get(gameConfig.homeSlug));
  const awayRosterSnapshot = buildRosterSnapshot(playersByTeamSlug.get(gameConfig.awaySlug));
  const rosterSnapshotsBySlug = new Map([
    [gameConfig.homeSlug, homeRosterSnapshot],
    [gameConfig.awaySlug, awayRosterSnapshot],
  ]);
  const rows = parsePlayByPlay(gameConfig.playByPlayPath);
  const events = buildEvents(rows, gameConfig, rosterSnapshotsBySlug);
  const completedAt = new Date(new Date(gameConfig.scheduledAt).getTime() + 90 * 60 * 1000);

  await Game.deleteMany({ leagueId: LEAGUE_ID, title: gameConfig.title });

  return Game.create({
    ownerUserId: OWNER_USER_ID,
    gameContext: 'league',
    trackingMode: 'dual_team',
    leagueId: LEAGUE_ID,
    homeLeagueTeamId: homeTeam._id,
    awayLeagueTeamId: awayTeam._id,
    trackedLeagueTeamId: homeTeam._id,
    initialActiveSide: TEAM_SIDES.HOME,
    homeParticipant: buildParticipant(homeTeam, TEAM_SIDES.HOME),
    awayParticipant: buildParticipant(awayTeam, TEAM_SIDES.AWAY),
    title: gameConfig.title,
    videoUrl: gameConfig.videoUrl,
    status: 'completed',
    scheduledAt: new Date(gameConfig.scheduledAt),
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
  });
}

async function ensureLeagueSetup() {
  const league = await League.findByIdAndUpdate(
    LEAGUE_ID,
    {
      $setOnInsert: {
        _id: LEAGUE_ID,
        ownerUserId: OWNER_USER_ID,
        name: 'We Ball Saturday',
        slug: LEAGUE_SLUG,
        description: 'Seeded We Ball Saturday league fixture.',
        seasonLabel: 'Spring 2026',
        status: 'active',
        isPublic: true,
        plan: 'pro',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  for (const [slug, roster] of Object.entries(TEAM_ROSTERS)) {
    await LeagueTeam.findOneAndUpdate(
      { leagueId: league._id, slug },
      {
        $set: {
          leagueId: league._id,
          name: roster.name,
          slug,
          status: 'active',
        },
        $setOnInsert: {
          colors: ['#0f172a', '#38bdf8'],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return league;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDb();

  const league = await ensureLeagueSetup();

  const teams = await LeagueTeam.find({ leagueId: LEAGUE_ID });
  const teamsBySlug = new Map(teams.map((team) => [team.slug, team]));
  for (const gameConfig of GAME_CONFIGS) {
    if (!fs.existsSync(gameConfig.playByPlayPath)) {
      throw new Error(`Missing play-by-play file: ${gameConfig.playByPlayPath}`);
    }
    if (!teamsBySlug.has(gameConfig.homeSlug) || !teamsBySlug.has(gameConfig.awaySlug)) {
      throw new Error(`Missing teams for ${gameConfig.title}`);
    }
    const rows = parsePlayByPlay(gameConfig.playByPlayPath);
    console.log(`${gameConfig.title}: ${rows.length} source rows`);
  }

  if (dryRun) {
    console.log('Dry run complete; no writes performed.');
    return;
  }

  const playersByTeamSlug = await upsertPlayers(league, teamsBySlug);

  for (const gameConfig of GAME_CONFIGS) {
    const game = await createGame(gameConfig, teamsBySlug, playersByTeamSlug);
    console.log(`Created ${game.title}: ${game.events.length} events`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
