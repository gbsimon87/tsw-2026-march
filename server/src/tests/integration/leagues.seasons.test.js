const request = require('supertest');

jest.mock('../../modules/leagues/leagues.service', () => ({
  createSeasonForLeague: jest.fn(),
  listSeasonsForLeague: jest.fn(),
  completeSeasonForUser: jest.fn(),
  listPublicSeasonsForLeague: jest.fn(),
  getLeagueForUser: jest.fn(),
  getPublicLeagueBySlug: jest.fn(),
}));

jest.mock('../../modules/games/games.service', () => ({
  createGameForUser: jest.fn(),
}));

const leaguesService = require('../../modules/leagues/leagues.service');
const gamesService = require('../../modules/games/games.service');
const { ApiError } = require('../../utils/apiError');
const { createApp } = require('../../app');
const { signAccessToken } = require('../../services/token.service');

const CSRF_ORIGIN = 'http://localhost:5173';

function authedRequest(app, method, path, userId = 'owner-1') {
  return request(app)
    [method](path)
    .set('Authorization', `Bearer ${signAccessToken({ sub: userId, sid: 'session-1' })}`)
    .set('Origin', CSRF_ORIGIN);
}

describe('POST /api/v1/leagues/:leagueId/seasons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires auth', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/leagues/league-1/seasons')
      .set('Origin', CSRF_ORIGIN)
      .send({ label: 'Spring 2026' });

    expect(res.statusCode).toBe(401);
    expect(leaguesService.createSeasonForLeague).not.toHaveBeenCalled();
  });

  test('validates the request body (label required)', async () => {
    const app = createApp();
    const res = await authedRequest(app, 'post', '/api/v1/leagues/league-1/seasons').send({});

    expect(res.statusCode).toBe(400);
    expect(leaguesService.createSeasonForLeague).not.toHaveBeenCalled();
  });

  test('201 + created season on success, forwarding userId/leagueId/payload to the service', async () => {
    leaguesService.createSeasonForLeague.mockResolvedValue({
      id: 'season-1',
      leagueId: 'league-1',
      label: 'Spring 2026',
      status: 'active',
      startedAt: '2026-07-10T00:00:00.000Z',
      completedAt: null,
    });

    const app = createApp();
    const res = await authedRequest(app, 'post', '/api/v1/leagues/league-1/seasons').send({
      label: 'Spring 2026',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.season).toMatchObject({
      id: 'season-1',
      label: 'Spring 2026',
      status: 'active',
    });
    expect(leaguesService.createSeasonForLeague).toHaveBeenCalledWith('owner-1', 'league-1', {
      label: 'Spring 2026',
    });
  });

  test('404 when a non-owner attempts to create a season (owner-only convention)', async () => {
    leaguesService.createSeasonForLeague.mockRejectedValue(new ApiError(404, 'League not found'));

    const app = createApp();
    const res = await authedRequest(
      app,
      'post',
      '/api/v1/leagues/league-1/seasons',
      'stranger-1'
    ).send({
      label: 'Spring 2026',
    });

    expect(res.statusCode).toBe(404);
  });

  test('402 when the league has no active League Pro subscription', async () => {
    leaguesService.createSeasonForLeague.mockRejectedValue(
      new ApiError(402, 'An active League subscription is required to start a new season')
    );

    const app = createApp();
    const res = await authedRequest(app, 'post', '/api/v1/leagues/league-1/seasons').send({
      label: 'Spring 2026',
    });

    expect(res.statusCode).toBe(402);
  });

  test('400 when a season is already active', async () => {
    leaguesService.createSeasonForLeague.mockRejectedValue(
      new ApiError(400, 'Complete the current season before starting a new one')
    );

    const app = createApp();
    const res = await authedRequest(app, 'post', '/api/v1/leagues/league-1/seasons').send({
      label: 'Spring 2026',
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/leagues/:leagueId/seasons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires auth', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/leagues/league-1/seasons');

    expect(res.statusCode).toBe(401);
  });

  test('200 + seasons list for any league participant', async () => {
    leaguesService.listSeasonsForLeague.mockResolvedValue([
      { id: 'season-1', label: 'Spring 2026', status: 'completed' },
      { id: 'season-2', label: 'Fall 2026', status: 'active' },
    ]);

    const app = createApp();
    const res = await authedRequest(app, 'get', '/api/v1/leagues/league-1/seasons', 'player-1');

    expect(res.statusCode).toBe(200);
    expect(res.body.seasons).toHaveLength(2);
    expect(leaguesService.listSeasonsForLeague).toHaveBeenCalledWith('player-1', 'league-1');
  });

  test('403 for a non-participant', async () => {
    leaguesService.listSeasonsForLeague.mockRejectedValue(new ApiError(403, 'Forbidden'));

    const app = createApp();
    const res = await authedRequest(app, 'get', '/api/v1/leagues/league-1/seasons', 'stranger-1');

    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/v1/leagues/:leagueId/seasons/:seasonId/complete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires auth', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/leagues/league-1/seasons/season-1/complete')
      .set('Origin', CSRF_ORIGIN);

    expect(res.statusCode).toBe(401);
  });

  test('200 + completed season on success', async () => {
    leaguesService.completeSeasonForUser.mockResolvedValue({
      id: 'season-1',
      leagueId: 'league-1',
      label: 'Spring 2026',
      status: 'completed',
      completedAt: '2026-07-10T00:00:00.000Z',
    });

    const app = createApp();
    const res = await authedRequest(
      app,
      'post',
      '/api/v1/leagues/league-1/seasons/season-1/complete'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.season).toMatchObject({ id: 'season-1', status: 'completed' });
    expect(leaguesService.completeSeasonForUser).toHaveBeenCalledWith(
      'owner-1',
      'league-1',
      'season-1'
    );
  });

  test('404 when a non-owner attempts to complete a season', async () => {
    leaguesService.completeSeasonForUser.mockRejectedValue(new ApiError(404, 'League not found'));

    const app = createApp();
    const res = await authedRequest(
      app,
      'post',
      '/api/v1/leagues/league-1/seasons/season-1/complete',
      'stranger-1'
    );

    expect(res.statusCode).toBe(404);
  });

  test('404 when the season does not belong to the league', async () => {
    leaguesService.completeSeasonForUser.mockRejectedValue(new ApiError(404, 'Season not found'));

    const app = createApp();
    const res = await authedRequest(
      app,
      'post',
      '/api/v1/leagues/league-1/seasons/season-not-in-league/complete'
    );

    expect(res.statusCode).toBe(404);
  });

  test('400 when the season is already completed', async () => {
    leaguesService.completeSeasonForUser.mockRejectedValue(
      new ApiError(400, 'Season is already completed')
    );

    const app = createApp();
    const res = await authedRequest(
      app,
      'post',
      '/api/v1/leagues/league-1/seasons/season-1/complete'
    );

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/public/leagues/:leagueSlug/seasons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('allows unauthenticated access and returns the seasons list', async () => {
    leaguesService.listPublicSeasonsForLeague.mockResolvedValue([
      { id: 'season-1', label: 'Spring 2026', status: 'completed' },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/public/leagues/test-league/seasons');

    expect(res.statusCode).toBe(200);
    expect(res.body.seasons).toHaveLength(1);
    expect(leaguesService.listPublicSeasonsForLeague).toHaveBeenCalledWith('test-league', null);
  });

  test('404 for a league slug that does not exist / is not visible', async () => {
    leaguesService.listPublicSeasonsForLeague.mockRejectedValue(
      new ApiError(404, 'League not found')
    );

    const app = createApp();
    const res = await request(app).get('/api/v1/public/leagues/missing-league/seasons');

    expect(res.statusCode).toBe(404);
  });
});

describe('season scoping on games/standings endpoints (?seasonId=)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /leagues/:leagueId/standings forwards ?seasonId= through to the service', async () => {
    leaguesService.getLeagueForUser.mockResolvedValue({
      standings: [{ teamId: 'team-a', wins: 3 }],
    });

    const app = createApp();
    const res = await authedRequest(
      app,
      'get',
      '/api/v1/leagues/league-1/standings?seasonId=season-old'
    );

    expect(res.statusCode).toBe(200);
    expect(leaguesService.getLeagueForUser).toHaveBeenCalledWith(
      'owner-1',
      'league-1',
      'season-old'
    );
  });

  test('GET /leagues/:leagueId/standings defaults to the current season when seasonId is omitted', async () => {
    leaguesService.getLeagueForUser.mockResolvedValue({ standings: [] });

    const app = createApp();
    await authedRequest(app, 'get', '/api/v1/leagues/league-1/standings');

    expect(leaguesService.getLeagueForUser).toHaveBeenCalledWith('owner-1', 'league-1', undefined);
  });

  test('GET /leagues/:leagueId/games forwards ?seasonId= through to the service', async () => {
    leaguesService.getLeagueForUser.mockResolvedValue({ games: [{ id: 'game-1' }] });

    const app = createApp();
    const res = await authedRequest(
      app,
      'get',
      '/api/v1/leagues/league-1/games?seasonId=season-new'
    );

    expect(res.statusCode).toBe(200);
    expect(leaguesService.getLeagueForUser).toHaveBeenCalledWith(
      'owner-1',
      'league-1',
      'season-new'
    );
  });

  test('creating a league game after the season is completed is rejected with 400', async () => {
    gamesService.createGameForUser.mockRejectedValue(new ApiError(400, 'Season is completed'));

    const app = createApp();
    const res = await authedRequest(app, 'post', '/api/v1/games').send({
      gameContext: 'league',
      leagueId: 'league-1',
      homeLeagueTeamId: 'team-a',
      awayLeagueTeamId: 'team-b',
      trackedLeagueTeamId: 'team-a',
    });

    expect(res.statusCode).toBe(400);
  });

  test('creating a league game with no active season is rejected with 400', async () => {
    gamesService.createGameForUser.mockRejectedValue(
      new ApiError(400, 'League has no active season')
    );

    const app = createApp();
    const res = await authedRequest(app, 'post', '/api/v1/games').send({
      gameContext: 'league',
      leagueId: 'league-1',
      homeLeagueTeamId: 'team-a',
      awayLeagueTeamId: 'team-b',
      trackedLeagueTeamId: 'team-a',
    });

    expect(res.statusCode).toBe(400);
  });

  test('creating a league game while the season is active succeeds and echoes the created game', async () => {
    gamesService.createGameForUser.mockResolvedValue({
      id: 'game-1',
      leagueId: 'league-1',
      seasonId: 'season-new',
      homeLeagueTeamId: 'team-a',
      awayLeagueTeamId: 'team-b',
      status: 'in_progress',
    });

    const app = createApp();
    const res = await authedRequest(app, 'post', '/api/v1/games').send({
      gameContext: 'league',
      leagueId: 'league-1',
      homeLeagueTeamId: 'team-a',
      awayLeagueTeamId: 'team-b',
      trackedLeagueTeamId: 'team-a',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.game).toMatchObject({ id: 'game-1', seasonId: 'season-new' });
  });
});
