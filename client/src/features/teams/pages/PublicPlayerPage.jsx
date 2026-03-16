import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { Modal } from '../../../components/ui/Modal';
import { FeedComposer } from '../../feed/components/FeedComposer';
import { teamsApi } from '../api/teamsApi';
import { StatsTable } from '../components/StatsTable';
import { getPlayerHeaderImage } from '../../feed/cardImage';

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

function FeedIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
      <path
        d="M4 14.5V5.5a1 1 0 0 1 1-1h7.2a1 1 0 0 1 .6.2l2.2 1.7a1 1 0 0 1 .4.8v7.3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1ZM7 8h5.5M7 11h5.5M7 14h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PublicPlayerPage() {
  const { teamId, playerId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedPostState, setFeedPostState] = useState('');

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
  const isFeedComposerOpen = searchParams.get('composeFeedPlayer') === '1';

  function updateSearchParam(name, value) {
    const nextParams = new URLSearchParams(searchParams);
    if (value == null) {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }
    setSearchParams(nextParams, { replace: true });
  }

  function closeFeedComposer() {
    updateSearchParam('composeFeedPlayer', null);
  }

  function openFeedComposer() {
    if (user) {
      updateSearchParam('composeFeedPlayer', '1');
      return;
    }

    const returnUrl = `/teams/${teamId}/players/${playerId}?composeFeedPlayer=1`;
    navigate(`/login?redirectTo=${encodeURIComponent(returnUrl)}`);
  }

  function onFeedPostCreated() {
    closeFeedComposer();
    setFeedPostState('posted');
    window.setTimeout(() => {
      setFeedPostState((current) => (current === 'posted' ? '' : current));
    }, 1500);
  }
  const gameLogRows = [
    ...data.games.map((game) => ({
      id: game.gameId,
      opponent: game.opponent || game.title || 'Opponent TBD',
      opponentDestination: game.opponentDestination || {
        kind: 'none',
        href: null,
      },
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
      render: (row) =>
        row.opponentDestination?.href ? (
          <Link
            to={row.opponentDestination.href}
            className="font-medium underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
          >
            {row.opponent}
          </Link>
        ) : (
          row.opponent
        ),
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
        <div className="mt-3 flex items-start gap-4">
          <img
            src={getPlayerHeaderImage(data)}
            alt={`${data.player.displayName} profile`}
            className="h-20 w-20 rounded-full border border-slate-200 bg-white object-cover"
          />
          <div className="flex-1">
            <h1 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
              {playerLabel}
            </h1>
            {data.player.position ? (
              <p className="mt-2 inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {data.player.position}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
              <article className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PPG</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatAverage(summary.pointsPerGame)}
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">RPG</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatAverage(summary.reboundsPerGame)}
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">APG</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatAverage(summary.assistsPerGame)}
                </p>
              </article>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={openFeedComposer}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label="Share to feed"
            title="Share to feed"
          >
            <FeedIcon />
          </button>
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

      {feedPostState === 'posted' ? (
        <p className="text-sm font-medium text-emerald-700">Posted to feed</p>
      ) : null}

      <Modal open={isFeedComposerOpen} onClose={closeFeedComposer} title="Share to Feed">
        <FeedComposer
          initialTab="player"
          initialSelectedPlayer={{ teamId: data.team.id, playerId: data.player.id }}
          initialPlayerOption={{
            id: data.player.id,
            displayName: data.player.displayName,
            team: { id: data.team.id, name: data.team.name },
          }}
          onCreated={onFeedPostCreated}
          onCancel={closeFeedComposer}
        />
      </Modal>
    </main>
  );
}
