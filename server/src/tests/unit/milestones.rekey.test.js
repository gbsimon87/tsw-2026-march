jest.mock('../../modules/games/games.repository', () => ({ findGameById: jest.fn() }));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(),
  listLeaguePlayersByClaimedUser: jest.fn(() => Promise.resolve([])),
  listLeaguePlayerStatsByPlayerIds: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/milestones/milestones.repository', () => {
  const actual = jest.requireActual('../../modules/milestones/milestones.repository');
  return {
    buildDedupeKey: actual.buildDedupeKey,
    insertMilestones: jest.fn(),
    listMilestonesByCareerKeys: jest.fn(() => Promise.resolve([])),
    listMilestonesBySourceGameId: jest.fn(() => Promise.resolve([])),
    deleteMilestonesByIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
    updateMilestoneCareerKey: jest.fn(() => Promise.resolve()),
    setMilestonePostId: jest.fn(() => Promise.resolve()),
  };
});

const milestonesRepository = require('../../modules/milestones/milestones.repository');
const { rekeyMilestonesForPlayer } = require('../../modules/milestones/milestones.service');

describe('rekeyMilestonesForPlayer', () => {
  beforeEach(() => jest.clearAllMocks());

  test('moves records from the player key to the user key', async () => {
    milestonesRepository.listMilestonesByCareerKeys.mockResolvedValue([
      {
        _id: 'm1',
        careerKey: 'player:p1',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g1',
        achievedAt: new Date('2026-01-01'),
        leaguePlayerId: 'p1',
      },
    ]);

    const result = await rekeyMilestonesForPlayer('p1', {
      fromCareerKey: 'player:p1',
      toCareerKey: 'user:u9',
      claimedByUserId: 'u9',
    });

    expect(milestonesRepository.updateMilestoneCareerKey).toHaveBeenCalledWith(
      'm1',
      'user:u9',
      'user:u9|career_points_500'
    );
    expect(result.moved).toBe(1);
    expect(result.dropped).toBe(0);
  });

  test('drops the later duplicate when the target key already has the milestone', async () => {
    milestonesRepository.listMilestonesByCareerKeys.mockResolvedValue([
      {
        _id: 'm1',
        careerKey: 'player:p1',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g1',
        achievedAt: new Date('2026-05-01'),
        leaguePlayerId: 'p1',
      },
      {
        _id: 'm2',
        careerKey: 'user:u9',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g0',
        achievedAt: new Date('2026-01-01'),
        leaguePlayerId: 'p0',
      },
    ]);

    const result = await rekeyMilestonesForPlayer('p1', {
      fromCareerKey: 'player:p1',
      toCareerKey: 'user:u9',
      claimedByUserId: 'u9',
    });

    expect(milestonesRepository.deleteMilestonesByIds).toHaveBeenCalledWith(['m1']);
    expect(result.dropped).toBe(1);
    expect(result.moved).toBe(0);
  });

  test('keeps the earlier record when the incoming one predates it', async () => {
    milestonesRepository.listMilestonesByCareerKeys.mockResolvedValue([
      {
        _id: 'm1',
        careerKey: 'player:p1',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g1',
        achievedAt: new Date('2026-01-01'),
        leaguePlayerId: 'p1',
      },
      {
        _id: 'm2',
        careerKey: 'user:u9',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g0',
        achievedAt: new Date('2026-05-01'),
        leaguePlayerId: 'p0',
      },
    ]);

    await rekeyMilestonesForPlayer('p1', {
      fromCareerKey: 'player:p1',
      toCareerKey: 'user:u9',
      claimedByUserId: 'u9',
    });

    expect(milestonesRepository.deleteMilestonesByIds).toHaveBeenCalledWith(['m2']);
    expect(milestonesRepository.updateMilestoneCareerKey).toHaveBeenCalledWith(
      'm1',
      'user:u9',
      'user:u9|career_points_500'
    );
  });

  test('keeps per-game feats from both keys, since their dedupe key includes the game', async () => {
    milestonesRepository.listMilestonesByCareerKeys.mockResolvedValue([
      {
        _id: 'm1',
        careerKey: 'player:p1',
        milestoneKey: 'triple_double',
        family: 'single_game_feat',
        sourceGameId: 'g1',
        achievedAt: new Date('2026-01-01'),
        leaguePlayerId: 'p1',
      },
      {
        _id: 'm2',
        careerKey: 'user:u9',
        milestoneKey: 'triple_double',
        family: 'single_game_feat',
        sourceGameId: 'g2',
        achievedAt: new Date('2026-02-01'),
        leaguePlayerId: 'p0',
      },
    ]);

    const result = await rekeyMilestonesForPlayer('p1', {
      fromCareerKey: 'player:p1',
      toCareerKey: 'user:u9',
      claimedByUserId: 'u9',
    });

    expect(result.dropped).toBe(0);
    expect(milestonesRepository.updateMilestoneCareerKey).toHaveBeenCalledWith(
      'm1',
      'user:u9',
      'user:u9|triple_double|g1'
    );
  });
});
