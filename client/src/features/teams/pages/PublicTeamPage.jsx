import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { Modal } from '../../../components/ui/Modal';
import { FeedComposer } from '../../feed/components/FeedComposer';
import { TeamCardPost } from '../../feed/components/posts/TeamCardPost';
import { ShareImageButton } from '../../feed/components/ShareImageButton';
import placeholderLogo from '../../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { teamsApi } from '../api/teamsApi';
import { StatsTable } from '../components/StatsTable';
import { buildTeamCardPreview } from '../shareCardPayloads';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { resolveShareImage } from '../../../hooks/resolveShareImage';

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
          {typeof game.teamPoints === 'number'
            ? ` • ${game.teamPoints}-${game.opponentPoints || 0}`
            : ''}
        </p>
        {game.hasVideo ? <p className="text-xs font-medium text-sky-700">Video available</p> : null}
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [areAllGamesVisible, setAreAllGamesVisible] = useState(false);
  const [error, setError] = useState('');
  const [feedPostState, setFeedPostState] = useState('');

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
  const isFeedComposerOpen = searchParams.get('composeFeedTeam') === '1';

  const venue = formatVenue(data?.team?.homeVenue);
  useDocumentMeta({
    title: data?.team ? `${data.team.name} — Team Page` : undefined,
    description: data?.team
      ? [
          `${data.team.name} on The Sporty Way.`,
          venue ? `Home games at ${venue.arenaName}.` : null,
          data.summary?.gamesCount ? `${data.summary.gamesCount} games tracked.` : null,
        ]
          .filter(Boolean)
          .join(' ')
      : undefined,
    image: data?.team ? resolveShareImage(data.team.logo?.url) : undefined,
    url: data?.team ? `${window.location.origin}/teams/${teamId}` : undefined,
  });

  function updateSearchParam(name, value) {
    const nextParams = new URLSearchParams(searchParams);
    if (value == null) {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }
    setSearchParams(nextParams, { replace: true });
  }

  if (isLoading) {
    return <SportsLoader label="Loading team" fullPage />;
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
        stl: 0,
        blk: 0,
        tov: 0,
        foul: 0,
        reb: 0,
        points: 0,
      },
    },
  };
  const teamCardPreview = buildTeamCardPreview(data);

  function closeFeedComposer() {
    updateSearchParam('composeFeedTeam', null);
  }

  function openFeedComposer() {
    if (user) {
      updateSearchParam('composeFeedTeam', '1');
      return;
    }

    const returnUrl = `/teams/${teamId}?composeFeedTeam=1`;
    navigate(`/login?redirectTo=${encodeURIComponent(returnUrl)}`);
  }

  function onFeedPostCreated() {
    closeFeedComposer();
    setFeedPostState('posted');
    window.setTimeout(() => {
      setFeedPostState((current) => (current === 'posted' ? '' : current));
    }, 1500);
  }

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
      id: 'spg',
      label: 'SPG',
      align: 'right',
      sortValue: (row) => row.stealsPerGame,
      render: (row) => formatPerGameValue(row.stealsPerGame),
    },
    {
      id: 'stl',
      label: 'STL',
      align: 'right',
      sortValue: (row) => row.stl,
      render: (row) => row.stl,
    },
    {
      id: 'blk',
      label: 'BLK',
      align: 'right',
      sortValue: (row) => row.blk || 0,
      render: (row) => row.blk || 0,
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
      id: 'topg',
      label: 'TOPG',
      align: 'right',
      sortValue: (row) => row.turnoversPerGame,
      render: (row) => formatPerGameValue(row.turnoversPerGame),
    },
    {
      id: 'tov',
      label: 'TOV',
      align: 'right',
      sortValue: (row) => row.tov,
      render: (row) => row.tov,
    },
    {
      id: 'fpg',
      label: 'FPG',
      align: 'right',
      sortValue: (row) => row.foulsPerGame,
      render: (row) => formatPerGameValue(row.foulsPerGame),
    },
    {
      id: 'foul',
      label: 'FOUL',
      align: 'right',
      sortValue: (row) => row.foul,
      render: (row) => row.foul,
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
      <PageHeader
        eyebrow="Public Team Page"
        title={data.team.name}
        media={
          <CloudinaryImage
            src={data.team.logo?.url || placeholderLogo}
            alt={`${data.team.name} logo`}
            width={80}
            height={80}
            loading="eager"
            decoding="async"
            srcSetWidths={[80, 160, 320]}
            sizes="80px"
            className="h-20 w-20 rounded-full border border-slate-200 bg-white object-cover"
          />
        }
      >
        {data.team.colors?.length ? (
          <div className="flex flex-wrap gap-2" aria-label="Team colours">
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
      </PageHeader>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Shareable Team Card</h2>
          </div>
          <button
            type="button"
            onClick={openFeedComposer}
            className="inline-flex rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Post to The Pulse
          </button>
        </div>
        <div className="mt-5">
          <TeamCardPost teamCard={teamCardPreview} interactive={false} />
        </div>
        <div className="flex justify-end">
          <ShareImageButton type="team_card" teamCard={teamCardPreview} />
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

      {feedPostState === 'posted' ? (
        <p className="text-sm font-medium text-emerald-700">Posted to The Pulse</p>
      ) : null}

      <Modal open={isFeedComposerOpen} onClose={closeFeedComposer} title="Share to The Pulse">
        <FeedComposer
          initialTab="team"
          initialSelectedTeamId={data.team.id}
          initialTeamOption={{ id: data.team.id, name: data.team.name }}
          onCreated={onFeedPostCreated}
          onCancel={closeFeedComposer}
        />
      </Modal>
    </main>
  );
}
