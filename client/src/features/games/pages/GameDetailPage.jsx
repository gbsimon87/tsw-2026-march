import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { useAuth } from '../../../app/store/AuthContext';
import { trackEvent } from '../../analytics/trackEvent';
import { Tabs } from '../../../components/Tabs';
import { SportsLoader } from '../../../components/SportsLoader';
import { Modal } from '../../../components/ui/Modal';
import { FeedComposer } from '../../feed/components/FeedComposer';
import { feedApi } from '../../feed/api/feedApi';
import { getGameHeaderImage, getLeagueHeaderImage } from '../../feed/cardImage';
import { StatsTable } from '../../teams/components/StatsTable';
import { gamesApi } from '../api/gamesApi';
import { GameDetailHeader } from '../components/GameDetailHeader';
import { GameReplayPanel } from '../components/GameReplayPanel';
import { GameRecapPanel } from '../components/GameRecapPanel';
import { ScoringTimelineChart } from '../components/ScoringTimelineChart';
import { RecapShotSnapshot } from '../components/RecapShotSnapshot';
import { createRecapCardDataUrl } from '../recapCardImage';
import { LockedFeatureCard } from '../../billing/components/LockedFeatureCard';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { resolveShareImage } from '../../../hooks/resolveShareImage';
import gameConstants from '../constants';

const { STAT_LABELS, ZONE_LABELS } = gameConstants;

function eventTime(value) {
  if (!value) {
    return '--:--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatEventMeta(event) {
  const parts = [];

  if (event.zoneId) {
    parts.push(ZONE_LABELS[event.zoneId] || event.zoneId);
  }

  if (typeof event.x === 'number' && typeof event.y === 'number') {
    parts.push(`(${event.x.toFixed(1)}, ${event.y.toFixed(1)})`);
  }

  parts.push(eventTime(event.occurredAt));
  return parts.join(' | ');
}

function formatGameDate(value) {
  if (!value) {
    return 'Date unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatHeaderDateTime(value) {
  if (!value) {
    return 'Date unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleString();
}

function getHeaderStatusLabel(game, recap) {
  if (recap?.statusLabel) {
    return recap.statusLabel;
  }

  if (game?.status === 'completed' || game?.status === 'finished') {
    return 'Final';
  }

  if (game?.status === 'in_progress' || game?.status === 'live') {
    return 'Live';
  }

  return game?.status || 'Game Detail';
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
      <path
        d="M5.5 7V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v3M5.5 15.5H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-1.5M5.5 12.5h9v4h-9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
      <path
        d="M12.5 4.5h3v3M8 12l7.5-7.5M15.5 10.5v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon({ downloaded = false }) {
  if (downloaded) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
        <path
          d="m5 10 3.2 3.2L15 6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
      <path
        d="M10 3.5v8m0 0 3-3m-3 3-3-3M4.5 13.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

function RecapTabIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M3 3h10v10H3z" strokeLinejoin="round" />
      <path d="M5.5 6.5h5M5.5 9h3" strokeLinecap="round" />
    </svg>
  );
}

function StatsTabIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M2 12h12M5 12V6M8 12V3M11 12V8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReplayTabIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 4.5v7l6-3.5-6-3.5Z" strokeLinejoin="round" />
      <path d="M12.5 4v8" strokeLinecap="round" />
    </svg>
  );
}

function createPngFileFromSvgDataUrl(dataUrl, filename) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width || 1080;
      canvas.height = image.naturalHeight || image.height || 420;
      const context = canvas.getContext('2d');

      if (!context || !canvas.toBlob) {
        reject(new Error('Canvas export is unavailable'));
        return;
      }

      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Image export failed'));
          return;
        }

        resolve(new File([blob], filename, { type: 'image/png' }));
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('Image load failed'));
    image.src = dataUrl;
  });
}

function canAccessReplay(team, entitlements) {
  if (entitlements?.canViewReplay === true) {
    return true;
  }

  if (entitlements?.canViewReplay === false) {
    return false;
  }

  if (team?.entitlements?.canViewReplay === true) {
    return true;
  }

  const plan = team?.billing?.plan;
  const status = team?.billing?.subscriptionStatus;
  return (plan === 'team' || plan === 'pro') && (status === 'active' || status === 'trialing');
}

function buildPlayersById(data, isDualTeam) {
  const entries = [];

  if (isDualTeam) {
    for (const side of ['home', 'away']) {
      for (const player of data?.participants?.[side]?.players || []) {
        entries.push([player.id, player]);
      }
    }
  } else {
    for (const player of data?.team?.players || []) {
      entries.push([player.id, player]);
    }
  }

  return new Map(entries);
}

function getParticipantName(participants, side) {
  return participants?.[side]?.displayName || side;
}

function getLeaguePlayerHref({ league, teamSlug, row }) {
  if (!league?.slug || !teamSlug || row.isTeamTotal || !row.playerId) {
    return null;
  }

  return `/league/${league.slug}/teams/${teamSlug}/players/${row.leaguePlayerId || row.playerId}`;
}

function withLeaguePlayerHref(rows, { league, teamSlug }) {
  return rows.map((row) => ({
    ...row,
    playerHref: getLeaguePlayerHref({ league, teamSlug, row }),
  }));
}

function buildPrimaryStatsView(data, isDualTeam) {
  if (!isDualTeam) {
    const rows = [
      ...(data.boxScore?.players || []),
      {
        playerId: 'team-total',
        displayName: 'Team Total',
        ...(data.boxScore?.teamTotals || {}),
        isTeamTotal: true,
      },
    ];

    return {
      label: data.team?.name || 'Team',
      rows: withLeaguePlayerHref(rows, {
        league: data.league,
        teamSlug: data.team?.slug,
      }),
    };
  }

  const homeRows = [
    ...(data.boxScore?.home?.players || []),
    {
      playerId: 'team-total',
      displayName: 'Team Total',
      ...(data.boxScore?.home?.totals || {}),
      isTeamTotal: true,
    },
  ];
  const awayRows = [
    ...(data.boxScore?.away?.players || []),
    {
      playerId: 'team-total-away',
      displayName: 'Team Total',
      ...(data.boxScore?.away?.totals || {}),
      isTeamTotal: true,
    },
  ];

  return {
    label: getParticipantName(data.participants, 'home'),
    rows: withLeaguePlayerHref(homeRows, {
      league: data.league,
      teamSlug: data.participants?.home?.slug,
    }),
    secondaryLabel: getParticipantName(data.participants, 'away'),
    secondaryRows: withLeaguePlayerHref(awayRows, {
      league: data.league,
      teamSlug: data.participants?.away?.slug,
    }),
  };
}

function shotPercentage(made, attempted) {
  const attempts = attempted || 0;

  if (attempts === 0) {
    return null;
  }

  return (made || 0) / attempts;
}

function formatShotPercentage(made, attempted) {
  const percentage = shotPercentage(made, attempted);

  if (percentage === null) {
    return '--';
  }

  return `${Math.round(percentage * 100)}%`;
}

function getTotalFgMade(row) {
  return (row.fg2m || 0) + (row.fg3m || 0);
}

function getTotalFgAttempted(row) {
  return (row.fg2a || 0) + (row.fg3a || 0);
}

export function GameDetailPage() {
  const { gameId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [feedPostState, setFeedPostState] = useState('');
  const [imageState, setImageState] = useState('');
  const [isSharingHeaderCard, setIsSharingHeaderCard] = useState(false);
  const isSharingHeaderCardRef = useRef(false);
  const [isPreparingCard, setIsPreparingCard] = useState(false);
  const [clipShareState, setClipShareState] = useState({});

  const isFeedComposerOpen = searchParams.get('composeFeedGame') === '1';
  const isPrintMode = searchParams.get('print') === '1';

  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => gamesApi.getById(gameId),
    enabled: Boolean(gameId),
  });

  useEffect(() => {
    if (isError) {
      setError(queryError?.message || 'Failed to load game');
    }
  }, [isError, queryError]);

  // OPT-022: generated on demand (share/download click) instead of eagerly on
  // every `data` change — the canvas render is wasted work whenever the user
  // never shares/downloads, and re-runs on every query refetch even though the
  // card's inputs (score, names, logos) rarely change after a game completes.
  function buildHeaderCardDataUrl() {
    if (!data) {
      return Promise.resolve('');
    }

    const { game, team, boxScore, participants } = data;
    const isDualTeam = game.trackingMode === 'dual_team';
    const recap = data.recap;
    const gameSummary = data.gameSummary || {
      teamPoints: boxScore?.teamTotals?.points || 0,
      opponentPoints: boxScore?.opponentTotals?.points || 0,
    };
    const playedAt = recap?.playedAt || game?.scheduledAt || game?.createdAt;
    const homeLogoUrl = isDualTeam
      ? participants?.home?.logo?.url || null
      : game?.gameContext === 'league'
        ? getLeagueHeaderImage(data.league)
        : getGameHeaderImage(team);
    const awayLogoUrl = isDualTeam ? participants?.away?.logo?.url || null : teamPlaceholder;
    const cardRecap = isDualTeam
      ? {
          statusLabel: getHeaderStatusLabel(game, recap),
          playedAt,
          dateLabel: formatHeaderDateTime(playedAt),
          home: {
            name: participants?.home?.displayName || 'Home',
            points: gameSummary?.homePoints || 0,
          },
          away: {
            name: participants?.away?.displayName || 'Away',
            points: gameSummary?.awayPoints || 0,
          },
        }
      : {
          statusLabel: getHeaderStatusLabel(game, recap),
          playedAt,
          dateLabel: formatHeaderDateTime(playedAt),
          team: {
            name: recap?.team?.name || team?.name || 'Team',
            points: gameSummary?.teamPoints || 0,
          },
          opponent: {
            name: recap?.opponent?.name || game?.opponent || 'Opponent',
            points: gameSummary?.opponentPoints || 0,
          },
        };

    return createRecapCardDataUrl(cardRecap, {
      homeLogoUrl,
      awayLogoUrl,
      teamColors: team?.colors || [],
    });
  }

  const metaIsDualTeam = data?.game?.trackingMode === 'dual_team';
  const metaGameSummary = data?.gameSummary || {
    teamPoints: data?.boxScore?.teamTotals?.points || 0,
    opponentPoints: data?.boxScore?.opponentTotals?.points || 0,
  };
  const metaMatchupName = data
    ? metaIsDualTeam
      ? `${getParticipantName(data.participants, 'away')} at ${getParticipantName(data.participants, 'home')}`
      : `${data.team?.name || 'Team'} vs ${data.recap?.opponent?.name || data.game?.opponent || 'Opponent'}`
    : undefined;
  const metaImage = data
    ? metaIsDualTeam
      ? data.participants?.home?.logo?.url
      : data.game?.gameContext === 'league'
        ? getLeagueHeaderImage(data.league)
        : getGameHeaderImage(data.team)
    : undefined;

  useDocumentMeta({
    title: data ? `${data.game?.title || metaMatchupName} — Game Recap` : undefined,
    description: data
      ? metaIsDualTeam
        ? `${metaMatchupName} final: ${metaGameSummary.homePoints || 0}-${metaGameSummary.awayPoints || 0}.`
        : `${metaMatchupName} final: ${metaGameSummary.teamPoints || 0}-${metaGameSummary.opponentPoints || 0}.`
      : undefined,
    image: data ? resolveShareImage(metaImage) : undefined,
    url: data ? `${window.location.origin}/games/${gameId}` : undefined,
  });

  if (isLoading) {
    return <SportsLoader label="Loading game" fullPage />;
  }

  if (!data) {
    return <p className="text-sm text-red-600">{error || 'Game not found'}</p>;
  }

  const { game, team, boxScore, participants } = data;
  const isDualTeam = game.trackingMode === 'dual_team';
  const recap = data.recap;
  const aiSummary = data.aiSummary || game.aiSummary || null;
  const playersById = buildPlayersById(data, isDualTeam);
  const gameSummary = data.gameSummary || {
    teamPoints: boxScore?.teamTotals?.points || 0,
    opponentPoints: boxScore?.opponentTotals?.points || 0,
    hasOpponentScore: (boxScore?.opponentTotals?.points || 0) > 0,
  };
  const entitlements = data.teamEntitlements || team.entitlements || {};
  const canViewReplay = canAccessReplay(team, entitlements);
  const canShareHighlights = Boolean(data.canShareHighlights);
  const sortedEvents = [...game.events].sort((a, b) => {
    const aTime = new Date(a.occurredAt || 0).getTime();
    const bTime = new Date(b.occurredAt || 0).getTime();
    return aTime - bTime;
  });
  const replayEvents = sortedEvents.map((event) => ({
    ...event,
    playerName: playersById.get(event.playerId)?.displayName || 'Unknown Player',
  }));
  const playByPlayEvents = (showAllEvents ? sortedEvents : sortedEvents.slice(-5))
    .slice()
    .reverse();
  const statsView = buildPrimaryStatsView(data, isDualTeam);
  const boxScoreColumns = [
    {
      id: 'player',
      label: 'Player',
      align: 'left',
      sortKey: 'displayName',
      render: (row) =>
        row.playerHref ? (
          <Link
            to={row.playerHref}
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-[#1B4332] hover:decoration-[#F4A300]"
          >
            {row.displayName}
          </Link>
        ) : row.isTeamTotal || isDualTeam ? (
          row.displayName
        ) : (
          <Link
            to={`/teams/${team.id}/players/${row.playerId}`}
            className="font-medium text-[#1B4332] underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#123328]"
          >
            {row.displayName}
          </Link>
        ),
    },
    {
      id: 'pts',
      label: 'PTS',
      align: 'right',
      sortKey: 'points',
      render: (row) => row.points || 0,
    },
    {
      id: 'fg',
      label: 'FG',
      align: 'right',
      sortValue: (row) => getTotalFgMade(row),
      render: (row) => `${getTotalFgMade(row)}/${getTotalFgAttempted(row)}`,
    },
    {
      id: 'fgPct',
      label: 'FG%',
      align: 'right',
      sortValue: (row) => shotPercentage(getTotalFgMade(row), getTotalFgAttempted(row)),
      render: (row) => formatShotPercentage(getTotalFgMade(row), getTotalFgAttempted(row)),
    },
    {
      id: 'rebounds',
      label: 'REB O/D/T',
      align: 'right',
      sortKey: 'reb',
      render: (row) => `${row.oreb || 0}/${row.dreb || 0}/${row.reb || 0}`,
    },
    { id: 'ast', label: 'AST', align: 'right', sortKey: 'ast', render: (row) => row.ast || 0 },
    { id: 'stl', label: 'STL', align: 'right', sortKey: 'stl', render: (row) => row.stl || 0 },
    { id: 'blk', label: 'BLK', align: 'right', sortKey: 'blk', render: (row) => row.blk || 0 },
    { id: 'tov', label: 'TOV', align: 'right', sortKey: 'tov', render: (row) => row.tov || 0 },
    { id: 'foul', label: 'FOUL', align: 'right', sortKey: 'foul', render: (row) => row.foul || 0 },
    {
      id: 'ft',
      label: 'FT',
      align: 'right',
      sortValue: (row) => row.ftm || 0,
      render: (row) => `${row.ftm || 0}/${row.fta || 0}`,
    },
    {
      id: 'fg2',
      label: '2PT',
      align: 'right',
      sortValue: (row) => row.fg2m || 0,
      render: (row) => `${row.fg2m || 0}/${row.fg2a || 0}`,
    },
    {
      id: 'fg2Pct',
      label: '2PT%',
      align: 'right',
      sortValue: (row) => shotPercentage(row.fg2m, row.fg2a),
      render: (row) => formatShotPercentage(row.fg2m, row.fg2a),
    },
    {
      id: 'fg3',
      label: '3PT',
      align: 'right',
      sortValue: (row) => row.fg3m || 0,
      render: (row) => `${row.fg3m || 0}/${row.fg3a || 0}`,
    },
    {
      id: 'fg3Pct',
      label: '3PT%',
      align: 'right',
      sortValue: (row) => shotPercentage(row.fg3m, row.fg3a),
      render: (row) => formatShotPercentage(row.fg3m, row.fg3a),
    },
  ];

  const statsContent = (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-sm font-semibold text-slate-900">
          {isDualTeam ? (
            <CloudinaryImage
              src={participants?.home?.logo?.url || teamPlaceholder}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              decoding="async"
              srcSetWidths={[20, 40, 60]}
              sizes="20px"
              className="h-5 w-5 rounded-full border border-slate-200 bg-white object-cover"
            />
          ) : null}
          Box Score: {statsView.label}
        </div>
        <StatsTable
          columns={boxScoreColumns}
          rows={statsView.rows}
          tableClassName="w-max text-sm"
        />
      </div>

      {isDualTeam && statsView.secondaryRows ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-sm font-semibold text-slate-900">
            <CloudinaryImage
              src={participants?.away?.logo?.url || teamPlaceholder}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              decoding="async"
              srcSetWidths={[20, 40, 60]}
              sizes="20px"
              className="h-5 w-5 rounded-full border border-slate-200 bg-white object-cover"
            />
            Box Score: {statsView.secondaryLabel}
          </div>
          <StatsTable
            columns={boxScoreColumns}
            rows={statsView.secondaryRows}
            tableClassName="w-max text-sm"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3
            className="text-xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            Scoring Timeline
          </h3>
          <p className="text-sm text-slate-600">How the score progressed as the game went on.</p>
          <ScoringTimelineChart
            events={sortedEvents}
            isDualTeam={isDualTeam}
            homeLabel={getParticipantName(participants, 'home')}
            awayLabel={getParticipantName(participants, 'away')}
          />
        </div>

        <RecapShotSnapshot shotSnapshot={recap?.shotSnapshot} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="text-sm font-semibold text-slate-900">Play by Play</div>
          {sortedEvents.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllEvents((value) => !value)}
              aria-label={showAllEvents ? 'Show Last 5' : 'Show All'}
              className="text-xs font-semibold text-[#1B4332] hover:underline"
            >
              {showAllEvents ? 'Show Last 5' : 'Show All'}
            </button>
          ) : null}
        </div>
        {sortedEvents.length === 0 ? (
          <p className="p-3 text-sm text-slate-600">No events recorded.</p>
        ) : (
          <ul className="divide-y text-sm">
            {playByPlayEvents.map((event, index) => {
              const player = event.playerId ? playersById.get(event.playerId) : null;
              const playerName =
                player?.displayName || (event.playerId ? 'Unknown Player' : 'Opponent');
              const statLabel = STAT_LABELS[event.statType] || event.statType;
              const sideLabel =
                isDualTeam && event.teamSide
                  ? `${getParticipantName(participants, event.teamSide)}: `
                  : '';

              return (
                <li key={event.id} className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2">
                  <div className="text-xs text-slate-500">
                    #{showAllEvents ? sortedEvents.length - index : sortedEvents.length - index}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{`${sideLabel}${playerName}: ${statLabel}`}</p>
                    <p className="text-xs text-slate-600">{formatEventMeta(event)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const replayContent = canViewReplay ? (
    <GameReplayPanel
      events={replayEvents}
      players={team.players || []}
      isDualTeam={isDualTeam}
      participants={participants}
      replayFilters={data.replayFilters || ['all']}
    />
  ) : (
    <LockedFeatureCard planName="Team" pricingHref="/pricing">
      <div className="rounded-xl bg-slate-100 p-8 text-center text-slate-400">
        <p className="text-lg" style={{ fontFamily: "'Archivo Black', sans-serif" }}>
          Replay
        </p>
        <p className="mt-1 text-sm">Event-by-event possession replay</p>
      </div>
    </LockedFeatureCard>
  );

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
    updateSearchParam('composeFeedGame', null);
  }

  function openFeedComposer() {
    if (user) {
      updateSearchParam('composeFeedGame', '1');
      trackEvent('game_detail_feed_composer_opened', { game_id: gameId });
      return;
    }

    const returnUrl = `/games/${gameId}?composeFeedGame=1`;
    navigate(`/login?redirectTo=${encodeURIComponent(returnUrl)}`);
  }

  async function shareHighlightClip(eventId) {
    setClipShareState((s) => ({ ...s, [eventId]: 'loading' }));
    try {
      await feedApi.createHighlightClipPost({ gameId, eventId });
      setClipShareState((s) => ({ ...s, [eventId]: 'shared' }));
      trackEvent('game_highlight_clip_shared', { game_id: gameId });
    } catch (err) {
      // TSW-001: this used to collapse every failure into a generic "Failed
      // to share", which is what hid the real 403 (missing league-owner
      // affiliation check in assertFeedPostingAllowed) until we could read
      // server logs by requestId. Surface the server's actual message so
      // future failures are self-diagnosing from the UI alone.
      console.error('shareHighlightClip failed', {
        gameId,
        eventId,
        requestId: err.requestId,
        err,
      });
      const msg = err.message?.toLowerCase().includes('already been shared')
        ? 'Already shared'
        : err.message || 'Failed to share';
      setClipShareState((s) => ({ ...s, [eventId]: msg }));
    }
  }

  function onFeedPostCreated() {
    closeFeedComposer();
    trackEvent('game_detail_feed_post_created', { game_id: gameId });
    setFeedPostState('posted');
    window.setTimeout(() => {
      setFeedPostState((current) => (current === 'posted' ? '' : current));
    }, 1500);
  }

  const initialGameOption = game?.id
    ? {
        id: game.id,
        title: isDualTeam
          ? `${getParticipantName(participants, 'home')} vs ${getParticipantName(participants, 'away')}`
          : `${team?.name || 'Team'} vs ${recap?.opponent?.name || game?.opponent || 'Opponent'}`,
        score: isDualTeam
          ? `${gameSummary.homePoints ?? 0} – ${gameSummary.awayPoints ?? 0}`
          : `${gameSummary.teamPoints ?? 0} – ${gameSummary.opponentPoints ?? 0}`,
      }
    : null;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/games/${gameId}` : '';
  const matchupName = isDualTeam
    ? `${getParticipantName(participants, 'away')} at ${getParticipantName(participants, 'home')}`
    : `${team?.name || 'Team'} vs ${recap?.opponent?.name || game?.opponent || 'Opponent'}`;
  const cardFilename = `${matchupName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-game-header.svg`;
  const shareImageFilename = cardFilename.replace(/\.svg$/i, '.png');
  const shareSummary = isDualTeam
    ? `${getParticipantName(participants, 'away')} at ${getParticipantName(participants, 'home')} final: ${gameSummary.homePoints || 0}-${gameSummary.awayPoints || 0}.`
    : `${team?.name || 'Team'} vs ${recap?.opponent?.name || game?.opponent || 'Opponent'} final: ${gameSummary.teamPoints || 0}-${gameSummary.opponentPoints || 0}.`;
  const shareText = `${shareSummary}\nView game: ${shareUrl}`;

  // `preparedDataUrl` lets a caller that already generated the card (e.g.
  // shareHeaderCard's fallback path) hand it straight through instead of
  // this function regenerating it a second time.
  async function downloadHeaderCard(preparedDataUrl) {
    if (!data || isPreparingCard) {
      return;
    }

    let dataUrl = preparedDataUrl;
    if (!dataUrl) {
      setIsPreparingCard(true);
      try {
        dataUrl = await buildHeaderCardDataUrl();
      } finally {
        setIsPreparingCard(false);
      }
    }
    if (!dataUrl) {
      return;
    }

    trackEvent('game_detail_card_downloaded', { game_id: gameId });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = cardFilename;
    document.body.append(link);
    link.click();
    link.remove();
    setImageState('downloaded');
    window.setTimeout(() => {
      setImageState((current) => (current === 'downloaded' ? '' : current));
    }, 1500);
  }

  async function shareGameLinkFallback() {
    if (navigator?.share) {
      try {
        await navigator.share({
          title: `${matchupName} Game Card`,
          text: shareText,
          url: shareUrl,
        });
        return true;
      } catch (shareError) {
        if (shareError?.name === 'AbortError') {
          return true;
        }
      }
    }

    if (navigator?.clipboard?.writeText && shareUrl) {
      try {
        await navigator.clipboard.writeText(shareText);
        setImageState('copied');
        window.setTimeout(() => {
          setImageState((current) => (current === 'copied' ? '' : current));
        }, 1500);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  async function shareHeaderCard() {
    if (isSharingHeaderCardRef.current) {
      return;
    }

    trackEvent('game_detail_share_initiated', { game_id: gameId });
    isSharingHeaderCardRef.current = true;
    setIsSharingHeaderCard(true);

    try {
      const headerCardDataUrl = await buildHeaderCardDataUrl();

      if (headerCardDataUrl && navigator?.share && navigator?.canShare) {
        let file = null;
        try {
          file = await createPngFileFromSvgDataUrl(headerCardDataUrl, shareImageFilename);
        } catch {
          file = null;
        }

        if (file) {
          const payload = {
            title: `${matchupName} Game Card`,
            text: shareText,
            files: [file],
          };

          if (navigator.canShare(payload)) {
            try {
              await navigator.share(payload);
              return;
            } catch (shareError) {
              if (shareError?.name === 'AbortError') {
                return;
              }
            }
          }
        }
      }

      const didShareLink = await shareGameLinkFallback();
      if (!didShareLink) {
        downloadHeaderCard(headerCardDataUrl);
      }
    } finally {
      isSharingHeaderCardRef.current = false;
      setIsSharingHeaderCard(false);
    }
  }

  const printContent = (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 text-slate-900">
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[#141414] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1B4332]"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => updateSearchParam('print', null)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
        >
          Exit Print View
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
          Printable Box Score
        </p>
        <h1
          className="text-2xl text-slate-900"
          style={{ fontFamily: "'Archivo Black', sans-serif" }}
          aria-label={game.title}
        >
          {game.title}
        </h1>
        <p className="text-sm text-slate-700">
          {isDualTeam
            ? `${getParticipantName(participants, 'away')} at ${getParticipantName(participants, 'home')}`
            : `${team?.name || 'Team'} vs ${recap?.opponent?.name || game?.opponent || 'Opponent'}`}
        </p>
        <p className="text-sm text-slate-700">
          Final Score:{' '}
          {isDualTeam
            ? `${gameSummary.homePoints || 0}-${gameSummary.awayPoints || 0}`
            : `${gameSummary.teamPoints || 0}-${gameSummary.opponentPoints || 0}`}
        </p>
        <p className="text-sm text-slate-700">
          Date: {formatGameDate(recap?.playedAt || game?.scheduledAt || game?.createdAt)}
        </p>
      </div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
          Box Score: {statsView.label}
        </div>
        <StatsTable
          columns={boxScoreColumns}
          rows={statsView.rows}
          tableClassName="w-full text-sm"
        />
      </div>
      {isDualTeam && statsView.secondaryRows ? (
        <div className="overflow-x-auto rounded border border-slate-200">
          <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
            Box Score: {statsView.secondaryLabel}
          </div>
          <StatsTable
            columns={boxScoreColumns}
            rows={statsView.secondaryRows}
            tableClassName="w-full text-sm"
          />
        </div>
      ) : null}
    </section>
  );

  const leagueBreadcrumbs =
    isDualTeam && data.league
      ? [
          { label: 'Discover', href: '/home' },
          { label: data.league.name, href: `/league/${data.league.slug}` },
          { label: game.title || 'Game' },
        ]
      : null;

  return (
    <section className="space-y-4">
      {!isPrintMode && leagueBreadcrumbs ? <Breadcrumbs crumbs={leagueBreadcrumbs} /> : null}
      {!isPrintMode ? (
        <GameDetailHeader
          gameId={game.id}
          game={game}
          team={team}
          league={data.league}
          participants={participants}
          isDualTeam={isDualTeam}
          recap={recap}
          gameSummary={gameSummary}
          canContinueTracking={Boolean(game.status === 'in_progress' && game.ownerUserId)}
          actions={
            <>
              <button
                type="button"
                onClick={() => updateSearchParam('print', '1')}
                aria-label="Print box score"
                title="Print box score"
                className="flex flex-col items-center gap-1 rounded-lg text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A300]"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white transition hover:border-[#F4A300]/60 hover:bg-slate-50">
                  <PrintIcon />
                </span>
                <span className="text-[11px] font-medium">Print</span>
              </button>
              <button
                type="button"
                onClick={shareHeaderCard}
                aria-label="Share image card"
                title={isSharingHeaderCard ? 'Preparing image card' : 'Share image card'}
                className="flex flex-col items-center gap-1 rounded-lg text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A300] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!data || isSharingHeaderCard}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white transition hover:border-[#F4A300]/60 hover:bg-slate-50">
                  <ShareIcon />
                </span>
                <span className="text-[11px] font-medium">Share</span>
              </button>
              <button
                type="button"
                onClick={() => downloadHeaderCard()}
                aria-label="Download image card"
                title={
                  imageState === 'downloaded'
                    ? 'Downloaded'
                    : isPreparingCard
                      ? 'Preparing image card'
                      : 'Download image card'
                }
                className="flex flex-col items-center gap-1 rounded-lg text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A300] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!data || isPreparingCard}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white transition hover:border-[#F4A300]/60 hover:bg-slate-50">
                  <DownloadIcon downloaded={imageState === 'downloaded'} />
                </span>
                <span className="text-[11px] font-medium">Download</span>
              </button>
              <button
                type="button"
                onClick={openFeedComposer}
                aria-label="Share to The Pulse"
                title="Share to The Pulse"
                className="flex flex-col items-center gap-1 rounded-lg text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A300]"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white transition hover:border-[#F4A300]/60 hover:bg-slate-50">
                  <FeedIcon />
                </span>
                <span className="text-[11px] font-medium">Pulse</span>
              </button>
            </>
          }
        />
      ) : null}

      {isPrintMode ? printContent : null}

      {!isPrintMode ? (
        <Tabs
          defaultValue="recap"
          onChange={(tab) => trackEvent('game_detail_tab_changed', { game_id: gameId, tab })}
          items={[
            {
              value: 'recap',
              label: 'Recap',
              icon: <RecapTabIcon />,
              content: (
                <GameRecapPanel
                  team={team}
                  league={data.league}
                  participants={participants}
                  isDualTeam={isDualTeam}
                  recap={recap}
                  aiSummary={aiSummary}
                  videoUrl={game.videoUrl}
                  videoTitle={game.title}
                  highlights={data.highlights}
                  sharedEventIds={data.sharedEventIds}
                  canShareHighlights={canShareHighlights}
                  clipShareState={clipShareState}
                  onShareHighlightClip={shareHighlightClip}
                />
              ),
            },
            {
              value: 'stats',
              label: 'Stats',
              icon: <StatsTabIcon />,
              content: statsContent,
            },
            {
              value: 'replay',
              label: 'Replay',
              icon: <ReplayTabIcon />,
              content: replayContent,
            },
          ]}
        />
      ) : null}

      {!isPrintMode && feedPostState === 'posted' ? (
        <p className="text-sm font-medium text-emerald-700">Posted to The Pulse</p>
      ) : null}
      {!isPrintMode && error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Modal
        open={!isPrintMode && isFeedComposerOpen}
        onClose={closeFeedComposer}
        title="Share to The Pulse"
      >
        <FeedComposer
          initialTab="game"
          initialSelectedGameId={game.id}
          initialGameOption={initialGameOption}
          onCreated={onFeedPostCreated}
          onCancel={closeFeedComposer}
        />
      </Modal>
    </section>
  );
}
