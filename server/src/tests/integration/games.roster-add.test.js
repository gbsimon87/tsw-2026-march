const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../../app');
const { signAccessToken } = require('../../services/token.service');
const { connectDb, disconnectDb } = require('../../config/db');

// Unmocked integration test: exercises the real controller -> service ->
// repository path against a real Mongo connection (no jest.mock on games or
// leagues). This is deliberate — see PROJECT-KNOWLEDGE §1 v1.5: a missing
// export once 500'd every request while every mocked unit test still passed.
// Only an unmocked round trip can prove the two-write invariant below.

const CSRF_ORIGIN = 'http://localhost:5173';

function authedPost(app, path, userId) {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${signAccessToken({ sub: String(userId), sid: 'session-1' })}`)
    .set('Origin', CSRF_ORIGIN);
}

describe('POST /api/v1/games/:gameId/roster', () => {
  let User;
  let League;
  let LeagueTeam;
  let LeaguePlayer;
  let LeagueTeamMember;
  let Game;

  beforeAll(async () => {
    await connectDb();

    // These models are all registered by requiring their owning repository
    // module; mongoose.model(name) then returns the already-compiled model.
    require('../../modules/auth/auth.repository');
    require('../../modules/leagues/leagues.repository');
    require('../../modules/games/games.repository');

    User = mongoose.model('User');
    League = mongoose.model('League');
    LeagueTeam = mongoose.model('LeagueTeam');
    LeaguePlayer = mongoose.model('LeaguePlayer');
    LeagueTeamMember = mongoose.model('LeagueTeamMember');
    Game = mongoose.model('Game');
  });

  afterAll(async () => {
    await disconnectDb();
  });

  async function createUser(emailPrefix) {
    return User.create({
      email: `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      name: emailPrefix,
      passwordHash: 'not-used-in-this-test',
      authProvider: 'local',
    });
  }

  async function createLeagueFixture() {
    const owner = await createUser('owner');
    const nonParticipant = await createUser('outsider');

    const league = await League.create({
      ownerUserId: owner._id,
      name: 'Test League',
      slug: `test-league-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    const homeTeam = await LeagueTeam.create({
      leagueId: league._id,
      name: 'Home Team',
      slug: `home-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    const awayTeam = await LeagueTeam.create({
      leagueId: league._id,
      name: 'Away Team',
      slug: `away-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    const game = await Game.create({
      ownerUserId: owner._id,
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: league._id,
      homeLeagueTeamId: homeTeam._id,
      awayLeagueTeamId: awayTeam._id,
      initialActiveSide: 'home',
      title: 'Home Team vs Away Team',
      status: 'in_progress',
    });

    return { owner, nonParticipant, league, homeTeam, awayTeam, game };
  }

  afterEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      League.deleteMany({}),
      LeagueTeam.deleteMany({}),
      LeaguePlayer.deleteMany({}),
      LeagueTeamMember.deleteMany({}),
      Game.deleteMany({}),
    ]);
  });

  test('league owner adds a player mid-game: 201, and both writes land exactly once', async () => {
    const { owner, league, homeTeam, awayTeam, game } = await createLeagueFixture();
    const app = createApp();

    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, owner._id).send({
      side: 'home',
      displayName: 'Jordan Blake',
      jerseyNumber: 23,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.player.displayName).toBe('Jordan Blake');
    expect(res.body.side).toBe('home');

    // TWO-WRITE INVARIANT — verified directly against the DB, not through the
    // response. This is the assertion a mocked unit test cannot make.
    const leaguePlayer = await LeaguePlayer.findOne({
      leagueTeamId: homeTeam._id,
      displayName: 'Jordan Blake',
    }).lean();
    expect(leaguePlayer).not.toBeNull();
    expect(String(leaguePlayer.leagueId)).toBe(String(league._id));

    const freshGame = await Game.findById(game._id).lean();
    const homeEntry = (freshGame.homeRosterSnapshot || []).find(
      (entry) => String(entry.leaguePlayerId) === String(leaguePlayer._id)
    );
    expect(homeEntry).toBeDefined();
    expect(homeEntry.displayName).toBe('Jordan Blake');

    expect(freshGame.awayRosterSnapshot || []).toHaveLength(0);
    expect(String(freshGame.awayLeagueTeamId)).toBe(String(awayTeam._id));
  });

  test('rejects adding a player to a completed game with 409, and makes neither write', async () => {
    const { owner, homeTeam, game } = await createLeagueFixture();
    game.status = 'completed';
    await game.save();
    const app = createApp();

    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, owner._id).send({
      side: 'home',
      displayName: 'Late Arrival',
    });

    expect(res.statusCode).toBe(409);

    const leaguePlayer = await LeaguePlayer.findOne({
      leagueTeamId: homeTeam._id,
      displayName: 'Late Arrival',
    }).lean();
    expect(leaguePlayer).toBeNull();

    const freshGame = await Game.findById(game._id).lean();
    expect(freshGame.homeRosterSnapshot || []).toHaveLength(0);
  });

  test('rejects a signed-in user with no role in the league (404 or 403), and makes no write', async () => {
    const { nonParticipant, homeTeam, game } = await createLeagueFixture();
    const app = createApp();

    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, nonParticipant._id).send({
      side: 'home',
      displayName: 'Uninvited Guest',
    });

    expect([403, 404]).toContain(res.statusCode);

    const leaguePlayer = await LeaguePlayer.findOne({
      leagueTeamId: homeTeam._id,
      displayName: 'Uninvited Guest',
    }).lean();
    expect(leaguePlayer).toBeNull();
  });

  test('rejects a league helper (game-track access, no roster-edit rights): 403 or 404, no write', async () => {
    const { league, homeTeam, game } = await createLeagueFixture();
    const helper = await createUser('helper');
    await LeagueTeamMember.create({
      leagueId: league._id,
      leagueTeamId: homeTeam._id,
      userId: helper._id,
      role: 'helper',
      status: 'active',
      createdByUserId: league.ownerUserId,
    });
    const app = createApp();

    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, helper._id).send({
      side: 'home',
      displayName: 'Helper Added Player',
    });

    expect([403, 404]).toContain(res.statusCode);

    const leaguePlayer = await LeaguePlayer.findOne({
      leagueTeamId: homeTeam._id,
      displayName: 'Helper Added Player',
    }).lean();
    expect(leaguePlayer).toBeNull();
  });

  test('dual-team league game with no side in the body: 400, and makes no write', async () => {
    const { owner, homeTeam, game } = await createLeagueFixture();
    const app = createApp();

    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, owner._id).send({
      displayName: 'No Side Given',
    });

    expect(res.statusCode).toBe(400);

    const leaguePlayer = await LeaguePlayer.findOne({
      leagueTeamId: homeTeam._id,
      displayName: 'No Side Given',
    }).lean();
    expect(leaguePlayer).toBeNull();
  });
});
