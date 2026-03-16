const request = require('supertest');
jest.mock('../../modules/teams/teams.service', () => ({
  getPublicTeam: jest.fn(),
  getPublicPlayer: jest.fn(),
  getPublicOpponentBySlug: jest.fn(),
  listPublicExploreGames: jest.fn(),
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

  test('allows unauthenticated access to GET /api/v1/public/teams/explore', async () => {
    teamsService.listPublicExploreGames.mockResolvedValue([
      {
        id: 'g1',
        title: 'vs Falcons',
        opponent: 'Falcons',
        teamPoints: 72,
        team: { id: 'team-1', name: 'TSW Blue' },
      },
    ]);

    const app = createApp();
    const response = await request(app).get('/api/v1/public/teams/explore');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      games: [
        {
          id: 'g1',
          title: 'vs Falcons',
          opponent: 'Falcons',
          teamPoints: 72,
          team: { id: 'team-1', name: 'TSW Blue' },
        },
      ],
    });
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

  test('allows unauthenticated access to GET /api/v1/public/teams/:teamId/players/:playerId', async () => {
    teamsService.getPublicPlayer.mockResolvedValue({
      team: { id: 'team-1', name: 'TSW Blue' },
      player: { id: 'player-1', displayName: 'Alex Carter', jerseyNumber: 12 },
      summary: {
        gamesCount: 2,
        points: 24,
        reb: 10,
        ast: 8,
        pointsPerGame: 12,
        reboundsPerGame: 5,
        assistsPerGame: 4,
      },
      games: [
        {
          gameId: 'g1',
          opponent: 'Falcons',
          opponentDestination: {
            kind: 'opponent_placeholder',
            href: '/opponents/falcons',
            label: 'Falcons',
            teamId: null,
            opponentSlug: 'falcons',
          },
          title: 'vs Falcons',
          date: '2026-03-10T00:00:00.000Z',
          scheduledAt: '2026-03-10T00:00:00.000Z',
          completedAt: '2026-03-10T02:00:00.000Z',
          createdAt: '2026-03-10T00:00:00.000Z',
          stats: {
            ftm: 4,
            fta: 6,
            fg2m: 5,
            fg2a: 7,
            fg3m: 0,
            fg3a: 2,
            ast: 4,
            oreb: 2,
            dreb: 3,
            reb: 5,
            points: 14,
          },
        },
      ],
    });

    const app = createApp();
    const response = await request(app).get(
      '/api/v1/public/teams/507f191e810c19729de860ea/players/507f1f77bcf86cd799439011'
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.player).toEqual({
      id: 'player-1',
      displayName: 'Alex Carter',
      jerseyNumber: 12,
    });
    expect(response.body.summary.assistsPerGame).toBe(4);
    expect(response.body.games[0].stats.ast).toBe(4);
    expect(response.body.games[0].opponentDestination).toEqual({
      kind: 'opponent_placeholder',
      href: '/opponents/falcons',
      label: 'Falcons',
      teamId: null,
      opponentSlug: 'falcons',
    });
  });

  test('allows unauthenticated access to GET /api/v1/public/opponents/:opponentSlug', async () => {
    teamsService.getPublicOpponentBySlug.mockResolvedValue({
      opponent: { slug: 'falcons', displayName: 'Falcons', matchedTeam: null },
      summary: { gamesCount: 1, latestGameAt: '2026-03-10T00:00:00.000Z' },
      relatedGames: [
        {
          id: 'g1',
          title: 'vs Falcons',
          opponent: 'Falcons',
          scheduledAt: '2026-03-10T00:00:00.000Z',
          completedAt: '2026-03-10T02:00:00.000Z',
          createdAt: '2026-03-10T00:00:00.000Z',
          teamPoints: 72,
          team: { id: 'team-1', name: 'TSW Blue' },
        },
      ],
    });

    const app = createApp();
    const response = await request(app).get('/api/v1/public/opponents/falcons');

    expect(response.statusCode).toBe(200);
    expect(response.body.opponent).toEqual({
      slug: 'falcons',
      displayName: 'Falcons',
      matchedTeam: null,
    });
    expect(response.body.relatedGames[0].team).toEqual({ id: 'team-1', name: 'TSW Blue' });
  });

  test('returns 404 for unknown public opponent slug', async () => {
    teamsService.getPublicOpponentBySlug.mockRejectedValueOnce(
      new ApiError(404, 'Opponent not found')
    );

    const app = createApp();
    const response = await request(app).get('/api/v1/public/opponents/missing-team');

    expect(response.statusCode).toBe(404);
  });

  test('keeps GET /api/v1/teams/:teamId protected without auth', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/teams/team-123');

    expect(response.statusCode).toBe(401);
  });
});
