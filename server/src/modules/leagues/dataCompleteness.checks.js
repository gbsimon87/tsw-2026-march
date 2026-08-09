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

function buildRosterIssues({ teams, players, statsByPlayerId, completedGameTeamIds }) {
  const issues = [];
  const activeByTeam = new Map();

  for (const player of players) {
    if (!player.isActive) continue;
    const teamId = String(player.leagueTeamId);
    activeByTeam.set(teamId, (activeByTeam.get(teamId) ?? 0) + 1);

    const teamHasPlayed = completedGameTeamIds.has(teamId);
    const gamesCount = statsByPlayerId.get(String(player.id))?.gamesCount ?? 0;

    // Before a team's first completed game every player has zero appearances,
    // and none of it is a problem — so this check needs the played guard.
    if (teamHasPlayed && gamesCount === 0) {
      issues.push({
        issueKey: `no_appearances:${player.id}`,
        checkType: 'no_appearances',
        severity: SEVERITY.MEDIUM,
        label: player.displayName,
        detail: 'On the roster but has no recorded appearances this season',
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }

    // Number 0 is a legal jersey, so test for null/undefined, not falsiness.
    if (player.jerseyNumber === null || player.jerseyNumber === undefined) {
      issues.push({
        issueKey: `missing_jersey:${player.id}`,
        checkType: 'missing_jersey',
        severity: SEVERITY.LOW,
        label: player.displayName,
        detail: 'No jersey number set',
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }

    // A league player's avatar comes from the account that claimed them
    // (claimedByUserId -> User.avatar.url), so "no picture" really means
    // "unclaimed". A claimed player who hasn't set an avatar is a personal
    // account setting no admin can act on, and is deliberately not flagged.
    if (!player.claimedByUserId) {
      issues.push({
        issueKey: `unclaimed_player:${player.id}`,
        checkType: 'unclaimed_player',
        severity: SEVERITY.LOW,
        label: player.displayName,
        detail: 'Unclaimed — no profile photo, follows, or shareable card',
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }
  }

  for (const team of teams) {
    const teamId = String(team.id);
    const activeCount = activeByTeam.get(teamId) ?? 0;

    if (activeCount < MIN_ACTIVE_ROSTER) {
      issues.push({
        issueKey: `roster_too_small:${teamId}`,
        checkType: 'roster_too_small',
        severity: SEVERITY.MEDIUM,
        label: team.name,
        detail: `Only ${activeCount} active ${activeCount === 1 ? 'player' : 'players'} (needs ${MIN_ACTIVE_ROSTER})`,
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }

    if (!team.logo) {
      issues.push({
        issueKey: `no_logo:${teamId}`,
        checkType: 'no_logo',
        severity: SEVERITY.LOW,
        label: team.name,
        detail: 'No team logo',
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
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
  buildRosterIssues,
};
