const SPORTS = Object.freeze({ BASKETBALL: 'basketball' });
const SEGMENT_TYPES = Object.freeze({ QUARTER: 'quarter', HALF: 'half' });
const SEGMENT_KINDS = Object.freeze({ REGULATION: 'regulation', OVERTIME: 'overtime' });
const CLOCK_STATUSES = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  SEGMENT_COMPLETE: 'segment_complete',
});

const DEFAULT_GAME_FORMAT = Object.freeze({
  regulationSegmentType: SEGMENT_TYPES.QUARTER,
  regulationSegmentDurationSeconds: 10 * 60,
  overtimeDurationSeconds: 5 * 60,
});

function regulationSegmentCount(format) {
  return format.regulationSegmentType === SEGMENT_TYPES.HALF ? 2 : 4;
}

function createReadyClock(format = DEFAULT_GAME_FORMAT) {
  return {
    status: CLOCK_STATUSES.READY,
    segmentKind: SEGMENT_KINDS.REGULATION,
    segmentNumber: 1,
    remainingMilliseconds: format.regulationSegmentDurationSeconds * 1000,
    runningSince: null,
  };
}

function effectiveRemainingMilliseconds(clock, now = new Date()) {
  const stored = Math.max(0, Number(clock.remainingMilliseconds) || 0);
  if (clock.status !== CLOCK_STATUSES.RUNNING || !clock.runningSince) return stored;
  return Math.max(0, stored - (now.getTime() - new Date(clock.runningSince).getTime()));
}

function normalizeClock(clock, now = new Date()) {
  const remainingMilliseconds = effectiveRemainingMilliseconds(clock, now);
  if (clock.status !== CLOCK_STATUSES.RUNNING) return { ...clock, remainingMilliseconds };
  return {
    ...clock,
    status: remainingMilliseconds === 0 ? CLOCK_STATUSES.SEGMENT_COMPLETE : CLOCK_STATUSES.RUNNING,
    remainingMilliseconds,
    runningSince: remainingMilliseconds === 0 ? null : now,
  };
}

function segmentDurationMilliseconds(format, segmentKind) {
  return (
    (segmentKind === SEGMENT_KINDS.OVERTIME
      ? format.overtimeDurationSeconds
      : format.regulationSegmentDurationSeconds) * 1000
  );
}

function validateSnapshot(format, snapshot) {
  const { segmentKind, segmentNumber, clockMillisecondsRemaining } = snapshot;
  if (
    !Object.values(SEGMENT_KINDS).includes(segmentKind) ||
    !Number.isInteger(segmentNumber) ||
    segmentNumber < 1
  )
    return false;
  if (segmentKind === SEGMENT_KINDS.REGULATION && segmentNumber > regulationSegmentCount(format))
    return false;
  return (
    Number.isFinite(clockMillisecondsRemaining) &&
    clockMillisecondsRemaining >= 0 &&
    clockMillisecondsRemaining <= segmentDurationMilliseconds(format, segmentKind)
  );
}

module.exports = {
  SPORTS,
  SEGMENT_TYPES,
  SEGMENT_KINDS,
  CLOCK_STATUSES,
  DEFAULT_GAME_FORMAT,
  regulationSegmentCount,
  createReadyClock,
  effectiveRemainingMilliseconds,
  normalizeClock,
  segmentDurationMilliseconds,
  validateSnapshot,
};
