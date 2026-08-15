export const RECENT_FORM_LIMIT = 5;

function gameTime(game) {
  const value = game.completedAt || game.scheduledAt;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function resultFor(teamPoints, opponentPoints) {
  if (teamPoints > opponentPoints) return 'win';
  if (teamPoints < opponentPoints) return 'loss';
  return 'tie';
}

/**
 * Builds a chronological recent-form list for every team in a season, with the
 * newest result on the right (the usual sports-table convention).
 * Only completed games with a usable score contribute to form.
 */
export function buildSeasonFormByTeam(games = [], limit = RECENT_FORM_LIMIT) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : RECENT_FORM_LIMIT;
  const formByTeam = new Map();
  const completedGames = games
    .filter(
      (game) =>
        game.status === 'completed' &&
        game.homeLeagueTeamId &&
        game.awayLeagueTeamId &&
        Number.isFinite(game.homePoints) &&
        Number.isFinite(game.awayPoints)
    )
    .sort((a, b) => gameTime(a) - gameTime(b));

  const addResult = (teamId, result) => {
    const key = String(teamId);
    const current = formByTeam.get(key) || [];
    current.push(result);
    if (current.length > safeLimit) current.shift();
    formByTeam.set(key, current);
  };

  completedGames.forEach((game) => {
    const date = game.completedAt || game.scheduledAt || null;

    addResult(game.homeLeagueTeamId, {
      gameId: game.id,
      result: resultFor(game.homePoints, game.awayPoints),
      opponentTeamId: String(game.awayLeagueTeamId),
      opponentTeamName: game.awayTeamName || 'Unknown Team',
      teamPoints: game.homePoints,
      opponentPoints: game.awayPoints,
      date,
    });

    addResult(game.awayLeagueTeamId, {
      gameId: game.id,
      result: resultFor(game.awayPoints, game.homePoints),
      opponentTeamId: String(game.homeLeagueTeamId),
      opponentTeamName: game.homeTeamName || 'Unknown Team',
      teamPoints: game.awayPoints,
      opponentPoints: game.homePoints,
      date,
    });
  });

  return formByTeam;
}
