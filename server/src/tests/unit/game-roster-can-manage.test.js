jest.mock('../../modules/teams/teams.repository', () => ({
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  assertTeamManagerOrOwner: jest.fn(),
  getLeagueContextForGame: jest.fn(),
  getLeagueRosterSnapshotForTeam: jest.fn(),
  getLeagueTeamRosterSnapshotForGame: jest.fn(),
  canManageLeagueGame: jest.fn(),
  canFinalizeLeagueGame: jest.fn(),
  scheduleLeagueAggregateRecompute: jest.fn(),
}));

const leaguesService = require('../../modules/leagues/leagues.service');
const { findTeamByIdAndOwner } = require('../../modules/teams/teams.repository');
const { canManageGameRoster } = require('../../modules/games/games.service');

const USER = '507f1f77bcf86cd799439011';

beforeEach(() => jest.clearAllMocks());

describe('canManageGameRoster', () => {
  it('is true for a standalone game the user already has access to', async () => {
    const game = { gameContext: 'standalone', trackingMode: 'one_sided', teamId: 'team-1' };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(true);
    expect(leaguesService.assertTeamManagerOrOwner).not.toHaveBeenCalled();
  });

  it('is true for a league game when the roster gate passes', async () => {
    leaguesService.assertTeamManagerOrOwner.mockResolvedValue({ league: {}, role: 'manager' });
    const game = {
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'lt-1',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(true);
  });

  it('is false for a league game when the roster gate rejects this user for every side', async () => {
    const forbidden = new Error('Forbidden');
    forbidden.statusCode = 403;
    leaguesService.assertTeamManagerOrOwner.mockRejectedValue(forbidden);
    const game = {
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'lt-1',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(false);
  });

  it('is false without a user id', async () => {
    const game = { gameContext: 'standalone', trackingMode: 'one_sided', teamId: 'team-1' };
    await expect(canManageGameRoster(null, game)).resolves.toBe(false);
  });

  // A standalone dual-team game is accessible to the owner of EITHER team
  // (canAccessStandaloneDualGame), so passing the access gate does not imply
  // owning the team whose roster is being edited. These three cases pin that.
  it('is true for a standalone dual-team game when the user owns one of the teams', async () => {
    findTeamByIdAndOwner.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'team-away' });
    const game = {
      gameContext: 'standalone',
      trackingMode: 'dual_team',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(true);
    expect(leaguesService.assertTeamManagerOrOwner).not.toHaveBeenCalled();
  });

  it('is false for a standalone dual-team game when the user owns neither team', async () => {
    findTeamByIdAndOwner.mockResolvedValue(null);
    const game = {
      gameContext: 'standalone',
      trackingMode: 'dual_team',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(false);
    expect(findTeamByIdAndOwner).toHaveBeenCalledTimes(2);
  });

  it('is false for a standalone dual-team game when the ownership lookup fails', async () => {
    findTeamByIdAndOwner.mockRejectedValue(new Error('db down'));
    const game = {
      gameContext: 'standalone',
      trackingMode: 'dual_team',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(false);
  });

  it('checks both sides of a dual-team league game and is true if either passes', async () => {
    leaguesService.assertTeamManagerOrOwner
      .mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
      .mockResolvedValueOnce({ league: {}, role: 'manager' });
    const game = {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'lt-home',
      awayLeagueTeamId: 'lt-away',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(true);
  });
});
