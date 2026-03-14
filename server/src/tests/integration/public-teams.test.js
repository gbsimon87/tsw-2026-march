const request = require('supertest');
jest.mock('../../modules/teams/teams.service', () => ({
  getPublicTeam: jest.fn(),
}));

const { ApiError } = require('../../utils/apiError');
const teamsService = require('../../modules/teams/teams.service');
const { createApp } = require('../../app');

describe('public teams routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('allows unauthenticated access to GET /api/v1/public/teams/:teamId', async () => {
    teamsService.getPublicTeam.mockRejectedValueOnce(new ApiError(404, 'Team not found'));

    const app = createApp();
    const response = await request(app).get('/api/v1/public/teams/not-a-valid-id');

    expect(response.statusCode).toBe(404);
  });

  test('returns the public team summary payload shape', async () => {
    teamsService.getPublicTeam.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Blue',
        players: [],
      },
      summary: {
        gamesCount: 2,
        points: 88,
        fg2: { made: 25, missed: 10, attempts: 35, percentage: 71.42857142857143 },
        fg3: { made: 8, missed: 7, attempts: 15, percentage: 53.333333333333336 },
        ft: { made: 14, missed: 4, attempts: 18, percentage: 77.77777777777779 },
      },
      games: [],
    });

    const app = createApp();
    const response = await request(app).get('/api/v1/public/teams/507f191e810c19729de860ea');

    expect(response.statusCode).toBe(200);
    expect(response.body.summary).toEqual({
      gamesCount: 2,
      points: 88,
      fg2: { made: 25, missed: 10, attempts: 35, percentage: 71.42857142857143 },
      fg3: { made: 8, missed: 7, attempts: 15, percentage: 53.333333333333336 },
      ft: { made: 14, missed: 4, attempts: 18, percentage: 77.77777777777779 },
    });
  });

  test('keeps GET /api/v1/teams/:teamId protected without auth', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/teams/team-123');

    expect(response.statusCode).toBe(401);
  });
});
