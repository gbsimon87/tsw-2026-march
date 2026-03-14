import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesApi } from '../api/gamesApi';

function formatStatus(status) {
  if (!status) {
    return 'Unknown';
  }
  if (status === 'in_progress') {
    return 'In Progress';
  }
  if (status === 'completed') {
    return 'Completed';
  }
  return status;
}

function QuickActionLink({ to, label, primary = false, children }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
        primary
          ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-700'
          : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          primary ? 'bg-white/12' : 'bg-slate-100'
        }`}
      >
        {children}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function GamesListPage() {
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    gamesApi
      .list()
      .then((response) => setGames(response.games || []))
      .catch((loadError) => setError(loadError.message || 'Failed to load games'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-8 md:p-10">
        <h1 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">Games</h1>
        <p className="mt-2 text-base text-slate-700">
          Manage your game timeline, continue live tracking, and review results quickly.
        </p>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="games-actions-heading" className="space-y-3">
        <h2 id="games-actions-heading" className="text-xl font-semibold text-slate-900">
          Quick Actions
        </h2>
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <QuickActionLink to="/games/new" label="New Game" primary>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </QuickActionLink>
          <QuickActionLink to="/dashboard" label="Dashboard">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5 10.5V20h14v-9.5" />
              <path d="M10 20v-5h4v5" />
            </svg>
          </QuickActionLink>
        </div>
      </section>

      <section aria-labelledby="games-summary-heading" className="space-y-3">
        <h2 id="games-summary-heading" className="text-xl font-semibold text-slate-900">
          Summary
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Total Games</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {isLoading ? '...' : games.length}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">In Progress</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {isLoading ? '...' : games.filter((game) => game.status === 'in_progress').length}
            </p>
          </article>
        </div>
      </section>

      <section
        aria-labelledby="games-list-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5"
      >
        <h2 id="games-list-heading" className="text-xl font-semibold text-slate-900">
          All Games
        </h2>
        {isLoading ? <p className="mt-3 text-sm text-slate-600">Loading games...</p> : null}
        {!isLoading && games.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No games yet.</p>
        ) : null}
        {!isLoading && games.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {games.map((game) => (
              <li key={game.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{game.title}</p>
                    <p className="text-xs text-slate-500">Status: {formatStatus(game.status)}</p>
                    <p className="text-xs text-slate-500">Opponent: {game.opponent || 'N/A'}</p>
                  </div>
                  <div className="flex gap-2">
                    {game.status === 'in_progress' ? (
                      <Link
                        aria-label={`Track ${game.title}`}
                        className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50"
                        to={`/games/${game.id}/track`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M4 19h16" />
                          <path d="M7 16V8" />
                          <path d="M12 16V5" />
                          <path d="M17 16v-4" />
                        </svg>
                      </Link>
                    ) : null}
                    <Link
                      aria-label={`Open details for ${game.title}`}
                      className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50"
                      to={`/games/${game.id}`}
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
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
