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
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  listFollowing: jest.fn(),
  getFollowStatuses: jest.fn(),
}));

const followsService = require('../../modules/follows/follows.service');
const { createApp } = require('../../app');
const { ApiError } = require('../../utils/apiError');
const { signAccessToken } = require('../../services/token.service');

const CSRF_ORIGIN = 'http://localhost:5173';

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

    test('blocks POST /api/v1/follows/users/:userId without csrf token', async () => {
      const res = await request(createApp())
        .post('/api/v1/follows/users/target-1')
        .set('Authorization', bearer());
      expect(res.statusCode).toBe(403);
    });

    test('blocks DELETE /api/v1/follows/users/:userId without csrf token', async () => {
      const res = await request(createApp())
        .delete('/api/v1/follows/users/target-1')
        .set('Authorization', bearer());
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/follows/users/:userId', () => {
    test('201 and returns follow state on success', async () => {
      followsService.followUser.mockResolvedValue({
        targetUserId: 'target-1',
        isFollowing: true,
      });

      const res = await request(createApp())
        .post('/api/v1/follows/users/target-1')
        .set('Authorization', bearer('follower-1'))
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(201);
      expect(res.body.follow).toEqual({ targetUserId: 'target-1', isFollowing: true });
      expect(followsService.followUser).toHaveBeenCalledWith('follower-1', 'target-1');
    });

    test('400 when following yourself', async () => {
      followsService.followUser.mockRejectedValue(new ApiError(400, 'You cannot follow yourself'));

      const res = await request(createApp())
        .post('/api/v1/follows/users/follower-1')
        .set('Authorization', bearer('follower-1'))
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(400);
    });

    test('404 when target user does not exist', async () => {
      followsService.followUser.mockRejectedValue(new ApiError(404, 'User not found'));

      const res = await request(createApp())
        .post('/api/v1/follows/users/missing')
        .set('Authorization', bearer())
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/follows/users/:userId', () => {
    test('200 and returns unfollowed state (idempotent)', async () => {
      followsService.unfollowUser.mockResolvedValue({
        targetUserId: 'target-1',
        isFollowing: false,
      });

      const res = await request(createApp())
        .delete('/api/v1/follows/users/target-1')
        .set('Authorization', bearer('follower-1'))
        .set('Origin', CSRF_ORIGIN);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ targetUserId: 'target-1', isFollowing: false });
      expect(followsService.unfollowUser).toHaveBeenCalledWith('follower-1', 'target-1');
    });
  });

  describe('GET /api/v1/follows/following', () => {
    test('200 with hydrated following list + nextCursor', async () => {
      followsService.listFollowing.mockResolvedValue({
        following: [
          {
            userId: 'target-1',
            name: 'Jamie Rivera',
            avatarUrl: null,
            hasPublicProfile: true,
            profileHref: '/players/target-1',
          },
        ],
        nextCursor: null,
      });

      const res = await request(createApp())
        .get('/api/v1/follows/following')
        .set('Authorization', bearer('follower-1'));

      expect(res.statusCode).toBe(200);
      expect(res.body.following).toHaveLength(1);
      expect(res.body.following[0]).toMatchObject({
        userId: 'target-1',
        hasPublicProfile: true,
        profileHref: '/players/target-1',
      });
      expect(res.body.nextCursor).toBeNull();
    });

    test('passes limit/cursor through to the service', async () => {
      followsService.listFollowing.mockResolvedValue({ following: [], nextCursor: null });

      await request(createApp())
        .get('/api/v1/follows/following?limit=5')
        .set('Authorization', bearer('follower-1'));

      expect(followsService.listFollowing).toHaveBeenCalledWith(
        'follower-1',
        expect.objectContaining({ limit: 5 })
      );
    });
  });

  describe('GET /api/v1/follows/status', () => {
    test('200 with a per-id status map', async () => {
      followsService.getFollowStatuses.mockResolvedValue({
        statuses: { aaaaaaaaaaaaaaaaaaaaaaaa: true, bbbbbbbbbbbbbbbbbbbbbbbb: false },
      });

      const res = await request(createApp())
        .get('/api/v1/follows/status?userIds=aaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbb')
        .set('Authorization', bearer('follower-1'));

      expect(res.statusCode).toBe(200);
      expect(res.body.statuses).toEqual({
        aaaaaaaaaaaaaaaaaaaaaaaa: true,
        bbbbbbbbbbbbbbbbbbbbbbbb: false,
      });
    });

    test('400 on a malformed id in the list', async () => {
      const res = await request(createApp())
        .get('/api/v1/follows/status?userIds=not-an-id')
        .set('Authorization', bearer('follower-1'));

      expect(res.statusCode).toBe(400);
    });
  });
});
