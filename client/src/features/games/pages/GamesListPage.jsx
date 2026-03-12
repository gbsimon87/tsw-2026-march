import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesApi } from '../api/gamesApi';

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

  if (isLoading) {
    return <p className="text-sm">Loading games...</p>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Games</h1>
        <Link className="rounded bg-slate-900 px-3 py-2 text-sm text-white" to="/games/new">
          New Game
        </Link>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {games.length === 0 ? <p className="text-sm text-slate-600">No games yet.</p> : null}
      <ul className="space-y-2">
        {games.map((game) => (
          <li key={game.id} className="rounded border bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{game.title}</p>
                <p className="text-xs text-slate-500">Status: {game.status}</p>
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
    </section>
  );
}
