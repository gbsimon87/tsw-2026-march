import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Tabs } from '../../../components/Tabs';
import { StatsTable } from '../../teams/components/StatsTable';
import { gamesApi } from '../api/gamesApi';
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

function canAccessReplay(team, entitlements) {
  const billing = team?.billing || {};
  const hasActiveProBilling =
    billing.plan === 'pro' && ['active', 'trialing'].includes(billing.subscriptionStatus);

  return hasActiveProBilling && Boolean(entitlements?.canViewReplay);
}

export function GameDetailPage() {
  const { gameId } = useParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);

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
              const player = playersById.get(event.playerId);
              const playerName = player?.displayName || 'Unknown Player';
              const statLabel = STAT_LABELS[event.statType] || event.statType;

              return (
                <li key={event.id} className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2">
                  <div className="text-xs text-slate-500">
                    #{showAllEvents ? sortedEvents.length - index : sortedEvents.length - index}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      {playerName}: {statLabel}
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

  return (
    <section className="space-y-4">
      <Tabs
        defaultValue="recap"
        items={[
          {
            value: 'recap',
            label: 'Recap',
            content: (
              <GameRecapPanel
                game={game}
                team={team}
                gameId={game.id}
                recap={recap}
                canContinueTracking={Boolean(game.status === 'in_progress' && game.ownerUserId)}
              />
            ),
          },
          { value: 'stats', label: 'Stats', content: statsContent },
          { value: 'replay', label: 'Replay', content: replayContent },
        ]}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
