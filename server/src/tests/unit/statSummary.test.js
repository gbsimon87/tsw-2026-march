const {
  createEmptyTeamStatSummary,
  applyEventToTeamStatSummary,
  finalizeTeamStatSummary,
  summarizeEvents,
  createEmptyPlayerStatLine,
  applyEventToPlayerStatLine,
  summarizeEventsBySide,
} = require('../../modules/shared/statSummary');
const { STAT_TYPES } = require('../../modules/shared/stats.constants');

describe('statSummary', () => {
  test('summarizes makes, misses, attempts, and points from events', () => {
    const result = summarizeEvents([
      { statType: STAT_TYPES.FG2_MADE },
      { statType: STAT_TYPES.FG2_MISS },
      { statType: STAT_TYPES.FG3_MADE },
      { statType: STAT_TYPES.FG3_MISS },
      { statType: STAT_TYPES.FT_MADE },
      { statType: STAT_TYPES.FT_MISS },
    ]);

    expect(result).toEqual({
      points: 6,
      opponentPoints: 0,
      fg2: { made: 1, missed: 1, attempts: 2, percentage: 50 },
      fg3: { made: 1, missed: 1, attempts: 2, percentage: 50 },
      ft: { made: 1, missed: 1, attempts: 2, percentage: 50 },
    });
  });

  test('returns null percentage when there are no attempts', () => {
    const summary = createEmptyTeamStatSummary();

    applyEventToTeamStatSummary(summary, 'UNRELATED');

    expect(finalizeTeamStatSummary(summary)).toEqual({
      points: 0,
      opponentPoints: 0,
      fg2: { made: 0, missed: 0, attempts: 0, percentage: null },
      fg3: { made: 0, missed: 0, attempts: 0, percentage: null },
      ft: { made: 0, missed: 0, attempts: 0, percentage: null },
    });
  });
});

describe('createEmptyPlayerStatLine / applyEventToPlayerStatLine (OPT-006)', () => {
  test('creates a zeroed line without leaguePlayerId by default', () => {
    expect(createEmptyPlayerStatLine('p1', 'Alex')).toEqual({
      playerId: 'p1',
      displayName: 'Alex',
      ftm: 0,
      fta: 0,
      fg2m: 0,
      fg2a: 0,
      fg3m: 0,
      fg3a: 0,
      ast: 0,
      oreb: 0,
      dreb: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      foul: 0,
      personalFoul: 0,
      technicalFoul: 0,
      flagrantFoul: 0,
      foulDrawn: 0,
      reb: 0,
      points: 0,
    });
  });

  test('includes leaguePlayerId (nullable) when opted in', () => {
    expect(
      createEmptyPlayerStatLine('p1', 'Alex', {
        includeLeaguePlayerId: true,
        leaguePlayerId: 'lp9',
      })
    ).toMatchObject({ playerId: 'p1', leaguePlayerId: 'lp9', displayName: 'Alex' });

    expect(createEmptyPlayerStatLine('p2', 'Sam', { includeLeaguePlayerId: true })).toMatchObject({
      playerId: 'p2',
      leaguePlayerId: null,
    });
  });

  test('credits a foul drawn separately from personal fouls and points', () => {
    const line = createEmptyPlayerStatLine('p1', 'Alex');
    applyEventToPlayerStatLine(line, STAT_TYPES.FOUL_DRAWN);
    expect(line).toMatchObject({ foulDrawn: 1, foul: 0, points: 0 });

    const summaries = summarizeEventsBySide([
      { teamSide: 'home', statType: STAT_TYPES.FOUL },
      { teamSide: 'away', statType: STAT_TYPES.FOUL_DRAWN },
    ]);
    expect(summaries.home).toMatchObject({ foul: 1, foulDrawn: 0, points: 0 });
    expect(summaries.away).toMatchObject({ foul: 0, foulDrawn: 1, points: 0 });
  });

  test('accumulates makes, misses, points, rebounds and other stats', () => {
    const line = createEmptyPlayerStatLine('p1', 'Alex');
    [
      STAT_TYPES.FT_MADE,
      STAT_TYPES.FT_MISS,
      STAT_TYPES.FG2_MADE,
      STAT_TYPES.FG2_MISS,
      STAT_TYPES.FG3_MADE,
      STAT_TYPES.FG3_MISS,
      STAT_TYPES.AST,
      STAT_TYPES.OREB,
      STAT_TYPES.DREB,
      STAT_TYPES.STL,
      STAT_TYPES.BLK,
      STAT_TYPES.TOV,
      STAT_TYPES.FOUL,
    ].forEach((statType) => applyEventToPlayerStatLine(line, statType));

    expect(line).toMatchObject({
      ftm: 1,
      fta: 2,
      fg2m: 1,
      fg2a: 2,
      fg3m: 1,
      fg3a: 2,
      ast: 1,
      oreb: 1,
      dreb: 1,
      reb: 2,
      stl: 1,
      blk: 1,
      tov: 1,
      foul: 1,
      points: 6,
    });
  });
});

describe('foul classifications', () => {
  test('totals each foul once, separates drawn fouls, and leaves points unchanged', () => {
    const types = [
      STAT_TYPES.FOUL,
      STAT_TYPES.TECHNICAL_FOUL,
      STAT_TYPES.FLAGRANT_FOUL,
      STAT_TYPES.FOUL_DRAWN,
    ];
    const line = createEmptyPlayerStatLine('p1', 'Alex');
    types.forEach((type) => applyEventToPlayerStatLine(line, type));
    expect(line).toMatchObject({
      foul: 3,
      personalFoul: 1,
      technicalFoul: 1,
      flagrantFoul: 1,
      foulDrawn: 1,
      points: 0,
    });
    const summary = summarizeEventsBySide(
      types.map((statType) => ({ statType, teamSide: 'home' }))
    );
    expect(summary.home).toMatchObject({
      foul: 3,
      personalFoul: 1,
      technicalFoul: 1,
      flagrantFoul: 1,
      foulDrawn: 1,
      points: 0,
    });
    expect(summary.away).toMatchObject({
      foul: 0,
      personalFoul: 0,
      technicalFoul: 0,
      flagrantFoul: 0,
      foulDrawn: 0,
    });
  });
});
