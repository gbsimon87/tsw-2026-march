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

function formatPerGameValue(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
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

  const summary = data.summary || {
    gamesCount: 0,
    points: 0,
    fg2: { made: 0, missed: 0, attempts: 0, percentage: null },
    fg3: { made: 0, missed: 0, attempts: 0, percentage: null },
    ft: { made: 0, missed: 0, attempts: 0, percentage: null },
    boxScore: {
      players: [],
      teamTotals: {
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
      },
    },
  };

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
        <div className="grid gap-3 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completed Public Games
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{summary.gamesCount}</p>
          </article>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[1180px] text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 text-left">Player</th>
                <th className="px-2 py-1.5 text-right">GP</th>
                <th className="px-2 py-1.5 text-right">PPG</th>
                <th className="px-2 py-1.5 text-right">PTS</th>
                <th className="px-2 py-1.5 text-right">APG</th>
                <th className="px-2 py-1.5 text-right">AST</th>
                <th className="px-2 py-1.5 text-right">RPG</th>
                <th className="px-2 py-1.5 text-right">REB</th>
                <th className="px-2 py-1.5 text-right">OREB</th>
                <th className="px-2 py-1.5 text-right">DREB</th>
                <th className="px-2 py-1.5 text-right">FT</th>
                <th className="px-2 py-1.5 text-right">2PT</th>
                <th className="px-2 py-1.5 text-right">3PT</th>
              </tr>
            </thead>
            <tbody>
              {summary.boxScore.players.map((row) => (
                <tr key={row.playerId} className="border-t border-slate-200">
                  <td className="px-2 py-1.5 text-slate-900">
                    <Link
                      to={`/teams/${teamId}/players/${row.playerId}`}
                      className="font-medium underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
                    >
                      {row.displayName}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{row.gamesPlayed}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">
                    {formatPerGameValue(row.pointsPerGame)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-900">
                    {row.points}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700">
                    {formatPerGameValue(row.assistsPerGame)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{row.ast}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">
                    {formatPerGameValue(row.reboundsPerGame)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{row.reb}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{row.oreb}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{row.dreb}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">
                    {row.ftm}/{row.fta}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700">
                    {row.fg2m}/{row.fg2a}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700">
                    {row.fg3m}/{row.fg3a}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Games</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Upcoming
            </h3>
            {upcomingGames.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
                No upcoming games scheduled.
              </p>
            ) : (
              upcomingGames.map((game) => <PublicGameRow key={game.id} game={game} />)
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent</h3>
            {recentGames.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
                No recent games yet.
              </p>
            ) : (
              recentGames.map((game) => <PublicGameRow key={game.id} game={game} />)
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
