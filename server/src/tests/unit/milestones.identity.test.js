jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(),
  listLeaguePlayersByClaimedUser: jest.fn(() => Promise.resolve([])),
  listLeaguePlayerStatsByPlayerIds: jest.fn(() => Promise.resolve([])),
}));

const leaguesRepository = require('../../modules/leagues/leagues.repository');
const {
  buildCareerKey,
  resolveCareerTotals,
  subtractGameLine,
} = require('../../modules/milestones/milestones.service');

describe('buildCareerKey', () => {
  test('uses the claiming user when the roster row is claimed', () => {
    expect(buildCareerKey({ _id: 'p1', claimedByUserId: 'u9' })).toBe('user:u9');
  });

  test('falls back to the roster row when unclaimed', () => {
    expect(buildCareerKey({ _id: 'p1', claimedByUserId: null })).toBe('player:p1');
  });
});

describe('resolveCareerTotals', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sums a claimed player rows across every team and season in the league', async () => {
    leaguesRepository.listLeaguePlayersByClaimedUser.mockResolvedValue([
      { _id: 'p1', leagueId: 'L1', claimedByUserId: 'u9' },
      { _id: 'p2', leagueId: 'L1', claimedByUserId: 'u9' },
      { _id: 'p3', leagueId: 'L2', claimedByUserId: 'u9' },
    ]);
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 10,
        points: 100,
        reb: 30,
        ast: 10,
        fg3m: 5,
        stl: 4,
        blk: 1,
      },
      { leaguePlayerId: 'p2', gamesCount: 6, points: 60, reb: 20, ast: 8, fg3m: 3, stl: 2, blk: 0 },
    ]);

    const result = await resolveCareerTotals('L1', { _id: 'p1', claimedByUserId: 'u9' });

    expect(result.careerKey).toBe('user:u9');
    expect(result.leaguePlayerIds.sort()).toEqual(['p1', 'p2']);
    expect(result.totals.points).toBe(160);
    expect(result.totals.gamesCount).toBe(16);
    expect(result.totals.reb).toBe(50);
  });

  test('excludes rows from other leagues', async () => {
    leaguesRepository.listLeaguePlayersByClaimedUser.mockResolvedValue([
      { _id: 'p1', leagueId: 'L1', claimedByUserId: 'u9' },
      { _id: 'p3', leagueId: 'L2', claimedByUserId: 'u9' },
    ]);
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([]);

    await resolveCareerTotals('L1', { _id: 'p1', claimedByUserId: 'u9' });

    expect(leaguesRepository.listLeaguePlayerStatsByPlayerIds).toHaveBeenCalledWith('L1', ['p1']);
  });

  test('uses only the single row for an unclaimed player', async () => {
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      { leaguePlayerId: 'p1', gamesCount: 3, points: 12, reb: 4, ast: 1, fg3m: 0, stl: 0, blk: 0 },
    ]);

    const result = await resolveCareerTotals('L1', { _id: 'p1', claimedByUserId: null });

    expect(result.careerKey).toBe('player:p1');
    expect(leaguesRepository.listLeaguePlayersByClaimedUser).not.toHaveBeenCalled();
    expect(result.totals.points).toBe(12);
  });
});

describe('subtractGameLine', () => {
  test('derives before totals by removing this game', () => {
    const before = subtractGameLine(
      { gamesCount: 10, points: 100, reb: 40, ast: 20, fg3m: 8, fg2a: 60, stl: 5, blk: 2 },
      { points: 22, reb: 9, ast: 4, fg3m: 3, fg2a: 12, stl: 1, blk: 1 }
    );
    expect(before).toMatchObject({
      gamesCount: 9,
      points: 78,
      reb: 31,
      ast: 16,
      fg3m: 5,
      fg2a: 48,
      stl: 4,
      blk: 1,
    });
  });

  test('carries the attempt counters that debut detection depends on', () => {
    const before = subtractGameLine(
      { gamesCount: 5, fg2a: 30, fg3a: 10, fta: 8, tov: 6, foul: 9 },
      { fg2a: 7, fg3a: 2, fta: 1, tov: 1, foul: 2 }
    );
    expect(before.fg2a).toBe(23);
    expect(before.fg3a).toBe(8);
    expect(before.fta).toBe(7);
    expect(before.tov).toBe(5);
    expect(before.foul).toBe(7);
  });

  test('clamps at zero rather than going negative', () => {
    const before = subtractGameLine(
      { gamesCount: 0, points: 2, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0 },
      { points: 5, reb: 3, ast: 0, fg3m: 0, stl: 0, blk: 0 }
    );
    expect(before.points).toBe(0);
    expect(before.reb).toBe(0);
    expect(before.gamesCount).toBe(0);
  });
});
