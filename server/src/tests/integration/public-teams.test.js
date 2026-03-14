const request = require('supertest');
const { createApp } = require('../../app');

describe('public teams routes', () => {
  test('allows unauthenticated access to GET /api/v1/public/teams/:teamId', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/public/teams/not-a-valid-id');

    expect(response.statusCode).toBe(404);
  });

  test('keeps GET /api/v1/teams/:teamId protected without auth', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/teams/team-123');

    expect(response.statusCode).toBe(401);
  });
});
