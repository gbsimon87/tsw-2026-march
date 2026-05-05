import { Link } from 'react-router-dom';
import { getGameHeaderImage } from '../../feed/cardImage';

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

function getMatchupTitle({ game, team, participants, isDualTeam, recap }) {
  if (isDualTeam) {
    return `${participants?.away?.displayName || 'Away'} at ${
      participants?.home?.displayName || 'Home'
    }`;
  }

  const teamName = recap?.team?.name || team?.name || 'Team';
  const opponentName = recap?.opponent?.name || game?.opponent;

  if (opponentName) {
    return `${teamName} vs ${opponentName}`;
  }

  return game?.title || teamName;
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

export function GameDetailHeader({
  gameId,
  game,
  team,
  participants,
  isDualTeam = false,
  recap,
  gameSummary,
  canContinueTracking = false,
  actions = null,
  className = '',
}) {
  const matchupTitle = getMatchupTitle({ game, team, participants, isDualTeam, recap });
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

  return (
    <section
      className={`rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 md:p-8 ${className}`}
    >
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 text-slate-900">
          <div className="text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {homeName}
            </p>
            <p className="text-4xl font-bold md:text-5xl">{homePoints}</p>
          </div>
          <p className="pb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {statusLabel}
          </p>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {awayName}
            </p>
            <p className="text-4xl font-bold md:text-5xl">{awayPoints}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-start gap-4">
          <img
            src={getGameHeaderImage(team)}
            alt={`${team?.name || recap?.team?.name || 'Team'} logo`}
            className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover"
          />
          <div>
            <h1 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
              {matchupTitle}
            </h1>
            <p className="mt-2 text-base text-slate-700">
              {game?.gameContext === 'league' ? 'League game' : 'One-off game'}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {formatDateTime(recap?.playedAt || game?.scheduledAt || game?.createdAt)}
            </p>
          </div>
        </div>
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
