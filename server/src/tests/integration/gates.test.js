const request = require('supertest');

jest.mock('../../middleware/rateLimit.middleware', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    apiRateLimiter: passThrough,
    authRecoveryLimiter: passThrough,
    contactLimiter: passThrough,
    checkoutLimiter: passThrough,
  };
});

jest.mock('../../modules/games/games.service', () => ({
  createGameForUser: jest.fn(),
  listGamesForUser: jest.fn(),
  getGameForUser: jest.fn(),
  appendEventForUser: jest.fn(),
  updateEventForUser: jest.fn(),
  deleteGameForUser: jest.fn(),
  setLineupForUser: jest.fn(),
  setGameLineup: jest.fn(),
  finishGameForUser: jest.fn(),
  getPublicGame: jest.fn(),
  getGameSummary: jest.fn(),
}));

jest.mock('../../modules/feed/feed.service', () => ({
  listFeedPosts: jest.fn(),
  createImagePostForUser: jest.fn(),
  createVideoPostForUser: jest.fn(),
  createGameCardPostForUser: jest.fn(),
  createPlayerCardPostForUser: jest.fn(),
  createTeamCardPostForUser: jest.fn(),
  createHighlightClipPostForUser: jest.fn(),
  deletePostForUser: jest.fn(),
  listShareableGames: jest.fn(),
  listShareablePlayers: jest.fn(),
  listShareableTeams: jest.fn(),
}));

jest.mock('../../modules/billing/billing.service', () => ({
  isTeamActive: jest.fn(),
  assertFeedPostingAllowed: jest.fn(),
  getTeamEntitlements: jest.fn(() => ({ canViewReplay: false })),
  getBillingSummary: jest.fn(() => ({ plan: 'free' })),
  assertTeamCreationAllowed: jest.fn(),
}));

const gamesService = require('../../modules/games/games.service');
const feedService = require('../../modules/feed/feed.service');
const billingService = require('../../modules/billing/billing.service');
const { createApp } = require('../../app');
const { ApiError } = require('../../utils/apiError');
const { signAccessToken } = require('../../services/token.service');

const CSRF_ORIGIN = 'http://localhost:5173';

function authedPost(app, path, userId = 'user-1') {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${signAccessToken({ sub: userId, sid: 's1' })}`)
    .set('Origin', CSRF_ORIGIN);
}

describe('game tracking gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('14.1 POST /games/:gameId/events returns 402 for free (unsubscribed) team', async () => {
    gamesService.appendEventForUser.mockRejectedValue(
      new ApiError(402, 'An active Team subscription is required to track stats')
    );

    const app = createApp();
    // OPP_FG2_MADE is a valid opponent aggregate event that passes the union schema
    const res = await authedPost(app, '/api/v1/games/game-1/events').send({
      statType: 'OPP_FG2_MADE',
    });

    expect(res.statusCode).toBe(402);
  });

  test('14.2 POST /games/:gameId/lineup returns 402 for free team', async () => {
    gamesService.setGameLineup.mockRejectedValue(
      new ApiError(402, 'An active Team subscription is required to track stats')
    );

    const app = createApp();
    // setLineupSchema requires exactly 5 playerIds
    const res = await authedPost(app, '/api/v1/games/game-1/lineup').send({
      playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    });

    expect(res.statusCode).toBe(402);
  });

  test('14.3 POST /games/:gameId/finish returns 402 for free team', async () => {
    gamesService.finishGameForUser.mockRejectedValue(
      new ApiError(402, 'An active Team subscription is required to track stats')
    );

    const app = createApp();
    const res = await authedPost(app, '/api/v1/games/game-1/finish').send({});

    expect(res.statusCode).toBe(402);
  });

  test('14.4 GET /api/v1/public/teams/:teamId returns 200 for free team (public reads always open)', async () => {
    // Public routes don't go through billing gate — just verify route is accessible
    const res = await request(createApp()).get('/api/v1/public/teams/team-1');
    // Will 404 since no DB, but not 402 or 403
    expect([200, 404]).toContain(res.statusCode);
  });
});

describe('feed affiliation gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('14.5 POST /feed/image returns 403 for user with no team/league affiliation', async () => {
    billingService.assertFeedPostingAllowed.mockRejectedValue(
      new ApiError(403, 'You must be part of a team or league to post')
    );

    const app = createApp();
    const res = await authedPost(app, '/api/v1/feed/image').send({});

    expect(res.statusCode).toBe(403);
    expect(billingService.assertFeedPostingAllowed).toHaveBeenCalledWith('user-1');
  });

  test('14.6 POST /feed/image returns 201 for team owner (affiliation check passes)', async () => {
    billingService.assertFeedPostingAllowed.mockResolvedValue(undefined);
    feedService.createImagePostForUser.mockResolvedValue({ id: 'post-1', type: 'image' });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/feed/image')
      .set('Authorization', `Bearer ${signAccessToken({ sub: 'owner-1', sid: 's1' })}`)
      .set('Origin', CSRF_ORIGIN)
      .send({});

    expect(res.statusCode).toBe(201);
    expect(billingService.assertFeedPostingAllowed).toHaveBeenCalledWith('owner-1');
  });

  test('14.7 POST /feed/game-card returns 201 for league team member (affiliation check passes)', async () => {
    billingService.assertFeedPostingAllowed.mockResolvedValue(undefined);
    feedService.createGameCardPostForUser.mockResolvedValue({ id: 'post-2', type: 'game_card' });

    const app = createApp();
    const res = await authedPost(app, '/api/v1/feed/game-card').send({ gameId: 'game-1' });

    expect(res.statusCode).toBe(201);
    expect(billingService.assertFeedPostingAllowed).toHaveBeenCalledWith('user-1');
  });

  test('14.8 POST /feed/image returns 403 after affiliation check fails (user removed from team)', async () => {
    billingService.assertFeedPostingAllowed.mockRejectedValue(
      new ApiError(403, 'You must be part of a team or league to post')
    );

    const app = createApp();
    const res = await authedPost(app, '/api/v1/feed/image').send({});

    expect(res.statusCode).toBe(403);
    expect(feedService.createImagePostForUser).not.toHaveBeenCalled();
  });

  test('assertFeedPostingAllowed is called before any upload processing', async () => {
    billingService.assertFeedPostingAllowed.mockRejectedValue(
      new ApiError(403, 'You must be part of a team or league to post')
    );

    const app = createApp();
    await authedPost(app, '/api/v1/feed/video').send({});

    // Service should never be reached if gate rejects
    expect(feedService.createVideoPostForUser).not.toHaveBeenCalled();
  });

  test('all post creation endpoints check affiliation', async () => {
    billingService.assertFeedPostingAllowed.mockRejectedValue(
      new ApiError(403, 'You must be part of a team or league to post')
    );

    const app = createApp();
    const endpoints = [
      '/api/v1/feed/game-card',
      '/api/v1/feed/player-card',
      '/api/v1/feed/team-card',
      '/api/v1/feed/highlight-clip',
    ];

    for (const endpoint of endpoints) {
      const res = await authedPost(app, endpoint).send({});
      expect(res.statusCode).toBe(403);
    }

    expect(billingService.assertFeedPostingAllowed).toHaveBeenCalledTimes(endpoints.length);
  });
});
