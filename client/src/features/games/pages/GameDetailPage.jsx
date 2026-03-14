import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { Tabs } from '../../../components/Tabs';
import { StatsTable } from '../../teams/components/StatsTable';
import { gamesApi } from '../api/gamesApi';
import { GameReplayPanel } from '../components/GameReplayPanel';
import { GameShotMap } from '../components/GameShotMap';
import gameConstants from '../constants';

const { STAT_LABELS, ZONE_LABELS } = gameConstants;

function formatDateTime(value) {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleString();
}

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

export function GameDetailPage() {
  const { gameId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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
  const sortedEvents = [...game.events].sort((a, b) => {
    const aTime = new Date(a.occurredAt || 0).getTime();
    const bTime = new Date(b.occurredAt || 0).getTime();
    return aTime - bTime;
  });
  const shotMapEvents = game.events.map((event) => ({
    ...event,
    playerName: playersById.get(event.playerId)?.displayName || 'Unknown Player',
  }));
  const replayEvents = sortedEvents.map((event) => ({
    ...event,
    playerName: playersById.get(event.playerId)?.displayName || 'Unknown Player',
  }));
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
      render: (row) => row.displayName,
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

  const boxScoreContent = (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border bg-white">
        <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Box Score</div>
        <StatsTable
          columns={boxScoreColumns}
          rows={boxScoreRows}
          tableClassName="min-w-full text-sm"
        />
      </div>

      <GameShotMap events={shotMapEvents} />

      <div className="rounded border bg-white">
        <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Play by Play</div>
        {sortedEvents.length === 0 ? (
          <p className="p-3 text-sm text-slate-600">No events recorded.</p>
        ) : (
          <ul className="divide-y text-sm">
            {sortedEvents.map((event, index) => {
              const player = playersById.get(event.playerId);
              const playerName = player?.displayName || 'Unknown Player';
              const statLabel = STAT_LABELS[event.statType] || event.statType;

              return (
                <li key={event.id} className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2">
                  <div className="text-xs text-slate-500">#{index + 1}</div>
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

  const gameInfoContent = (
    <div className="space-y-4">
      <div className="rounded border bg-white p-3">
        <h2 className="text-lg font-semibold">{game.title}</h2>
        <p className="text-sm text-slate-600">
          Team:{' '}
          <Link className="font-medium text-blue-600 hover:underline" to={`/teams/${team.id}`}>
            {team.name}
          </Link>{' '}
          | Status: {game.status}
        </p>
        {game.status === 'in_progress' && user ? (
          <Link
            className="mt-2 inline-block text-sm text-blue-600 hover:underline"
            to={`/games/${game.id}/track`}
          >
            Continue Tracking
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Game Date / Time</p>
          <p className="mt-1 text-sm font-medium">
            {formatDateTime(game.scheduledAt || game.createdAt)}
          </p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Recorded At</p>
          <p className="mt-1 text-sm font-medium">{formatDateTime(game.createdAt)}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Finished At</p>
          <p className="mt-1 text-sm font-medium">{formatDateTime(game.completedAt)}</p>
        </div>
      </div>
    </div>
  );
  const replayContent = <GameReplayPanel events={replayEvents} players={team.players || []} />;

  return (
    <section className="space-y-4">
      <Tabs
        defaultValue="box-score"
        items={[
          { value: 'box-score', label: 'Box Score', content: boxScoreContent },
          { value: 'replay', label: 'Replay', content: replayContent },
          { value: 'game-info', label: 'Game Info', content: gameInfoContent },
        ]}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
