const {
  aggregateScrimmageStats,
  validateGameRosters,
  DEFAULT_MVP_RULES,
} = require('../../modules/scrimmages/scrimmages.scoring');
const {
  summarizeEventsBySide,
  applyEventToPlayerStatLine,
  createEmptyPlayerStatLine,
} = require('../../modules/shared/statSummary');
const {
  createReadyClock,
  regulationSegmentCount,
  validateSnapshot,
} = require('../../modules/shared/gameClock');
const schemas = require('../../modules/scrimmages/scrimmages.validation');
function game(overrides = {}) {
  return {
    status: 'completed',
    scrimmageSessionId: 'week-1',
    scoringRules: { insideArc: 1, outsideArc: 2 },
    homeRosterSnapshot: [
      { _id: 'john', displayName: 'John' },
      { _id: 'bench', displayName: 'Bench' },
    ],
    awayRosterSnapshot: [{ _id: 'kyle', displayName: 'Kyle' }],
    homeStartingLineupPlayerIds: ['john'],
    awayStartingLineupPlayerIds: ['kyle'],
    events: [
      { playerId: 'john', teamSide: 'home', statType: 'FG3_MADE' },
      { playerId: 'john', teamSide: 'home', statType: 'FG2_MISS' },
      { playerId: 'john', teamSide: 'home', statType: 'TOV' },
    ],
    ...overrides,
  };
}
test('pickup scoring, efficiency penalties and team results include zero-stat starters and exclude the bench', () => {
  const rows = aggregateScrimmageStats([game()], { ...DEFAULT_MVP_RULES, weeklyMinGames: 1 });
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.playerId === 'john')).toMatchObject({
    points: 2,
    makes: 1,
    misses: 1,
    attempts: 2,
    fgPercentage: 50,
    turnovers: 1,
    wins: 1,
    mvpScore: 1,
    eligible: true,
  });
  expect(rows.find((r) => r.playerId === 'kyle')).toMatchObject({
    gamesPlayed: 1,
    fgPercentage: null,
    losses: 1,
    mvpScore: -1,
  });
});
test('season MVP and FG% use pooled totals instead of averages of weekly averages', () => {
  const a = game({ events: [{ playerId: 'john', teamSide: 'home', statType: 'FG2_MADE' }] });
  const b = game({
    scrimmageSessionId: 'week-2',
    events: [
      { playerId: 'john', teamSide: 'home', statType: 'FG3_MADE' },
      { playerId: 'john', teamSide: 'home', statType: 'FG2_MISS' },
      { playerId: 'john', teamSide: 'home', statType: 'FG2_MISS' },
    ],
  });
  const row = aggregateScrimmageStats(
    [a, a, b],
    { ...DEFAULT_MVP_RULES, seasonMinGames: 3 },
    'season'
  ).find((r) => r.playerId === 'john');
  expect(row).toMatchObject({
    gamesPlayed: 3,
    weeksPlayed: 2,
    points: 4,
    makes: 3,
    attempts: 5,
    fgPercentage: 60,
    contribution: 8,
    eligible: true,
  });
  expect(row.mvpScore).toBeCloseTo(8 / 3);
});
test('unfinished games do not change MVP and low attendance stays provisional', () => {
  const rows = aggregateScrimmageStats([game(), game({ status: 'in_progress' })]);
  expect(rows.find((r) => r.playerId === 'john')).toMatchObject({
    gamesPlayed: 1,
    eligible: false,
  });
});
test('a corrected event changes wins, shooting and MVP on the next aggregation', () => {
  const original = game();
  const corrected = game({ events: [] });
  expect(aggregateScrimmageStats([original])[0].wins).toBe(1);
  expect(
    aggregateScrimmageStats([corrected]).every(
      (row) => row.draws === 1 && row.wins === 0 && row.mvpScore === 0
    )
  ).toBe(true);
});
test('shared score and player accumulators preserve standard scoring while honoring the scrimmage snapshot', () => {
  const events = game().events;
  expect(summarizeEventsBySide(events).home.points).toBe(3);
  expect(summarizeEventsBySide(events, { insideArc: 1, outsideArc: 2 }).home.points).toBe(2);
  const row = createEmptyPlayerStatLine('john', 'John');
  applyEventToPlayerStatLine(row, 'FG2_MADE', { insideArc: 1, outsideArc: 2 });
  expect(row).toMatchObject({ points: 1, fg2m: 1, fg2a: 1 });
});
function rosters() {
  const assignments = Array.from({ length: 10 }, (_, i) => ({
    playerId: `p${i}`,
    color: i < 5 ? 'red' : 'white',
  }));
  return {
    assignments,
    payload: {
      homeColor: 'red',
      awayColor: 'white',
      homePlayers: assignments
        .slice(0, 5)
        .map((p, i) => ({ playerId: p.playerId, jerseyNumber: i })),
      awayPlayers: assignments.slice(5).map((p, i) => ({ playerId: p.playerId, jerseyNumber: i })),
    },
  };
}
test('duplicate jerseys across colors work, but duplicate jerseys within a side fail', () => {
  const { assignments, payload } = rosters();
  expect(validateGameRosters(assignments, payload)).toBeNull();
  payload.homePlayers[1].jerseyNumber = 0;
  expect(validateGameRosters(assignments, payload)).toMatch(/Jersey numbers/);
});
test('weekly color changes are rejected', () => {
  const { assignments, payload } = rosters();
  payload.homePlayers[0].playerId = 'p5';
  expect(validateGameRosters(assignments, payload)).toMatch(/assigned weekly color/);
});
test('smaller and unequal lineups are allowed while empty sides are rejected', () => {
  const { assignments, payload } = rosters();
  payload.homePlayers = payload.homePlayers.slice(0, 3);
  payload.awayPlayers = payload.awayPlayers.slice(0, 2);
  expect(validateGameRosters(assignments, payload)).toBeNull();
  payload.homePlayers = [];
  expect(validateGameRosters(assignments, payload)).toMatch(/one to five/);
});
test('a scrimmage has one regulation segment and four-minute overtime; standard formats are unchanged', () => {
  const format = {
    regulationSegmentType: 'scrimmage',
    regulationSegmentDurationSeconds: 240,
    overtimeDurationSeconds: 240,
  };
  expect(regulationSegmentCount(format)).toBe(1);
  expect(regulationSegmentCount({ regulationSegmentType: 'half' })).toBe(2);
  expect(createReadyClock(format).remainingMilliseconds).toBe(240000);
  expect(
    validateSnapshot(format, {
      segmentKind: 'regulation',
      segmentNumber: 2,
      clockMillisecondsRemaining: 0,
    })
  ).toBe(false);
  expect(
    validateSnapshot(format, {
      segmentKind: 'overtime',
      segmentNumber: 1,
      clockMillisecondsRemaining: 0,
    })
  ).toBe(true);
});
test('a claim requires explicit acceptance, a signature, a version, and an existing player', () => {
  expect(
    schemas.join.safeParse({ displayName: 'John', signedName: 'John', accepted: false }).success
  ).toBe(false);
  expect(
    schemas.join.safeParse({
      displayName: 'John',
      signedName: 'John',
      accepted: true,
      termsVersion: 'a'.repeat(64),
    }).success
  ).toBe(false);
});
test('invalid dates fail validation without throwing a RangeError', () => {
  expect(
    schemas.session.safeParse({ label: 'Week 1', date: '2026-99-99', assignments: [] }).success
  ).toBe(false);
  expect(
    schemas.session.safeParse({ label: 'Week 1', date: '2026-02-30', assignments: [] }).success
  ).toBe(false);
});
