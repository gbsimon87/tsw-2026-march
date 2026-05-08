const { summarizeEvents, summarizeEventsBySide } = require('../shared/statSummary');

const MOMENT_PRIORITY = {
  OPP_FG3_MADE: 5,
  FG3_MADE: 5,
  OPP_FG2_MADE: 4,
  FG2_MADE: 4,
  AST: 3,
  OPP_FT_MADE: 2,
  FT_MADE: 2,
  DREB: 1,
  OREB: 1,
};

const MOMENT_LABELS = {
  OPP_FG3_MADE: 'Opponent 3PT Make',
  FG3_MADE: '3PT Make',
  OPP_FG2_MADE: 'Opponent 2PT Make',
  FG2_MADE: '2PT Make',
  AST: 'Assist',
  OPP_FT_MADE: 'Opponent FT Make',
  FT_MADE: 'FT Make',
  DREB: 'Defensive Rebound',
  OREB: 'Offensive Rebound',
};

function formatStatusLabel(status) {
  if (status === 'completed') {
    return 'Final';
  }
  if (status === 'in_progress') {
    return 'In Progress';
  }
  return 'Scheduled';
}

function buildTopPerformers(boxScore) {
  const rows = Array.isArray(boxScore) ? boxScore : boxScore?.players || [];
  return [...rows]
    .sort((left, right) => {
      if (right.points !== left.points) {
        return right.points - left.points;
      }
      if (right.reb !== left.reb) {
        return right.reb - left.reb;
      }
      if (right.ast !== left.ast) {
        return right.ast - left.ast;
      }
      return left.displayName.localeCompare(right.displayName);
    })
    .slice(0, 3)
    .map((row) => ({
      playerId: row.playerId,
      leaguePlayerId: row.leaguePlayerId || null,
      displayName: row.displayName,
      points: row.points,
      reb: row.reb,
      ast: row.ast,
      teamSide: row.teamSide || null,
      teamName: row.teamName || null,
    }));
}

function buildKeyMoments(events, playersById) {
  return [...(events || [])]
    .filter((event) => MOMENT_PRIORITY[event.statType])
    .sort((left, right) => {
      const leftPriority = MOMENT_PRIORITY[left.statType] || 0;
      const rightPriority = MOMENT_PRIORITY[right.statType] || 0;
      if (rightPriority !== leftPriority) {
        return rightPriority - leftPriority;
      }
      return new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime();
    })
    .slice(0, 5)
    .map((event) => ({
      eventId: String(event._id || event.id),
      playerId: event.playerId ? String(event.playerId) : null,
      playerName: event.playerId
        ? playersById.get(String(event.playerId)) || 'Unknown Player'
        : 'Opponent',
      statType: event.statType,
      statLabel: MOMENT_LABELS[event.statType] || event.statType,
      occurredAt: event.occurredAt || null,
    }));
}

function buildShotSnapshot(events, playersById) {
  const shotEvents = (events || []).filter(
    (event) =>
      (event.statType === 'FG2_MADE' ||
        event.statType === 'FG2_MISS' ||
        event.statType === 'FG3_MADE' ||
        event.statType === 'FG3_MISS') &&
      typeof event.x === 'number' &&
      typeof event.y === 'number'
  );

  return {
    made: shotEvents.filter((event) => event.statType.endsWith('_MADE')).length,
    missed: shotEvents.filter((event) => event.statType.endsWith('_MISS')).length,
    events: shotEvents.map((event) => ({
      id: String(event._id || event.id),
      playerId: String(event.playerId),
      playerName: playersById.get(String(event.playerId)) || 'Unknown Player',
      statType: event.statType,
      zoneId: event.zoneId ?? null,
      x: event.x,
      y: event.y,
    })),
  };
}

function buildGameRecap(game, team, boxScore) {
  if (game?.trackingMode === 'dual_team') {
    const bySide = summarizeEventsBySide(game?.events || []);
    const players = [
      ...(team?.home?.players || []).map((player) => ({
        ...player,
        side: 'home',
      })),
      ...(team?.away?.players || []).map((player) => ({
        ...player,
        side: 'away',
      })),
    ];
    const playersById = new Map(
      players.map((player) => [String(player._id || player.id), player.displayName])
    );

    return {
      statusLabel: formatStatusLabel(game?.status),
      home: {
        name: team?.home?.displayName || 'Home',
        points: boxScore?.home?.totals?.points || 0,
      },
      away: {
        name: team?.away?.displayName || 'Away',
        points: boxScore?.away?.totals?.points || 0,
      },
      playedAt: game?.completedAt || game?.scheduledAt || game?.createdAt || null,
      topPerformers: buildTopPerformers([
        ...(boxScore?.home?.players || []).map((p) => ({
          ...p,
          teamSide: 'home',
          teamName: team?.home?.displayName || 'Home',
        })),
        ...(boxScore?.away?.players || []).map((p) => ({
          ...p,
          teamSide: 'away',
          teamName: team?.away?.displayName || 'Away',
        })),
      ]),
      homeStats: {
        points: boxScore?.home?.totals?.points || 0,
        fg2: bySide.home.fg2,
        fg3: bySide.home.fg3,
        ft: bySide.home.ft,
        reb: boxScore?.home?.totals?.reb || 0,
        ast: boxScore?.home?.totals?.ast || 0,
        stl: boxScore?.home?.totals?.stl || 0,
        blk: boxScore?.home?.totals?.blk || 0,
        tov: boxScore?.home?.totals?.tov || 0,
        foul: boxScore?.home?.totals?.foul || 0,
      },
      awayStats: {
        points: boxScore?.away?.totals?.points || 0,
        fg2: bySide.away.fg2,
        fg3: bySide.away.fg3,
        ft: bySide.away.ft,
        reb: boxScore?.away?.totals?.reb || 0,
        ast: boxScore?.away?.totals?.ast || 0,
        stl: boxScore?.away?.totals?.stl || 0,
        blk: boxScore?.away?.totals?.blk || 0,
        tov: boxScore?.away?.totals?.tov || 0,
        foul: boxScore?.away?.totals?.foul || 0,
      },
      teamStats: {
        points: boxScore?.home?.totals?.points || 0,
        fg2: bySide.home.fg2,
        fg3: bySide.home.fg3,
        ft: bySide.home.ft,
        reb: boxScore?.home?.totals?.reb || 0,
        ast: boxScore?.home?.totals?.ast || 0,
        stl: boxScore?.home?.totals?.stl || 0,
        blk: boxScore?.home?.totals?.blk || 0,
        tov: boxScore?.home?.totals?.tov || 0,
        foul: boxScore?.home?.totals?.foul || 0,
      },
      keyMoments: buildKeyMoments(game?.events || [], playersById),
      shotSnapshot: buildShotSnapshot(game?.events || [], playersById),
    };
  }

  const playersById = new Map(
    (team?.players || []).map((player) => [String(player._id || player.id), player.displayName])
  );
  const teamSummary = summarizeEvents(game?.events || []);

  return {
    statusLabel: formatStatusLabel(game?.status),
    team: {
      id: String(team?._id || team?.id),
      name: team?.name || 'Team',
      points: boxScore?.teamTotals?.points || 0,
    },
    opponent: {
      name: game?.opponent ?? null,
      points: boxScore?.opponentTotals?.points || 0,
    },
    playedAt: game?.completedAt || game?.scheduledAt || game?.createdAt || null,
    topPerformers: buildTopPerformers(boxScore),
    teamStats: {
      points: boxScore?.teamTotals?.points || 0,
      fg2: teamSummary.fg2,
      fg3: teamSummary.fg3,
      ft: teamSummary.ft,
      reb: boxScore?.teamTotals?.reb || 0,
      ast: boxScore?.teamTotals?.ast || 0,
      stl: boxScore?.teamTotals?.stl || 0,
      blk: boxScore?.teamTotals?.blk || 0,
      tov: boxScore?.teamTotals?.tov || 0,
      foul: boxScore?.teamTotals?.foul || 0,
    },
    keyMoments: buildKeyMoments(game?.events || [], playersById),
    shotSnapshot: buildShotSnapshot(game?.events || [], playersById),
  };
}

module.exports = {
  buildGameRecap,
};
