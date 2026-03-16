const request = require('supertest');

jest.mock('../../modules/feed/feed.service', () => ({
  listFeedPosts: jest.fn(),
  createImagePostForUser: jest.fn(),
  createGameCardPostForUser: jest.fn(),
  createPlayerCardPostForUser: jest.fn(),
  createTeamCardPostForUser: jest.fn(),
  deletePostForUser: jest.fn(),
  listShareableGames: jest.fn(),
  listShareablePlayers: jest.fn(),
  listShareableTeams: jest.fn(),
}));

const feedService = require('../../modules/feed/feed.service');
const { createApp } = require('../../app');

describe('feed routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('allows unauthenticated access to GET /api/v1/feed', async () => {
    feedService.listFeedPosts.mockResolvedValue({ posts: [], nextCursor: null });

    const app = createApp();
    const response = await request(app).get('/api/v1/feed');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ posts: [], nextCursor: null });
  });

  test('requires auth for POST /api/v1/feed/game-card', async () => {
    const app = createApp();
    const response = await request(app).post('/api/v1/feed/game-card').send({ gameId: 'g1' });

    expect(response.statusCode).toBe(403);
  });

  test('allows unauthenticated access to shareable lists', async () => {
    feedService.listShareableTeams.mockResolvedValue([{ id: 't1', name: 'TSW Blue' }]);

    const app = createApp();
    const response = await request(app).get('/api/v1/feed/shareable/teams');

    expect(response.statusCode).toBe(200);
    expect(response.body.teams).toEqual([{ id: 't1', name: 'TSW Blue' }]);
  });

  test('requires auth for DELETE /api/v1/feed/:postId', async () => {
    const app = createApp();
    const response = await request(app).delete('/api/v1/feed/post-1');

    expect(response.statusCode).toBe(403);
  });
});
