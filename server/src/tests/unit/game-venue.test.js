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

describe('Game.venueAddress', () => {
  it('defaults to null when omitted', () => {
    const game = buildGame({ venue: 'Court 1' });

    expect(game.validateSync()?.errors?.venueAddress).toBeUndefined();
    expect(game.venueAddress).toBeNull();
  });

  it('accepts and trims a structured address', () => {
    const game = buildGame({
      venue: 'Central Court',
      venueAddress: {
        addressLine1: '  12 Baker Street  ',
        city: '  London  ',
        postalCode: '  NW1 6XE  ',
        country: '  United Kingdom  ',
      },
    });

    expect(game.validateSync()?.errors).toBeUndefined();
    expect(game.venueAddress.addressLine1).toBe('12 Baker Street');
    expect(game.venueAddress.city).toBe('London');
    expect(game.venueAddress.postalCode).toBe('NW1 6XE');
    expect(game.venueAddress.country).toBe('United Kingdom');
  });

  it('defaults unset address parts to null rather than empty strings', () => {
    const game = buildGame({ venue: 'Central Court', venueAddress: { city: 'Leeds' } });

    expect(game.venueAddress.addressLine1).toBeNull();
    expect(game.venueAddress.addressLine2).toBeNull();
    expect(game.venueAddress.state).toBeNull();
  });

  it('rejects an address line longer than 160 characters', () => {
    const game = buildGame({
      venue: 'Central Court',
      venueAddress: { addressLine1: 'x'.repeat(161) },
    });

    expect(game.validateSync()?.errors?.['venueAddress.addressLine1']).toBeDefined();
  });

  it('rejects a postal code longer than 32 characters', () => {
    const game = buildGame({
      venue: 'Central Court',
      venueAddress: { postalCode: 'x'.repeat(33) },
    });

    expect(game.validateSync()?.errors?.['venueAddress.postalCode']).toBeDefined();
  });
});

describe('createGameSchema venueAddress', () => {
  it('accepts and trims a structured address on a league game', () => {
    const parsed = createGameSchema.parse(
      leagueGamePayload({
        venue: 'Central Court',
        venueAddress: { addressLine1: '  12 Baker Street  ', city: '  London  ' },
      })
    );

    expect(parsed.venueAddress).toEqual({ addressLine1: '12 Baker Street', city: 'London' });
  });

  it('leaves venueAddress undefined when omitted', () => {
    expect(createGameSchema.parse(leagueGamePayload()).venueAddress).toBeUndefined();
  });

  it('accepts a venueAddress on a standalone game', () => {
    const parsed = createGameSchema.parse({
      gameContext: 'standalone',
      trackingMode: 'one_sided',
      gameFormat: GAME_FORMAT,
      teamId: HOME_ID,
      title: 'Friendly',
      venue: 'Riverside Gym',
      venueAddress: { city: 'Bristol' },
    });

    expect(parsed.venueAddress).toEqual({ city: 'Bristol' });
  });

  it('rejects an address line longer than 160 characters', () => {
    expect(() =>
      createGameSchema.parse(leagueGamePayload({ venueAddress: { addressLine1: 'x'.repeat(161) } }))
    ).toThrow();
  });

  it('rejects a postal code longer than 32 characters', () => {
    expect(() =>
      createGameSchema.parse(leagueGamePayload({ venueAddress: { postalCode: 'x'.repeat(33) } }))
    ).toThrow();
  });
});

describe('updateGameSchema venueAddress', () => {
  it('accepts and trims a structured address', () => {
    expect(updateGameSchema.parse({ venueAddress: { city: '  Leeds  ' } }).venueAddress).toEqual({
      city: 'Leeds',
    });
  });

  it('accepts null so an address can be cleared', () => {
    expect(updateGameSchema.parse({ venueAddress: null }).venueAddress).toBeNull();
  });

  it('counts venueAddress as a provided field on its own', () => {
    expect(() => updateGameSchema.parse({ venueAddress: { city: 'Leeds' } })).not.toThrow();
  });

  it('rejects an over-long city', () => {
    expect(() => updateGameSchema.parse({ venueAddress: { city: 'x'.repeat(101) } })).toThrow();
  });
});
