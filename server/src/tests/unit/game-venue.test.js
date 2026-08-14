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

const { createGameSchema, updateGameSchema } = require('../../modules/games/games.validation');

const LEAGUE_ID = '507f1f77bcf86cd799439011';
const HOME_ID = '507f1f77bcf86cd799439031';
const AWAY_ID = '507f1f77bcf86cd799439032';
const GAME_FORMAT = {
  regulationSegmentType: 'quarter',
  regulationSegmentDurationSeconds: 600,
  overtimeDurationSeconds: 300,
};

function leagueGamePayload(overrides = {}) {
  return {
    gameContext: 'league',
    trackingMode: 'one_sided',
    gameFormat: GAME_FORMAT,
    leagueId: LEAGUE_ID,
    homeLeagueTeamId: HOME_ID,
    awayLeagueTeamId: AWAY_ID,
    trackedLeagueTeamId: HOME_ID,
    ...overrides,
  };
}

describe('createGameSchema venue', () => {
  it('accepts and trims a venue on a one-sided league game', () => {
    const parsed = createGameSchema.parse(leagueGamePayload({ venue: '  Court 1  ' }));

    expect(parsed.venue).toBe('Court 1');
  });

  it('accepts a venue on a dual-team league game', () => {
    const parsed = createGameSchema.parse({
      gameContext: 'league',
      trackingMode: 'dual_team',
      gameFormat: GAME_FORMAT,
      leagueId: LEAGUE_ID,
      homeLeagueTeamId: HOME_ID,
      awayLeagueTeamId: AWAY_ID,
      venue: 'Riverside Gym',
    });

    expect(parsed.venue).toBe('Riverside Gym');
  });

  it('leaves venue undefined when omitted', () => {
    const parsed = createGameSchema.parse(leagueGamePayload());

    expect(parsed.venue).toBeUndefined();
  });

  it('rejects a venue longer than 120 characters', () => {
    expect(() => createGameSchema.parse(leagueGamePayload({ venue: 'x'.repeat(121) }))).toThrow();
  });
});

describe('updateGameSchema venue', () => {
  it('accepts and trims a venue', () => {
    expect(updateGameSchema.parse({ venue: '  Central Court  ' }).venue).toBe('Central Court');
  });

  it('accepts null so a venue can be cleared', () => {
    expect(updateGameSchema.parse({ venue: null }).venue).toBeNull();
  });

  it('counts venue as a provided field on its own', () => {
    // updateGameSchema refuses an empty payload; venue alone must satisfy it,
    // otherwise "just fix the venue" would 400.
    expect(() => updateGameSchema.parse({ venue: 'Court 2' })).not.toThrow();
  });

  it('rejects a venue longer than 120 characters', () => {
    expect(() => updateGameSchema.parse({ venue: 'x'.repeat(121) })).toThrow();
  });
});
