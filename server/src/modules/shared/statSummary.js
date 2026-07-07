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
    blk: 0,
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

  if (statType === STAT_TYPES.BLK) {
    summary.blk += 1;
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

// Per-player box-score line accumulator (OPT-006). Shared by games and leagues
// services so live-read and write-time materialisation stay in lockstep.
function createEmptyPlayerStatLine(playerId, displayName, options = {}) {
  return {
    playerId,
    ...(options.includeLeaguePlayerId
      ? { leaguePlayerId: options.leaguePlayerId ? String(options.leaguePlayerId) : null }
      : {}),
    displayName,
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
    reb: 0,
    points: 0,
  };
}

function applyEventToPlayerStatLine(line, statType) {
  if (statType === STAT_TYPES.FT_MADE) {
    line.ftm += 1;
    line.fta += 1;
    line.points += 1;
    return line;
  }
  if (statType === STAT_TYPES.FT_MISS) {
    line.fta += 1;
    return line;
  }
  if (statType === STAT_TYPES.FG2_MADE) {
    line.fg2m += 1;
    line.fg2a += 1;
    line.points += 2;
    return line;
  }
  if (statType === STAT_TYPES.FG2_MISS) {
    line.fg2a += 1;
    return line;
  }
  if (statType === STAT_TYPES.FG3_MADE) {
    line.fg3m += 1;
    line.fg3a += 1;
    line.points += 3;
    return line;
  }
  if (statType === STAT_TYPES.FG3_MISS) {
    line.fg3a += 1;
    return line;
  }
  if (statType === STAT_TYPES.AST) {
    line.ast += 1;
    return line;
  }
  if (statType === STAT_TYPES.OREB) {
    line.oreb += 1;
    line.reb += 1;
    return line;
  }
  if (statType === STAT_TYPES.DREB) {
    line.dreb += 1;
    line.reb += 1;
    return line;
  }
  if (statType === STAT_TYPES.STL) {
    line.stl += 1;
    return line;
  }
  if (statType === STAT_TYPES.BLK) {
    line.blk += 1;
    return line;
  }
  if (statType === STAT_TYPES.TOV) {
    line.tov += 1;
    return line;
  }
  if (statType === STAT_TYPES.FOUL) {
    line.foul += 1;
  }
  return line;
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
  createEmptyPlayerStatLine,
  applyEventToTeamStatSummary,
  applyEventToFullTeamStatSummary,
  applyEventToPlayerStatLine,
  finalizeTeamStatSummary,
  finalizeFullTeamStatSummary,
  summarizeEvents,
  summarizeEventsOneSided,
  summarizeEventsBySide,
};
