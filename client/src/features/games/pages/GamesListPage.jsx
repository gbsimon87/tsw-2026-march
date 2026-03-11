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
              </div>
              <div className="flex gap-2">
                {game.status === 'in_progress' ? (
                  <Link
                    className="text-sm text-blue-600 hover:underline"
                    to={`/games/${game.id}/track`}
                  >
                    Track
                  </Link>
                ) : null}
                <Link className="text-sm text-blue-600 hover:underline" to={`/games/${game.id}`}>
                  Box Score
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
