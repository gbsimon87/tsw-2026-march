import { useEffect, useMemo, useRef, useState } from 'react';
import courtImage from '../../../assets/courts/basketball_court_1.png';
import { courtToImage, DEFAULT_COURT_IMAGE_CALIBRATION } from '../court/courtImageCalibration';

const COURT_ASPECT_RATIO = 420 / 760;
const ROTATED_COURT_ASPECT_RATIO = 760 / 420;

function normalizeFromPointer(event, element, rotate90 = false) {
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
    x: Math.max(0, Math.min(100, rotate90 ? y : x)),
    y: Math.max(0, Math.min(100, rotate90 ? 100 - x : y)),
  };
}

export function InteractiveCourtImage({
  selectedPoint,
  onSelect,
  calibration = DEFAULT_COURT_IMAGE_CALIBRATION,
  children,
  containerClassName = '',
  courtClassName = '',
  helperText = 'Tap/click the court image to select shot location.',
  imageClassName = '',
  rotate90 = false,
}) {
  const [showCalibration, setShowCalibration] = useState(false);
  const [draftRect, setDraftRect] = useState(calibration.courtRect);
  const [dragState, setDragState] = useState(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef(null);

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
    const point = normalizeFromPointer(event, event.currentTarget, rotate90);
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

  useEffect(() => {
    const element = stageRef.current;
    if (!element) {
      return undefined;
    }

    function measure() {
      const rect = element.getBoundingClientRect();
      const availableWidth = rect.width || 1;
      const availableHeight = rect.height || 1;
      const targetAspect = rotate90 ? ROTATED_COURT_ASPECT_RATIO : COURT_ASPECT_RATIO;

      let width = availableWidth;
      let height = width / targetAspect;

      if (height > availableHeight) {
        height = availableHeight;
        width = height * targetAspect;
      }

      setStageSize({
        width,
        height,
      });
    }

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      measure();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [rotate90]);

  const rotatedContentStyle = rotate90
    ? {
        width: `${stageSize.height}px`,
        height: `${stageSize.width}px`,
        transform: 'translate(-50%, -50%) rotate(90deg)',
      }
    : null;

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded border bg-white p-3 ${containerClassName}`.trim()}
    >
      <div className="pointer-events-none absolute" />
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <button
          type="button"
          className="absolute right-0 top-0 z-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm"
          onClick={() => setShowCalibration((value) => !value)}
        >
          {showCalibration ? 'Hide calibration' : 'Show calibration'}
        </button>

        <div
          ref={stageRef}
          data-testid="interactive-court-stage"
          className={`relative h-full w-full overflow-hidden ${courtClassName}`.trim()}
        >
          <div className="absolute inset-0 h-full w-full">
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: `${stageSize.width}px`,
                height: `${stageSize.height}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-full w-full"
                style={rotatedContentStyle || { transform: 'translate(-50%, -50%)' }}
                role="img"
                aria-label="Basketball court image"
                data-testid="interactive-court-image"
                onPointerDown={onSelectPoint}
                onClick={onSelectPoint}
              >
                <img
                  src={courtImage}
                  alt="Basketball court"
                  className={`block h-full w-full select-none ${imageClassName}`.trim()}
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
                      style={{
                        left: `${rect.left + rect.width}%`,
                        top: `${rect.top + rect.height}%`,
                      }}
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
                      style={{
                        left: `${selectedPoint.x}%`,
                        top: `${selectedPoint.y}%`,
                        opacity: 0.45,
                      }}
                    />
                  </>
                ) : null}

                {children}
              </div>
            </div>
          </div>
        </div>
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
      {helperText ? <p className="mt-2 text-xs text-slate-500">{helperText}</p> : null}
    </div>
  );
}
