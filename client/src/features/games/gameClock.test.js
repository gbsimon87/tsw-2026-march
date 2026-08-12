import { describe, expect, test } from 'vitest';
import {
  DEFAULT_GAME_FORMAT,
  clockSnapshot,
  effectiveRemainingMilliseconds,
  formatClock,
  regulationSegmentCount,
  segmentLabel,
} from './gameClock';

describe('game clock helpers', () => {
  test('formats whole minutes and tenths under one minute', () => {
    expect(formatClock(600000)).toBe('10:00');
    expect(formatClock(59999)).toBe('59.9');
  });

  test('supports quarter, half, and overtime labels', () => {
    expect(regulationSegmentCount(DEFAULT_GAME_FORMAT)).toBe(4);
    expect(segmentLabel(DEFAULT_GAME_FORMAT, 'regulation', 3)).toBe('Q3');
    const halves = { ...DEFAULT_GAME_FORMAT, regulationSegmentType: 'half' };
    expect(regulationSegmentCount(halves)).toBe(2);
    expect(segmentLabel(halves, 'regulation', 2)).toBe('H2');
    expect(segmentLabel(halves, 'overtime', 2)).toBe('OT2');
  });

  test('captures a game-clock snapshot independently from video time', () => {
    const game = {
      clock: {
        status: 'running',
        segmentKind: 'regulation',
        segmentNumber: 1,
        remainingMilliseconds: 10000,
        runningSince: '2026-08-12T12:00:00.000Z',
      },
    };
    const now = new Date('2026-08-12T12:00:02.500Z').getTime();
    expect(effectiveRemainingMilliseconds(game.clock, now)).toBe(7500);
    expect(clockSnapshot(game, now)).toEqual({
      segmentKind: 'regulation',
      segmentNumber: 1,
      clockMillisecondsRemaining: 7500,
    });
  });
});
