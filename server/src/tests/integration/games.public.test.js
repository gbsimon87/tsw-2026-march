const request = require('supertest');
const { createApp } = require('../../app');

describe('games public detail route', () => {
  test('allows unauthenticated access to GET /api/v1/games/:gameId', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/games/not-a-valid-id');

    expect(response.statusCode).toBe(404);
  });

  test('still blocks GET /api/v1/games list without auth', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/games');

    expect(response.statusCode).toBe(401);
  });
});
