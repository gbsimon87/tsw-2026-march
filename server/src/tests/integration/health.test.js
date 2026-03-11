const request = require('supertest');
const { createApp } = require('../../app');

describe('GET /api/v1/health', () => {
  test('responds with ok status', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
