const request = require('supertest');
const { createApp } = require('../../app');
const gamesService = require('../../modules/games/games.service');
const { signAccessToken } = require('../../services/token.service');
const { ApiError } = require('../../utils/apiError');

// Exercise the real route, auth, validation and controller. Persistence behavior
// is covered separately by the atomic-substitution service tests.
describe('POST /api/v1/games/:gameId/substitutions', () => {
  const payload = {
    playerOutId: 'out',
    playerInId: 'in',
    teamSide: 'home',
    segmentKind: 'regulation',
    segmentNumber: 1,
    clockMillisecondsRemaining: 120000,
    videoTimestamp: 42,
  };
  let substitute;

  beforeEach(() => {
    substitute = jest.spyOn(gamesService, 'substituteForUser');
  });
  afterEach(() => jest.restoreAllMocks());

  function post(body = payload, authenticated = true) {
    const req = request(createApp())
      .post('/api/v1/games/game-1/substitutions')
      .set('Origin', 'http://localhost:5173');
    if (authenticated) {
      req.set('Authorization', `Bearer ${signAccessToken({ sub: 'user-1', sid: 'session-1' })}`);
    }
    return req.send(body);
  }

  test('requires authentication', async () => {
    expect((await post(payload, false)).statusCode).toBe(401);
    expect(substitute).not.toHaveBeenCalled();
  });

  test('rejects an incomplete pair before reaching the service', async () => {
    expect((await post({ ...payload, playerInId: undefined })).statusCode).toBe(400);
    expect(substitute).not.toHaveBeenCalled();
  });

  test('passes the authenticated pair and snapshot to the service', async () => {
    const result = {
      game: { id: 'game-1', events: [{ statType: 'SUB_OUT' }, { statType: 'SUB_IN' }] },
    };
    substitute.mockResolvedValue(result);
    const response = await post();
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(result);
    expect(substitute).toHaveBeenCalledWith('user-1', 'game-1', payload);
  });

  test('returns a version conflict without replaying the pair', async () => {
    substitute.mockRejectedValue(new ApiError(409, 'Game changed'));
    expect((await post()).statusCode).toBe(409);
    expect(substitute).toHaveBeenCalledTimes(1);
  });
});
