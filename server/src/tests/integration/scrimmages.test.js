const request = require('supertest');
jest.mock('../../modules/scrimmages/scrimmages.service', () => ({
  list: jest.fn(),
  detail: jest.fn(),
  join: jest.fn(),
  newGame: jest.fn(),
  playerProfile: jest.fn(),
  publishSession: jest.fn(),
  mergePlayers: jest.fn(),
}));
const service = require('../../modules/scrimmages/scrimmages.service');
const { createApp } = require('../../app');
const { signAccessToken } = require('../../services/token.service');
const id = 'a'.repeat(24),
  playerId = 'b'.repeat(24);
function authed(app, path) {
  return request(app)
    .post(path)
    .set('Origin', 'http://localhost:5173')
    .set('Authorization', `Bearer ${signAccessToken({ sub: 'user-1', sid: 'session-1' })}`);
}
beforeEach(() => jest.clearAllMocks());
test('public player profiles route season and week filters without requiring a claim', async () => {
  service.playerProfile.mockResolvedValue({
    player: { id: playerId, displayName: 'John' },
    plays: [],
  });
  const seasonId = 'c'.repeat(24),
    sessionId = 'd'.repeat(24);
  const response = await request(createApp()).get(
    `/api/v1/scrimmages/${id}/players/${playerId}?seasonId=${seasonId}&sessionId=${sessionId}`
  );
  expect(response.statusCode).toBe(200);
  expect(service.playerProfile).toHaveBeenCalledWith(id, playerId, undefined, {
    seasonId,
    sessionId,
  });
  expect(response.headers['cache-control']).toContain('no-store');
});
test('anonymous users cannot claim profiles', async () => {
  const response = await request(createApp())
    .post(`/api/v1/scrimmages/${id}/join`)
    .set('Origin', 'http://localhost:5173')
    .send({});
  expect(response.statusCode).toBe(401);
  expect(service.join).not.toHaveBeenCalled();
});
test('an unchecked terms box cannot reach the claim service', async () => {
  const response = await authed(createApp(), `/api/v1/scrimmages/${id}/join`).send({
    playerId,
    displayName: 'John',
    signedName: 'John',
    termsVersion: 'c'.repeat(64),
    accepted: false,
  });
  expect(response.statusCode).toBe(400);
  expect(service.join).not.toHaveBeenCalled();
});
test('a signed profile claim carries its authenticated user and terms version', async () => {
  service.join.mockResolvedValue({ status: 'pending' });
  const body = {
    playerId,
    displayName: 'John',
    signedName: 'John Smith',
    termsVersion: 'c'.repeat(64),
    accepted: true,
  };
  const response = await authed(createApp(), `/api/v1/scrimmages/${id}/join`).send(body);
  expect(response.statusCode).toBe(200);
  expect(response.body.status).toBe('pending');
  expect(service.join).toHaveBeenCalledWith(id, 'user-1', body);
});
test('empty rosters cannot reach the game creation service', async () => {
  const response = await authed(
    createApp(),
    `/api/v1/scrimmages/${id}/sessions/${playerId}/games`
  ).send({
    requestId: 'a1360c09-028f-4e36-8f5b-9d8e79f6fc6e',
    homeColor: 'red',
    awayColor: 'white',
    homePlayers: [],
    awayPlayers: [],
  });
  expect(response.statusCode).toBe(400);
  expect(service.newGame).not.toHaveBeenCalled();
});
test('a game can be created with fewer than five players per side', async () => {
  service.newGame.mockResolvedValue({ game: { id: 'small-game' } });
  const response = await authed(
    createApp(),
    `/api/v1/scrimmages/${id}/sessions/${playerId}/games`
  ).send({
    requestId: 'a1360c09-028f-4e36-8f5b-9d8e79f6fc6e',
    homeColor: 'red',
    awayColor: 'white',
    homePlayers: [{ playerId: 'c'.repeat(24), jerseyNumber: null }],
    awayPlayers: [{ playerId: 'd'.repeat(24), jerseyNumber: null }],
  });
  expect(response.statusCode).toBe(201);
  expect(service.newGame).toHaveBeenCalled();
});

test('publication requires authentication and dispatches to the session publishing service', async () => {
  const app = createApp(),
    sessionId = 'c'.repeat(24);
  expect(
    (
      await request(app)
        .post(`/api/v1/scrimmages/${id}/sessions/${sessionId}/publish`)
        .set('Origin', 'http://localhost:5173')
    ).statusCode
  ).toBe(401);
  service.publishSession.mockResolvedValue({ session: { publishedAt: '2026-10-08T12:00:00Z' } });
  expect(
    (await authed(app, `/api/v1/scrimmages/${id}/sessions/${sessionId}/publish`).send({}))
      .statusCode
  ).toBe(200);
  expect(service.publishSession).toHaveBeenCalledWith(id, sessionId, 'user-1');
});
test('duplicate merging requires explicit acknowledgement and passes only validated identities', async () => {
  const app = createApp(),
    toPlayerId = 'd'.repeat(24);
  const route = `/api/v1/scrimmages/${id}/players/${playerId}/merge`;
  expect((await authed(app, route).send({ toPlayerId, confirmed: false })).statusCode).toBe(400);
  expect(service.mergePlayers).not.toHaveBeenCalled();
  service.mergePlayers.mockResolvedValue({ player: { id: toPlayerId } });
  expect((await authed(app, route).send({ toPlayerId, confirmed: true })).statusCode).toBe(200);
  expect(service.mergePlayers).toHaveBeenCalledWith(id, playerId, 'user-1', {
    toPlayerId,
    confirmed: true,
  });
});
