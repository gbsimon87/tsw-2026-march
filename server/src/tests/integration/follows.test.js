const request = require('supertest');

jest.mock('../../middleware/rateLimit.middleware', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    apiRateLimiter: passThrough,
    authRecoveryLimiter: passThrough,
    authCredentialLimiter: passThrough,
    contactLimiter: passThrough,
    checkoutLimiter: passThrough,
  };
});

jest.mock('../../modules/follows/follows.service', () => ({
  followTarget: jest.fn(),
  unfollowTarget: jest.fn(),
  listFollowing: jest.fn(),
  getFollowStatuses: jest.fn(),
}));

const followsService = require('../../modules/follows/follows.service');
const { createApp } = require('../../app');
const { ApiError } = require('../../utils/apiError');
const { signAccessToken } = require('../../services/token.service');

const CSRF_ORIGIN = 'http://localhost:5173';
const HEX_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const HEX_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function bearer(userId = 'follower-1') {
  return `Bearer ${signAccessToken({ sub: userId, sid: 's1' })}`;
}

describe('follows routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('auth & csrf', () => {
    test('blocks GET /api/v1/follows/following without auth', async () => {
      const res = await request(createApp()).get('/api/v1/follows/following');
      expect(res.statusCode).toBe(401);
    });

    test('blocks POST follow without a csrf token', async () => {
      const res = await request(createApp())
        .post('/api/v1/follows/user/target-1')
        .set('Authorization', bearer());
      expect(res.statusCode).toBe(403);
    });

    test('blocks DELETE unfollow without a csrf token', async () => {
      const res = await request(createApp())
        .delete('/api/v1/follows/user/target-1')
        .set('Authorization', bearer());
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/follows/:targetType/:targetId', () => {
    test.each([
      ['user', 'target-1'],
      ['league', HEX_A],
      ['leagueTeam', HEX_B],
    ])('201 and returns follow state for %s', async (targetType, targetId) => {
      followsService.followTarget.mockResolvedValue({ targetType, targetId, isFollowing: true });

      const res = await request(createApp())
        .post(`/api/v1/follows/${targetType}/${targetId}`)
        .set('Authorization', bearer('follower-1'))
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(201);
      expect(res.body.follow).toEqual({ targetType, targetId, isFollowing: true });
      expect(followsService.followTarget).toHaveBeenCalledWith('follower-1', targetType, targetId);
    });

    test('400 when following yourself', async () => {
      followsService.followTarget.mockRejectedValue(
        new ApiError(400, 'You cannot follow yourself')
      );

      const res = await request(createApp())
        .post('/api/v1/follows/user/follower-1')
        .set('Authorization', bearer('follower-1'))
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(400);
    });

    test('404 when following a private league you cannot see', async () => {
      followsService.followTarget.mockRejectedValue(new ApiError(404, 'League not found'));

      const res = await request(createApp())
        .post(`/api/v1/follows/league/${HEX_A}`)
        .set('Authorization', bearer())
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(404);
    });

    test('back-compat /users/:userId alias maps to the user target type', async () => {
      followsService.followTarget.mockResolvedValue({
        targetType: 'user',
        targetId: 'target-1',
        isFollowing: true,
      });

      const res = await request(createApp())
        .post('/api/v1/follows/users/target-1')
        .set('Authorization', bearer('follower-1'))
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(201);
      expect(followsService.followTarget).toHaveBeenCalledWith('follower-1', 'user', 'target-1');
    });
  });

  describe('DELETE /api/v1/follows/:targetType/:targetId', () => {
    test('200 and returns unfollowed state (idempotent)', async () => {
      followsService.unfollowTarget.mockResolvedValue({
        targetType: 'league',
        targetId: HEX_A,
        isFollowing: false,
      });

      const res = await request(createApp())
        .delete(`/api/v1/follows/league/${HEX_A}`)
        .set('Authorization', bearer('follower-1'))
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ targetType: 'league', targetId: HEX_A, isFollowing: false });
      expect(followsService.unfollowTarget).toHaveBeenCalledWith('follower-1', 'league', HEX_A);
    });

    test('back-compat /users/:userId alias maps to the user target type', async () => {
      followsService.unfollowTarget.mockResolvedValue({
        targetType: 'user',
        targetId: 'target-1',
        isFollowing: false,
      });

      const res = await request(createApp())
        .delete('/api/v1/follows/users/target-1')
        .set('Authorization', bearer('follower-1'))
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(200);
      expect(followsService.unfollowTarget).toHaveBeenCalledWith('follower-1', 'user', 'target-1');
    });
  });

  describe('GET /api/v1/follows/following', () => {
    test('200 with a hydrated following list + nextCursor', async () => {
      followsService.listFollowing.mockResolvedValue({
        following: [
          {
            targetType: 'league',
            leagueId: HEX_A,
            name: 'Open League',
            logo: null,
            slug: 'open',
            profileHref: '/league/open',
          },
        ],
        nextCursor: null,
      });

      const res = await request(createApp())
        .get('/api/v1/follows/following?targetType=league')
        .set('Authorization', bearer('follower-1'));

      expect(res.statusCode).toBe(200);
      expect(res.body.following[0]).toMatchObject({
        targetType: 'league',
        profileHref: '/league/open',
      });
    });

    test('passes targetType/limit through to the service', async () => {
      followsService.listFollowing.mockResolvedValue({ following: [], nextCursor: null });

      await request(createApp())
        .get('/api/v1/follows/following?targetType=leagueTeam&limit=5')
        .set('Authorization', bearer('follower-1'));

      expect(followsService.listFollowing).toHaveBeenCalledWith(
        'follower-1',
        expect.objectContaining({ targetType: 'leagueTeam', limit: 5 })
      );
    });

    test('400 on an unknown targetType', async () => {
      const res = await request(createApp())
        .get('/api/v1/follows/following?targetType=team')
        .set('Authorization', bearer('follower-1'));

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/follows/status', () => {
    test('200 with a per-id status map', async () => {
      followsService.getFollowStatuses.mockResolvedValue({
        statuses: { [HEX_A]: true, [HEX_B]: false },
      });

      const res = await request(createApp())
        .get(`/api/v1/follows/status?targetType=league&targetIds=${HEX_A},${HEX_B}`)
        .set('Authorization', bearer('follower-1'));

      expect(res.statusCode).toBe(200);
      expect(res.body.statuses).toEqual({ [HEX_A]: true, [HEX_B]: false });
      expect(followsService.getFollowStatuses).toHaveBeenCalledWith('follower-1', 'league', [
        HEX_A,
        HEX_B,
      ]);
    });

    test('400 when targetType is missing', async () => {
      const res = await request(createApp())
        .get(`/api/v1/follows/status?targetIds=${HEX_A}`)
        .set('Authorization', bearer('follower-1'));

      expect(res.statusCode).toBe(400);
    });

    test('400 on a malformed id in the list', async () => {
      const res = await request(createApp())
        .get('/api/v1/follows/status?targetType=user&targetIds=not-an-id')
        .set('Authorization', bearer('follower-1'));

      expect(res.statusCode).toBe(400);
    });
  });
});
