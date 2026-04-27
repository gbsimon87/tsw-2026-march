const { STAT_TYPES, TEAM_SIDES } = require('./stats.constants');

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
    opponentPoints: 0,
    fg2: createEmptyShotSummary(),
    fg3: createEmptyShotSummary(),
    ft: createEmptyShotSummary(),
  };
}

function createEmptyFullTeamStatSummary() {
  return {
    points: 0,
    fg2: createEmptyShotSummary(),
    fg3: createEmptyShotSummary(),
    ft: createEmptyShotSummary(),
    reb: 0,
    ast: 0,
    stl: 0,
    tov: 0,
    foul: 0,
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

function finalizeFullTeamStatSummary(summary) {
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
    return summary;
  }

  if (statType === STAT_TYPES.OPP_FT_MADE) {
    summary.opponentPoints += 1;
    return summary;
  }

  if (statType === STAT_TYPES.OPP_FG2_MADE) {
    summary.opponentPoints += 2;
    return summary;
  }

  if (statType === STAT_TYPES.OPP_FG3_MADE) {
    summary.opponentPoints += 3;
  }

  return summary;
}

function applyEventToFullTeamStatSummary(summary, statType) {
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
    return summary;
  }

  if (statType === STAT_TYPES.AST) {
    summary.ast += 1;
    return summary;
  }

  if (statType === STAT_TYPES.OREB || statType === STAT_TYPES.DREB) {
    summary.reb += 1;
    return summary;
  }

  if (statType === STAT_TYPES.STL) {
    summary.stl += 1;
    return summary;
  }

  if (statType === STAT_TYPES.TOV) {
    summary.tov += 1;
    return summary;
  }

  if (statType === STAT_TYPES.FOUL) {
    summary.foul += 1;
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

function summarizeEventsOneSided(events = []) {
  return summarizeEvents(events);
}

function summarizeEventsBySide(events = []) {
  const summaries = {
    [TEAM_SIDES.HOME]: createEmptyFullTeamStatSummary(),
    [TEAM_SIDES.AWAY]: createEmptyFullTeamStatSummary(),
  };

  for (const event of events) {
    if (!event?.teamSide || !summaries[event.teamSide]) {
      continue;
    }
    applyEventToFullTeamStatSummary(summaries[event.teamSide], event.statType);
  }

  return {
    [TEAM_SIDES.HOME]: finalizeFullTeamStatSummary(summaries[TEAM_SIDES.HOME]),
    [TEAM_SIDES.AWAY]: finalizeFullTeamStatSummary(summaries[TEAM_SIDES.AWAY]),
  };
}

module.exports = {
  createEmptyTeamStatSummary,
  createEmptyFullTeamStatSummary,
  applyEventToTeamStatSummary,
  applyEventToFullTeamStatSummary,
  finalizeTeamStatSummary,
  finalizeFullTeamStatSummary,
  summarizeEvents,
  summarizeEventsOneSided,
  summarizeEventsBySide,
};
