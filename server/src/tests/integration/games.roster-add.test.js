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
  let Team;

  beforeAll(async () => {
    await connectDb();

    // These models are all registered by requiring their owning repository
    // module; mongoose.model(name) then returns the already-compiled model.
    require('../../modules/auth/auth.repository');
    require('../../modules/leagues/leagues.repository');
    require('../../modules/games/games.repository');
    require('../../modules/teams/teams.repository');

    User = mongoose.model('User');
    League = mongoose.model('League');
    LeagueTeam = mongoose.model('LeagueTeam');
    LeaguePlayer = mongoose.model('LeaguePlayer');
    LeagueTeamMember = mongoose.model('LeagueTeamMember');
    Game = mongoose.model('Game');
    Team = mongoose.model('Team');
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
      plan: 'league',
      billingSource: 'comp',
      subscriptionStatus: 'active',
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

  async function createStandaloneDualFixture() {
    const owner = await createUser('team-owner');

    const homeTeam = await Team.create({
      ownerUserId: owner._id,
      name: 'Home Squad',
      capacityType: 'free',
    });
    const awayTeam = await Team.create({
      ownerUserId: owner._id,
      name: 'Away Squad',
      capacityType: 'paid',
      billingSource: 'comp',
    });

    const game = await Game.create({
      ownerUserId: owner._id,
      gameContext: 'standalone',
      trackingMode: 'dual_team',
      homeTeamId: homeTeam._id,
      awayTeamId: awayTeam._id,
      initialActiveSide: 'home',
      title: 'Home Squad vs Away Squad',
      status: 'in_progress',
    });

    return { owner, homeTeam, awayTeam, game };
  }

  afterEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      League.deleteMany({}),
      LeagueTeam.deleteMany({}),
      LeaguePlayer.deleteMany({}),
      LeagueTeamMember.deleteMany({}),
      Game.deleteMany({}),
      Team.deleteMany({}),
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

  test('rejects a signed-in user with no role in the league: 404, and makes no write', async () => {
    const { nonParticipant, homeTeam, game } = await createLeagueFixture();
    const app = createApp();

    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, nonParticipant._id).send({
      side: 'home',
      displayName: 'Uninvited Guest',
    });

    expect(res.statusCode).toBe(404);

    const leaguePlayer = await LeaguePlayer.findOne({
      leagueTeamId: homeTeam._id,
      displayName: 'Uninvited Guest',
    }).lean();
    expect(leaguePlayer).toBeNull();
  });

  test('returns 403 when a home-team manager tries to add a player to the away team', async () => {
    const { league, homeTeam, awayTeam, game } = await createLeagueFixture();
    const homeManager = await createUser('home-manager');
    await LeagueTeamMember.create({
      leagueId: league._id,
      leagueTeamId: homeTeam._id,
      userId: homeManager._id,
      role: 'manager',
      status: 'active',
      createdByUserId: league.ownerUserId,
    });
    const app = createApp();

    // Passes assertGameAccess (canManageLeagueGame accepts a manager of EITHER
    // side), then fails assertTeamManagerOrOwner for the away team specifically
    // — a home-team manager is not an active manager of the away team, the
    // league owner, or a league-wide manager.
    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, homeManager._id).send({
      side: 'away',
      displayName: 'Smuggled Onto Away Roster',
    });

    expect(res.statusCode).toBe(403);

    const leaguePlayer = await LeaguePlayer.findOne({
      leagueTeamId: awayTeam._id,
      displayName: 'Smuggled Onto Away Roster',
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

  test('owner adds a player to a standalone dual-team game: 201, correct standalone snapshot shape, away untouched', async () => {
    const { owner, homeTeam, awayTeam, game } = await createStandaloneDualFixture();
    const app = createApp();

    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, owner._id).send({
      side: 'home',
      displayName: 'Jordan Blake',
      jerseyNumber: 23,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.player.displayName).toBe('Jordan Blake');
    expect(res.body.side).toBe('home');

    const freshHomeTeam = await Team.findById(homeTeam._id).lean();
    const teamPlayer = (freshHomeTeam.players || []).find(
      (player) => player.displayName === 'Jordan Blake'
    );
    expect(teamPlayer).toBeDefined();
    expect(teamPlayer.jerseyNumber).toBe(23);

    const freshGame = await Game.findById(game._id).lean();
    const homeEntry = (freshGame.homeRosterSnapshot || []).find(
      (entry) => String(entry.sourcePlayerId) === String(teamPlayer._id)
    );
    expect(homeEntry).toBeDefined();
    expect(homeEntry.sourceType).toBe('team_player');
    expect(homeEntry.leaguePlayerId).toBeNull();
    expect(homeEntry.displayName).toBe('Jordan Blake');

    expect(freshGame.awayRosterSnapshot || []).toHaveLength(0);
    expect(String(freshGame.awayTeamId)).toBe(String(awayTeam._id));
  });

  test('a free Team cannot be used to bypass payment for another owned Team in a dual-team game', async () => {
    const { owner, awayTeam, game } = await createStandaloneDualFixture();
    awayTeam.billingSource = 'stripe';
    awayTeam.subscriptionStatus = 'inactive';
    await awayTeam.save();
    const app = createApp();

    const res = await authedPost(app, `/api/v1/games/${game._id}/roster`, owner._id).send({
      side: 'home',
      displayName: 'Blocked Player',
    });

    expect(res.statusCode).toBe(402);
    expect(await Team.findOne({ 'players.displayName': 'Blocked Player' })).toBeNull();
  });
});
