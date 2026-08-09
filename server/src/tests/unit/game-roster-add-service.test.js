jest.mock('../../modules/games/games.repository', () => ({
  findGameById: jest.fn(),
  saveGame: jest.fn(async (game) => game),
  createGame: jest.fn(),
  listGamesByOwner: jest.fn(),
  claimGameSummaryGeneration: jest.fn(),
  releaseGameSummaryLock: jest.fn(),
  saveGameSummary: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  addPlayerToLeagueTeam: jest.fn(),
  getLeagueContextForGame: jest.fn(),
  getLeagueRosterSnapshotForTeam: jest.fn(),
  getLeagueTeamRosterSnapshotForGame: jest.fn(),
  canManageLeagueGame: jest.fn(async () => true),
  canFinalizeLeagueGame: jest.fn(),
  scheduleLeagueAggregateRecompute: jest.fn(),
}));

jest.mock('../../modules/teams/teams.service', () => ({
  addPlayerToTeam: jest.fn(),
  scheduleTeamSeasonSummaryRecompute: jest.fn(),
  computeBoxScore: jest.fn(),
}));

const { findGameById, saveGame } = require('../../modules/games/games.repository');
const leaguesService = require('../../modules/leagues/leagues.service');
const teamsService = require('../../modules/teams/teams.service');
const { addPlayerToGameRoster } = require('../../modules/games/games.service');

const OWNER = '507f1f77bcf86cd799439011';
const GAME_ID = '507f1f77bcf86cd799439012';

function leagueDualGame(overrides = {}) {
  return {
    _id: GAME_ID,
    ownerUserId: OWNER,
    status: 'in_progress',
    gameContext: 'league',
    trackingMode: 'dual_team',
    leagueId: '507f1f77bcf86cd799439013',
    homeLeagueTeamId: '507f1f77bcf86cd799439014',
    awayLeagueTeamId: '507f1f77bcf86cd799439015',
    homeRosterSnapshot: [],
    awayRosterSnapshot: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  leaguesService.addPlayerToLeagueTeam.mockResolvedValue({
    id: 'lp-1',
    displayName: 'Jordan Blake',
    jerseyNumber: 23,
    position: null,
    isActive: true,
  });
  teamsService.addPlayerToTeam.mockResolvedValue({
    id: 'p-1',
    displayName: 'Jordan Blake',
    jerseyNumber: 23,
  });
});

describe('addPlayerToGameRoster', () => {
  it('delegates the league roster write and appends to the correct snapshot', async () => {
    const game = leagueDualGame();
    findGameById.mockResolvedValue(game);

    const result = await addPlayerToGameRoster(OWNER, GAME_ID, {
      side: 'home',
      displayName: 'Jordan Blake',
      jerseyNumber: 23,
    });

    expect(leaguesService.addPlayerToLeagueTeam).toHaveBeenCalledWith(
      OWNER,
      '507f1f77bcf86cd799439013',
      '507f1f77bcf86cd799439014',
      { displayName: 'Jordan Blake', jerseyNumber: 23 }
    );
    expect(game.homeRosterSnapshot).toHaveLength(1);
    expect(game.homeRosterSnapshot[0]).toMatchObject({
      leaguePlayerId: 'lp-1',
      displayName: 'Jordan Blake',
      jerseyNumber: 23,
      isActive: true,
      isClaimed: false,
    });
    expect(game.awayRosterSnapshot).toHaveLength(0);
    expect(saveGame).toHaveBeenCalledWith(game);
    expect(result.player.displayName).toBe('Jordan Blake');
    expect(result.side).toBe('home');
  });

  it('writes no snapshot for a standalone one-sided game', async () => {
    const game = {
      _id: GAME_ID,
      ownerUserId: OWNER,
      status: 'in_progress',
      gameContext: 'standalone',
      trackingMode: 'one_sided',
      teamId: '507f1f77bcf86cd799439016',
    };
    findGameById.mockResolvedValue(game);

    const result = await addPlayerToGameRoster(OWNER, GAME_ID, { displayName: 'Jordan Blake' });

    expect(teamsService.addPlayerToTeam).toHaveBeenCalledWith(OWNER, '507f1f77bcf86cd799439016', {
      displayName: 'Jordan Blake',
      jerseyNumber: null,
    });
    expect(saveGame).not.toHaveBeenCalled();
    expect(result.side).toBeNull();
  });

  it('rejects a completed game with 409 and writes nothing', async () => {
    findGameById.mockResolvedValue(leagueDualGame({ status: 'completed' }));

    await expect(
      addPlayerToGameRoster(OWNER, GAME_ID, { side: 'home', displayName: 'Jordan Blake' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(leaguesService.addPlayerToLeagueTeam).not.toHaveBeenCalled();
    expect(saveGame).not.toHaveBeenCalled();
  });

  it('allows a scheduled game', async () => {
    findGameById.mockResolvedValue(leagueDualGame({ status: 'scheduled' }));

    await expect(
      addPlayerToGameRoster(OWNER, GAME_ID, { side: 'home', displayName: 'Jordan Blake' })
    ).resolves.toBeTruthy();
  });

  it('propagates a duplicate-name 409 from the delegated service', async () => {
    findGameById.mockResolvedValue(leagueDualGame());
    const conflict = new Error('Player name is already in use on this team');
    conflict.statusCode = 409;
    leaguesService.addPlayerToLeagueTeam.mockRejectedValue(conflict);

    await expect(
      addPlayerToGameRoster(OWNER, GAME_ID, { side: 'home', displayName: 'Jordan Blake' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(saveGame).not.toHaveBeenCalled();
  });

  it('propagates a 403 from the delegated permission gate without touching the game', async () => {
    findGameById.mockResolvedValue(leagueDualGame());
    const forbidden = new Error('Forbidden');
    forbidden.statusCode = 403;
    leaguesService.addPlayerToLeagueTeam.mockRejectedValue(forbidden);

    await expect(
      addPlayerToGameRoster(OWNER, GAME_ID, { side: 'home', displayName: 'Jordan Blake' })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(saveGame).not.toHaveBeenCalled();
  });

  it('retries the snapshot append once on a VersionError', async () => {
    const stale = leagueDualGame();
    const fresh = leagueDualGame();
    findGameById.mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh);

    const versionError = new Error('No matching document found for id');
    versionError.name = 'VersionError';
    saveGame.mockRejectedValueOnce(versionError).mockResolvedValueOnce(fresh);

    await addPlayerToGameRoster(OWNER, GAME_ID, {
      side: 'home',
      displayName: 'Jordan Blake',
      jerseyNumber: 23,
    });

    expect(saveGame).toHaveBeenCalledTimes(2);
    expect(fresh.homeRosterSnapshot).toHaveLength(1);
    // The roster write must NOT be repeated by the retry — that would create a
    // second real player.
    expect(leaguesService.addPlayerToLeagueTeam).toHaveBeenCalledTimes(1);
  });
});
