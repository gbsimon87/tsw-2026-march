const { appendEventSchema } = require('../../modules/games/games.validation');

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
});
