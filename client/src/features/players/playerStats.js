export const PLAYER_STAT_CATEGORIES = [
  { value: 'all', label: 'All statistics' },
  { value: 'scoring', label: 'Scoring' },
  { value: 'rebounding', label: 'Rebounding' },
  { value: 'playmaking', label: 'Playmaking' },
  { value: 'defense', label: 'Defense' },
];

const CATEGORY_STAT_IDS = {
  all: ['ft', 'fg2', 'fg3', 'ast', 'stl', 'blk', 'tov', 'foul', 'oreb', 'dreb', 'reb', 'points'],
  scoring: ['ft', 'fg2', 'fg3', 'points'],
  rebounding: ['oreb', 'dreb', 'reb'],
  playmaking: ['ast', 'tov'],
  defense: ['stl', 'blk', 'foul'],
};

export function getCategoryStatIds(category) {
  return CATEGORY_STAT_IDS[category] || CATEGORY_STAT_IDS.all;
}

function gameDate(game) {
  const rawValue = game.date || game.completedAt || game.scheduledAt || game.createdAt || null;
  const parsed = rawValue ? new Date(rawValue) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

export function getGameSeasonKey(game) {
  if (game.seasonId) return `season:${game.seasonId}`;
  const date = gameDate(game);
  return date ? `year:${date.getFullYear()}` : 'undated';
}

export function buildPlayerSeasonOptions(games = [], seasons = []) {
  const seasonById = new Map(seasons.map((season) => [String(season.id), season]));
  const seen = new Map();

  games.forEach((game) => {
    const key = getGameSeasonKey(game);
    if (seen.has(key)) return;

    if (key.startsWith('season:')) {
      const id = key.slice('season:'.length);
      const season = seasonById.get(id);
      seen.set(key, season?.label || 'Unlabelled season');
      return;
    }

    if (key.startsWith('year:')) {
      seen.set(key, `${key.slice('year:'.length)} season`);
      return;
    }

    seen.set(key, 'Date unavailable');
  });

  return Array.from(seen, ([value, label]) => ({ value, label }));
}

export function filterPlayerGamesBySeason(games = [], seasonKey = 'all') {
  if (seasonKey === 'all') return games;
  return games.filter((game) => getGameSeasonKey(game) === seasonKey);
}

export function summarizePlayerGames(games = []) {
  const totals = games.reduce(
    (summary, game) => {
      const stats = game.stats || {};
      return {
        ftm: summary.ftm + (stats.ftm || 0),
        fta: summary.fta + (stats.fta || 0),
        fg2m: summary.fg2m + (stats.fg2m || 0),
        fg2a: summary.fg2a + (stats.fg2a || 0),
        fg3m: summary.fg3m + (stats.fg3m || 0),
        fg3a: summary.fg3a + (stats.fg3a || 0),
        ast: summary.ast + (stats.ast || 0),
        oreb: summary.oreb + (stats.oreb || 0),
        dreb: summary.dreb + (stats.dreb || 0),
        stl: summary.stl + (stats.stl || 0),
        blk: summary.blk + (stats.blk || 0),
        tov: summary.tov + (stats.tov || 0),
        foul: summary.foul + (stats.foul || 0),
        reb: summary.reb + (stats.reb || 0),
        points: summary.points + (stats.points || 0),
      };
    },
    {
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
    }
  );
  const gamesCount = games.length;
  const perGame = (value) => (gamesCount > 0 ? value / gamesCount : 0);

  return {
    ...totals,
    gamesCount,
    pointsPerGame: perGame(totals.points),
    reboundsPerGame: perGame(totals.reb),
    assistsPerGame: perGame(totals.ast),
    stealsPerGame: perGame(totals.stl),
    blocksPerGame: perGame(totals.blk),
    turnoversPerGame: perGame(totals.tov),
    foulsPerGame: perGame(totals.foul),
  };
}
