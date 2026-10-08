const mongoose = require('mongoose');
const {
  buildScrimmageFixtures,
  insertMissing,
  MVP_RULES,
} = require('../../scripts/seed-scrimmages');
const { aggregateScrimmageStats } = require('../../modules/scrimmages/scrimmages.scoring');
const { Game } = require('../../modules/games/games.repository');
const repo = require('../../modules/scrimmages/scrimmages.repository');
const { computeGameFinalScore } = require('../../modules/games/games.service');
const input = {
  ownerUserId: new mongoose.Types.ObjectId(),
  managerUserId: new mongoose.Types.ObjectId(),
  playerUserId: new mongoose.Types.ObjectId(),
  pendingUserId: new mongoose.Types.ObjectId(),
  now: new Date('2026-10-08T12:00:00Z'),
};
const same = (a, b) => String(a) === String(b);
afterEach(() => jest.restoreAllMocks());
test('complete fixture documents pass real Mongoose validation', () => {
  const fixtures = buildScrimmageFixtures(input);
  for (const [key, Model] of [
    ['series', repo.Scrimmage],
    ['players', repo.ScrimmagePlayer],
    ['sessions', repo.ScrimmageSession],
    ['acceptances', repo.ScrimmageAcceptance],
    ['requests', repo.ScrimmageJoinRequest],
    ['games', Game],
  ]) {
    for (const document of fixtures[key])
      expect(new Model(document).validateSync()).toBeUndefined();
  }
  expect(fixtures.series).toHaveLength(2);
  expect(fixtures.sessions).toHaveLength(12);
  expect(fixtures.games).toHaveLength(66);
});
test('published weeks and season MVP have eligible rows, provisional guests and correct event totals', () => {
  const fixtures = buildScrimmageFixtures(input);
  for (const series of fixtures.series) {
    const weeks = fixtures.sessions.filter(
      (week) =>
        same(week.scrimmageId, series._id) &&
        same(week.seasonId, series.activeSeasonId) &&
        week.publishedAt
    );
    expect(weeks).toHaveLength(3);
    for (const week of weeks) {
      const games = fixtures.games.filter((game) => same(game.scrimmageSessionId, week._id));
      const rows = aggregateScrimmageStats(games, MVP_RULES);
      expect(games).toHaveLength(6);
      expect(rows.filter((row) => row.eligible).length).toBeGreaterThanOrEqual(18);
      expect(rows.every((row) => Number.isFinite(row.mvpScore))).toBe(true);
      for (const game of games) {
        expect(game.finalScore).toEqual(computeGameFinalScore(game));
        expect(game.eventCount).toBe(game.events.length);
        expect(
          game.events.every(
            (event) =>
              event.videoTimestamp > game.videoStartTimestamp &&
              event.videoTimestamp < game.videoStartTimestamp + 240
          )
        ).toBe(true);
        expect(new Set(game.events.map((event) => event.statType))).toEqual(
          new Set(['FG2_MADE', 'FG3_MADE', 'FG2_MISS', 'FG3_MISS', 'TOV'])
        );
        expect(game.events.every((event) => event.clockMillisecondsRemaining >= 0)).toBe(true);
      }
    }
    const seasonGames = fixtures.games.filter((game) =>
      weeks.some((week) => same(week._id, game.scrimmageSessionId))
    );
    const rows = aggregateScrimmageStats(seasonGames, MVP_RULES, 'season');
    expect(rows.filter((row) => row.eligible)).toHaveLength(20);
    expect(rows.filter((row) => !row.eligible)).toHaveLength(2);
    expect(
      rows.every(
        (row) => row.points > 0 && row.misses > 0 && row.attempts === row.makes + row.misses
      )
    ).toBe(true);
    expect(rows.some((row) => row.wins > 0)).toBe(true);
    expect(rows.some((row) => row.losses > 0)).toBe(true);
  }
});
test('current weeks have one paused active game, four color pools, repeatable IDs and claims', () => {
  const fixtures = buildScrimmageFixtures(input);
  const repeat = buildScrimmageFixtures({ ...input, now: new Date('2026-10-15T12:00:00Z') });
  expect(fixtures.games.map((game) => String(game._id))).toEqual(
    repeat.games.map((game) => String(game._id))
  );
  for (const series of fixtures.series) {
    const open = fixtures.sessions.find(
      (week) => same(week.scrimmageId, series._id) && week.status === 'open'
    );
    expect(new Set(open.assignments.map((player) => player.color))).toEqual(
      new Set(['red', 'white', 'blue', 'black'])
    );
    expect(open.assignments).toHaveLength(22);
    const active = fixtures.games.filter(
      (game) => same(game.scrimmageSessionId, open._id) && game.scrimmageActive
    );
    expect(active).toHaveLength(1);
    expect(active[0].clock.status).toBe('paused');
    expect(active[0].homeRosterSnapshot).toHaveLength(5);
    expect(active[0].awayRosterSnapshot).toHaveLength(5);
    const draft = fixtures.sessions.find(
      (week) =>
        same(week.scrimmageId, series._id) && week.status === 'completed' && !week.publishedAt
    );
    expect(draft).toBeDefined();
    expect(
      fixtures.requests
        .filter((request) => same(request.scrimmageId, series._id))
        .map((request) => request.status)
    ).toEqual(['approved', 'pending']);
  }
});
test('additive reruns fill only missing IDs and preserve edited existing records', async () => {
  const fixtures = buildScrimmageFixtures(input);
  const first = { ...fixtures.players[0], displayName: 'Edited name' };
  jest.spyOn(repo.ScrimmagePlayer, 'find').mockResolvedValue([first]);
  const insert = jest.spyOn(repo.ScrimmagePlayer, 'insertMany').mockResolvedValue([]);
  expect(
    await insertMissing(repo.ScrimmagePlayer, fixtures.players.slice(0, 2), 'scrimmageId')
  ).toBe(1);
  expect(insert).toHaveBeenCalledWith([fixtures.players[1]], { ordered: true });
  repo.ScrimmagePlayer.find.mockResolvedValue(fixtures.players.slice(0, 2));
  insert.mockClear();
  expect(
    await insertMissing(repo.ScrimmagePlayer, fixtures.players.slice(0, 2), 'scrimmageId')
  ).toBe(0);
  expect(insert).not.toHaveBeenCalled();
});
test('conflicting IDs fail without writing into another scrimmage', async () => {
  const fixtures = buildScrimmageFixtures(input);
  jest
    .spyOn(repo.ScrimmagePlayer, 'find')
    .mockResolvedValue([{ ...fixtures.players[0], scrimmageId: new mongoose.Types.ObjectId() }]);
  const insert = jest.spyOn(repo.ScrimmagePlayer, 'insertMany').mockResolvedValue([]);
  await expect(
    insertMissing(repo.ScrimmagePlayer, fixtures.players.slice(0, 2), 'scrimmageId')
  ).rejects.toThrow('conflicting');
  expect(insert).not.toHaveBeenCalled();
});

test('partial reruns anchor restored games to saved week dates, not the current date', () => {
  const initial = buildScrimmageFixtures(input);
  const sessionDates = Object.fromEntries(
    initial.sessions.map((week) => [String(week._id), week.date])
  );
  const rerun = buildScrimmageFixtures({
    ...input,
    now: new Date('2026-12-25T12:00:00Z'),
    sessionDates,
  });
  expect(rerun.games.map((game) => game.scheduledAt)).toEqual(
    initial.games.map((game) => game.scheduledAt)
  );
  expect(rerun.games.map((game) => game.videoStartTimestamp)).toEqual(
    initial.games.map((game) => game.videoStartTimestamp)
  );
});
