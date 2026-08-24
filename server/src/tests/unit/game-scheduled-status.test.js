const mongoose = require('mongoose');

require('../../modules/games/games.repository');

const Game = mongoose.models.Game;

function buildGame(overrides = {}) {
  return new Game({
    ownerUserId: new mongoose.Types.ObjectId(),
    title: 'Fixture',
    ...overrides,
  });
}

describe('Game.status enum', () => {
  it('accepts scheduled', () => {
    const game = buildGame({ status: 'scheduled' });

    expect(game.validateSync()?.errors?.status).toBeUndefined();
    expect(game.status).toBe('scheduled');
  });

  it('still accepts in_progress and completed', () => {
    for (const status of ['in_progress', 'completed']) {
      const game = buildGame({ status });

      expect(game.validateSync()?.errors?.status).toBeUndefined();
      expect(game.status).toBe(status);
    }
  });

  it('defaults to in_progress so existing create paths are unchanged', () => {
    expect(buildGame().status).toBe('in_progress');
  });

  it('rejects an unknown status', () => {
    expect(buildGame({ status: 'cancelled' }).validateSync()?.errors?.status).toBeDefined();
  });
});

describe('setGameLineup status handling', () => {
  const gameId = new mongoose.Types.ObjectId().toString();
  const userId = new mongoose.Types.ObjectId().toString();
  const teamId = new mongoose.Types.ObjectId().toString();

  function loadServiceWithGameStatus(status) {
    jest.resetModules();
    jest.doMock('../../modules/games/games.repository', () => ({
      ...jest.requireActual('../../modules/games/games.repository'),
      findGameById: jest.fn().mockResolvedValue({
        _id: gameId,
        ownerUserId: userId,
        teamId,
        gameContext: 'standalone',
        status,
      }),
    }));
    jest.doMock('../../modules/teams/teams.repository', () => ({
      ...jest.requireActual('../../modules/teams/teams.repository'),
      findTeamByIdAndOwner: jest.fn().mockResolvedValue({
        _id: teamId,
        ownerUserId: userId,
        capacityType: 'free',
        plan: 'starter',
        subscriptionStatus: 'inactive',
      }),
    }));
    return require('../../modules/games/games.service');
  }

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('still says completed for a completed game', async () => {
    const service = loadServiceWithGameStatus('completed');

    await expect(service.setGameLineup(userId, gameId, { playerIds: [] })).rejects.toThrow(
      /completed game/i
    );
  });
});
