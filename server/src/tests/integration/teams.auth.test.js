const request = require('supertest');
const { createApp } = require('../../app');

describe('teams routes auth/csrf', () => {
  test('blocks GET /api/v1/teams without auth', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/teams');

    expect(response.statusCode).toBe(401);
  });

  test('blocks POST /api/v1/teams without csrf token', async () => {
    const app = createApp();
    const response = await request(app).post('/api/v1/teams').send({ name: 'Varsity' });

    expect(response.statusCode).toBe(403);
  });

  test('blocks PATCH /api/v1/teams/:teamId without csrf token', async () => {
    const app = createApp();
    const response = await request(app).patch('/api/v1/teams/team-123').send({ name: 'Updated' });

    expect(response.statusCode).toBe(403);
  });
});
