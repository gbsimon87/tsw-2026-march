import { useMemo, useState } from 'react';
import courtImage from '../../../assets/courts/basketball_court_1.png';
import { STAT_LABELS, ZONE_LABELS } from '../constants';

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

function canReplayEvent(event) {
  return typeof event.x === 'number' && typeof event.y === 'number';
}

function isMade(statType) {
  return statType.endsWith('_MADE');
}

function emptyLine(player) {
  return {
    playerId: player.id,
    displayName: player.displayName,
    ftm: 0,
    fta: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    points: 0,
  };
}

function applyEventToLine(line, statType) {
  if (statType === 'FT_MADE') {
    line.ftm += 1;
    line.fta += 1;
    line.points += 1;
    return;
  }
  if (statType === 'FT_MISS') {
    line.fta += 1;
    return;
  }
  if (statType === 'FG2_MADE') {
    line.fg2m += 1;
    line.fg2a += 1;
    line.points += 2;
    return;
  }
  if (statType === 'FG2_MISS') {
    line.fg2a += 1;
    return;
  }
  if (statType === 'FG3_MADE') {
    line.fg3m += 1;
    line.fg3a += 1;
    line.points += 3;
    return;
  }
  if (statType === 'FG3_MISS') {
    line.fg3a += 1;
  }
}

export function GameReplayPanel({ events, players }) {
  const replayEvents = useMemo(() => (events || []).filter(canReplayEvent), [events]);
  const [currentIndex, setCurrentIndex] = useState(replayEvents.length ? 0 : -1);
  const currentEvent = currentIndex >= 0 ? replayEvents[currentIndex] : null;
  const visibleEvents = currentIndex >= 0 ? replayEvents.slice(0, currentIndex + 1) : [];
  const replayBoxScore = useMemo(() => {
    const basePlayers = players?.length
      ? players.map((player) => ({ id: player.id, displayName: player.displayName }))
      : Array.from(
          new Map(
            replayEvents.map((event) => [event.playerId, event.playerName || 'Unknown Player'])
          )
        ).map(([id, displayName]) => ({ id, displayName }));

    const lines = basePlayers.map(emptyLine);
    const byId = new Map(lines.map((line) => [line.playerId, line]));

    for (const event of visibleEvents) {
      if (!byId.has(event.playerId)) {
        const fallback = emptyLine({
          id: event.playerId,
          displayName: event.playerName || 'Unknown Player',
        });
        lines.push(fallback);
        byId.set(event.playerId, fallback);
      }
      applyEventToLine(byId.get(event.playerId), event.statType);
    }

    return lines;
  }, [players, replayEvents, visibleEvents]);

  return (
    <div className="space-y-3 rounded border bg-white p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Replay</h3>
        <p className="text-xs text-slate-600">
          {replayEvents.length === 0
            ? 'No events to replay'
            : `Event ${currentIndex + 1} of ${replayEvents.length}`}
        </p>
      </div>

      {replayEvents.length === 0 ? (
        <p className="text-sm text-slate-600">No coordinate-based events recorded for replay.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
              disabled={currentIndex <= 0}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex((value) => Math.min(replayEvents.length - 1, value + 1))
              }
              disabled={currentIndex >= replayEvents.length - 1}
              className="rounded border border-slate-700 bg-slate-700 px-3 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>

          <div className="rounded border bg-slate-50 p-2 text-xs text-slate-700">
            <p className="font-medium">
              {currentEvent?.playerName || 'Unknown Player'}:{' '}
              {STAT_LABELS[currentEvent?.statType] || currentEvent?.statType}
            </p>
            <p>
              {ZONE_LABELS[currentEvent?.zoneId] || currentEvent?.zoneId} | (
              {currentEvent?.x?.toFixed(1)}, {currentEvent?.y?.toFixed(1)}) |{' '}
              {eventTime(currentEvent?.occurredAt)}
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[420px]" data-testid="replay-shot-map">
            <img src={courtImage} alt="Replay court" className="block w-full" />
            {visibleEvents.map((event, index) => {
              const active = index === currentIndex;
              const made = isMade(event.statType);

              return (
                <span
                  key={event.id}
                  className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                    active ? 'h-5 w-5 border-slate-900' : 'h-3.5 w-3.5'
                  } ${made ? 'border-emerald-900 bg-emerald-500' : 'border-rose-900 bg-rose-500'}`}
                  style={{ left: `${event.x}%`, top: `${event.y}%`, opacity: active ? 1 : 0.75 }}
                  data-testid="replay-marker"
                />
              );
            })}
          </div>

          <div className="overflow-x-auto rounded border" data-testid="replay-box-score">
            <div className="border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Replay Box Score
            </div>
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-right">FT</th>
                  <th className="px-3 py-2 text-right">2PT</th>
                  <th className="px-3 py-2 text-right">3PT</th>
                  <th className="px-3 py-2 text-right">PTS</th>
                </tr>
              </thead>
              <tbody>
                {replayBoxScore.map((line) => (
                  <tr key={line.playerId} className="border-t">
                    <td className="px-3 py-2">{line.displayName}</td>
                    <td className="px-3 py-2 text-right">
                      {line.ftm}/{line.fta}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {line.fg2m}/{line.fg2a}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {line.fg3m}/{line.fg3a}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{line.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
