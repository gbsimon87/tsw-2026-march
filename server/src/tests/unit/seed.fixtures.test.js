const mongoose = require('mongoose');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  buildDemoLeagueGames,
  buildSeedLeagueGames,
  completeGameFixture,
  buildMilestoneFixtures,
  buildSocialFixture,
  seedLeagueGames,
  upsertUser,
} = require('../../scripts/seed');
const { computeGameFinalScore } = require('../../modules/games/games.service');
const { TEAM_SIDES, STAT_TYPES } = require('../../modules/shared/stats.constants');

const Game = mongoose.model('Game');
const User = mongoose.model('User');
const id = () => new mongoose.Types.ObjectId();
const ownerUserId = id();
const league = { _id: id(), slug: 'demo-league' };
const seasonId = id();
function teams(count = 5) {
  return Array.from({ length: count }, (_, index) => ({
    team: { _id: id(), name: `Team ${index}`, colors: ['#141414', '#2563eb'] },
    players: Array.from({ length: 8 }, (_, playerIndex) => ({
      _id: id(),
      displayName: `Player ${index}-${playerIndex}`,
      jerseyNumber: playerIndex + 1,
      position: 'PG',
      isActive: true,
    })),
  }));
}

beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('demo games cover every home/away pairing with complete and consistent stat lines', async () => {
  const roster = teams();
  const start = new Date(Date.now() - 100 * 86400000);
  const games = buildDemoLeagueGames(ownerUserId, league, seasonId, roster, start);
  expect(games).toHaveLength(20);
  expect(
    new Set(games.map((game) => `${game.homeLeagueTeamId}:${game.awayLeagueTeamId}`)).size
  ).toBe(20);
  for (const game of games) {
    expect(game.completedAt.getTime()).toBeLessThan(Date.now());
    expect(game.finalScore).toEqual(computeGameFinalScore(game));
    expect(game.finalScore.home).not.toBe(game.finalScore.away);
    expect(game.boxScore.home.players).toHaveLength(8);
    expect(game.boxScore.away.players).toHaveLength(8);
    expect(game.boxScore.home.players.every((row) => row.leaguePlayerId)).toBe(true);
    expect(game.boxScore.home.totals.points).toBe(game.finalScore.home);
    expect(game.gameSummary.awayPoints).toBe(game.finalScore.away);
    expect(game.eventCount).toBe(game.events.length);
    await new Game(game).validate();
  }
});

test('tie-breaking adds an attributable free throw to the source events', () => {
  const home = { _id: id(), leaguePlayerId: id(), displayName: 'Home', isActive: true };
  const away = { _id: id(), leaguePlayerId: id(), displayName: 'Away', isActive: true };
  const game = completeGameFixture({
    trackingMode: 'dual_team',
    homeRosterSnapshot: [home],
    awayRosterSnapshot: [away],
    scheduledAt: new Date(),
    events: [],
  });
  expect(game.events).toEqual([
    expect.objectContaining({
      playerId: home._id,
      teamSide: TEAM_SIDES.HOME,
      statType: STAT_TYPES.FT_MADE,
    }),
  ]);
  expect(game.finalScore).toEqual({ home: 1, away: 0 });
  expect(game.boxScore.home.players[0].ftm).toBe(1);
});

test('Metro completed fixtures stay in the past, including the larger seven-team schedule', () => {
  const games = buildSeedLeagueGames(ownerUserId, league, teams(7)).filter(
    (game) => game.status === 'completed' && game.events.length
  );
  expect(games).toHaveLength(42);
  expect(games.every((game) => game.completedAt.getTime() < Date.now())).toBe(true);
});

test('partial additive reruns create only missing pairings in the requested season', async () => {
  const persisted = new Set();
  const exists = jest
    .spyOn(Game, 'exists')
    .mockImplementation(async (key) =>
      persisted.has(`${key.seasonId}:${key.homeLeagueTeamId}:${key.awayLeagueTeamId}`)
    );
  const create = jest.spyOn(Game, 'create').mockImplementation(async (game) => {
    persisted.add(`${game.seasonId}:${game.homeLeagueTeamId}:${game.awayLeagueTeamId}`);
    return game;
  });
  const roster = teams();
  persisted.add(`${seasonId}:${roster[0].team._id}:${roster[1].team._id}`);
  expect(await seedLeagueGames(league, seasonId, roster, ownerUserId)).toEqual({
    createdCount: 19,
  });
  expect(await seedLeagueGames(league, seasonId, roster, ownerUserId)).toEqual({ createdCount: 0 });
  expect(create).toHaveBeenCalledTimes(19);
  expect(
    exists.mock.calls.every(([key]) => key.seasonId === seasonId && key.ownerUserId === ownerUserId)
  ).toBe(true);
  expect(await seedLeagueGames(league, id(), roster, ownerUserId)).toEqual({ createdCount: 20 });
});

test('milestones retain the actual chronological debut and career threshold source', () => {
  const player = { _id: id(), leagueTeamId: id(), claimedByUserId: ownerUserId };
  const game = (date, points) => ({
    _id: id(),
    leagueId: league._id,
    seasonId,
    completedAt: new Date(date),
    trackingMode: 'one_sided',
    boxScore: {
      players: [{ leaguePlayerId: player._id, points, fg2a: points / 2, fg2m: points / 2 }],
    },
  });
  const first = game('2025-01-01', 60);
  const second = game('2025-01-02', 60);
  const docs = buildMilestoneFixtures([second, first], [player]);
  const threshold = docs.find((doc) => doc.milestoneKey === 'career_points_100');
  expect(threshold.sourceGameId).toBe(second._id);
  const debut = docs.find((doc) => doc.milestoneKey === 'first_career_game');
  expect(debut.sourceGameId).toBe(first._id);
});

test('fictional consent scenarios include a minor without guardian consent', () => {
  expect(buildSocialFixture(ownerUserId, { player: true, index: 7 })).toMatchObject({
    ageCategory: 'minor',
    guardianConsentAt: null,
  });
  expect(
    buildSocialFixture(ownerUserId, { status: 'unrecorded' }).marketing.recordedByUserId
  ).toBeNull();
});

test('additive seed refuses a non-demo email collision and preserves demo credentials', async () => {
  const save = jest.fn();
  const find = jest.spyOn(User, 'findOne').mockResolvedValue({ isDemo: false, save });
  await expect(upsertUser({ email: 'testuser@gmail.com' })).rejects.toThrow('non-demo account');
  const existing = {
    isDemo: true,
    isInternal: true,
    passwordHash: 'changed-password',
    roles: ['user'],
    save,
  };
  find.mockResolvedValue(existing);
  expect((await upsertUser({ email: 'testuser@gmail.com' })).user).toBe(existing);
  expect(save).not.toHaveBeenCalled();
  expect(existing.passwordHash).toBe('changed-password');
});

test.each([[[]], [['--demo']]])(
  'CLI dry run avoids database connections and rejects production for mode %j',
  (mode) => {
    const script = path.resolve(__dirname, '../../scripts/seed.js');
    const options = {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        ENV_FILE: '/tmp/tsw-seed-no-env-file',
        NODE_ENV: 'development',
        APP_ENV: 'development',
        MONGO_URI: 'mongodb://127.0.0.1:1',
        MONGO_DB_NAME: 'tsw_seed_dev',
        SEED_CONFIRM_DB: 'tsw_seed_dev',
      },
    };
    const preview = spawnSync(process.execPath, [script, ...mode, '--dry-run'], options);
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain('No connection or writes');
    const production = spawnSync(process.execPath, [script, ...mode, '--dry-run'], {
      ...options,
      env: { ...options.env, APP_ENV: 'production', ALLOW_DEMO_SEED: 'true' },
    });
    expect(production.status).toBe(1);
    expect(production.stderr).toContain('APP_ENV is production');
    expect(production.stderr).not.toContain('Mongo connection failed');
  }
);
