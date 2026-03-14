import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teamsApi } from '../api/teamsApi';
import { StatsTable } from '../components/StatsTable';

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
  const gameLogRows = [
    ...data.games.map((game) => ({
      id: game.gameId,
      opponent: game.opponent || game.title || 'Opponent TBD',
      dateLabel: formatGameDate(game),
      dateValue: game.date || game.scheduledAt || game.completedAt || game.createdAt || null,
      ...game.stats,
    })),
    {
      id: 'totals',
      opponent: 'Totals',
      dateLabel: 'Season',
      dateValue: null,
      ...totals,
    },
  ];
  const gameLogColumns = [
    {
      id: 'opponent',
      label: 'Opponent',
      align: 'left',
      sortKey: 'opponent',
      render: (row) => row.opponent,
    },
    {
      id: 'date',
      label: 'Date',
      align: 'left',
      sortKey: 'dateValue',
      render: (row) => row.dateLabel,
    },
    {
      id: 'ft',
      label: 'FT',
      align: 'right',
      sortValue: (row) => row.ftm,
      render: (row) => `${row.ftm}/${row.fta}`,
    },
    {
      id: 'fg2',
      label: '2PT',
      align: 'right',
      sortValue: (row) => row.fg2m,
      render: (row) => `${row.fg2m}/${row.fg2a}`,
    },
    {
      id: 'fg3',
      label: '3PT',
      align: 'right',
      sortValue: (row) => row.fg3m,
      render: (row) => `${row.fg3m}/${row.fg3a}`,
    },
    { id: 'ast', label: 'AST', align: 'right', sortKey: 'ast', render: (row) => row.ast },
    { id: 'oreb', label: 'OREB', align: 'right', sortKey: 'oreb', render: (row) => row.oreb },
    { id: 'dreb', label: 'DREB', align: 'right', sortKey: 'dreb', render: (row) => row.dreb },
    { id: 'reb', label: 'REB', align: 'right', sortKey: 'reb', render: (row) => row.reb },
    {
      id: 'pts',
      label: 'PTS',
      align: 'right',
      sortKey: 'points',
      emphasis: true,
      render: (row) => row.points,
    },
  ];

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
          <StatsTable columns={gameLogColumns} rows={gameLogRows} tableClassName="w-max text-sm" />
        </div>
      </section>
    </main>
  );
}
