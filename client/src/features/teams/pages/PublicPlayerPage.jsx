import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teamsApi } from '../api/teamsApi';

function formatGameDate(game) {
  const rawValue = game.date || game.scheduledAt || game.completedAt || game.createdAt || null;
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

function emptyStats() {
  return {
    ftm: 0,
    fta: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ast: 0,
    oreb: 0,
    dreb: 0,
    reb: 0,
    points: 0,
  };
}

export function PublicPlayerPage() {
  const { teamId, playerId } = useParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    teamsApi
      .getPublicPlayerById(teamId, playerId)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load player'))
      .finally(() => setIsLoading(false));
  }, [teamId, playerId]);

  const totals = useMemo(() => {
    const zeroTotals = emptyStats();
    const games = data?.games || [];

    return games.reduce(
      (summary, game) => ({
        ftm: summary.ftm + game.stats.ftm,
        fta: summary.fta + game.stats.fta,
        fg2m: summary.fg2m + game.stats.fg2m,
        fg2a: summary.fg2a + game.stats.fg2a,
        fg3m: summary.fg3m + game.stats.fg3m,
        fg3a: summary.fg3a + game.stats.fg3a,
        ast: summary.ast + game.stats.ast,
        oreb: summary.oreb + game.stats.oreb,
        dreb: summary.dreb + game.stats.dreb,
        reb: summary.reb + game.stats.reb,
        points: summary.points + game.stats.points,
      }),
      zeroTotals
    );
  }, [data]);

  if (isLoading) {
    return <p className="text-sm">Loading player...</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-600">{error || 'Player not found'}</p>;
  }

  const summary = data.summary || {
    gamesCount: 0,
    points: 0,
    reb: 0,
    ast: 0,
    pointsPerGame: 0,
    reboundsPerGame: 0,
    assistsPerGame: 0,
  };

  const playerLabel =
    typeof data.player.jerseyNumber === 'number'
      ? `#${data.player.jerseyNumber} ${data.player.displayName}`
      : data.player.displayName;

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Public Player Profile
        </p>
        <p className="mt-2 text-sm font-medium text-slate-600">
          <Link className="transition hover:text-sky-700 hover:underline" to={`/teams/${teamId}`}>
            {data.team.name}
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
          {playerLabel}
        </h1>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PPG</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatAverage(summary.pointsPerGame)}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">RPG</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatAverage(summary.reboundsPerGame)}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">APG</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatAverage(summary.assistsPerGame)}
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Game Log</h2>
          <p className="text-sm text-slate-500">{summary.gamesCount} public completed games</p>
        </div>

        {data.games.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No completed public games yet.</p>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[1040px] text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Opponent</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">FT</th>
                <th className="px-3 py-2 text-right">2PT</th>
                <th className="px-3 py-2 text-right">3PT</th>
                <th className="px-3 py-2 text-right">AST</th>
                <th className="px-3 py-2 text-right">OREB</th>
                <th className="px-3 py-2 text-right">DREB</th>
                <th className="px-3 py-2 text-right">REB</th>
                <th className="px-3 py-2 text-right">PTS</th>
              </tr>
            </thead>
            <tbody>
              {data.games.map((game) => (
                <tr key={game.gameId} className="border-t border-slate-200">
                  <td className="px-3 py-3 text-slate-900">
                    {game.opponent || game.title || 'Opponent TBD'}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{formatGameDate(game)}</td>
                  <td className="px-3 py-3 text-right text-slate-700">
                    {game.stats.ftm}/{game.stats.fta}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">
                    {game.stats.fg2m}/{game.stats.fg2a}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">
                    {game.stats.fg3m}/{game.stats.fg3a}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">{game.stats.ast}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{game.stats.oreb}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{game.stats.dreb}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{game.stats.reb}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">
                    {game.stats.points}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-3 text-slate-900">Totals</td>
                <td className="px-3 py-3 text-slate-900">Season</td>
                <td className="px-3 py-3 text-right text-slate-900">
                  {totals.ftm}/{totals.fta}
                </td>
                <td className="px-3 py-3 text-right text-slate-900">
                  {totals.fg2m}/{totals.fg2a}
                </td>
                <td className="px-3 py-3 text-right text-slate-900">
                  {totals.fg3m}/{totals.fg3a}
                </td>
                <td className="px-3 py-3 text-right text-slate-900">{totals.ast}</td>
                <td className="px-3 py-3 text-right text-slate-900">{totals.oreb}</td>
                <td className="px-3 py-3 text-right text-slate-900">{totals.dreb}</td>
                <td className="px-3 py-3 text-right text-slate-900">{totals.reb}</td>
                <td className="px-3 py-3 text-right text-slate-900">{totals.points}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
