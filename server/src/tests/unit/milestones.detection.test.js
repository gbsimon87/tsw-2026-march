jest.mock('../../modules/games/games.repository', () => ({
  findGameById: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(),
  listLeaguePlayersByClaimedUser: jest.fn(() => Promise.resolve([])),
  listLeaguePlayerStatsByPlayerIds: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  recomputeLeagueAggregates: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../modules/milestones/milestones.repository', () => {
  const actual = jest.requireActual('../../modules/milestones/milestones.repository');
  return {
    buildDedupeKey: actual.buildDedupeKey,
    insertMilestones: jest.fn((docs) => Promise.resolve(docs)),
    listMilestonesBySourceGameId: jest.fn(() => Promise.resolve([])),
    deleteMilestonesByIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
    setMilestonePostId: jest.fn(() => Promise.resolve()),
  };
});

const gamesRepository = require('../../modules/games/games.repository');
const leaguesRepository = require('../../modules/leagues/leagues.repository');
const leaguesService = require('../../modules/leagues/leagues.service');
const milestonesRepository = require('../../modules/milestones/milestones.repository');
const {
  extractBoxScoreLines,
  detectForFinalizedGame,
} = require('../../modules/milestones/milestones.service');

function boxScoreRow(overrides = {}) {
  return {
    playerId: 'snap1',
    leaguePlayerId: 'p1',
    displayName: 'Ana',
    points: 0,
    reb: 0,
    ast: 0,
    fg3m: 0,
    fg3a: 0,
    fg2a: 0,
    fta: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    ...overrides,
  };
}

describe('extractBoxScoreLines', () => {
  test('reads a one-sided box score', () => {
    const lines = extractBoxScoreLines({
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      boxScore: { players: [boxScoreRow({ points: 10 })] },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].leaguePlayerId).toBe('p1');
    expect(lines[0].leagueTeamId).toBe('T1');
  });

  test('reads both sides of a dual-team box score', () => {
    const lines = extractBoxScoreLines({
      trackingMode: 'dual_team',
      homeLeagueTeamId: 'T1',
      awayLeagueTeamId: 'T2',
      boxScore: {
        home: { players: [boxScoreRow({ leaguePlayerId: 'p1' })] },
        away: { players: [boxScoreRow({ leaguePlayerId: 'p2' })] },
      },
    });
    expect(lines.map((l) => l.leaguePlayerId)).toEqual(['p1', 'p2']);
    expect(lines.map((l) => l.leagueTeamId)).toEqual(['T1', 'T2']);
  });

  test('skips rows with no leaguePlayerId', () => {
    const lines = extractBoxScoreLines({
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      boxScore: { players: [boxScoreRow({ leaguePlayerId: null })] },
    });
    expect(lines).toHaveLength(0);
  });
});

describe('detectForFinalizedGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    leaguesRepository.findLeaguePlayerById.mockResolvedValue({
      _id: 'p1',
      leagueId: 'L1',
      leagueTeamId: 'T1',
      claimedByUserId: null,
    });
  });

  test('ignores a game that is not completed', async () => {
    gamesRepository.findGameById.mockResolvedValue({ _id: 'g1', status: 'in_progress' });
    const result = await detectForFinalizedGame('g1');
    expect(result.created).toEqual([]);
    expect(milestonesRepository.insertMilestones).not.toHaveBeenCalled();
  });

  test('ignores a standalone game', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'standalone',
    });
    const result = await detectForFinalizedGame('g1');
    expect(result.created).toEqual([]);
  });

  test('awaits the league aggregate recompute before reading totals', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [boxScoreRow({ points: 10, fg2a: 8 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      { leaguePlayerId: 'p1', gamesCount: 1, points: 10, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0 },
    ]);

    await detectForFinalizedGame('g1', { publish: false });

    expect(leaguesService.recomputeLeagueAggregates).toHaveBeenCalledWith('L1', 'S1');
  });

  test('writes a milestone when a career threshold is crossed', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [boxScoreRow({ points: 20, fg2a: 14 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 30,
        points: 505,
        reb: 40,
        ast: 20,
        fg3m: 10,
        fg2a: 300,
        fta: 60,
        tov: 25,
        foul: 40,
        stl: 8,
        blk: 3,
      },
    ]);

    await detectForFinalizedGame('g1', { publish: false });

    const inserted = milestonesRepository.insertMilestones.mock.calls[0][0];
    const keys = inserted.map((d) => d.milestoneKey);
    expect(keys).toContain('career_points_500');
    // A 30-game veteran must never be handed a debut milestone.
    expect(keys).not.toContain('first_career_game');
    expect(inserted.find((d) => d.milestoneKey === 'career_points_500').rarityRank).toBe(7);
    const threshold = inserted.find((d) => d.milestoneKey === 'career_points_500');
    expect(threshold.dedupeKey).toBe('player:p1|career_points_500');
    expect(threshold.careerKey).toBe('player:p1');
    expect(String(threshold.sourceGameId)).toBe('g1');
    expect(threshold.achievedAt).toEqual(new Date('2026-08-01'));
  });

  test('scopes a repeatable feat dedupe key to the game', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [boxScoreRow({ points: 12, reb: 11, ast: 10, fg2a: 9 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 30,
        points: 300,
        reb: 100,
        ast: 90,
        fg3m: 0,
        stl: 0,
        blk: 0,
      },
    ]);

    await detectForFinalizedGame('g1', { publish: false });

    const inserted = milestonesRepository.insertMilestones.mock.calls[0][0];
    const triple = inserted.find((d) => d.milestoneKey === 'triple_double');
    expect(triple.dedupeKey).toBe('player:p1|triple_double|g1');
  });

  test('carries claimedByUserId onto the record for claimed players', async () => {
    leaguesRepository.findLeaguePlayerById.mockResolvedValue({
      _id: 'p1',
      leagueId: 'L1',
      leagueTeamId: 'T1',
      claimedByUserId: 'u9',
    });
    leaguesRepository.listLeaguePlayersByClaimedUser.mockResolvedValue([
      { _id: 'p1', leagueId: 'L1', claimedByUserId: 'u9' },
    ]);
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [boxScoreRow({ points: 3, fg3m: 1, fg3a: 1 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      { leaguePlayerId: 'p1', gamesCount: 1, points: 3, reb: 0, ast: 0, fg3m: 1, stl: 0, blk: 0 },
    ]);

    await detectForFinalizedGame('g1', { publish: false });

    const inserted = milestonesRepository.insertMilestones.mock.calls[0][0];
    expect(inserted[0].careerKey).toBe('user:u9');
    expect(inserted[0].claimedByUserId).toBe('u9');
  });
});
