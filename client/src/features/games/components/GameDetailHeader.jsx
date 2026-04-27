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
  return (
    <section
      className={`rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 md:p-8 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {recap?.statusLabel || 'Game Detail'}
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-[1.5fr,1fr] md:items-end">
        <div className="flex items-start gap-4">
          <img
            src={getGameHeaderImage(team)}
            alt={`${team?.name || recap?.team?.name || 'Team'} logo`}
            className="h-20 w-20 rounded-full border border-slate-200 bg-white object-cover"
          />
          <div>
            {team?.id && !isDualTeam ? (
              <Link
                to={`/teams/${team.id}`}
                className="text-3xl font-bold leading-tight text-slate-900 transition hover:text-sky-700 hover:underline focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-sky-500 md:text-4xl"
              >
                {recap?.team?.name || team?.name || game?.title || 'Team'}
              </Link>
            ) : (
              <h1 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
                {recap?.team?.name || team?.name || game?.title || 'Team'}
              </h1>
            )}
            <p className="mt-2 text-base text-slate-700">
              {isDualTeam
                ? `${participants?.away?.displayName || 'Away'} at ${participants?.home?.displayName || 'Home'}`
                : recap?.opponent?.name || game?.opponent
                  ? `vs ${recap?.opponent?.name || game?.opponent}`
                  : 'Opponent not recorded'}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {formatDateTime(recap?.playedAt || game?.scheduledAt || game?.createdAt)}
            </p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>Status: {game?.status || 'unknown'}</p>
              <p>Recorded: {formatDateTime(game?.createdAt)}</p>
              <p>Finished: {formatDateTime(game?.completedAt)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-right shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Final Score
          </p>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3 text-slate-900">
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isDualTeam
                  ? participants?.home?.displayName || 'Home'
                  : recap?.team?.name || team?.name || 'Team'}
              </p>
              <p className="text-4xl font-bold">
                {isDualTeam ? gameSummary?.homePoints || 0 : gameSummary?.teamPoints || 0}
              </p>
            </div>
            <p className="pb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Final
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isDualTeam
                  ? participants?.away?.displayName || 'Away'
                  : recap?.opponent?.name || game?.opponent || 'Opponent'}
              </p>
              <p className="text-4xl font-bold">
                {isDualTeam ? gameSummary?.awayPoints || 0 : gameSummary?.opponentPoints || 0}
              </p>
            </div>
          </div>
        </div>
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
