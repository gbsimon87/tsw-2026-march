const DEFAULT_MVP_RULES = Object.freeze({
  missPenalty: 1,
  turnoverPenalty: 2,
  winBonus: 2,
  lossPenalty: 1,
  weeklyMinGames: 3,
  seasonMinGames: 6,
  seasonMinWeeks: 2,
});
const ALLOWED_STATS = new Set([
  'FG2_MADE',
  'FG2_MISS',
  'FG3_MADE',
  'FG3_MISS',
  'TOV',
  'SUB_IN',
  'SUB_OUT',
]);

// Attendance counts through the starting lineup and substitutions, including players
// who never record a statistical event. Merely being on the bench is not an appearance.
function aggregateScrimmageStats(games, rules = DEFAULT_MVP_RULES, scope = 'weekly') {
  const settings = { ...DEFAULT_MVP_RULES, ...rules };
  const players = new Map();
  for (const game of games) {
    if (game.status !== 'completed') continue;
    const scores = { home: 0, away: 0 };
    for (const event of game.events || []) {
      if (!(event.teamSide in scores)) continue;
      if (event.statType === 'FG2_MADE')
        scores[event.teamSide] += game.scoringRules?.insideArc ?? 2;
      if (event.statType === 'FG3_MADE')
        scores[event.teamSide] += game.scoringRules?.outsideArc ?? 3;
    }
    for (const side of ['home', 'away']) {
      const appearances = new Set((game[`${side}StartingLineupPlayerIds`] || []).map(String));
      for (const event of game.events || []) {
        if (event.teamSide === side && event.playerId && event.statType !== 'SUB_OUT')
          appearances.add(String(event.playerId));
      }
      for (const player of game[`${side}RosterSnapshot`] || []) {
        const id = String(player._id || player.id);
        if (!appearances.has(id)) continue;
        if (!players.has(id))
          players.set(id, {
            playerId: id,
            displayName: player.displayName,
            points: 0,
            makes: 0,
            misses: 0,
            attempts: 0,
            turnovers: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            gamesPlayed: 0,
            weeks: new Set(),
          });
        const row = players.get(id);
        row.gamesPlayed += 1;
        row.weeks.add(String(game.scrimmageSessionId));
        const opponent = side === 'home' ? 'away' : 'home';
        if (scores[side] > scores[opponent]) row.wins += 1;
        else if (scores[side] < scores[opponent]) row.losses += 1;
        else row.draws += 1;
        for (const event of game.events || []) {
          if (event.teamSide !== side || String(event.playerId) !== id) continue;
          if (event.statType === 'FG2_MADE' || event.statType === 'FG3_MADE') {
            row.makes += 1;
            row.points +=
              event.statType === 'FG2_MADE'
                ? (game.scoringRules?.insideArc ?? 2)
                : (game.scoringRules?.outsideArc ?? 3);
          } else if (event.statType === 'FG2_MISS' || event.statType === 'FG3_MISS')
            row.misses += 1;
          else if (event.statType === 'TOV') row.turnovers += 1;
        }
      }
    }
  }
  return [...players.values()]
    .map(({ weeks, ...row }) => {
      const attempts = row.makes + row.misses;
      const contribution =
        row.points -
        settings.missPenalty * row.misses -
        settings.turnoverPenalty * row.turnovers +
        settings.winBonus * row.wins -
        settings.lossPenalty * row.losses;
      return {
        ...row,
        attempts,
        weeksPlayed: weeks.size,
        fgPercentage: attempts ? (100 * row.makes) / attempts : null,
        contribution,
        mvpScore: contribution / row.gamesPlayed,
        eligible:
          scope === 'weekly'
            ? row.gamesPlayed >= settings.weeklyMinGames
            : row.gamesPlayed >= settings.seasonMinGames && weeks.size >= settings.seasonMinWeeks,
      };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.mvpScore - a.mvpScore ||
        (b.fgPercentage ?? -1) - (a.fgPercentage ?? -1) ||
        b.wins - a.wins ||
        a.turnovers - b.turnovers ||
        a.displayName.localeCompare(b.displayName)
    );
}

function validateGameRosters(assignments, payload) {
  const assigned = new Map(assignments.map((p) => [String(p.playerId), p]));
  if (payload.homeColor === payload.awayColor) return 'Select two different colors';
  const allIds = new Set();
  for (const side of ['home', 'away']) {
    const numbers = new Set();
    const roster = payload[`${side}Players`];
    if (!roster || roster.length < 1 || roster.length > 5)
      return 'Select one to five players for each side';
    for (const entry of roster) {
      const player = assigned.get(String(entry.playerId));
      if (!player || player.color !== payload[`${side}Color`])
        return 'Players must belong to their assigned weekly color';
      if (allIds.has(String(entry.playerId))) return 'A player can appear only once in a game';
      allIds.add(String(entry.playerId));
      if (entry.jerseyNumber != null) {
        if (numbers.has(entry.jerseyNumber)) return 'Jersey numbers must be unique within a color';
        numbers.add(entry.jerseyNumber);
      }
    }
  }
  return null;
}
module.exports = { DEFAULT_MVP_RULES, ALLOWED_STATS, aggregateScrimmageStats, validateGameRosters };
