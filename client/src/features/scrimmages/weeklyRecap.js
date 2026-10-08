// Reuse the weekly aggregate supplied by the session API: it already applies
// publication, identity merges, captured scoring rules and MVP eligibility.
export function buildWeeklyRecap({ scrimmage, session, games = [], standings = [], origin = '' }) {
  if (!session.publishedAt) return null;
  const path = `/scrimmage/${scrimmage.id}/sessions/${session.id}?tab=recap`;
  const url = `${origin}${path}`;
  const title = `${scrimmage.name} · ${session.label}`;
  const completedGames = games.filter((game) => game.status === 'completed').length;
  const winner = standings.find((row) => row.eligible) || null;
  const rules = scrimmage.seasons.find((season) => season.id === session.seasonId)?.mvpRules;
  const formula = rules
    ? `MVP = (Points − ${rules.missPenalty} × misses − ${rules.turnoverPenalty} × turnovers + ${rules.winBonus} × wins − ${rules.lossPenalty} × losses) ÷ games played. Minimum ${rules.weeklyMinGames} games.`
    : '';
  const players = standings.map((row) => ({
    ...row,
    stats: `${row.points} points · ${row.fgPercentage == null ? '—' : `${row.fgPercentage.toFixed(1)}%`} FG · ${row.turnovers} turnover${row.turnovers === 1 ? '' : 's'} · ${row.gamesPlayed} game${row.gamesPlayed === 1 ? '' : 's'}`,
    playsPath: `/scrimmage/${scrimmage.id}/players/${row.playerId}?${new URLSearchParams({ seasonId: session.seasonId, sessionId: session.id })}`,
  }));
  const caption = [
    title,
    `${String(session.date).slice(0, 10)} · ${completedGames} completed game${completedGames === 1 ? '' : 's'}`,
    winner
      ? `Weekly MVP: ${winner.displayName} (${winner.mvpScore.toFixed(2)})`
      : 'No eligible weekly MVP yet.',
    ...players.map(
      (player) =>
        `${player.displayName}: ${player.stats} · MVP ${player.mvpScore.toFixed(2)}${player.eligible ? '' : ' (provisional)'}`
    ),
    formula,
    `Full results and player video plays: ${url}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { title, url, path, completedGames, winner, players, formula, caption };
}
