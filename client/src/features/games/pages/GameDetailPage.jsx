import { useEffect, useMemo, useState } from 'react';
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

function eventActorLabel(event, playersById) {
  if (!event.playerId) {
    return 'Opponent';
  }

  return playersById.get(event.playerId)?.displayName || 'Unknown Player';
}

function canAccessReplay(team, entitlements) {
  const billing = team?.billing || {};
  const hasActiveProBilling =
    billing.plan === 'pro' && ['active', 'trialing'].includes(billing.subscriptionStatus);

  return hasActiveProBilling && Boolean(entitlements?.canViewReplay);
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

  const playersById = useMemo(
    () => new Map((data?.team?.players || []).map((player) => [player.id, player])),
    [data]
  );

  if (isLoading) {
    return <p className="text-sm">Loading game...</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-600">{error || 'Game not found'}</p>;
  }

  const { game, team, boxScore } = data;
  const recap = data.recap;
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
  const boxScoreRows = [
    ...boxScore.players,
    {
      playerId: 'team-total',
      displayName: 'Team Total',
      ftm: boxScore.teamTotals.ftm,
      fta: boxScore.teamTotals.fta,
      fg2m: boxScore.teamTotals.fg2m,
      fg2a: boxScore.teamTotals.fg2a,
      fg3m: boxScore.teamTotals.fg3m,
      fg3a: boxScore.teamTotals.fg3a,
      ast: boxScore.teamTotals.ast,
      oreb: boxScore.teamTotals.oreb,
      dreb: boxScore.teamTotals.dreb,
      reb: boxScore.teamTotals.reb,
      points: boxScore.teamTotals.points,
      isTeamTotal: true,
    },
  ];
  const boxScoreColumns = [
    {
      id: 'player',
      label: 'Player',
      align: 'left',
      sortKey: 'displayName',
      render: (row) =>
        row.isTeamTotal ? (
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
      emphasis: true,
      render: (row) => row.points,
    },
    {
      id: 'reb',
      label: 'REB',
      align: 'right',
      sortKey: 'reb',
      render: (row) => row.reb,
    },
    {
      id: 'ast',
      label: 'AST',
      align: 'right',
      sortKey: 'ast',
      render: (row) => row.ast,
    },
    {
      id: 'stl',
      label: 'STL',
      align: 'right',
      sortKey: 'stl',
      render: (row) => row.stl,
    },
    {
      id: 'tov',
      label: 'TOV',
      align: 'right',
      sortKey: 'tov',
      render: (row) => row.tov,
    },
    {
      id: 'foul',
      label: 'FOUL',
      align: 'right',
      sortKey: 'foul',
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
    {
      id: 'oreb',
      label: 'OREB',
      align: 'right',
      sortKey: 'oreb',
      render: (row) => row.oreb,
    },
    {
      id: 'dreb',
      label: 'DREB',
      align: 'right',
      sortKey: 'dreb',
      render: (row) => row.dreb,
    },
  ];

  const statsContent = (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border bg-white">
        <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Box Score</div>
        <StatsTable columns={boxScoreColumns} rows={boxScoreRows} tableClassName="w-max text-sm" />
      </div>

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
              const playerName = eventActorLabel(event, playersById);
              const statLabel = STAT_LABELS[event.statType] || event.statType;

              return (
                <li key={event.id} className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2">
                  <div className="text-xs text-slate-500">
                    #{showAllEvents ? sortedEvents.length - index : sortedEvents.length - index}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      {player?.id && team?.id ? (
                        <>
                          <Link
                            to={`/teams/${team.id}/players/${player.id}`}
                            className="text-blue-700 hover:text-blue-900 hover:underline"
                          >
                            {playerName}
                          </Link>
                          {`: ${statLabel}`}
                        </>
                      ) : (
                        `${playerName}: ${statLabel}`
                      )}
                    </p>
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
    <GameReplayPanel events={replayEvents} players={team.players || []} />
  ) : (
    <LockedFeatureCard
      title="Replay is only available for Pro users"
      description="Upgrade to Team Pro to unlock interactive event replay and the live-updating replay box score."
      showUpgrade
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

  return (
    <section className="space-y-4">
      <GameDetailHeader
        gameId={game.id}
        game={game}
        team={team}
        recap={recap}
        gameSummary={gameSummary}
        canContinueTracking={Boolean(game.status === 'in_progress' && game.ownerUserId)}
        className={isPrintMode ? 'print:rounded-none print:p-0' : ''}
        actions={
          !isPrintMode ? (
            <button
              type="button"
              onClick={() => updateSearchParam('print', '1')}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Print Box Score
            </button>
          ) : (
            <>
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
            </>
          )
        }
      />

      {isPrintMode ? (
        <div className="overflow-x-auto rounded border bg-white p-4 print:overflow-visible print:rounded-none print:border-0 print:bg-white print:p-0">
          <StatsTable
            columns={boxScoreColumns}
            rows={boxScoreRows}
            tableClassName="w-full text-sm print:text-xs"
          />
        </div>
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
