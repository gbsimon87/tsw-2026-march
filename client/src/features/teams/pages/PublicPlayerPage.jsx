import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { SportsLoader } from '../../../components/SportsLoader';
import { Modal } from '../../../components/ui/Modal';
import { FeedComposer } from '../../feed/components/FeedComposer';
import { teamsApi } from '../api/teamsApi';
import { StatsTable } from '../components/StatsTable';
import { PlayerCardPost } from '../../feed/components/posts/PlayerCardPost';
import { ShareImageButton } from '../../feed/components/ShareImageButton';
import { extractYouTubeVideoId } from '../../games/youtube';

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
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
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

const HIGHLIGHT_LABELS = {
  FG2_MADE: '2PT Make',
  FG2_MISS: '2PT Miss',
  FG3_MADE: '3PT Make',
  FG3_MISS: '3PT Miss',
  FT_MADE: 'FT Make',
  FT_MISS: 'FT Miss',
  AST: 'Assist',
  STL: 'Steal',
  BLK: 'Block',
};

const CLIP_BUFFER = 5;
const HIGHLIGHT_PRIORITY = { FG3_MADE: 0, FG2_MADE: 1 };
const MAX_HIGHLIGHTS = 5;

function selectHighlights(highlights) {
  return [...(highlights || [])]
    .sort((a, b) => {
      const pa = HIGHLIGHT_PRIORITY[a.statType] ?? 2;
      const pb = HIGHLIGHT_PRIORITY[b.statType] ?? 2;
      return pa - pb;
    })
    .slice(0, MAX_HIGHLIGHTS);
}

function HighlightClip({ videoUrl, timestamp, statType, gameTitle }) {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) return null;

  const start = Math.max(0, timestamp - CLIP_BUFFER);
  const end = timestamp + CLIP_BUFFER;
  const src = `https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&autoplay=0&controls=1&rel=0&modestbranding=1&playsinline=1`;

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-video w-full bg-slate-950">
        <iframe
          className="h-full w-full"
          src={src}
          title={`${HIGHLIGHT_LABELS[statType] || statType} — ${gameTitle || 'Game'}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-slate-900">
          {HIGHLIGHT_LABELS[statType] || statType}
        </p>
        {gameTitle ? <p className="truncate text-xs text-slate-400">{gameTitle}</p> : null}
      </div>
    </div>
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
        ast: summary.ast + (game.stats.ast || 0),
        oreb: summary.oreb + (game.stats.oreb || 0),
        dreb: summary.dreb + (game.stats.dreb || 0),
        stl: summary.stl + (game.stats.stl || 0),
        blk: summary.blk + (game.stats.blk || 0),
        tov: summary.tov + (game.stats.tov || 0),
        foul: summary.foul + (game.stats.foul || 0),
        reb: summary.reb + (game.stats.reb || 0),
        points: summary.points + (game.stats.points || 0),
      }),
      zeroTotals
    );
  }, [data]);

  if (isLoading) {
    return <SportsLoader label="Loading player" fullPage />;
  }

  if (!data) {
    return <p className="text-sm text-red-600">{error || 'Player not found'}</p>;
  }

  const summary = data.summary || {
    gamesCount: 0,
    points: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    pointsPerGame: 0,
    reboundsPerGame: 0,
    assistsPerGame: 0,
    stealsPerGame: 0,
    blocksPerGame: 0,
    turnoversPerGame: 0,
    foulsPerGame: 0,
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
    { id: 'stl', label: 'STL', align: 'right', sortKey: 'stl', render: (row) => row.stl },
    { id: 'blk', label: 'BLK', align: 'right', sortKey: 'blk', render: (row) => row.blk || 0 },
    { id: 'tov', label: 'TOV', align: 'right', sortKey: 'tov', render: (row) => row.tov },
    { id: 'foul', label: 'FOUL', align: 'right', sortKey: 'foul', render: (row) => row.foul },
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
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Public Player Profile
            </p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              <Link
                className="transition hover:text-sky-700 hover:underline"
                to={`/teams/${teamId}`}
              >
                {data.team.name}
              </Link>
            </p>
          </div>
          {data.player.position ? (
            <p className="inline-flex w-fit rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              {data.player.position}
            </p>
          ) : null}
        </div>

        <PlayerCardPost
          interactive={false}
          playerCard={{
            playerUrl: `/teams/${teamId}/players/${playerId}`,
            playerName: playerLabel,
            teamName: data.team.name,
            jerseyNumber: data.player.jerseyNumber ?? null,
            playerImage: data.player.image ?? null,
            teamLogo: data.team.logo ?? null,
            teamColors: data.team.colors ?? [],
            summary: {
              pointsPerGame: summary.pointsPerGame,
              reboundsPerGame: summary.reboundsPerGame,
              assistsPerGame: summary.assistsPerGame,
            },
          }}
        />

        <div className="flex justify-end">
          <ShareImageButton
            type="player_card"
            playerCard={{
              playerUrl: `/teams/${teamId}/players/${playerId}`,
              playerName: playerLabel,
              teamName: data.team.name,
              jerseyNumber: data.player.jerseyNumber ?? null,
              playerImage: data.player.image ?? null,
              teamLogo: data.team.logo ?? null,
              teamColors: data.team.colors ?? [],
              summary: {
                pointsPerGame: summary.pointsPerGame,
                reboundsPerGame: summary.reboundsPerGame,
                assistsPerGame: summary.assistsPerGame,
              },
            }}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={openFeedComposer}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label="Share to The Pulse"
            title="Share to The Pulse"
          >
            <FeedIcon />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PPG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(summary.pointsPerGame)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">RPG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(summary.reboundsPerGame)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">APG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(summary.assistsPerGame)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SPG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(summary.stealsPerGame)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">TOPG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(summary.turnoversPerGame)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FPG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(summary.foulsPerGame)}
          </p>
        </article>
      </section>

      {data.highlights?.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold text-slate-900">Highlights</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {selectHighlights(data.highlights).map((h) => (
              <HighlightClip
                key={h.eventId}
                videoUrl={h.videoUrl}
                timestamp={h.videoTimestamp}
                statType={h.statType}
                gameTitle={h.gameTitle}
              />
            ))}
          </div>
        </section>
      ) : null}

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
        <p className="text-sm font-medium text-emerald-700">Posted to The Pulse</p>
      ) : null}

      <Modal open={isFeedComposerOpen} onClose={closeFeedComposer} title="Share to The Pulse">
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
