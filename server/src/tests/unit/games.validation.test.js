const {
  createGameSchema,
  appendEventSchema,
  clockCommandSchema,
} = require('../../modules/games/games.validation');

const GAME_FORMAT = {
  regulationSegmentType: 'quarter',
  regulationSegmentDurationSeconds: 600,
  overtimeDurationSeconds: 300,
};
const CLOCK_SNAPSHOT = {
  segmentKind: 'regulation',
  segmentNumber: 1,
  clockMillisecondsRemaining: 600000,
};

describe('games validation', () => {
  test('accepts the manual finish-period clock command', () => {
    expect(clockCommandSchema.parse({ action: 'finish_segment' })).toEqual({
      action: 'finish_segment',
    });
  });

  test('accepts FREE_THROW_LINE zone with coordinates', () => {
    const parsed = appendEventSchema.parse({
      ...CLOCK_SNAPSHOT,
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
        ...CLOCK_SNAPSHOT,
        playerId: 'player-1',
        statType: 'FG3_MADE',
        zoneId: 'WING_LEFT_3',
      })
    ).toThrow();
  });

  test('accepts rebound event without coordinates', () => {
    const parsed = appendEventSchema.parse({
      ...CLOCK_SNAPSHOT,
      playerId: 'player-1',
      statType: 'OREB',
    });

    expect(parsed.statType).toBe('OREB');
  });

  test('accepts assist event without coordinates', () => {
    const parsed = appendEventSchema.parse({
      ...CLOCK_SNAPSHOT,
      playerId: 'player-1',
      statType: 'AST',
    });

    expect(parsed.statType).toBe('AST');
  });

  test('accepts opponent rebound without player id', () => {
    const parsed = appendEventSchema.parse({
      ...CLOCK_SNAPSHOT,
      statType: 'OPP_REB',
    });

    expect(parsed.statType).toBe('OPP_REB');
  });

  test('accepts substitution event with related player id', () => {
    const parsed = appendEventSchema.parse({
      ...CLOCK_SNAPSHOT,
      playerId: 'player-1',
      relatedPlayerId: 'player-6',
      statType: 'SUB_OUT',
    });

    expect(parsed.statType).toBe('SUB_OUT');
    expect(parsed.relatedPlayerId).toBe('player-6');
  });

  test('accepts optional opponent when creating game', () => {
    const parsed = createGameSchema.parse({
      gameContext: 'standalone',
      trackingMode: 'one_sided',
      gameFormat: GAME_FORMAT,
      teamId: 'team-1',
      title: 'Playoff game',
      opponent: 'Wildcats',
    });

    expect(parsed.opponent).toBe('Wildcats');
  });

  test('rejects blank opponent when provided', () => {
    expect(() =>
      createGameSchema.parse({
        gameContext: 'standalone',
        trackingMode: 'one_sided',
        gameFormat: GAME_FORMAT,
        teamId: 'team-1',
        title: 'Playoff game',
        opponent: '   ',
      })
    ).toThrow();
  });

  test('accepts YouTube video URL when creating game', () => {
    const parsed = createGameSchema.parse({
      gameContext: 'standalone',
      trackingMode: 'one_sided',
      gameFormat: GAME_FORMAT,
      teamId: 'team-1',
      title: 'Playoff game',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });

    expect(parsed.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  test('rejects non-YouTube video URL when creating game', () => {
    expect(() =>
      createGameSchema.parse({
        gameContext: 'standalone',
        trackingMode: 'one_sided',
        gameFormat: GAME_FORMAT,
        teamId: 'team-1',
        title: 'Playoff game',
        videoUrl: 'https://vimeo.com/123456',
      })
    ).toThrow('Video URL must be a valid YouTube link');
  });
});
