import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { gamesApi } from '../api/gamesApi';

export function GameDetailPage() {
  const { gameId } = useParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    gamesApi
      .getById(gameId)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load game'))
      .finally(() => setIsLoading(false));
  }, [gameId]);

  if (isLoading) {
    return <p className="text-sm">Loading game...</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-600">{error || 'Game not found'}</p>;
  }

  const { game, team, boxScore } = data;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{game.title}</h1>
          <p className="text-sm text-slate-600">
            Team: {team.name} | Status: {game.status}
          </p>
        </div>
        {game.status === 'in_progress' ? (
          <Link className="text-sm text-blue-600 hover:underline" to={`/games/${game.id}/track`}>
            Continue Tracking
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">FT</th>
              <th className="px-3 py-2 text-right">2PT</th>
              <th className="px-3 py-2 text-right">3PT</th>
              <th className="px-3 py-2 text-right">PTS</th>
            </tr>
          </thead>
          <tbody>
            {boxScore.players.map((row) => (
              <tr key={row.playerId} className="border-t">
                <td className="px-3 py-2">{row.displayName}</td>
                <td className="px-3 py-2 text-right">
                  {row.ftm}/{row.fta}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.fg2m}/{row.fg2a}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.fg3m}/{row.fg3a}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{row.points}</td>
              </tr>
            ))}
            <tr className="border-t bg-slate-50 font-semibold">
              <td className="px-3 py-2">Team Total</td>
              <td className="px-3 py-2 text-right">
                {boxScore.teamTotals.ftm}/{boxScore.teamTotals.fta}
              </td>
              <td className="px-3 py-2 text-right">
                {boxScore.teamTotals.fg2m}/{boxScore.teamTotals.fg2a}
              </td>
              <td className="px-3 py-2 text-right">
                {boxScore.teamTotals.fg3m}/{boxScore.teamTotals.fg3a}
              </td>
              <td className="px-3 py-2 text-right">{boxScore.teamTotals.points}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
