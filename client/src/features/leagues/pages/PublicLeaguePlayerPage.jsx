import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';

function formatGameDate(game) {
  const rawValue = game.completedAt || game.scheduledAt || game.createdAt || null;
  if (!rawValue) {
    return 'Date unavailable';
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString();
}

function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function PublicLeaguePlayerPage() {
  const { leagueSlug, teamSlug, leaguePlayerId } = useParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    leaguesApi
      .getPublicPlayer(leagueSlug, teamSlug, leaguePlayerId)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load player'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug, teamSlug, leaguePlayerId]);

  const totals = useMemo(() => {
    return (data?.games || []).reduce(
      (summary, game) => ({
        points: summary.points + game.stats.points,
        reb: summary.reb + game.stats.reb,
        ast: summary.ast + game.stats.ast,
        stl: summary.stl + game.stats.stl,
        blk: summary.blk + (game.stats.blk || 0),
        tov: summary.tov + game.stats.tov,
        foul: summary.foul + game.stats.foul,
      }),
      { points: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, foul: 0 }
    );
  }, [data]);

  if (isLoading) {
    return <p className="text-sm">Loading player...</p>;
  }

  if (!data?.player) {
    return <p className="text-sm text-red-600">{error || 'League player not found'}</p>;
  }

  const { league, team, player, summary, games } = data;
  const playerLabel =
    typeof player.jerseyNumber === 'number'
      ? `#${player.jerseyNumber} ${player.displayName}`
      : player.displayName;

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Public League Player
        </p>
        <div className="mt-2 flex items-center gap-4">
          <img
            src={playerPlaceholder}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
          />
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">{playerLabel}</h1>
        </div>
        <p className="mt-2 text-base text-slate-700">
          <Link to={`/league/${league.slug}`} className="hover:underline">
            {league.name}
          </Link>{' '}
          •{' '}
          <Link to={`/league/${league.slug}/teams/${team.slug}`} className="hover:underline">
            {team.name}
          </Link>
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Games</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{summary.gamesCount}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Averages</p>
          <p className="mt-2 text-sm text-slate-700">
            {formatAverage(summary.pointsPerGame)} PPG • {formatAverage(summary.reboundsPerGame)}{' '}
            RPG • {formatAverage(summary.assistsPerGame)} APG
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Totals</p>
          <p className="mt-2 text-sm text-slate-700">
            {totals.points} PTS • {totals.reb} REB • {totals.ast} AST
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Game Log</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Opponent</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">PTS</th>
                <th className="px-3 py-2 text-right">REB</th>
                <th className="px-3 py-2 text-right">AST</th>
                <th className="px-3 py-2 text-right">STL</th>
                <th className="px-3 py-2 text-right">BLK</th>
                <th className="px-3 py-2 text-right">TOV</th>
                <th className="px-3 py-2 text-right">FOUL</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.gameId} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <Link
                      to={game.opponentDestination?.href || `/games/${game.gameId}`}
                      className="underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
                    >
                      {game.opponent || game.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{formatGameDate(game)}</td>
                  <td className="px-3 py-2 text-right">{game.stats.points}</td>
                  <td className="px-3 py-2 text-right">{game.stats.reb}</td>
                  <td className="px-3 py-2 text-right">{game.stats.ast}</td>
                  <td className="px-3 py-2 text-right">{game.stats.stl}</td>
                  <td className="px-3 py-2 text-right">{game.stats.blk || 0}</td>
                  <td className="px-3 py-2 text-right">{game.stats.tov}</td>
                  <td className="px-3 py-2 text-right">{game.stats.foul}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
