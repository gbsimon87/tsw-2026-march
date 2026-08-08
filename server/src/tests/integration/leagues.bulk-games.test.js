const request = require('supertest');

jest.mock('../../modules/leagues/leagues.service', () => ({
  bulkCreateLeagueGamesForUser: jest.fn(),
  getLeagueForUser: jest.fn(),
  getPublicLeagueBySlug: jest.fn(),
}));

const leaguesService = require('../../modules/leagues/leagues.service');
const { ApiError } = require('../../utils/apiError');
const { createApp } = require('../../app');
const { signAccessToken } = require('../../services/token.service');

const CSRF_ORIGIN = 'http://localhost:5173';
const LEAGUE_ID = '507f1f77bcf86cd799439011';
const HOME_ID = '507f1f77bcf86cd799439031';
const AWAY_ID = '507f1f77bcf86cd799439032';

function authedPost(app, path, userId = 'owner-1') {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${signAccessToken({ sub: userId, sid: 'session-1' })}`)
    .set('Origin', CSRF_ORIGIN);
}

function validBody(overrides = {}) {
  return {
    games: [
      {
        homeLeagueTeamId: HOME_ID,
        awayLeagueTeamId: AWAY_ID,
        scheduledAt: '2026-09-05T10:00:00.000Z',
        venue: 'Court 1',
      },
    ],
    ...overrides,
  };
}

describe('POST /api/v1/leagues/:leagueId/games/bulk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    leaguesService.bulkCreateLeagueGamesForUser.mockResolvedValue({
      created: 1,
      replaced: 0,
      games: [
        {
          id: 'game-1',
          leagueId: LEAGUE_ID,
          homeLeagueTeamId: HOME_ID,
          awayLeagueTeamId: AWAY_ID,
          title: 'Bisons at Hawks',
          status: 'scheduled',
          scheduledAt: '2026-09-05T10:00:00.000Z',
          venue: 'Court 1',
        },
      ],
    });
  });

  test('requires auth', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/leagues/${LEAGUE_ID}/games/bulk`)
      .set('Origin', CSRF_ORIGIN)
      .send(validBody());

    expect(res.statusCode).toBe(401);
    expect(leaguesService.bulkCreateLeagueGamesForUser).not.toHaveBeenCalled();
  });

  test('201 + created games, forwarding userId/leagueId/payload to the service', async () => {
    const app = createApp();
    const res = await authedPost(app, `/api/v1/leagues/${LEAGUE_ID}/games/bulk`).send(validBody());

    expect(res.statusCode).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.replaced).toBe(0);
    expect(res.body.games[0].status).toBe('scheduled');
    expect(res.body.games[0].venue).toBe('Court 1');

    expect(leaguesService.bulkCreateLeagueGamesForUser).toHaveBeenCalledWith(
      'owner-1',
      LEAGUE_ID,
      expect.objectContaining({
        replaceExisting: false,
        games: [expect.objectContaining({ homeLeagueTeamId: HOME_ID, venue: 'Court 1' })],
      })
    );
  });

  test('forwards replaceExisting when set', async () => {
    const app = createApp();
    await authedPost(app, `/api/v1/leagues/${LEAGUE_ID}/games/bulk`).send(
      validBody({ replaceExisting: true })
    );

    expect(leaguesService.bulkCreateLeagueGamesForUser).toHaveBeenCalledWith(
      'owner-1',
      LEAGUE_ID,
      expect.objectContaining({ replaceExisting: true })
    );
  });

  test('validates the request body (empty games array)', async () => {
    const app = createApp();
    const res = await authedPost(app, `/api/v1/leagues/${LEAGUE_ID}/games/bulk`).send({
      games: [],
    });

    expect(res.statusCode).toBe(400);
    expect(leaguesService.bulkCreateLeagueGamesForUser).not.toHaveBeenCalled();
  });

  test('rejects a batch larger than 200 games', async () => {
    const app = createApp();
    const games = Array.from({ length: 201 }, () => ({
      homeLeagueTeamId: HOME_ID,
      awayLeagueTeamId: AWAY_ID,
      scheduledAt: '2026-09-05T10:00:00.000Z',
    }));

    const res = await authedPost(app, `/api/v1/leagues/${LEAGUE_ID}/games/bulk`).send({ games });

    expect(res.statusCode).toBe(400);
    expect(leaguesService.bulkCreateLeagueGamesForUser).not.toHaveBeenCalled();
  });

  test('rejects a team playing itself', async () => {
    const app = createApp();
    const res = await authedPost(app, `/api/v1/leagues/${LEAGUE_ID}/games/bulk`).send({
      games: [
        {
          homeLeagueTeamId: HOME_ID,
          awayLeagueTeamId: HOME_ID,
          scheduledAt: '2026-09-05T10:00:00.000Z',
        },
      ],
    });

    expect(res.statusCode).toBe(400);
    expect(leaguesService.bulkCreateLeagueGamesForUser).not.toHaveBeenCalled();
  });

  test('surfaces a service authorization failure as 403', async () => {
    leaguesService.bulkCreateLeagueGamesForUser.mockRejectedValue(new ApiError(403, 'Forbidden'));
    const app = createApp();

    const res = await authedPost(app, `/api/v1/leagues/${LEAGUE_ID}/games/bulk`).send(validBody());

    expect(res.statusCode).toBe(403);
  });

  test('surfaces the no-active-season failure as 400 with its message', async () => {
    leaguesService.bulkCreateLeagueGamesForUser.mockRejectedValue(
      new ApiError(400, 'League has no active season')
    );
    const app = createApp();

    const res = await authedPost(app, `/api/v1/leagues/${LEAGUE_ID}/games/bulk`).send(validBody());

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/no active season/i);
  });
});
