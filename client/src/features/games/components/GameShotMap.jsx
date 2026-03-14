import { useMemo, useState } from 'react';
import courtImage from '../../../assets/courts/basketball_court_1.png';
import gameConstants from '../constants';
import {
  CORNER_THREE_MAX_LOCAL_Y_FEET,
  CORNER_THREE_X_FEET,
  COURT_LENGTH_FEET,
  HOOP_OFFSET_FROM_BASELINE_FEET,
  HOOP_X_FEET,
  LANE_HALF_WIDTH_FEET,
  THREE_POINT_RADIUS_FEET,
  feetToNormalized,
} from '../court/courtGeometry';
import { courtToImage, DEFAULT_COURT_IMAGE_CALIBRATION } from '../court/courtImageCalibration';

const { ZONE_LABELS } = gameConstants;

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

function toImagePointFromFeet(xFeet, yFeet) {
  return courtToImage(feetToNormalized(xFeet, yFeet), DEFAULT_COURT_IMAGE_CALIBRATION);
}

function pathFromPoints(points) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function buildThreeArcPoints(hoopYFeet, direction, thresholds) {
  const radius = thresholds.threePointRadiusFeet;
  const yLocal = thresholds.cornerThreeMaxLocalYFeet;
  const maxX = Math.sqrt(Math.max(radius * radius - yLocal * yLocal, 0));
  const steps = 28;
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const localX = -maxX + t * (maxX * 2);
    const localY = Math.sqrt(Math.max(radius * radius - localX * localX, 0));
    const yFeet = hoopYFeet + direction * localY;
    points.push(toImagePointFromFeet(HOOP_X_FEET + localX, yFeet));
  }

  return points;
}

function buildZoneOverlayPaths() {
  const thresholds = {
    threePointRadiusFeet:
      DEFAULT_COURT_IMAGE_CALIBRATION.inference?.threePointRadiusFeet ?? THREE_POINT_RADIUS_FEET,
    cornerThreeMaxLocalYFeet:
      DEFAULT_COURT_IMAGE_CALIBRATION.inference?.cornerThreeMaxLocalYFeet ??
      CORNER_THREE_MAX_LOCAL_Y_FEET,
    cornerThreeXFeet:
      DEFAULT_COURT_IMAGE_CALIBRATION.inference?.cornerThreeXFeet ?? CORNER_THREE_X_FEET,
  };

  const cornerLeftXFeet = HOOP_X_FEET - thresholds.cornerThreeXFeet;
  const cornerRightXFeet = HOOP_X_FEET + thresholds.cornerThreeXFeet;
  const northHoopYFeet = HOOP_OFFSET_FROM_BASELINE_FEET;
  const southHoopYFeet = COURT_LENGTH_FEET - HOOP_OFFSET_FROM_BASELINE_FEET;
  const northCornerYFeet = northHoopYFeet + thresholds.cornerThreeMaxLocalYFeet;
  const southCornerYFeet = southHoopYFeet - thresholds.cornerThreeMaxLocalYFeet;

  const northArc = pathFromPoints(buildThreeArcPoints(northHoopYFeet, 1, thresholds));
  const southArc = pathFromPoints(buildThreeArcPoints(southHoopYFeet, -1, thresholds));

  const northCornerLeft = [
    toImagePointFromFeet(cornerLeftXFeet, 0),
    toImagePointFromFeet(cornerLeftXFeet, northCornerYFeet),
  ];
  const northCornerRight = [
    toImagePointFromFeet(cornerRightXFeet, 0),
    toImagePointFromFeet(cornerRightXFeet, northCornerYFeet),
  ];
  const southCornerLeft = [
    toImagePointFromFeet(cornerLeftXFeet, COURT_LENGTH_FEET),
    toImagePointFromFeet(cornerLeftXFeet, southCornerYFeet),
  ];
  const southCornerRight = [
    toImagePointFromFeet(cornerRightXFeet, COURT_LENGTH_FEET),
    toImagePointFromFeet(cornerRightXFeet, southCornerYFeet),
  ];

  const northPaintTopLeft = toImagePointFromFeet(HOOP_X_FEET - LANE_HALF_WIDTH_FEET, 0);
  const northPaintBottomRight = toImagePointFromFeet(HOOP_X_FEET + LANE_HALF_WIDTH_FEET, 19);
  const southPaintTopLeft = toImagePointFromFeet(HOOP_X_FEET - LANE_HALF_WIDTH_FEET, 75);
  const southPaintBottomRight = toImagePointFromFeet(
    HOOP_X_FEET + LANE_HALF_WIDTH_FEET,
    COURT_LENGTH_FEET
  );

  const leftMidSplitStart = toImagePointFromFeet(HOOP_X_FEET - 8, 19);
  const leftMidSplitEnd = toImagePointFromFeet(HOOP_X_FEET - 8, 47);
  const rightMidSplitStart = toImagePointFromFeet(HOOP_X_FEET + 8, 19);
  const rightMidSplitEnd = toImagePointFromFeet(HOOP_X_FEET + 8, 47);
  const centerSplitStart = toImagePointFromFeet(HOOP_X_FEET, 19);
  const centerSplitEnd = toImagePointFromFeet(HOOP_X_FEET, 75);

  const backcourtLineLeft = toImagePointFromFeet(0, 47);
  const backcourtLineRight = toImagePointFromFeet(50, 47);

  return {
    northArc,
    southArc,
    northCornerLeft,
    northCornerRight,
    southCornerLeft,
    southCornerRight,
    northPaintTopLeft,
    northPaintBottomRight,
    southPaintTopLeft,
    southPaintBottomRight,
    leftMidSplitStart,
    leftMidSplitEnd,
    rightMidSplitStart,
    rightMidSplitEnd,
    centerSplitStart,
    centerSplitEnd,
    backcourtLineLeft,
    backcourtLineRight,
  };
}

export function GameShotMap({ events }) {
  const [shotFilter, setShotFilter] = useState('ALL');
  const [playerFilter, setPlayerFilter] = useState('ALL');
  const [showZoneLines, setShowZoneLines] = useState(true);
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
  const zoneRows = useMemo(() => {
    const map = new Map();
    for (const event of plotted) {
      const key = event.zoneId || 'UNKNOWN_ZONE';
      if (!map.has(key)) {
        map.set(key, { zoneId: key, made: 0, miss: 0, total: 0 });
      }
      const row = map.get(key);
      row.total += 1;
      if (isMade(event.statType)) {
        row.made += 1;
      } else {
        row.miss += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [plotted]);
  const overlay = useMemo(() => buildZoneOverlayPaths(), []);

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
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${
            showZoneLines
              ? 'border-slate-700 bg-slate-700 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
          onClick={() => setShowZoneLines((value) => !value)}
        >
          {showZoneLines ? 'Hide Zones' : 'Show Zones'}
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
        {showZoneLines ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-label="Shot zones overlay"
            data-testid="shot-zone-overlay"
          >
            <g stroke="#334155" strokeWidth="0.35" fill="none" opacity="0.65">
              <path d={overlay.northArc} />
              <path d={overlay.southArc} />
              <path d={pathFromPoints(overlay.northCornerLeft)} />
              <path d={pathFromPoints(overlay.northCornerRight)} />
              <path d={pathFromPoints(overlay.southCornerLeft)} />
              <path d={pathFromPoints(overlay.southCornerRight)} />
              <rect
                x={overlay.northPaintTopLeft.x}
                y={overlay.northPaintTopLeft.y}
                width={overlay.northPaintBottomRight.x - overlay.northPaintTopLeft.x}
                height={overlay.northPaintBottomRight.y - overlay.northPaintTopLeft.y}
              />
              <rect
                x={overlay.southPaintTopLeft.x}
                y={overlay.southPaintTopLeft.y}
                width={overlay.southPaintBottomRight.x - overlay.southPaintTopLeft.x}
                height={overlay.southPaintBottomRight.y - overlay.southPaintTopLeft.y}
              />
              <path d={pathFromPoints([overlay.leftMidSplitStart, overlay.leftMidSplitEnd])} />
              <path d={pathFromPoints([overlay.rightMidSplitStart, overlay.rightMidSplitEnd])} />
              <path d={pathFromPoints([overlay.centerSplitStart, overlay.centerSplitEnd])} />
              <path d={pathFromPoints([overlay.backcourtLineLeft, overlay.backcourtLineRight])} />
            </g>
          </svg>
        ) : null}

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
              title={`${isMade(event.statType) ? 'Made' : 'Missed'} | ${
                ZONE_LABELS[event.zoneId] || event.zoneId || 'Unknown Zone'
              } | (${event.x.toFixed(1)}, ${event.y.toFixed(1)})`}
              data-testid={made ? 'shot-made-marker' : 'shot-miss-marker'}
            />
          );
        })}
      </div>

      <div className="mt-3 overflow-x-auto rounded border">
        <div className="border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Zone Results
        </div>
        {zoneRows.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">No shots for current filters.</p>
        ) : (
          <table className="min-w-full text-xs" data-testid="shot-zone-table">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Zone</th>
                <th className="px-3 py-2 text-right">Made</th>
                <th className="px-3 py-2 text-right">Missed</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {zoneRows.map((row) => (
                <tr key={row.zoneId} className="border-t">
                  <td className="px-3 py-2">{ZONE_LABELS[row.zoneId] || row.zoneId}</td>
                  <td className="px-3 py-2 text-right">{row.made}</td>
                  <td className="px-3 py-2 text-right">{row.miss}</td>
                  <td className="px-3 py-2 text-right font-medium">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
