// Social backlog rank 2 — the per-game player stat card.
//
// This builds the SAME shape the server's buildPlayerGameCardSnapshot
// (feed.service.js) persists onto a player_game_card post, so one renderer
// serves both the downloadable PNG and the card in The Pulse. If you change a
// field here, change it there.

// One context stat beside PTS/REB/AST. Ordered by how much a basketball
// audience reads into it, each behind a threshold that says "this is worth
// pointing at" — and every branch reports something the box score actually
// recorded. Nothing here computes a stat that was never tracked.
const CONTEXT_STAT_RULES = [
  { key: 'fg3m', label: '3-pointers', min: 3 },
  { key: 'blk', label: 'Blocks', min: 2 },
  { key: 'stl', label: 'Steals', min: 3 },
];

export function pickContextStat(stats) {
  const notable = CONTEXT_STAT_RULES.find((rule) => (stats?.[rule.key] ?? 0) >= rule.min);
  if (notable) {
    return { label: notable.label, value: String(stats[notable.key]) };
  }

  const made = (stats?.fg2m ?? 0) + (stats?.fg3m ?? 0);
  const attempted = (stats?.fg2a ?? 0) + (stats?.fg3a ?? 0);
  return { label: 'Field goals', value: `${made}/${attempted}` };
}

function resultLabel({ teamPoints, opponentPoints, hasOpponentScore }) {
  // A one-sided game where nobody tracked the opponent's scoring has no result
  // to report, and "W 78-0" would be a fabricated claim.
  if (!hasOpponentScore) {
    return null;
  }

  const outcome = teamPoints > opponentPoints ? 'W' : teamPoints < opponentPoints ? 'L' : 'D';
  return `${outcome} ${teamPoints}–${opponentPoints}`;
}

export function buildPlayerGameCard({ data, row, rosterPlayer = null, side = null }) {
  if (!row) {
    return null;
  }

  const isDualTeam = data?.game?.trackingMode === 'dual_team';
  const team = isDualTeam ? data?.participants?.[side] : data?.team;
  const opponent = isDualTeam ? data?.participants?.[side === 'home' ? 'away' : 'home'] : null;

  const summary = data?.gameSummary || {};
  const teamPoints = isDualTeam
    ? ((side === 'home' ? summary.homePoints : summary.awayPoints) ?? 0)
    : (summary.teamPoints ?? 0);
  const opponentPoints = isDualTeam
    ? ((side === 'home' ? summary.awayPoints : summary.homePoints) ?? 0)
    : (summary.opponentPoints ?? 0);

  const playerImage = rosterPlayer?.avatarUrl ? { url: rosterPlayer.avatarUrl } : null;
  const teamLogo = team?.logo ?? null;

  return {
    gameId: data.game.id,
    gameUrl: `/games/${data.game.id}`,
    playerId: row.leaguePlayerId ? null : (row.playerId ?? null),
    leaguePlayerId: row.leaguePlayerId ?? null,
    playerName: row.displayName,
    jerseyNumber: rosterPlayer?.jerseyNumber ?? null,
    playerImage,
    // Shared Design Requirements: a team logo may stand in for a missing photo,
    // but the card has to be able to say that it did rather than pass a crest
    // off as a face.
    imageFallback: playerImage ? 'player' : teamLogo ? 'team_logo' : 'placeholder',
    teamName: team?.name ?? team?.displayName ?? null,
    teamLogo,
    teamColors: team?.colors ?? [],
    opponentName: isDualTeam
      ? (opponent?.displayName ?? null)
      : (data?.recap?.opponent?.name ?? data?.game?.opponent ?? null),
    resultLabel: resultLabel({
      teamPoints,
      opponentPoints,
      // A dual-team game always has both sides tracked.
      hasOpponentScore: isDualTeam ? true : Boolean(summary.hasOpponentScore),
    }),
    playedOn: data?.game?.completedAt ?? data?.game?.scheduledAt ?? null,
    stats: {
      points: row.points ?? 0,
      reb: row.reb ?? 0,
      ast: row.ast ?? 0,
      stl: row.stl ?? 0,
      blk: row.blk ?? 0,
      fg2m: row.fg2m ?? 0,
      fg2a: row.fg2a ?? 0,
      fg3m: row.fg3m ?? 0,
      fg3a: row.fg3a ?? 0,
      ftm: row.ftm ?? 0,
      fta: row.fta ?? 0,
      tov: row.tov ?? 0,
      foul: row.foul ?? 0,
    },
  };
}

// A card reading 0/0/0 is not worth sharing, and the team-total row is not a
// player at all — the row action stays hidden for both.
export function hasShareableLine(row) {
  if (!row || row.isTeamTotal) {
    return false;
  }

  return ['points', 'reb', 'ast', 'stl', 'blk'].some((key) => (row[key] ?? 0) > 0);
}
