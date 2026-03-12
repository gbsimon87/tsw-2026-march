import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Tabs } from '../../../components/Tabs';
import { gamesApi } from '../api/gamesApi';
import { GameShotMap } from '../components/GameShotMap';
import { STAT_LABELS, ZONE_LABELS } from '../constants';

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

export function GameDetailPage() {
  const { gameId } = useParams();
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

  const boxScoreContent = (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border bg-white">
        <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Box Score</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">FT</th>
              <th className="px-3 py-2 text-right">2PT</th>
              <th className="px-3 py-2 text-right">3PT</th>
              <th className="px-3 py-2 text-right">PTS</th>
            </tr>
          </thead>
          <tbody>
            {boxScore.players.map((row) => (
              <tr key={row.playerId} className="border-t">
                <td className="px-3 py-2">{row.displayName}</td>
                <td className="px-3 py-2 text-right">
                  {row.ftm}/{row.fta}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.fg2m}/{row.fg2a}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.fg3m}/{row.fg3a}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{row.points}</td>
              </tr>
            ))}
            <tr className="border-t bg-slate-50 font-semibold">
              <td className="px-3 py-2">Team Total</td>
              <td className="px-3 py-2 text-right">
                {boxScore.teamTotals.ftm}/{boxScore.teamTotals.fta}
              </td>
              <td className="px-3 py-2 text-right">
                {boxScore.teamTotals.fg2m}/{boxScore.teamTotals.fg2a}
              </td>
              <td className="px-3 py-2 text-right">
                {boxScore.teamTotals.fg3m}/{boxScore.teamTotals.fg3a}
              </td>
              <td className="px-3 py-2 text-right">{boxScore.teamTotals.points}</td>
            </tr>
          </tbody>
        </table>
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
              const zoneLabel = ZONE_LABELS[event.zoneId] || event.zoneId;
              const x = typeof event.x === 'number' ? event.x.toFixed(1) : '?';
              const y = typeof event.y === 'number' ? event.y.toFixed(1) : '?';

              return (
                <li key={event.id} className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2">
                  <div className="text-xs text-slate-500">#{index + 1}</div>
                  <div>
                    <p className="font-medium text-slate-900">
                      {playerName}: {statLabel}
                    </p>
                    <p className="text-xs text-slate-600">
                      {zoneLabel} | ({x}, {y}) | {eventTime(event.occurredAt)}
                    </p>
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
          Team: {team.name} | Status: {game.status}
        </p>
        {game.status === 'in_progress' ? (
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

  return (
    <section className="space-y-4">
      <Tabs
        defaultValue="box-score"
        items={[
          { value: 'box-score', label: 'Box Score', content: boxScoreContent },
          { value: 'game-info', label: 'Game Info', content: gameInfoContent },
        ]}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
