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

  const printBoxScoreColumns = [
    {
      id: 'player',
      label: 'Player',
      align: 'left',
      headerClassName: 'w-[28%] min-w-[12rem]',
      cellClassName: 'max-w-[14rem] whitespace-normal break-words pr-3 text-left',
      render: (row) => row.displayName,
    },
    { id: 'pts', label: 'PTS', align: 'right', render: (row) => row.points },
    { id: 'reb', label: 'REB', align: 'right', render: (row) => row.reb },
    { id: 'ast', label: 'AST', align: 'right', render: (row) => row.ast },
    { id: 'stl', label: 'STL', align: 'right', render: (row) => row.stl },
    { id: 'tov', label: 'TOV', align: 'right', render: (row) => row.tov },
    { id: 'foul', label: 'FOUL', align: 'right', render: (row) => row.foul },
    { id: 'ft', label: 'FT', align: 'right', render: (row) => `${row.ftm}/${row.fta}` },
    { id: 'fg2', label: '2PT', align: 'right', render: (row) => `${row.fg2m}/${row.fg2a}` },
    { id: 'fg3', label: '3PT', align: 'right', render: (row) => `${row.fg3m}/${row.fg3a}` },
    { id: 'oreb', label: 'OREB', align: 'right', render: (row) => row.oreb },
    { id: 'dreb', label: 'DREB', align: 'right', render: (row) => row.dreb },
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

  const printContent = (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 print:mx-auto print:max-w-[7.35in] print:space-y-2 print:rounded-none print:border-0 print:p-0">
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

      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 print:break-inside-avoid print:gap-3 print:pb-2">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Printable Box Score
          </p>
          <h1 className="text-2xl font-bold text-slate-900 print:text-[1.35rem]">
            {team?.name || recap?.team?.name || game?.title || 'Team'}
          </h1>
          <p className="text-sm text-slate-700 print:text-xs">
            vs {recap?.opponent?.name || game?.opponent || 'Opponent'}
          </p>
          <div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2 sm:gap-x-6 print:gap-y-0.5">
            <p>Date: {formatGameDate(recap?.playedAt || game?.scheduledAt || game?.createdAt)}</p>
            <p>Status: {game?.status || 'unknown'}</p>
            <p>Recorded: {formatGameDate(game?.createdAt)}</p>
            <p>Finished: {formatGameDate(game?.completedAt)}</p>
          </div>
        </div>
        <div className="min-w-[11rem] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right print:min-w-[8.35rem] print:px-3 print:py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Final Score
          </p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2 print:mt-1.5">
            <div className="text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {team?.name || 'Team'}
              </p>
              <p className="text-3xl font-bold leading-none print:text-[1.7rem]">
                {gameSummary.teamPoints}
              </p>
            </div>
            <p className="pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Final
            </p>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {recap?.opponent?.name || game?.opponent || 'Opponent'}
              </p>
              <p className="text-3xl font-bold leading-none print:text-[1.7rem]">
                {gameSummary.opponentPoints}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full table-fixed border-collapse text-sm print:text-[11px]">
          <thead>
            <tr className="border-b-2 border-slate-300 text-slate-600">
              {printBoxScoreColumns.map((column) => (
                <th
                  key={column.id}
                  className={`px-2 py-2 font-semibold print:px-1.5 print:py-1.5 ${column.align === 'right' ? 'text-right' : 'text-left'} ${column.headerClassName || ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {boxScoreRows.map((row) => (
              <tr
                key={row.playerId}
                className={`${row.isTeamTotal ? 'border-t-2 border-slate-300 bg-slate-50 font-semibold' : 'border-t border-slate-200'} print:break-inside-avoid`}
              >
                {printBoxScoreColumns.map((column) => (
                  <td
                    key={column.id}
                    className={`px-2 py-2 align-top print:px-1.5 print:py-1.5 ${column.align === 'right' ? 'text-right' : 'text-left'} ${column.cellClassName || ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
