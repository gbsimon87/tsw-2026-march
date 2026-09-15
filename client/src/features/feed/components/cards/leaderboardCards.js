import { formatAverage } from '../posts/cardUtils';

// Social backlog rank 8 — league leaders and rankings cards.
//
// The ranking itself is the SERVER's (leagues.service.js `buildCategoryLeaders`):
// `leaders` is the top ten by fantasy score, so a volume scorer who does little
// else never appears in it, and re-sorting that array by PPG would publish the
// wrong name as the league's leading scorer. This module only shapes what the
// server already ranked into something the board can draw.

export const LEADERBOARD_KINDS = Object.freeze(['points', 'rebounds', 'assists', 'table']);

// The table card lists this many teams. Five is a screenful at export size and
// the top of a table is what a post is about.
const TABLE_ROW_LIMIT = 5;

// Form is drawn as up to five result pips; more than that stops reading as a
// shape and starts reading as a barcode.
const FORM_LIMIT = 5;

function rankedPlayerRows(category) {
  return category.rows.map((row, index) => ({
    rank: index + 1,
    name: row.displayName,
    // Carried for the export guard (social backlog rank 9): a leaderboard names
    // up to five people, and the guard matches the restricted ones by id.
    leaguePlayerId: row.leaguePlayerId ?? null,
    teamName: row.teamName || null,
    value: formatAverage(row[category.statKey]),
    // Carried so the card can say a 30.0 average came from one game. An
    // average with no sample behind it is the easiest honest number to read
    // dishonestly.
    gamesCount: row.gamesCount ?? null,
  }));
}

function leaderSlide(category, league, seasonLabel) {
  if (!category?.rows?.length) return null;

  const rows = rankedPlayerRows(category);

  return {
    kind: category.key,
    label: category.label,
    kicker: `${category.abbreviation} LEADERS`,
    serial: seasonLabel || '',
    leagueName: league?.name || 'League',
    teamColors: [],
    rows,
    altText: `${league?.name || 'League'} ${category.label.toLowerCase()} leaders: ${rows
      .map((row) => `${row.rank}. ${row.name} ${row.value}`)
      .join(', ')}.`,
  };
}

function formLetters(form) {
  return (form || [])
    .slice(-FORM_LIMIT)
    .map((entry) => (entry?.result === 'win' ? 'W' : entry?.result === 'loss' ? 'L' : 'D'));
}

function tableSlide({ standings, league, seasonLabel, formByTeam }) {
  const rows = (standings || []).slice(0, TABLE_ROW_LIMIT).map((row, index) => ({
    rank: index + 1,
    name: row.teamName,
    record: row.record || `${row.wins ?? 0}-${row.losses ?? 0}`,
    pointDiff: row.pointDiff,
    form: formLetters(formByTeam?.get?.(String(row.teamId))),
  }));

  // One or two teams is a fixture list, not a table.
  if (rows.length < 3) return null;

  return {
    kind: 'table',
    label: 'League table',
    kicker: 'LEAGUE TABLE',
    serial: seasonLabel || '',
    leagueName: league?.name || 'League',
    teamColors: [],
    rows,
    altText: `${league?.name || 'League'} league table: ${rows
      .map(
        (row) =>
          `${row.rank}. ${row.name} ${row.record}${row.form.length ? `, form ${row.form.join('')}` : ''}`
      )
      .join('; ')}.`,
  };
}

/**
 * The leaderboard cards a league can honestly support right now.
 *
 * A category the server suppressed (fewer than three qualified players) is
 * simply absent — this never renders an empty podium.
 */
export function buildLeaderboardCards({
  league,
  categoryLeaders = [],
  standings = [],
  formByTeam = null,
  seasonLabel = '',
  only = LEADERBOARD_KINDS,
} = {}) {
  const byKey = new Map(categoryLeaders.map((category) => [category.key, category]));

  return only
    .map((kind) =>
      kind === 'table'
        ? tableSlide({ standings, league, seasonLabel, formByTeam })
        : leaderSlide(byKey.get(kind), league, seasonLabel)
    )
    .filter(Boolean);
}
