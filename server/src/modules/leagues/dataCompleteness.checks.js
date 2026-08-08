// Data-completeness check engine. Pure: no I/O, no Mongoose, no clock access —
// `now` is always injected so the 48h boundary is testable.
const OVERDUE_AFTER_MS = 48 * 60 * 60 * 1000;
const MIN_ACTIVE_ROSTER = 5;

const SEVERITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

function teamName(teamsById, leagueTeamId) {
  if (!leagueTeamId) return 'Unknown team';
  return teamsById.get(String(leagueTeamId))?.name ?? 'Unknown team';
}

function matchupLabel(teamsById, game) {
  const home = teamName(teamsById, game.homeLeagueTeamId);
  const away = teamName(teamsById, game.awayLeagueTeamId);
  return `${away} at ${home}`;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function daysAgo(now, date) {
  const days = Math.floor((now.getTime() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function buildGameIssues({ games, teamsById, now }) {
  const issues = [];

  for (const game of games) {
    const label = matchupLabel(teamsById, game);
    const href = `/admin/games/${game.id}`;
    const scheduledAt = game.scheduledAt ? new Date(game.scheduledAt) : null;
    const isPastDue = scheduledAt && now.getTime() - scheduledAt.getTime() > OVERDUE_AFTER_MS;

    if (game.status === 'scheduled' && isPastDue) {
      issues.push({
        issueKey: `overdue_game:${game.id}`,
        checkType: 'overdue_game',
        severity: SEVERITY.HIGH,
        label,
        detail: `Scheduled ${daysAgo(now, scheduledAt)}, never started`,
        href,
        leagueTeamId: null,
      });
    }

    if (game.status === 'in_progress' && isPastDue) {
      issues.push({
        issueKey: `stuck_in_progress:${game.id}`,
        checkType: 'stuck_in_progress',
        severity: SEVERITY.HIGH,
        label,
        detail: `Started ${daysAgo(now, scheduledAt)} and never finalised`,
        href,
        leagueTeamId: null,
      });
    }

    // Only the tracked side is ever expected to carry events (spec D5): in a
    // one_sided game the opponent legitimately has none.
    if (game.status === 'completed' && (game.events?.length ?? 0) === 0) {
      issues.push({
        issueKey: `missing_box_score:${game.id}`,
        checkType: 'missing_box_score',
        severity: SEVERITY.HIGH,
        label,
        detail: 'Marked complete but no stats were recorded',
        href,
        leagueTeamId: game.trackedLeagueTeamId ? String(game.trackedLeagueTeamId) : null,
      });
    }

    // Venue is actionable before tip-off and pointless after, so this check is
    // deliberately future-only.
    const isFuture = scheduledAt && scheduledAt.getTime() > now.getTime();
    if (game.status === 'scheduled' && isFuture && !hasText(game.venue)) {
      issues.push({
        issueKey: `no_venue:${game.id}`,
        checkType: 'no_venue',
        severity: SEVERITY.LOW,
        label,
        detail: 'No venue set',
        href,
        leagueTeamId: null,
      });
    }
  }

  return issues;
}

module.exports = {
  OVERDUE_AFTER_MS,
  MIN_ACTIVE_ROSTER,
  SEVERITY,
  buildGameIssues,
};
