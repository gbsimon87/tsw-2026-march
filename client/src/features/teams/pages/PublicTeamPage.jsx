import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import placeholderLogo from '../../../assets/placeholders/team-logo-placeholder.svg';
import { teamsApi } from '../api/teamsApi';
import { StatsTable } from '../components/StatsTable';

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

function formatVenue(homeVenue) {
  if (!homeVenue?.arenaName) {
    return null;
  }

  const addressParts = [
    homeVenue.addressLine1,
    homeVenue.addressLine2,
    homeVenue.city,
    homeVenue.state,
    homeVenue.postalCode,
    homeVenue.country,
  ].filter(Boolean);

  return {
    arenaName: homeVenue.arenaName,
    address: addressParts.join(', '),
  };
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
  const [areAllGamesVisible, setAreAllGamesVisible] = useState(false);
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

  const visibleUpcomingGames = areAllGamesVisible ? upcomingGames : upcomingGames.slice(0, 5);
  const visibleRecentGames = areAllGamesVisible ? recentGames : recentGames.slice(0, 5);

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

  const playerColumns = [
    {
      id: 'player',
      label: 'Player',
      align: 'left',
      sortValue: (row) => row.displayName,
      render: (row) => (
        <Link
          to={`/teams/${teamId}/players/${row.playerId}`}
          className="font-medium underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
        >
          {row.displayName}
        </Link>
      ),
    },
    {
      id: 'pos',
      label: 'POS',
      align: 'left',
      sortValue: (row) => row.position || '',
      render: (row) => row.position || '—',
    },
    {
      id: 'gp',
      label: 'GP',
      align: 'right',
      sortValue: (row) => row.gamesPlayed,
      render: (row) => row.gamesPlayed,
    },
    {
      id: 'ppg',
      label: 'PPG',
      align: 'right',
      sortValue: (row) => row.pointsPerGame,
      render: (row) => formatPerGameValue(row.pointsPerGame),
    },
    {
      id: 'pts',
      label: 'PTS',
      align: 'right',
      sortValue: (row) => row.points,
      emphasis: true,
      render: (row) => row.points,
    },
    {
      id: 'apg',
      label: 'APG',
      align: 'right',
      sortValue: (row) => row.assistsPerGame,
      render: (row) => formatPerGameValue(row.assistsPerGame),
    },
    {
      id: 'ast',
      label: 'AST',
      align: 'right',
      sortValue: (row) => row.ast,
      render: (row) => row.ast,
    },
    {
      id: 'rpg',
      label: 'RPG',
      align: 'right',
      sortValue: (row) => row.reboundsPerGame,
      render: (row) => formatPerGameValue(row.reboundsPerGame),
    },
    {
      id: 'reb',
      label: 'REB',
      align: 'right',
      sortValue: (row) => row.reb,
      render: (row) => row.reb,
    },
    {
      id: 'oreb',
      label: 'OREB',
      align: 'right',
      sortValue: (row) => row.oreb,
      render: (row) => row.oreb,
    },
    {
      id: 'dreb',
      label: 'DREB',
      align: 'right',
      sortValue: (row) => row.dreb,
      render: (row) => row.dreb,
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
  ];

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Public Team Page
        </p>
        <div className="mt-3 flex items-start gap-4">
          <img
            src={data.team.logo?.url || placeholderLogo}
            alt={`${data.team.name} logo`}
            className="h-20 w-20 rounded-2xl border border-slate-200 bg-white object-cover"
          />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
              {data.team.name}
            </h1>
            {data.team.colors?.length ? (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Team colours">
                {data.team.colors.map((color) => (
                  <span
                    key={color}
                    className="h-5 w-5 rounded-full border border-slate-300"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            ) : null}
            {formatVenue(data.team.homeVenue) ? (
              <div className="mt-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">
                  {formatVenue(data.team.homeVenue).arenaName}
                </p>
                <p>{formatVenue(data.team.homeVenue).address}</p>
              </div>
            ) : null}
          </div>
        </div>
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
          <StatsTable
            columns={playerColumns}
            rows={summary.boxScore.players}
            tableClassName="w-max text-sm"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">Games</h2>
            <p className="text-sm text-slate-600">
              Showing {visibleUpcomingGames.length + visibleRecentGames.length} of{' '}
              {upcomingGames.length + recentGames.length} games
            </p>
          </div>
          <button
            type="button"
            aria-expanded={areAllGamesVisible}
            aria-controls="public-team-games-panel"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            onClick={() => setAreAllGamesVisible((current) => !current)}
          >
            {areAllGamesVisible ? 'Show fewer' : 'Show all'}
            <svg
              viewBox="0 0 20 20"
              className={`h-4 w-4 transition ${areAllGamesVisible ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </button>
        </div>
        <div id="public-team-games-panel" className="mt-4 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Upcoming
            </h3>
            {visibleUpcomingGames.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
                No upcoming games scheduled.
              </p>
            ) : (
              visibleUpcomingGames.map((game) => <PublicGameRow key={game.id} game={game} />)
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent</h3>
            {visibleRecentGames.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
                No recent games yet.
              </p>
            ) : (
              visibleRecentGames.map((game) => <PublicGameRow key={game.id} game={game} />)
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
