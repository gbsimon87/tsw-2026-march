export const DEFAULT_GAME_FORMAT = Object.freeze({
  regulationSegmentType: 'quarter',
  regulationSegmentDurationSeconds: 600,
  overtimeDurationSeconds: 300,
});

export function regulationSegmentCount(format) {
  return format.regulationSegmentType === 'half' ? 2 : 4;
}

export function segmentLabel(format, kind, number) {
  if (kind === 'overtime') return `OT${number}`;
  return `${format.regulationSegmentType === 'half' ? 'H' : 'Q'}${number}`;
}

export function effectiveRemainingMilliseconds(clock, now = Date.now()) {
  if (!clock) return 0;
  if (clock.status !== 'running' || !clock.runningSince)
    return Math.max(0, clock.remainingMilliseconds);
  return Math.max(0, clock.remainingMilliseconds - (now - new Date(clock.runningSince).getTime()));
}

export function formatClock(milliseconds) {
  const value = Math.max(0, milliseconds);
  if (value < 60000) return (Math.floor(value / 100) / 10).toFixed(1);
  const totalSeconds = Math.ceil(value / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function clockSnapshot(game, now = Date.now()) {
  return {
    segmentKind: game.clock.segmentKind,
    segmentNumber: game.clock.segmentNumber,
    clockMillisecondsRemaining: effectiveRemainingMilliseconds(game.clock, now),
  };
}
