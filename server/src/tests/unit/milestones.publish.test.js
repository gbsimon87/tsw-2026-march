jest.mock('../../config/env', () => ({
  env: {
    AUTO_FEED_ENABLED: true,
    AUTO_FEED_MILESTONES_ENABLED: true,
    CLOUDINARY_CLOUD_NAME: null,
  },
}));

jest.mock('../../modules/feed/feed.repository', () => ({
  createPost: jest.fn((doc) => Promise.resolve({ _id: 'post1', ...doc })),
  findPostByMilestoneId: jest.fn(() => Promise.resolve(null)),
  listPosts: jest.fn(),
  findPostById: jest.fn(),
  deletePostById: jest.fn(),
  updatePostCardSnapshot: jest.fn(() => Promise.resolve()),
  listGameCardPostsByGameId: jest.fn(() => Promise.resolve([])),
  findAutoGameCardPost: jest.fn(() => Promise.resolve(null)),
  findPostByHighlightEventId: jest.fn(() => Promise.resolve(null)),
  findSharedEventIds: jest.fn(() => Promise.resolve([])),
  deleteAutoPostsForGameIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
}));

jest.mock('../../modules/auth/auth.service', () => ({
  getSystemUserId: jest.fn(() => Promise.resolve('system-user-1')),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  isLeaguePublic: jest.fn(() => Promise.resolve(true)),
  listPublicLeagues: jest.fn(() => Promise.resolve({ leagues: [] })),
  getPublicLeagueTeamById: jest.fn(),
  getPublicLeaguePlayerById: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(() =>
    Promise.resolve({
      _id: 'p1',
      displayName: 'Ana',
      jerseyNumber: 7,
      avatar: { url: 'https://example.com/ana.jpg' },
    })
  ),
  findLeagueTeamById: jest.fn(() =>
    Promise.resolve({ _id: 'T1', name: 'Sharks', logo: null, colors: [] })
  ),
  listLeagueTeams: jest.fn(() => Promise.resolve([])),
  listLeaguePlayers: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/milestones/milestones.repository', () => ({
  setMilestonePostId: jest.fn(() => Promise.resolve()),
}));

const { env } = require('../../config/env');
const feedRepository = require('../../modules/feed/feed.repository');
const leaguesService = require('../../modules/leagues/leagues.service');
const milestonesRepository = require('../../modules/milestones/milestones.repository');
const {
  autoPublishMilestonePosts,
  buildMilestoneCardSnapshot,
} = require('../../modules/feed/feed.service');

const GAME = {
  _id: 'g1',
  gameContext: 'league',
  leagueId: 'L1',
  title: 'Sharks vs Bears',
};

function milestone(overrides = {}) {
  return {
    _id: 'm1',
    tier: 'feed',
    rarityRank: 5,
    milestoneKey: 'career_points_1000',
    label: '1,000 career points',
    family: 'career_threshold',
    value: 1000,
    statKey: 'points',
    achievedAt: new Date('2026-01-02T12:00:00.000Z'),
    leaguePlayerId: 'p1',
    leagueTeamId: 'T1',
    ...overrides,
  };
}

describe('autoPublishMilestonePosts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.AUTO_FEED_ENABLED = true;
    env.AUTO_FEED_MILESTONES_ENABLED = true;
    leaguesService.isLeaguePublic.mockResolvedValue(true);
    feedRepository.createPost.mockImplementation((doc) =>
      Promise.resolve({ _id: 'post1', ...doc })
    );
  });

  test('does nothing when milestone feed publishing is disabled', async () => {
    env.AUTO_FEED_MILESTONES_ENABLED = false;
    await expect(autoPublishMilestonePosts(GAME, [milestone()])).resolves.toEqual({
      created: 0,
      capped: false,
    });
    expect(feedRepository.createPost).not.toHaveBeenCalled();
  });

  test('does nothing when automatic feed publishing is disabled', async () => {
    env.AUTO_FEED_ENABLED = false;
    await expect(autoPublishMilestonePosts(GAME, [milestone()])).resolves.toEqual({
      created: 0,
      capped: false,
    });
    expect(feedRepository.createPost).not.toHaveBeenCalled();
  });

  test('does not publish milestones from a private league', async () => {
    leaguesService.isLeaguePublic.mockResolvedValue(false);
    await expect(autoPublishMilestonePosts(GAME, [milestone()])).resolves.toEqual({
      created: 0,
      capped: false,
    });
    expect(feedRepository.createPost).not.toHaveBeenCalled();
  });

  test('skips profile-tier milestones', async () => {
    await autoPublishMilestonePosts(GAME, [milestone({ tier: 'profile' })]);
    expect(feedRepository.createPost).not.toHaveBeenCalled();
  });

  test('publishes no more than two milestones per game', async () => {
    const milestones = [
      milestone({ _id: 'm1', rarityRank: 5 }),
      milestone({ _id: 'm2', rarityRank: 2 }),
      milestone({ _id: 'm3', rarityRank: 4 }),
    ];

    await expect(autoPublishMilestonePosts(GAME, milestones)).resolves.toEqual({
      created: 2,
      capped: true,
    });
    expect(feedRepository.createPost).toHaveBeenCalledTimes(2);
  });

  test('publishes the rarest milestones first', async () => {
    const milestones = [
      milestone({ _id: 'm1', rarityRank: 7 }),
      milestone({ _id: 'm2', rarityRank: 2 }),
      milestone({ _id: 'm3', rarityRank: 4 }),
    ];

    await autoPublishMilestonePosts(GAME, milestones);

    expect(
      feedRepository.createPost.mock.calls.map(([doc]) => doc.milestoneCard.milestoneId)
    ).toEqual(['m2', 'm3']);
  });

  test('links the created post back to the milestone record', async () => {
    await autoPublishMilestonePosts(GAME, [milestone()]);
    expect(milestonesRepository.setMilestonePostId).toHaveBeenCalledWith('m1', 'post1');
  });

  test('treats a duplicate milestone post as an idempotent no-op', async () => {
    feedRepository.createPost.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 11000 })
    );
    await expect(autoPublishMilestonePosts(GAME, [milestone()])).resolves.toEqual({
      created: 0,
      capped: false,
    });
  });

  test('authors milestone posts as the system user', async () => {
    await autoPublishMilestonePosts(GAME, [milestone()]);
    expect(feedRepository.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ creatorUserId: 'system-user-1', type: 'milestone' })
    );
  });
});

describe('buildMilestoneCardSnapshot', () => {
  test('builds a self-contained feed payload', () => {
    expect(
      buildMilestoneCardSnapshot({
        milestone: milestone(),
        player: { displayName: 'Ana', jerseyNumber: 7, avatar: { url: 'avatar.jpg' } },
        team: { name: 'Sharks', logo: { url: 'logo.jpg' }, colors: ['#123456'] },
        game: GAME,
      })
    ).toEqual(
      expect.objectContaining({
        milestoneId: 'm1',
        milestoneKey: 'career_points_1000',
        playerName: 'Ana',
        teamName: 'Sharks',
        gameId: 'g1',
        gameUrl: '/games/g1',
      })
    );
  });
});
