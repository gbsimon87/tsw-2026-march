import { useEffect, useMemo, useState } from 'react';
import courtImage from '../../../assets/courts/basketball_court_1.png';
import { courtToImage, DEFAULT_COURT_IMAGE_CALIBRATION } from '../court/courtImageCalibration';

function normalizeFromPointer(event, element) {
  const rect = element.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  const pointerX = Number.isFinite(event.clientX)
    ? event.clientX
    : rect.left + (event.nativeEvent?.offsetX || 0);
  const pointerY = Number.isFinite(event.clientY)
    ? event.clientY
    : rect.top + (event.nativeEvent?.offsetY || 0);

  const x = ((pointerX - rect.left) / width) * 100;
  const y = ((pointerY - rect.top) / height) * 100;

  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
}

export function InteractiveCourtImage({
  selectedPoint,
  onSelect,
  calibration = DEFAULT_COURT_IMAGE_CALIBRATION,
}) {
  const [showCalibration, setShowCalibration] = useState(false);
  const [draftRect, setDraftRect] = useState(calibration.courtRect);
  const [dragState, setDragState] = useState(null);

  useEffect(() => {
    setDraftRect(calibration.courtRect);
  }, [calibration]);

  const activeCalibration = useMemo(
    () => ({
      courtRect: draftRect,
    }),
    [draftRect]
  );

  function onSelectPoint(event) {
    const point = normalizeFromPointer(event, event.currentTarget);
    onSelect(point);
  }

  const rect = draftRect;
  const centerTop = courtToImage({ x: 50, y: 0 }, activeCalibration);
  const centerBottom = courtToImage({ x: 50, y: 100 }, activeCalibration);
  const centerLeft = courtToImage({ x: 0, y: 50 }, activeCalibration);
  const centerRight = courtToImage({ x: 100, y: 50 }, activeCalibration);
  const northFt = courtToImage({ x: 50, y: 20.21 }, activeCalibration);
  const southFt = courtToImage({ x: 50, y: 79.79 }, activeCalibration);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function startDrag(event, corner) {
    event.preventDefault();
    event.stopPropagation();

    setDragState({
      corner,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: draftRect,
    });
  }

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    function onMove(event) {
      const minSize = 20;
      const dx = event.clientX - dragState.startClientX;
      const dy = event.clientY - dragState.startClientY;

      const deltaX = (dx / 420) * 100;
      const deltaY = (dy / 760) * 100;

      const start = dragState.startRect;
      const left = start.left;
      const top = start.top;
      const right = start.left + start.width;
      const bottom = start.top + start.height;

      let nextLeft = left;
      let nextTop = top;
      let nextRight = right;
      let nextBottom = bottom;

      if (dragState.corner.includes('l')) {
        nextLeft = clamp(left + deltaX, 0, right - minSize);
      }
      if (dragState.corner.includes('r')) {
        nextRight = clamp(right + deltaX, left + minSize, 100);
      }
      if (dragState.corner.includes('t')) {
        nextTop = clamp(top + deltaY, 0, bottom - minSize);
      }
      if (dragState.corner.includes('b')) {
        nextBottom = clamp(bottom + deltaY, top + minSize, 100);
      }

      setDraftRect({
        left: Number(nextLeft.toFixed(2)),
        top: Number(nextTop.toFixed(2)),
        width: Number((nextRight - nextLeft).toFixed(2)),
        height: Number((nextBottom - nextTop).toFixed(2)),
      });
    }

    function onUp() {
      setDragState(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragState]);

  const calibrationJson = JSON.stringify({ courtRect: draftRect }, null, 2);

  async function copyCalibration() {
    try {
      await navigator.clipboard.writeText(calibrationJson);
    } catch {
      // noop
    }
  }

  return (
    <div className="rounded border bg-white p-3">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          onClick={() => setShowCalibration((value) => !value)}
        >
          {showCalibration ? 'Hide calibration' : 'Show calibration'}
        </button>
      </div>

      <div
        className="relative mx-auto w-full max-w-[420px] touch-none"
        role="img"
        aria-label="Basketball court image"
        data-testid="interactive-court-image"
        onPointerDown={onSelectPoint}
        onClick={onSelectPoint}
      >
        <img
          src={courtImage}
          alt="Basketball court"
          className="block w-full select-none"
          draggable={false}
        />

        {showCalibration ? (
          <>
            <span
              className="pointer-events-none absolute border border-cyan-500"
              style={{
                left: `${rect.left}%`,
                top: `${rect.top}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
              }}
              data-testid="calibration-rect"
            />
            <button
              type="button"
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-700 bg-cyan-300"
              style={{ left: `${rect.left}%`, top: `${rect.top}%` }}
              onPointerDown={(event) => startDrag(event, 'lt')}
              aria-label="Top left calibration handle"
            />
            <button
              type="button"
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-700 bg-cyan-300"
              style={{ left: `${rect.left + rect.width}%`, top: `${rect.top}%` }}
              onPointerDown={(event) => startDrag(event, 'rt')}
              aria-label="Top right calibration handle"
            />
            <button
              type="button"
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-700 bg-cyan-300"
              style={{ left: `${rect.left}%`, top: `${rect.top + rect.height}%` }}
              onPointerDown={(event) => startDrag(event, 'lb')}
              aria-label="Bottom left calibration handle"
            />
            <button
              type="button"
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-700 bg-cyan-300"
              style={{ left: `${rect.left + rect.width}%`, top: `${rect.top + rect.height}%` }}
              onPointerDown={(event) => startDrag(event, 'rb')}
              aria-label="Bottom right calibration handle"
            />
            <span
              className="pointer-events-none absolute border-t border-cyan-400"
              style={{
                left: `${centerLeft.x}%`,
                top: `${centerLeft.y}%`,
                width: `${centerRight.x - centerLeft.x}%`,
              }}
              data-testid="calibration-midline-horizontal"
            />
            <span
              className="pointer-events-none absolute border-l border-cyan-400"
              style={{
                left: `${centerTop.x}%`,
                top: `${centerTop.y}%`,
                height: `${centerBottom.y - centerTop.y}%`,
              }}
              data-testid="calibration-midline-vertical"
            />
            <span
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500"
              style={{ left: `${northFt.x}%`, top: `${northFt.y}%` }}
              data-testid="calibration-north-ft"
            />
            <span
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500"
              style={{ left: `${southFt.x}%`, top: `${southFt.y}%` }}
              data-testid="calibration-south-ft"
            />
          </>
        ) : null}

        {selectedPoint ? (
          <>
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-900 bg-red-500"
              style={{ left: `${selectedPoint.x}%`, top: `${selectedPoint.y}%` }}
            />
            <span
              className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-500"
              style={{ left: `${selectedPoint.x}%`, top: `${selectedPoint.y}%`, opacity: 0.45 }}
            />
          </>
        ) : null}
      </div>
      {showCalibration ? (
        <div className="mt-2 space-y-2">
          <pre
            className="max-h-40 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-cyan-200"
            data-testid="calibration-values"
          >
            {calibrationJson}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={copyCalibration}
            >
              Copy values
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() => setDraftRect(calibration.courtRect)}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        Tap/click the court image to select shot location.
      </p>
    </div>
  );
}
