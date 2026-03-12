import { useMemo, useState } from 'react';
import courtImage from '../../../assets/courts/basketball_court_1.png';

function isMade(statType) {
  return statType.endsWith('_MADE');
}

function isShotEvent(statType) {
  return statType.startsWith('FG2_') || statType.startsWith('FG3_');
}

function matchesFilter(statType, filter) {
  if (filter === 'FG2') {
    return statType.startsWith('FG2_');
  }
  if (filter === 'FG3') {
    return statType.startsWith('FG3_');
  }
  return true;
}

export function GameShotMap({ events }) {
  const [shotFilter, setShotFilter] = useState('ALL');
  const [playerFilter, setPlayerFilter] = useState('ALL');
  const allShots = useMemo(
    () =>
      (events || []).filter(
        (event) =>
          isShotEvent(event.statType) && typeof event.x === 'number' && typeof event.y === 'number'
      ),
    [events]
  );
  const playerOptions = useMemo(() => {
    const map = new Map();
    for (const event of allShots) {
      if (event.playerId && !map.has(event.playerId)) {
        map.set(event.playerId, event.playerName || `Player ${map.size + 1}`);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allShots]);

  const plotted = allShots.filter(
    (event) =>
      matchesFilter(event.statType, shotFilter) &&
      (playerFilter === 'ALL' || event.playerId === playerFilter)
  );

  const madeCount = plotted.filter((event) => isMade(event.statType)).length;
  const missCount = plotted.length - madeCount;

  return (
    <div className="rounded border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Shot Map</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="shot-map-player-filter" className="text-xs text-slate-600">
            Player
          </label>
          <select
            id="shot-map-player-filter"
            value={playerFilter}
            onChange={(event) => setPlayerFilter(event.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          >
            <option value="ALL">All Players</option>
            {playerOptions.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${
            shotFilter === 'ALL'
              ? 'border-slate-700 bg-slate-700 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
          onClick={() => setShotFilter('ALL')}
        >
          All Shots
        </button>
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${
            shotFilter === 'FG2'
              ? 'border-slate-700 bg-slate-700 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
          onClick={() => setShotFilter('FG2')}
        >
          2PT
        </button>
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${
            shotFilter === 'FG3'
              ? 'border-slate-700 bg-slate-700 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
          onClick={() => setShotFilter('FG3')}
        >
          3PT
        </button>
      </div>

      <div className="mb-2 flex items-center gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Made ({madeCount})
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          Missed ({missCount})
        </span>
        <span className="text-slate-500">Total ({plotted.length})</span>
      </div>

      <div className="relative mx-auto w-full max-w-[420px]" data-testid="game-shot-map">
        <img src={courtImage} alt="Game shot map court" className="block w-full" />

        {plotted.map((event, index) => {
          const made = isMade(event.statType);
          const offset = (index % 3) * 1.2;

          return (
            <span
              key={event.id}
              className={`pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                made ? 'border-emerald-900 bg-emerald-500' : 'border-rose-900 bg-rose-500'
              }`}
              style={{
                left: `calc(${event.x}% + ${offset}px)`,
                top: `calc(${event.y}% + ${offset}px)`,
                opacity: 0.9,
              }}
              title={`${event.statType} @ (${event.x.toFixed(1)}, ${event.y.toFixed(1)})`}
              data-testid={made ? 'shot-made-marker' : 'shot-miss-marker'}
            />
          );
        })}
      </div>
    </div>
  );
}
