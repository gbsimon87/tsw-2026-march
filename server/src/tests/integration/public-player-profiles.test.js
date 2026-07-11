const request = require('supertest');

jest.mock('../../modules/leagues/leagues.service', () => ({
  getPublicUserProfiles: jest.fn(),
}));

const leaguesService = require('../../modules/leagues/leagues.service');
const { ApiError } = require('../../utils/apiError');
const { createApp } = require('../../app');

describe('GET /api/v1/public/players/:userId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('200 with profiles on success', async () => {
    leaguesService.getPublicUserProfiles.mockResolvedValue({
      user: { id: 'user-1', name: 'Jamie Rivera', avatarUrl: null },
      profiles: [
        {
          id: 'lp-1',
          displayName: 'Jamie Rivera',
          playerLabel: '#7 Jamie Rivera',
          jerseyNumber: 7,
          position: 'PG',
          memberRole: 'player',
          memberRoleLabel: 'Player',
          team: { name: 'Hawks' },
          league: { name: 'City League', isPublic: true },
          profileHref: '/league/city-league/teams/hawks/players/lp-1',
          summary: { gamesCount: 4, pointsPerGame: 10, reboundsPerGame: 5, assistsPerGame: 2 },
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/public/players/user-1');

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'user-1', name: 'Jamie Rivera' });
    expect(res.body.profiles).toHaveLength(1);
    expect(res.body.profiles[0].summary).toEqual({
      gamesCount: 4,
      pointsPerGame: 10,
      reboundsPerGame: 5,
      assistsPerGame: 2,
    });
    expect(leaguesService.getPublicUserProfiles).toHaveBeenCalledWith('user-1');
  });

  test('404 when the service throws not found', async () => {
    leaguesService.getPublicUserProfiles.mockRejectedValue(new ApiError(404, 'Player not found'));

    const app = createApp();
    const res = await request(app).get('/api/v1/public/players/user-404');

    expect(res.statusCode).toBe(404);
  });
});
