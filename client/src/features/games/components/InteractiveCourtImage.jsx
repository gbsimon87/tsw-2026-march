import { useEffect, useRef, useState } from 'react';
import courtImage from '../../../assets/courts/basketball_court_1.png';

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
  children,
  containerClassName = '',
  courtClassName = '',
  helperText = 'Tap/click the court image to select shot location.',
  imageClassName = '',
  rotate90 = false,
  topControls = null,
}) {
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef(null);

  function onSelectPoint(event) {
    const point = normalizeFromPointer(event, event.currentTarget, rotate90);
    onSelect(point);
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

      setStageSize({ width, height });
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
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {topControls ? (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">{topControls}</div>
        ) : null}

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
      {helperText ? <p className="mt-2 text-xs text-slate-500">{helperText}</p> : null}
    </div>
  );
}
