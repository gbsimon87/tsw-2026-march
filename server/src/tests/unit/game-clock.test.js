const {
  CLOCK_STATUSES,
  DEFAULT_GAME_FORMAT,
  createReadyClock,
  effectiveRemainingMilliseconds,
  normalizeClock,
  regulationSegmentCount,
  validateSnapshot,
} = require('../../modules/shared/gameClock');

describe('game clock domain', () => {
  test('creates the default 10-minute first quarter', () => {
    expect(createReadyClock()).toEqual({
      status: CLOCK_STATUSES.READY,
      segmentKind: 'regulation',
      segmentNumber: 1,
      remainingMilliseconds: 600000,
      runningSince: null,
    });
  });

  test('derives running time from the stored anchor and completes at zero', () => {
    const clock = {
      ...createReadyClock(),
      status: CLOCK_STATUSES.RUNNING,
      remainingMilliseconds: 10000,
      runningSince: new Date('2026-08-12T12:00:00.000Z'),
    };
    const now = new Date('2026-08-12T12:00:12.000Z');

    expect(effectiveRemainingMilliseconds(clock, now)).toBe(0);
    expect(normalizeClock(clock, now)).toMatchObject({
      status: CLOCK_STATUSES.SEGMENT_COMPLETE,
      remainingMilliseconds: 0,
      runningSince: null,
    });
  });

  test('supports halves and validates regulation and overtime snapshots', () => {
    const halves = { ...DEFAULT_GAME_FORMAT, regulationSegmentType: 'half' };
    expect(regulationSegmentCount(halves)).toBe(2);
    expect(
      validateSnapshot(halves, {
        segmentKind: 'regulation',
        segmentNumber: 2,
        clockMillisecondsRemaining: 12500,
      })
    ).toBe(true);
    expect(
      validateSnapshot(halves, {
        segmentKind: 'regulation',
        segmentNumber: 3,
        clockMillisecondsRemaining: 12500,
      })
    ).toBe(false);
    expect(
      validateSnapshot(halves, {
        segmentKind: 'overtime',
        segmentNumber: 3,
        clockMillisecondsRemaining: 300000,
      })
    ).toBe(true);
  });
});
