jest.mock('../../modules/games/games.repository', () => ({ findGameById: jest.fn() }));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(() =>
    Promise.resolve({ _id: 'p1', leagueId: 'L1', leagueTeamId: 'T1', claimedByUserId: null })
  ),
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

jest.mock('../../modules/feed/feed.service', () => ({
  autoPublishMilestonePosts: jest.fn(() => Promise.resolve({ created: 0, capped: false })),
  deletePostsByIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
}));

const gamesRepository = require('../../modules/games/games.repository');
const leaguesRepository = require('../../modules/leagues/leagues.repository');
const milestonesRepository = require('../../modules/milestones/milestones.repository');
const feedService = require('../../modules/feed/feed.service');
const { reevaluateMilestonesForGame } = require('../../modules/milestones/milestones.service');

function row(overrides = {}) {
  return {
    leaguePlayerId: 'p1',
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

function completedGame(line) {
  return {
    _id: 'g1',
    status: 'completed',
    gameContext: 'league',
    leagueId: 'L1',
    seasonId: 'S1',
    trackingMode: 'one_sided',
    trackedLeagueTeamId: 'T1',
    completedAt: new Date('2026-08-01'),
    boxScore: { players: [line] },
  };
}

describe('reevaluateMilestonesForGame', () => {
  beforeEach(() => jest.clearAllMocks());

  test('removes a milestone that the edit invalidated, and its post', async () => {
    gamesRepository.findGameById.mockResolvedValue(
      completedGame(row({ points: 12, reb: 4, fg2a: 9 }))
    );
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 20,
        points: 300,
        reb: 90,
        ast: 40,
        fg3m: 10,
        stl: 5,
        blk: 1,
      },
    ]);
    milestonesRepository.listMilestonesBySourceGameId.mockResolvedValue([
      { _id: 'm1', milestoneKey: 'triple_double', careerKey: 'player:p1', postId: 'post1' },
    ]);

    const result = await reevaluateMilestonesForGame('g1');

    expect(milestonesRepository.deleteMilestonesByIds).toHaveBeenCalledWith(['m1']);
    expect(feedService.deletePostsByIds).toHaveBeenCalledWith(['post1']);
    expect(result.removed).toBe(1);
  });

  test('keeps a milestone that still holds', async () => {
    gamesRepository.findGameById.mockResolvedValue(
      completedGame(row({ points: 12, reb: 11, ast: 10, fg2a: 9 }))
    );
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 20,
        points: 300,
        reb: 90,
        ast: 40,
        fg3m: 10,
        stl: 5,
        blk: 1,
      },
    ]);
    milestonesRepository.listMilestonesBySourceGameId.mockResolvedValue([
      { _id: 'm1', milestoneKey: 'triple_double', careerKey: 'player:p1', postId: 'post1' },
    ]);

    const result = await reevaluateMilestonesForGame('g1');

    expect(milestonesRepository.deleteMilestonesByIds).not.toHaveBeenCalled();
    expect(result.removed).toBe(0);
  });

  test('never publishes newly earned milestones from an edit', async () => {
    gamesRepository.findGameById.mockResolvedValue(completedGame(row({ points: 45, fg2a: 30 })));
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 20,
        points: 300,
        reb: 0,
        ast: 0,
        fg3m: 0,
        stl: 0,
        blk: 0,
      },
    ]);

    await reevaluateMilestonesForGame('g1');

    expect(feedService.autoPublishMilestonePosts).not.toHaveBeenCalled();
  });
});
