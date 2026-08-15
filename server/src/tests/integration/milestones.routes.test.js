const request = require('supertest');

jest.mock('../../modules/milestones/milestones.service', () => ({
  listMilestonesForLeaguePlayer: jest.fn(),
}));

const milestonesService = require('../../modules/milestones/milestones.service');
const { createApp } = require('../../app');

describe('milestone routes', () => {
  beforeEach(() => jest.clearAllMocks());

  test('allows unauthenticated reads', async () => {
    milestonesService.listMilestonesForLeaguePlayer.mockResolvedValue({
      milestones: [],
      nextCursor: null,
    });

    const app = createApp();
    const response = await request(app).get(
      '/api/v1/public/milestones/players/507f1f77bcf86cd799439011'
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ milestones: [], nextCursor: null });
  });

  test('rejects a limit above the maximum', async () => {
    const app = createApp();
    const response = await request(app).get(
      '/api/v1/public/milestones/players/507f1f77bcf86cd799439011?limit=500'
    );

    expect(response.statusCode).toBe(400);
  });

  test('passes the cursor through to the service', async () => {
    milestonesService.listMilestonesForLeaguePlayer.mockResolvedValue({
      milestones: [],
      nextCursor: null,
    });

    const app = createApp();
    await request(app).get(
      '/api/v1/public/milestones/players/507f1f77bcf86cd799439011?limit=10&cursor=507f1f77bcf86cd799439099'
    );

    expect(milestonesService.listMilestonesForLeaguePlayer).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      { limit: 10, cursor: '507f1f77bcf86cd799439099' }
    );
  });
});
