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

describe('Game.venue', () => {
  it('accepts and trims a venue', () => {
    const game = buildGame({ venue: '  Court 1  ' });

    expect(game.validateSync()?.errors?.venue).toBeUndefined();
    expect(game.venue).toBe('Court 1');
  });

  it('is optional', () => {
    const game = buildGame();

    expect(game.validateSync()?.errors?.venue).toBeUndefined();
    expect(game.venue).toBeUndefined();
  });

  it('rejects a venue longer than 120 characters', () => {
    const game = buildGame({ venue: 'x'.repeat(121) });

    expect(game.validateSync()?.errors?.venue).toBeDefined();
  });

  it('accepts a venue of exactly 120 characters', () => {
    const game = buildGame({ venue: 'x'.repeat(120) });

    expect(game.validateSync()?.errors?.venue).toBeUndefined();
  });
});
