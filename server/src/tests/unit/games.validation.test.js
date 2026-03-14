const { createGameSchema, appendEventSchema } = require('../../modules/games/games.validation');

describe('games validation', () => {
  test('accepts FREE_THROW_LINE zone with coordinates', () => {
    const parsed = appendEventSchema.parse({
      playerId: 'player-1',
      statType: 'FT_MADE',
      zoneId: 'FREE_THROW_LINE',
      x: 50,
      y: 79.8,
    });

    expect(parsed.zoneId).toBe('FREE_THROW_LINE');
  });

  test('rejects shot event without coordinates', () => {
    expect(() =>
      appendEventSchema.parse({
        playerId: 'player-1',
        statType: 'FG3_MADE',
        zoneId: 'WING_LEFT_3',
      })
    ).toThrow();
  });

  test('accepts rebound event without coordinates', () => {
    const parsed = appendEventSchema.parse({
      playerId: 'player-1',
      statType: 'OREB',
    });

    expect(parsed.statType).toBe('OREB');
  });

  test('accepts optional opponent when creating game', () => {
    const parsed = createGameSchema.parse({
      teamId: 'team-1',
      title: 'Playoff game',
      opponent: 'Wildcats',
    });

    expect(parsed.opponent).toBe('Wildcats');
  });

  test('rejects blank opponent when provided', () => {
    expect(() =>
      createGameSchema.parse({
        teamId: 'team-1',
        title: 'Playoff game',
        opponent: '   ',
      })
    ).toThrow();
  });
});
