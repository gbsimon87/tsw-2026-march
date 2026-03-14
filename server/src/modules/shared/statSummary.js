const { STAT_TYPES } = require('./stats.constants');

function createEmptyShotSummary() {
  return {
    made: 0,
    missed: 0,
    attempts: 0,
    percentage: null,
  };
}

function createEmptyTeamStatSummary() {
  return {
    points: 0,
    fg2: createEmptyShotSummary(),
    fg3: createEmptyShotSummary(),
    ft: createEmptyShotSummary(),
  };
}

function finalizeShotSummary(summary) {
  summary.attempts = summary.made + summary.missed;
  summary.percentage = summary.attempts > 0 ? (summary.made / summary.attempts) * 100 : null;
  return summary;
}

function finalizeTeamStatSummary(summary) {
  finalizeShotSummary(summary.fg2);
  finalizeShotSummary(summary.fg3);
  finalizeShotSummary(summary.ft);
  return summary;
}

function applyEventToTeamStatSummary(summary, statType) {
  if (statType === STAT_TYPES.FT_MADE) {
    summary.ft.made += 1;
    summary.points += 1;
    return summary;
  }

  if (statType === STAT_TYPES.FT_MISS) {
    summary.ft.missed += 1;
    return summary;
  }

  if (statType === STAT_TYPES.FG2_MADE) {
    summary.fg2.made += 1;
    summary.points += 2;
    return summary;
  }

  if (statType === STAT_TYPES.FG2_MISS) {
    summary.fg2.missed += 1;
    return summary;
  }

  if (statType === STAT_TYPES.FG3_MADE) {
    summary.fg3.made += 1;
    summary.points += 3;
    return summary;
  }

  if (statType === STAT_TYPES.FG3_MISS) {
    summary.fg3.missed += 1;
  }

  return summary;
}

function summarizeEvents(events = []) {
  const summary = createEmptyTeamStatSummary();

  for (const event of events) {
    applyEventToTeamStatSummary(summary, event.statType);
  }

  return finalizeTeamStatSummary(summary);
}

module.exports = {
  createEmptyTeamStatSummary,
  applyEventToTeamStatSummary,
  finalizeTeamStatSummary,
  summarizeEvents,
};
