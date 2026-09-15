import { formatCompactDate } from '../posts/cardUtils';

// Social backlog rank 7 — the box-score breakdown carousel.
//
// Four ordered 4:5 slides sharing one template: the result, how the teams
// compared, who carried it, and one call to action. The template is literally
// shared — every slide renders inside the same `Board` the game, player, team
// and milestone exports use (boardExportParts.jsx), so a carousel cannot drift
// from the single cards beside it in a feed.
//
// This module is the DATA half: it decides which slides a given game can
// honestly support, and what each one says. Nothing here computes a stat; a
// slide whose source is missing is dropped rather than rendered empty.

export const SLIDE_KINDS = Object.freeze(['result', 'comparison', 'performers', 'cta']);

const CTA_HEADLINE = 'Every stat, tracked live.';
const CTA_LINES = ['Full box score, shot chart and play-by-play', 'on the game page.'];

function number(value) {
  return Number.isFinite(value) ? value : null;
}

function percent(shot) {
  const value = shot?.percentage;
  return Number.isFinite(value) ? `${Math.round(value)}%` : null;
}

// A column is only worth putting on the comparison slide if SOMETHING was
// recorded for it. An all-null column is a column of dashes.
function statColumn(name, stats) {
  if (!stats) return null;

  const column = {
    name: name || 'Team',
    points: number(stats.points) ?? 0,
    rows: [
      { label: '2PT', value: percent(stats.fg2) },
      { label: '3PT', value: percent(stats.fg3) },
      { label: 'FT', value: percent(stats.ft) },
      { label: 'REB', value: number(stats.reb) },
      { label: 'AST', value: number(stats.ast) },
    ].filter((row) => row.value != null),
  };

  return column.rows.length ? column : null;
}

function resultSlide(data) {
  const recap = data?.recap;
  const isDualTeam = data?.game?.trackingMode === 'dual_team';

  const home = isDualTeam
    ? { name: recap?.home?.name || 'Home', points: recap?.home?.points ?? 0 }
    : { name: recap?.team?.name || data?.team?.name || 'Team', points: recap?.team?.points ?? 0 };
  const away = isDualTeam
    ? { name: recap?.away?.name || 'Away', points: recap?.away?.points ?? 0 }
    : {
        name: recap?.opponent?.name || data?.game?.opponent || 'Opponent',
        points: recap?.opponent?.points ?? 0,
      };

  return {
    kind: 'result',
    label: 'Result',
    kicker: (recap?.statusLabel || 'Final').toUpperCase(),
    serial: formatCompactDate(recap?.playedAt || data?.game?.completedAt),
    teamColors: data?.team?.colors ?? [],
    home,
    away,
    altText: `Final score slide: ${home.name} ${home.points}, ${away.name} ${away.points}.`,
  };
}

function comparisonSlide(data) {
  const recap = data?.recap;
  const isDualTeam = data?.game?.trackingMode === 'dual_team';

  // A one-sided game intentionally tracks ONE roster (see Constraints in
  // docs/ideas.md), so there is no opponent breakdown to compare against. The
  // slide shows the one column that exists and says so in its kicker, rather
  // than inventing a second or being dropped entirely.
  const columns = isDualTeam
    ? [
        statColumn(recap?.home?.name, recap?.homeStats),
        statColumn(recap?.away?.name, recap?.awayStats),
      ].filter(Boolean)
    : [statColumn(recap?.team?.name || data?.team?.name, recap?.teamStats)].filter(Boolean);

  if (!columns.length) return null;

  const summarise = (column) =>
    `${column.name} ${column.points} points, ${column.rows.map((row) => `${row.label} ${row.value}`).join(', ')}`;

  return {
    kind: 'comparison',
    label: columns.length > 1 ? 'Team comparison' : 'Team totals',
    kicker: columns.length > 1 ? 'HOW IT WAS WON' : 'TEAM TOTALS',
    serial: '',
    teamColors: data?.team?.colors ?? [],
    columns,
    altText: `Team ${columns.length > 1 ? 'comparison' : 'totals'} slide: ${columns
      .map(summarise)
      .join('. ')}.`,
  };
}

function performersSlide(data) {
  const rows = (data?.recap?.topPerformers || [])
    .slice(0, 3)
    .map((performer) => ({
      name: performer.displayName,
      // For the export guard (rank 9). The kit masks recap.topPerformers before
      // slides are built, so these are usually already masked; carrying the ids
      // means a slide built from an unguarded payload is still catchable.
      leaguePlayerId: performer.leaguePlayerId ?? null,
      playerId: performer.playerId ?? null,
      teamName: performer.teamName || null,
      points: number(performer.points) ?? 0,
      reb: number(performer.reb),
      ast: number(performer.ast),
    }))
    // A line of zeroes is not a top performance, and a row with no name is not
    // a person.
    .filter((row) => row.name && (row.points > 0 || row.reb > 0 || row.ast > 0));

  if (!rows.length) return null;

  const statLine = (row) =>
    [
      `${row.points} PTS`,
      row.reb == null ? null : `${row.reb} REB`,
      row.ast == null ? null : `${row.ast} AST`,
    ]
      .filter(Boolean)
      .join(', ');

  return {
    kind: 'performers',
    label: 'Top performers',
    kicker: 'WHO CARRIED IT',
    serial: '',
    teamColors: data?.team?.colors ?? [],
    rows: rows.map((row) => ({ ...row, line: statLine(row) })),
    altText: `Top performers slide: ${rows.map((row) => `${row.name} ${statLine(row)}`).join('; ')}.`,
  };
}

function ctaSlide(data, attributionUrl) {
  // The URL is shown without its scheme: it is read off a screen and typed, and
  // "https://" is four words of nothing on a poster.
  const readable = attributionUrl ? attributionUrl.replace(/^https?:\/\//, '') : null;

  return {
    kind: 'cta',
    label: 'Call to action',
    kicker: 'SEE THE FULL GAME',
    serial: '',
    teamColors: data?.team?.colors ?? [],
    headline: CTA_HEADLINE,
    lines: CTA_LINES,
    link: readable,
    altText: `Call to action slide: ${CTA_HEADLINE} ${CTA_LINES.join(' ')}${
      readable ? ` Link: ${readable}.` : ''
    }`,
  };
}

/**
 * The ordered slides a completed game can support.
 *
 * `only` restricts the set — the kit's reorder/remove controls pass the kinds
 * still selected, so removing a slide never needs a code change.
 */
export function buildCarouselSlides(data, { attributionUrl = '', only = SLIDE_KINDS } = {}) {
  if (data?.game?.status !== 'completed') return [];

  const builders = {
    result: () => resultSlide(data),
    comparison: () => comparisonSlide(data),
    performers: () => performersSlide(data),
    cta: () => ctaSlide(data, attributionUrl),
  };

  return only
    .filter((kind) => builders[kind])
    .map((kind) => builders[kind]())
    .filter(Boolean);
}
