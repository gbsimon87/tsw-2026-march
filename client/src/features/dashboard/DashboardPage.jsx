import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/store/AuthContext';
import { teamsApi } from '../teams/api/teamsApi';
import { gamesApi } from '../games/api/gamesApi';

export function DashboardPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([teamsApi.list(), gamesApi.list()])
      .then(([teamsResponse, gamesResponse]) => {
        setTeams(teamsResponse.teams || []);
        setGames(gamesResponse.games || []);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load dashboard'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-slate-700">Track teams, games, and box scores.</p>
      {isLoading ? <p className="text-sm">Loading...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!isLoading && teams.length === 0 ? (
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-700">No team found. Create one to get started.</p>
          <Link className="mt-2 inline-block text-sm text-blue-600 hover:underline" to="/teams/new">
            Create Team
          </Link>
        </div>
      ) : null}

      {!isLoading && teams.length > 0 ? (
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-slate-700">Teams: {teams.length}</p>
          <p className="text-sm text-slate-700">Games: {games.length}</p>
          <div className="mt-2 flex gap-3 text-sm">
            <Link className="text-blue-600 hover:underline" to="/games/new">
              Start New Game
            </Link>
            <Link className="text-blue-600 hover:underline" to="/games">
              View Previous Games
            </Link>
          </div>
        </div>
      ) : null}

      <pre className="rounded bg-slate-900 p-4 text-sm text-emerald-300">
        {JSON.stringify(user, null, 2)}
      </pre>
    </section>
  );
}
