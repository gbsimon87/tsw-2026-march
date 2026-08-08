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
