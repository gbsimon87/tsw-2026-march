import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teamsApi } from '../api/teamsApi';

function formatGameDate(game) {
  const rawValue = game.scheduledAt || game.completedAt || game.createdAt || null;
  if (!rawValue) {
    return 'Date unavailable';
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString();
}

function formatStatus(status) {
  if (status === 'in_progress') {
    return 'In Progress';
  }
  if (status === 'completed') {
    return 'Completed';
  }
  return 'Scheduled';
}

function gameTimeValue(game) {
  const rawValue = game.scheduledAt || game.completedAt || game.createdAt || null;
  if (!rawValue) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = new Date(rawValue).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function PublicGameRow({ game }) {
  const primaryText = game.opponent || game.title || 'Opponent TBD';

  return (
    <article className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3">
      <div>
        <p className="font-medium text-slate-900">{primaryText}</p>
        <p className="text-sm text-slate-600">
          {formatGameDate(game)} • {formatStatus(game.status)}
          {typeof game.teamPoints === 'number' ? ` • ${game.teamPoints} pts` : ''}
        </p>
      </div>
      {game.isPubliclyViewable ? (
        <Link
          to={`/games/${game.id}`}
          aria-label={`Open details for ${primaryText}`}
          className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>
      ) : null}
    </article>
  );
}

export function PublicTeamPage() {
  const { teamId } = useParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    teamsApi
      .getPublicById(teamId)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load team'))
      .finally(() => setIsLoading(false));
  }, [teamId]);

  const upcomingGames = useMemo(() => {
    const games = data?.games || [];
    return [...games]
      .filter((game) => !game.isPubliclyViewable)
      .sort((gameA, gameB) => gameTimeValue(gameA) - gameTimeValue(gameB));
  }, [data]);

  const recentGames = useMemo(() => {
    const games = data?.games || [];
    return [...games]
      .filter((game) => game.isPubliclyViewable)
      .sort((gameA, gameB) => gameTimeValue(gameB) - gameTimeValue(gameA));
  }, [data]);

  if (isLoading) {
    return <p className="text-sm">Loading team...</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-600">{error || 'Team not found'}</p>;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Public Team Page
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
          {data.team.name}
        </h1>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Roster</h2>
        {data.team.players.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No active players listed yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.team.players.map((player) => (
              <li
                key={player.id}
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800"
              >
                {typeof player.jerseyNumber === 'number'
                  ? `#${player.jerseyNumber} ${player.displayName}`
                  : player.displayName}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Games</h2>

        <div className="mt-4 space-y-5">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Upcoming
            </h3>
            {upcomingGames.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No upcoming games scheduled.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {upcomingGames.map((game) => (
                  <PublicGameRow key={game.id} game={game} />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent</h3>
            {recentGames.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No recent games yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {recentGames.map((game) => (
                  <PublicGameRow key={game.id} game={game} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
