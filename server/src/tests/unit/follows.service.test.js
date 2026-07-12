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
  assertLeagueVisible: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  listLeaguesByIds: jest.fn(),
  listLeagueTeamsByIds: jest.fn(),
}));

const { ApiError } = require('../../utils/apiError');
const repository = require('../../modules/follows/follows.repository');
const authRepository = require('../../modules/auth/auth.repository');
const leaguesService = require('../../modules/leagues/leagues.service');
const leaguesRepository = require('../../modules/leagues/leagues.repository');
const followsService = require('../../modules/follows/follows.service');

const FOLLOWER = '507f1f77bcf86cd799439011';
const TARGET = '507f1f77bcf86cd799439012';
const LEAGUE = '507f1f77bcf86cd799439021';
const LEAGUE_TEAM = '507f1f77bcf86cd799439031';

describe('follows.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- shared-shape behavior, parametrized across every target type --------

  const TYPE_CASES = [
    { targetType: 'user', targetId: TARGET },
    { targetType: 'league', targetId: LEAGUE },
    { targetType: 'leagueTeam', targetId: LEAGUE_TEAM },
  ];

  describe.each(TYPE_CASES)('followTarget / unfollowTarget (%s)', ({ targetType, targetId }) => {
    beforeEach(() => {
      // Make every type's followability gate pass by default.
      authRepository.findUserById.mockResolvedValue({ _id: targetId, name: 'Target' });
      leaguesService.assertLeagueVisible.mockResolvedValue({ _id: LEAGUE });
      leaguesRepository.listLeagueTeamsByIds.mockResolvedValue([
        { _id: LEAGUE_TEAM, leagueId: LEAGUE, name: 'Team', slug: 'team' },
      ]);
    });

    test('creates the follow and returns isFollowing: true', async () => {
      repository.createFollow.mockResolvedValue({});

      const result = await followsService.followTarget(FOLLOWER, targetType, targetId);

      expect(repository.createFollow).toHaveBeenCalledWith({
        followerUserId: FOLLOWER,
        targetType,
        targetId,
      });
      expect(result).toEqual({ targetType, targetId, isFollowing: true });
    });

    test('unfollow is idempotent and returns isFollowing: false', async () => {
      repository.deleteFollow.mockResolvedValue({ deletedCount: 0 });

      const result = await followsService.unfollowTarget(FOLLOWER, targetType, targetId);

      expect(repository.deleteFollow).toHaveBeenCalledWith({
        followerUserId: FOLLOWER,
        targetType,
        targetId,
      });
      expect(result).toEqual({ targetType, targetId, isFollowing: false });
    });

    test('404 on a malformed target id (never hits the repository)', async () => {
      await expect(
        followsService.followTarget(FOLLOWER, targetType, 'not-valid')
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(repository.createFollow).not.toHaveBeenCalled();
    });
  });

  test('unknown targetType is a 400', async () => {
    await expect(followsService.followTarget(FOLLOWER, 'team', TARGET)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(followsService.unfollowTarget(FOLLOWER, 'team', TARGET)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  // ---- user-specific rules -------------------------------------------------

  describe('user target', () => {
    test('rejects following yourself with 400', async () => {
      await expect(followsService.followTarget(FOLLOWER, 'user', FOLLOWER)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(repository.createFollow).not.toHaveBeenCalled();
    });

    test('404 when the target user does not exist', async () => {
      authRepository.findUserById.mockResolvedValue(null);

      await expect(followsService.followTarget(FOLLOWER, 'user', TARGET)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(repository.createFollow).not.toHaveBeenCalled();
    });

    test('back-compat followUser/unfollowUser wrappers still work', async () => {
      authRepository.findUserById.mockResolvedValue({ _id: TARGET });
      repository.createFollow.mockResolvedValue({});
      const followed = await followsService.followUser(FOLLOWER, TARGET);
      expect(followed).toEqual({ targetType: 'user', targetId: TARGET, isFollowing: true });

      repository.deleteFollow.mockResolvedValue({ deletedCount: 1 });
      const unfollowed = await followsService.unfollowUser(FOLLOWER, TARGET);
      expect(unfollowed).toEqual({ targetType: 'user', targetId: TARGET, isFollowing: false });
    });
  });

  // ---- visibility gating (D8) ----------------------------------------------

  describe('league/leagueTeam visibility gating', () => {
    test('following a league reuses assertLeagueVisible with the viewer', async () => {
      leaguesService.assertLeagueVisible.mockResolvedValue({ _id: LEAGUE });
      repository.createFollow.mockResolvedValue({});

      await followsService.followTarget(FOLLOWER, 'league', LEAGUE);

      expect(leaguesService.assertLeagueVisible).toHaveBeenCalledWith(LEAGUE, {
        viewerUserId: FOLLOWER,
      });
    });

    test('following a private league you cannot see propagates 404', async () => {
      leaguesService.assertLeagueVisible.mockRejectedValue(new ApiError(404, 'League not found'));

      await expect(followsService.followTarget(FOLLOWER, 'league', LEAGUE)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(repository.createFollow).not.toHaveBeenCalled();
    });

    test('following a leagueTeam gates on the PARENT league via assertLeagueVisible', async () => {
      leaguesRepository.listLeagueTeamsByIds.mockResolvedValue([
        { _id: LEAGUE_TEAM, leagueId: LEAGUE, name: 'Team', slug: 'team' },
      ]);
      leaguesService.assertLeagueVisible.mockResolvedValue({ _id: LEAGUE });
      repository.createFollow.mockResolvedValue({});

      await followsService.followTarget(FOLLOWER, 'leagueTeam', LEAGUE_TEAM);

      expect(leaguesService.assertLeagueVisible).toHaveBeenCalledWith(LEAGUE, {
        viewerUserId: FOLLOWER,
      });
    });

    test('404 when the leagueTeam does not exist', async () => {
      leaguesRepository.listLeagueTeamsByIds.mockResolvedValue([]);

      await expect(
        followsService.followTarget(FOLLOWER, 'leagueTeam', LEAGUE_TEAM)
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(leaguesService.assertLeagueVisible).not.toHaveBeenCalled();
    });

    test('unfollow does NOT re-check visibility (cannot be trapped in a now-private league)', async () => {
      repository.deleteFollow.mockResolvedValue({ deletedCount: 1 });

      await followsService.unfollowTarget(FOLLOWER, 'league', LEAGUE);

      expect(leaguesService.assertLeagueVisible).not.toHaveBeenCalled();
      expect(repository.deleteFollow).toHaveBeenCalled();
    });
  });

  // ---- listFollowing hydration ---------------------------------------------

  describe('listFollowing — user hydration', () => {
    test('hydrates users, tags targetType, marks hasPublicProfile / profileHref', async () => {
      repository.listFollowingByUser.mockResolvedValue([{ targetId: TARGET }]);
      authRepository.findUsersByIds.mockResolvedValue([
        { _id: TARGET, name: 'Jamie', avatar: { url: null } },
      ]);
      leaguesService.assembleLeagueProfilesForUser.mockResolvedValue([
        { league: { isPublic: true } },
      ]);

      const result = await followsService.listFollowing(FOLLOWER, { targetType: 'user' });

      expect(result.following).toEqual([
        {
          targetType: 'user',
          userId: TARGET,
          name: 'Jamie',
          avatarUrl: null,
          hasPublicProfile: true,
          profileHref: `/players/${TARGET}`,
        },
      ]);
      expect(result.nextCursor).toBeNull();
    });

    test('defaults to the user type when no targetType is passed', async () => {
      repository.listFollowingByUser.mockResolvedValue([]);
      authRepository.findUsersByIds.mockResolvedValue([]);

      await followsService.listFollowing(FOLLOWER, {});

      expect(repository.listFollowingByUser).toHaveBeenCalledWith(
        FOLLOWER,
        expect.objectContaining({ targetType: 'user' })
      );
    });

    test('minimal card (null profileHref) when no public profile', async () => {
      repository.listFollowingByUser.mockResolvedValue([{ targetId: TARGET }]);
      authRepository.findUsersByIds.mockResolvedValue([
        { _id: TARGET, name: 'Jamie', avatar: null },
      ]);
      leaguesService.assembleLeagueProfilesForUser.mockResolvedValue([
        { league: { isPublic: false } },
      ]);

      const result = await followsService.listFollowing(FOLLOWER, { targetType: 'user' });

      expect(result.following[0]).toMatchObject({ hasPublicProfile: false, profileHref: null });
    });

    test('drops follows whose user no longer exists', async () => {
      repository.listFollowingByUser.mockResolvedValue([{ targetId: TARGET }]);
      authRepository.findUsersByIds.mockResolvedValue([]);

      const result = await followsService.listFollowing(FOLLOWER, { targetType: 'user' });

      expect(result.following).toEqual([]);
    });

    test('applies keyset pagination when a limit is passed', async () => {
      repository.listFollowingByUser.mockResolvedValue([
        { _id: 'a', targetId: TARGET },
        { _id: 'b', targetId: 'other' },
      ]);
      authRepository.findUsersByIds.mockResolvedValue([{ _id: TARGET, name: 'Jamie' }]);
      leaguesService.assembleLeagueProfilesForUser.mockResolvedValue([]);

      const result = await followsService.listFollowing(FOLLOWER, { targetType: 'user', limit: 1 });

      expect(result.nextCursor).toBe('a');
    });
  });

  describe('listFollowing — league hydration', () => {
    test('links visible leagues and nulls href/slug for a now-private league (D8)', async () => {
      const PRIVATE = '507f1f77bcf86cd799439022';
      repository.listFollowingByUser.mockResolvedValue([
        { targetId: LEAGUE },
        { targetId: PRIVATE },
      ]);
      leaguesRepository.listLeaguesByIds.mockResolvedValue([
        { _id: LEAGUE, name: 'Open League', slug: 'open', logo: null },
        { _id: PRIVATE, name: 'Secret League', slug: 'secret', logo: null },
      ]);
      leaguesService.assertLeagueVisible.mockImplementation((id) => {
        if (String(id) === PRIVATE) return Promise.reject(new ApiError(404, 'League not found'));
        return Promise.resolve({ _id: id });
      });

      const result = await followsService.listFollowing(FOLLOWER, { targetType: 'league' });

      expect(result.following).toEqual([
        {
          targetType: 'league',
          leagueId: LEAGUE,
          name: 'Open League',
          logo: null,
          slug: 'open',
          profileHref: '/league/open',
        },
        {
          targetType: 'league',
          leagueId: PRIVATE,
          name: 'Secret League',
          logo: null,
          slug: null,
          profileHref: null,
        },
      ]);
    });
  });

  describe('listFollowing — leagueTeam hydration', () => {
    test('builds a team href from the parent league slug when visible', async () => {
      repository.listFollowingByUser.mockResolvedValue([{ targetId: LEAGUE_TEAM }]);
      leaguesRepository.listLeagueTeamsByIds.mockResolvedValue([
        { _id: LEAGUE_TEAM, leagueId: LEAGUE, name: 'Hawks', slug: 'hawks', logo: null },
      ]);
      leaguesRepository.listLeaguesByIds.mockResolvedValue([
        { _id: LEAGUE, slug: 'open', name: 'Open League' },
      ]);
      leaguesService.assertLeagueVisible.mockResolvedValue({ _id: LEAGUE });

      const result = await followsService.listFollowing(FOLLOWER, { targetType: 'leagueTeam' });

      expect(result.following).toEqual([
        {
          targetType: 'leagueTeam',
          leagueTeamId: LEAGUE_TEAM,
          name: 'Hawks',
          logo: null,
          teamSlug: 'hawks',
          leagueSlug: 'open',
          profileHref: '/league/open/teams/hawks',
        },
      ]);
    });

    test('nulls href/slugs when the parent league is no longer visible (D8)', async () => {
      repository.listFollowingByUser.mockResolvedValue([{ targetId: LEAGUE_TEAM }]);
      leaguesRepository.listLeagueTeamsByIds.mockResolvedValue([
        { _id: LEAGUE_TEAM, leagueId: LEAGUE, name: 'Hawks', slug: 'hawks', logo: null },
      ]);
      leaguesRepository.listLeaguesByIds.mockResolvedValue([{ _id: LEAGUE, slug: 'open' }]);
      leaguesService.assertLeagueVisible.mockRejectedValue(new ApiError(404, 'League not found'));

      const result = await followsService.listFollowing(FOLLOWER, { targetType: 'leagueTeam' });

      expect(result.following[0]).toMatchObject({
        teamSlug: null,
        leagueSlug: null,
        profileHref: null,
      });
    });
  });

  describe('getFollowStatuses', () => {
    test.each(['user', 'league', 'leagueTeam'])(
      'returns a boolean per requested id (%s)',
      async (targetType) => {
        repository.findFollowedTargetIds.mockResolvedValue(new Set([TARGET]));

        const result = await followsService.getFollowStatuses(FOLLOWER, targetType, [
          TARGET,
          'other-id',
        ]);

        expect(repository.findFollowedTargetIds).toHaveBeenCalledWith(
          FOLLOWER,
          expect.objectContaining({ targetType })
        );
        expect(result.statuses).toEqual({ [TARGET]: true, 'other-id': false });
      }
    );

    test('rejects an unknown targetType with 400', async () => {
      await expect(
        followsService.getFollowStatuses(FOLLOWER, 'team', [TARGET])
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
