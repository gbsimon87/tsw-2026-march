const {
  createEmptyTeamStatSummary,
  applyEventToTeamStatSummary,
  finalizeTeamStatSummary,
  summarizeEvents,
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
      fg2: { made: 0, missed: 0, attempts: 0, percentage: null },
      fg3: { made: 0, missed: 0, attempts: 0, percentage: null },
      ft: { made: 0, missed: 0, attempts: 0, percentage: null },
    });
  });
});
