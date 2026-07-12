const request = require('supertest');

jest.mock('../../middleware/rateLimit.middleware', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    apiRateLimiter: passThrough,
    authRecoveryLimiter: passThrough,
    authCredentialLimiter: passThrough,
    contactLimiter: passThrough,
    checkoutLimiter: passThrough,
  };
});

// Keep the real module (deriveLeaguePlayerScores is pure and used by the export
// service) but stub the auth gates, getters, and profile assembly.
jest.mock('../../modules/leagues/leagues.service', () => {
  const actual = jest.requireActual('../../modules/leagues/leagues.service');
  return {
    ...actual,
    assertLeagueManagerOrOwner: jest.fn(),
    assertTeamManagerOrOwner: jest.fn(),
    assembleLeagueProfilesForUser: jest.fn(),
    getLeagueStandings: jest.fn(),
    getLeaguePlayerStats: jest.fn(),
    getLeagueSeasonGames: jest.fn(),
  };
});

const leaguesService = require('../../modules/leagues/leagues.service');
const { createApp } = require('../../app');
const { ApiError } = require('../../utils/apiError');
const { signAccessToken } = require('../../services/token.service');

const LEAGUE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TEAM_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const SEASON_ID = 'cccccccccccccccccccccccc';

function bearer(userId = 'user-1') {
  return `Bearer ${signAccessToken({ sub: userId, sid: 's1' })}`;
}

function statRow(overrides = {}) {
  return {
    leagueTeamId: TEAM_ID,
    leaguePlayerId: 'dddddddddddddddddddddddd',
    displayName: 'Alice',
    points: 20,
    reb: 10,
    ast: 6,
    stl: 3,
    blk: 1,
    tov: 2,
    foul: 1,
    fg2m: 4,
    fg2a: 8,
    fg3m: 2,
    fg3a: 5,
    gamesCount: 2,
    ...overrides,
  };
}

describe('export routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('auth', () => {
    test('401 on my-sporty without auth', async () => {
      const res = await request(createApp()).get('/api/v1/export/my-sporty');
      expect(res.statusCode).toBe(401);
    });

    test('401 on league export without auth', async () => {
      const res = await request(createApp()).get(
        `/api/v1/export/leagues/${LEAGUE_ID}/season/${SEASON_ID}`
      );
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /export/my-sporty', () => {
    test('200 text/csv attachment with a row per profile', async () => {
      leaguesService.assembleLeagueProfilesForUser.mockResolvedValue([
        {
          league: { name: 'City League' },
          team: { name: 'Hawks' },
          memberRoleLabel: 'Player',
          jerseyNumber: 7,
          position: 'PG',
          summary: {
            gamesCount: 4,
            pointsPerGame: 10.25,
            reboundsPerGame: 5,
            assistsPerGame: 2,
          },
        },
      ]);

      const res = await request(createApp())
        .get('/api/v1/export/my-sporty')
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.headers['content-disposition']).toMatch(/mysporty-stats-/);
      expect(res.text).toContain('My Player Profiles');
      expect(res.text).toContain('City League');
      expect(res.text).toContain('Hawks');
      expect(res.text).toContain('10.3'); // ppg rounded to one decimal
    });

    test('200 with just a header row when the user has no profiles', async () => {
      leaguesService.assembleLeagueProfilesForUser.mockResolvedValue([]);

      const res = await request(createApp())
        .get('/api/v1/export/my-sporty')
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('My Player Profiles');
      expect(res.text).toContain('League,Team,Role');
    });
  });

  describe('GET /export/leagues/:leagueId/season/:seasonId', () => {
    beforeEach(() => {
      leaguesService.assertLeagueManagerOrOwner.mockResolvedValue({
        league: { name: 'City League' },
        role: 'owner',
      });
      leaguesService.getLeagueStandings.mockResolvedValue([
        {
          teamId: TEAM_ID,
          teamName: 'Hawks',
          gamesPlayed: 2,
          wins: 2,
          losses: 0,
          record: '2-0',
          winPct: 1,
          pointsFor: 100,
          pointsAgainst: 80,
          pointDiff: 20,
        },
      ]);
      leaguesService.getLeaguePlayerStats.mockResolvedValue([statRow()]);
      leaguesService.getLeagueSeasonGames.mockResolvedValue({
        teams: [
          { _id: TEAM_ID, name: 'Hawks' },
          { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', name: 'Bears' },
        ],
        rows: [
          {
            id: 'g1',
            status: 'completed',
            completedAt: '2026-07-01T00:00:00.000Z',
            homeLeagueTeamId: TEAM_ID,
            awayLeagueTeamId: 'eeeeeeeeeeeeeeeeeeeeeeee',
            homeTeamName: 'Hawks',
            awayTeamName: 'Bears',
            homePoints: 55,
            awayPoints: 40,
            title: 'Hawks vs Bears',
          },
        ],
        games: [
          {
            status: 'completed',
            trackingMode: 'one_sided',
            completedAt: '2026-07-01T00:00:00.000Z',
            homeLeagueTeamId: TEAM_ID,
            awayLeagueTeamId: 'eeeeeeeeeeeeeeeeeeeeeeee',
            trackedLeagueTeamId: TEAM_ID,
            boxScore: {
              players: [{ displayName: 'Alice', points: 12, reb: 5, ast: 3, fg2m: 4, fg2a: 9 }],
            },
          },
        ],
      });
    });

    test('owner gets 200 with all sections by default', async () => {
      const res = await request(createApp())
        .get(`/api/v1/export/leagues/${LEAGUE_ID}/season/${SEASON_ID}`)
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('Standings');
      expect(res.text).toContain('Statistical Leaders');
      expect(res.text).toContain('Player Stats');
      expect(res.text).toContain('Games');
      expect(res.text).toContain('Game Logs');
    });

    test('?dataset=gamelogs returns per-game player lines', async () => {
      const res = await request(createApp())
        .get(`/api/v1/export/leagues/${LEAGUE_ID}/season/${SEASON_ID}?dataset=gamelogs`)
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('Game Logs');
      expect(res.text).toContain('Hawks');
      expect(res.text).toContain('Bears'); // opponent column
      expect(res.text).not.toContain('Standings');
    });

    test('?dataset=standings returns only the standings section', async () => {
      const res = await request(createApp())
        .get(`/api/v1/export/leagues/${LEAGUE_ID}/season/${SEASON_ID}?dataset=standings`)
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('Standings');
      expect(res.text).not.toContain('Player Stats');
    });

    test('403 when the gate rejects (e.g. team manager or non-member)', async () => {
      leaguesService.assertLeagueManagerOrOwner.mockRejectedValue(new ApiError(403, 'Forbidden'));

      const res = await request(createApp())
        .get(`/api/v1/export/leagues/${LEAGUE_ID}/season/${SEASON_ID}`)
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(403);
    });

    test('400 on an invalid dataset', async () => {
      const res = await request(createApp())
        .get(`/api/v1/export/leagues/${LEAGUE_ID}/season/${SEASON_ID}?dataset=bogus`)
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(400);
    });

    test('400 on a malformed leagueId', async () => {
      const res = await request(createApp())
        .get(`/api/v1/export/leagues/not-an-id/season/${SEASON_ID}`)
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /export/leagues/:leagueId/teams/:leagueTeamId/season/:seasonId', () => {
    beforeEach(() => {
      leaguesService.getLeaguePlayerStats.mockResolvedValue([statRow()]);
      leaguesService.getLeagueSeasonGames.mockResolvedValue({
        teams: [
          { _id: TEAM_ID, name: 'Hawks' },
          { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', name: 'Bears' },
        ],
        rows: [
          {
            id: 'g1',
            status: 'completed',
            completedAt: '2026-07-01T00:00:00.000Z',
            homeLeagueTeamId: TEAM_ID,
            awayLeagueTeamId: 'eeeeeeeeeeeeeeeeeeeeeeee',
            homeTeamName: 'Hawks',
            awayTeamName: 'Bears',
            homePoints: 55,
            awayPoints: 40,
            title: 'Hawks vs Bears',
          },
        ],
        games: [
          {
            status: 'completed',
            trackingMode: 'one_sided',
            completedAt: '2026-07-01T00:00:00.000Z',
            homeLeagueTeamId: TEAM_ID,
            awayLeagueTeamId: 'eeeeeeeeeeeeeeeeeeeeeeee',
            trackedLeagueTeamId: TEAM_ID,
            boxScore: { players: [{ displayName: 'Alice', points: 12, reb: 5, ast: 3 }] },
          },
        ],
      });
    });

    test('team manager gets 200 with team sections', async () => {
      leaguesService.assertTeamManagerOrOwner.mockResolvedValue({
        league: { name: 'City League' },
        role: 'manager',
      });

      const res = await request(createApp())
        .get(`/api/v1/export/leagues/${LEAGUE_ID}/teams/${TEAM_ID}/season/${SEASON_ID}`)
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('Hawks — Player Stats');
      expect(res.text).toContain('Hawks — Games');
      expect(res.text).toContain('Hawks — Game Logs');
      expect(res.text).toContain('Alice');
    });

    test('403 for an unrelated user', async () => {
      leaguesService.assertTeamManagerOrOwner.mockRejectedValue(new ApiError(403, 'Forbidden'));

      const res = await request(createApp())
        .get(`/api/v1/export/leagues/${LEAGUE_ID}/teams/${TEAM_ID}/season/${SEASON_ID}`)
        .set('Authorization', bearer());

      expect(res.statusCode).toBe(403);
    });
  });
});
