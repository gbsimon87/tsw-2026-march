import { Link } from 'react-router-dom';
import { getGameHeaderImage, getLeagueHeaderImage } from '../../feed/cardImage';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';

function formatDateTime(value) {
  if (!value) {
    return 'Date unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleString();
}

function getStatusLabel(game, recap) {
  if (recap?.statusLabel) {
    return recap.statusLabel;
  }

  if (game?.status === 'completed' || game?.status === 'finished') {
    return 'Final';
  }

  if (game?.status === 'in_progress' || game?.status === 'live') {
    return 'Live';
  }

  return game?.status || 'Game Detail';
}

function getScoreboardTeams({ game, team, participants, isDualTeam, recap }) {
  if (isDualTeam) {
    return {
      homeName: participants?.home?.displayName || 'Home',
      awayName: participants?.away?.displayName || 'Away',
    };
  }

  return {
    homeName: recap?.team?.name || team?.name || 'Team',
    awayName: recap?.opponent?.name || game?.opponent || 'Opponent',
  };
}

function getMatchupTitle({ game, team, participants, isDualTeam, recap }) {
  if (isDualTeam) {
    return `${participants?.away?.displayName || 'Away'} at ${
      participants?.home?.displayName || 'Home'
    }`;
  }

  const teamName = recap?.team?.name || team?.name || 'Team';
  const opponentName = recap?.opponent?.name || game?.opponent;

  return opponentName ? `${teamName} vs ${opponentName}` : game?.title || teamName;
}

export function GameDetailHeader({
  gameId,
  game,
  team,
  league = null,
  participants,
  isDualTeam = false,
  recap,
  gameSummary,
  canContinueTracking = false,
  actions = null,
  className = '',
}) {
  const statusLabel = getStatusLabel(game, recap);
  const { homeName, awayName } = getScoreboardTeams({
    game,
    team,
    participants,
    isDualTeam,
    recap,
  });
  const homePoints = isDualTeam ? gameSummary?.homePoints || 0 : gameSummary?.teamPoints || 0;
  const awayPoints = isDualTeam ? gameSummary?.awayPoints || 0 : gameSummary?.opponentPoints || 0;
  const matchupTitle = getMatchupTitle({ game, team, participants, isDualTeam, recap });

  return (
    <section
      className={`rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 md:p-8 ${className}`}
    >
      <h1 className="sr-only">{matchupTitle}</h1>
      <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {statusLabel}
          </span>
          <span className="text-xs text-slate-400">
            {formatDateTime(recap?.playedAt || game?.scheduledAt || game?.createdAt)}
          </span>
        </div>
        <div className="space-y-3 px-4 py-4">
          {[
            {
              logo: isDualTeam
                ? participants?.home?.logo?.url || teamPlaceholder
                : game?.gameContext === 'league'
                  ? getLeagueHeaderImage(league)
                  : getGameHeaderImage(team),
              name: homeName,
              points: homePoints,
              won: homePoints > awayPoints,
            },
            {
              logo: isDualTeam ? participants?.away?.logo?.url || teamPlaceholder : teamPlaceholder,
              name: awayName,
              points: awayPoints,
              won: awayPoints > homePoints,
            },
          ].map((side) => (
            <div key={side.name} className="flex items-center gap-3">
              <img
                src={side.logo}
                alt={`${side.name} logo`}
                className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
              />
              <span
                className={`flex-1 truncate text-sm font-semibold ${side.won ? 'text-slate-900' : 'text-slate-500'}`}
              >
                {side.name}
              </span>
              <span
                className={`tabular-nums text-3xl font-bold md:text-4xl ${side.won ? 'text-slate-900' : 'text-slate-400'}`}
              >
                {side.points}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {team?.id && !isDualTeam ? (
          <Link
            to={`/teams/${team.id}`}
            className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            View Team
          </Link>
        ) : null}
      </div>

      {canContinueTracking ? (
        <div className="mt-4">
          <Link
            className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            to={`/games/${gameId}/track`}
          >
            Continue Tracking
          </Link>
        </div>
      ) : null}

      {actions ? <div className="mt-4 flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
    </section>
  );
}
