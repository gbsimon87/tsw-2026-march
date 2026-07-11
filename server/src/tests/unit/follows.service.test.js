jest.mock('../../modules/follows/follows.repository', () => ({
  createFollow: jest.fn(),
  deleteFollow: jest.fn(),
  listFollowingByUser: jest.fn(),
  findFollowedTargetIds: jest.fn(),
}));

jest.mock('../../modules/auth/auth.repository', () => ({
  findUserById: jest.fn(),
  findUsersByIds: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  assembleLeagueProfilesForUser: jest.fn(),
}));

const repository = require('../../modules/follows/follows.repository');
const authRepository = require('../../modules/auth/auth.repository');
const leaguesService = require('../../modules/leagues/leagues.service');
const followsService = require('../../modules/follows/follows.service');

const FOLLOWER = '507f1f77bcf86cd799439011';
const TARGET = '507f1f77bcf86cd799439012';

describe('follows.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('followUser', () => {
    test('creates the follow and returns isFollowing: true', async () => {
      authRepository.findUserById.mockResolvedValue({ _id: TARGET, name: 'Target' });
      repository.createFollow.mockResolvedValue({});

      const result = await followsService.followUser(FOLLOWER, TARGET);

      expect(repository.createFollow).toHaveBeenCalledWith({
        followerUserId: FOLLOWER,
        targetType: 'user',
        targetId: TARGET,
      });
      expect(result).toEqual({ targetUserId: TARGET, isFollowing: true });
    });

    test('rejects following yourself with 400', async () => {
      await expect(followsService.followUser(FOLLOWER, FOLLOWER)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(repository.createFollow).not.toHaveBeenCalled();
    });

    test('404 when target user does not exist', async () => {
      authRepository.findUserById.mockResolvedValue(null);

      await expect(followsService.followUser(FOLLOWER, TARGET)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(repository.createFollow).not.toHaveBeenCalled();
    });

    test('404 on an invalid target id (never hits the DB)', async () => {
      await expect(followsService.followUser(FOLLOWER, 'not-valid')).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(authRepository.findUserById).not.toHaveBeenCalled();
    });
  });

  describe('unfollowUser', () => {
    test('deletes the follow and returns isFollowing: false (idempotent)', async () => {
      repository.deleteFollow.mockResolvedValue({ deletedCount: 0 });

      const result = await followsService.unfollowUser(FOLLOWER, TARGET);

      expect(repository.deleteFollow).toHaveBeenCalledWith({
        followerUserId: FOLLOWER,
        targetType: 'user',
        targetId: TARGET,
      });
      expect(result).toEqual({ targetUserId: TARGET, isFollowing: false });
    });
  });

  describe('listFollowing', () => {
    test('hydrates users and marks hasPublicProfile / profileHref', async () => {
      repository.listFollowingByUser.mockResolvedValue([{ targetId: TARGET }]);
      authRepository.findUsersByIds.mockResolvedValue([
        { _id: TARGET, name: 'Jamie', avatar: { url: null } },
      ]);
      leaguesService.assembleLeagueProfilesForUser.mockResolvedValue([
        { league: { isPublic: true } },
      ]);

      const result = await followsService.listFollowing(FOLLOWER, {});

      expect(result.following).toEqual([
        {
          userId: TARGET,
          name: 'Jamie',
          avatarUrl: null,
          hasPublicProfile: true,
          profileHref: `/players/${TARGET}`,
        },
      ]);
      expect(result.nextCursor).toBeNull();
    });

    test('shows a minimal card (null profileHref) when no public profile', async () => {
      repository.listFollowingByUser.mockResolvedValue([{ targetId: TARGET }]);
      authRepository.findUsersByIds.mockResolvedValue([
        { _id: TARGET, name: 'Jamie', avatar: null },
      ]);
      leaguesService.assembleLeagueProfilesForUser.mockResolvedValue([
        { league: { isPublic: false } },
      ]);

      const result = await followsService.listFollowing(FOLLOWER, {});

      expect(result.following[0]).toMatchObject({
        userId: TARGET,
        hasPublicProfile: false,
        profileHref: null,
      });
    });

    test('drops follows whose user no longer exists', async () => {
      repository.listFollowingByUser.mockResolvedValue([{ targetId: TARGET }]);
      authRepository.findUsersByIds.mockResolvedValue([]);

      const result = await followsService.listFollowing(FOLLOWER, {});

      expect(result.following).toEqual([]);
    });

    test('applies keyset pagination when a limit is passed', async () => {
      // over-fetched limit+1 rows -> nextCursor is the last kept row's target
      repository.listFollowingByUser.mockResolvedValue([
        { _id: 'a', targetId: TARGET },
        { _id: 'b', targetId: 'other' },
      ]);
      authRepository.findUsersByIds.mockResolvedValue([{ _id: TARGET, name: 'Jamie' }]);
      leaguesService.assembleLeagueProfilesForUser.mockResolvedValue([]);

      const result = await followsService.listFollowing(FOLLOWER, { limit: 1 });

      expect(result.nextCursor).toBe('a');
    });
  });

  describe('getFollowStatuses', () => {
    test('returns a boolean per requested id', async () => {
      repository.findFollowedTargetIds.mockResolvedValue(new Set([TARGET]));

      const result = await followsService.getFollowStatuses(FOLLOWER, [TARGET, 'other-id']);

      expect(result.statuses).toEqual({ [TARGET]: true, 'other-id': false });
    });
  });
});
