import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { Tabs } from '../../../components/Tabs';
import { Modal } from '../../../components/ui/Modal';
import { FeedComposer } from '../../feed/components/FeedComposer';
import { StatsTable } from '../../teams/components/StatsTable';
import { gamesApi } from '../api/gamesApi';
import { GameDetailHeader } from '../components/GameDetailHeader';
import { GameReplayPanel } from '../components/GameReplayPanel';
import { GameRecapPanel } from '../components/GameRecapPanel';
import { GameVideoEmbed } from '../components/GameVideoEmbed';
import { RecapShotSnapshot } from '../components/RecapShotSnapshot';
import { LockedFeatureCard } from '../../billing/components/LockedFeatureCard';
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

function canAccessReplay(team, entitlements) {
  void team;
  void entitlements;
  return true;
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

function buildPrimaryStatsView(data, isDualTeam) {
  if (!isDualTeam) {
    return {
      label: data.team?.name || 'Team',
      rows: [
        ...(data.boxScore?.players || []),
        {
          playerId: 'team-total',
          displayName: 'Team Total',
          ...(data.boxScore?.teamTotals || {}),
          isTeamTotal: true,
        },
      ],
    };
  }

  return {
    label: getParticipantName(data.participants, 'home'),
    rows: [
      ...(data.boxScore?.home?.players || []),
      {
        playerId: 'team-total',
        displayName: 'Team Total',
        ...(data.boxScore?.home?.totals || {}),
        isTeamTotal: true,
      },
    ],
    secondaryLabel: getParticipantName(data.participants, 'away'),
    secondaryRows: [
      ...(data.boxScore?.away?.players || []),
      {
        playerId: 'team-total-away',
        displayName: 'Team Total',
        ...(data.boxScore?.away?.totals || {}),
        isTeamTotal: true,
      },
    ],
  };
}

export function GameDetailPage() {
  const { gameId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [feedPostState, setFeedPostState] = useState('');

  const isFeedComposerOpen = searchParams.get('composeFeedGame') === '1';
  const isPrintMode = searchParams.get('print') === '1';

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

  const { game, team, boxScore, participants } = data;
  const isDualTeam = game.trackingMode === 'dual_team';
  const recap = data.recap;
  const playersById = buildPlayersById(data, isDualTeam);
  const gameSummary = data.gameSummary || {
    teamPoints: boxScore?.teamTotals?.points || 0,
    opponentPoints: boxScore?.opponentTotals?.points || 0,
    hasOpponentScore: (boxScore?.opponentTotals?.points || 0) > 0,
  };
  const entitlements = data.teamEntitlements || team.entitlements || {};
  const canViewReplay = canAccessReplay(team, entitlements);
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
        row.isTeamTotal || isDualTeam ? (
          row.displayName
        ) : (
          <Link
            to={`/teams/${team.id}/players/${row.playerId}`}
            className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
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
    { id: 'reb', label: 'REB', align: 'right', sortKey: 'reb', render: (row) => row.reb || 0 },
    { id: 'ast', label: 'AST', align: 'right', sortKey: 'ast', render: (row) => row.ast || 0 },
    { id: 'stl', label: 'STL', align: 'right', sortKey: 'stl', render: (row) => row.stl || 0 },
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
      id: 'fg3',
      label: '3PT',
      align: 'right',
      sortValue: (row) => row.fg3m || 0,
      render: (row) => `${row.fg3m || 0}/${row.fg3a || 0}`,
    },
  ];

  const statsContent = (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border bg-white">
        <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
          Box Score: {statsView.label}
        </div>
        <StatsTable
          columns={boxScoreColumns}
          rows={statsView.rows}
          tableClassName="w-max text-sm"
        />
      </div>

      {isDualTeam && statsView.secondaryRows ? (
        <div className="overflow-x-auto rounded border bg-white">
          <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
            Box Score: {statsView.secondaryLabel}
          </div>
          <StatsTable
            columns={boxScoreColumns}
            rows={statsView.secondaryRows}
            tableClassName="w-max text-sm"
          />
        </div>
      ) : null}

      <RecapShotSnapshot shotSnapshot={recap?.shotSnapshot} />

      <div className="rounded border bg-white">
        <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
          <div className="text-sm font-semibold">Play by Play</div>
          {sortedEvents.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllEvents((value) => !value)}
              className="text-xs font-semibold text-blue-600 hover:underline"
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

  const replayContent =
    canViewReplay && !isDualTeam ? (
      <GameReplayPanel events={replayEvents} players={team.players || []} />
    ) : (
      <LockedFeatureCard
        title={
          isDualTeam
            ? 'Replay is not available for league dual-team games yet'
            : 'Replay is temporarily unavailable'
        }
        description={
          isDualTeam
            ? 'Replay remains disabled here until side-aware league replay is fully supported.'
            : 'Replay is not available for this game right now.'
        }
      />
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
      return;
    }

    const returnUrl = `/games/${gameId}?composeFeedGame=1`;
    navigate(`/login?redirectTo=${encodeURIComponent(returnUrl)}`);
  }

  function onFeedPostCreated() {
    closeFeedComposer();
    setFeedPostState('posted');
    window.setTimeout(() => {
      setFeedPostState((current) => (current === 'posted' ? '' : current));
    }, 1500);
  }

  const initialGameOption =
    game?.id && team?.name
      ? {
          id: game.id,
          team: { name: team.name },
          opponent: game.opponent || game.title || recap?.opponent?.name || 'Opponent',
        }
      : null;

  const printContent = (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 text-slate-900">
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => updateSearchParam('print', null)}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
        >
          Exit Print View
        </button>
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">{game.title}</h1>
        <p className="text-sm text-slate-700">
          {isDualTeam
            ? `${getParticipantName(participants, 'away')} at ${getParticipantName(participants, 'home')}`
            : `${team?.name || 'Team'} vs ${recap?.opponent?.name || game?.opponent || 'Opponent'}`}
        </p>
        <p className="text-sm text-slate-700">
          Final:{' '}
          {isDualTeam
            ? `${gameSummary.homePoints || 0}-${gameSummary.awayPoints || 0}`
            : `${gameSummary.teamPoints || 0}-${gameSummary.opponentPoints || 0}`}
        </p>
        <p className="text-sm text-slate-700">
          Date: {formatGameDate(recap?.playedAt || game?.scheduledAt || game?.createdAt)}
        </p>
      </div>
    </section>
  );

  return (
    <section className="space-y-4">
      {!isPrintMode ? (
        <GameDetailHeader
          gameId={game.id}
          game={game}
          team={team}
          participants={participants}
          isDualTeam={isDualTeam}
          recap={recap}
          gameSummary={gameSummary}
          canContinueTracking={Boolean(game.status === 'in_progress' && game.ownerUserId)}
          actions={
            <button
              type="button"
              onClick={() => updateSearchParam('print', '1')}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Print Box Score
            </button>
          }
        />
      ) : null}

      {isPrintMode ? printContent : null}

      {!isPrintMode && game.videoUrl ? (
        <GameVideoEmbed videoUrl={game.videoUrl} title={game.title} />
      ) : null}

      {!isPrintMode ? (
        <Tabs
          defaultValue="recap"
          items={[
            {
              value: 'recap',
              label: 'Recap',
              content: (
                <GameRecapPanel
                  team={team}
                  participants={participants}
                  isDualTeam={isDualTeam}
                  gameId={game.id}
                  recap={recap}
                  onShareToFeed={openFeedComposer}
                />
              ),
            },
            { value: 'stats', label: 'Stats', content: statsContent },
            { value: 'replay', label: 'Replay', content: replayContent },
          ]}
        />
      ) : null}

      {!isPrintMode && feedPostState === 'posted' ? (
        <p className="text-sm font-medium text-emerald-700">Posted to feed</p>
      ) : null}
      {!isPrintMode && error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Modal
        open={!isPrintMode && isFeedComposerOpen}
        onClose={closeFeedComposer}
        title="Share to Feed"
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
