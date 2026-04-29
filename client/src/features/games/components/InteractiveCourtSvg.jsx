import {
  CORNER_THREE_MAX_LOCAL_Y_FEET,
  CORNER_THREE_X_FEET,
  COURT_LENGTH_FEET,
  COURT_WIDTH_FEET,
  HOOP_OFFSET_FROM_BASELINE_FEET,
  HOOP_X_FEET,
  SVG_HEIGHT,
  SVG_WIDTH,
  THREE_POINT_RADIUS_FEET,
  feetToSvgX,
  feetToSvgY,
} from '../court/courtGeometry';

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

function topThreePointPath() {
  const localY = CORNER_THREE_MAX_LOCAL_Y_FEET;
  const startXFeet = HOOP_X_FEET - CORNER_THREE_X_FEET;
  const endXFeet = HOOP_X_FEET + CORNER_THREE_X_FEET;
  const yFeet = HOOP_OFFSET_FROM_BASELINE_FEET + localY;
  const radiusSvg = (THREE_POINT_RADIUS_FEET / COURT_WIDTH_FEET) * SVG_WIDTH;

  const startX = feetToSvgX(startXFeet);
  const endX = feetToSvgX(endXFeet);
  const y = feetToSvgY(yFeet);

  return {
    d: `M ${startX} ${y} A ${radiusSvg} ${radiusSvg} 0 0 1 ${endX} ${y}`,
    y,
    leftX: startX,
    rightX: endX,
  };
}

function bottomThreePointPath() {
  const localY = CORNER_THREE_MAX_LOCAL_Y_FEET;
  const startXFeet = HOOP_X_FEET - CORNER_THREE_X_FEET;
  const endXFeet = HOOP_X_FEET + CORNER_THREE_X_FEET;
  const yFeet = COURT_LENGTH_FEET - HOOP_OFFSET_FROM_BASELINE_FEET - localY;
  const radiusSvg = (THREE_POINT_RADIUS_FEET / COURT_WIDTH_FEET) * SVG_WIDTH;

  const startX = feetToSvgX(startXFeet);
  const endX = feetToSvgX(endXFeet);
  const y = feetToSvgY(yFeet);

  return {
    d: `M ${startX} ${y} A ${radiusSvg} ${radiusSvg} 0 0 0 ${endX} ${y}`,
    y,
    leftX: startX,
    rightX: endX,
  };
}

function topFreeThrowArcPath() {
  return 'M 190 190 A 60 60 0 0 1 310 190';
}

function bottomFreeThrowArcPath() {
  return 'M 190 750 A 60 60 0 0 0 310 750';
}

export function InteractiveCourtSvg({ selectedPoint, onSelect }) {
  function onSelectPoint(event) {
    const point = normalizeFromPointer(event, event.currentTarget);
    onSelect(point);
  }

  const topArc = topThreePointPath();
  const bottomArc = bottomThreePointPath();

  return (
    <div className="rounded border bg-white p-3">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="h-[520px] w-full touch-none"
        role="img"
        aria-label="Basketball court"
        data-testid="interactive-court"
        onPointerDown={onSelectPoint}
        onClick={onSelectPoint}
      >
        <rect
          x="1"
          y="1"
          width={SVG_WIDTH - 2}
          height={SVG_HEIGHT - 2}
          fill="#fffdf7"
          stroke="#8b5e34"
          strokeWidth="2"
        />
        <line
          x1="1"
          y1={SVG_HEIGHT / 2}
          x2={SVG_WIDTH - 1}
          y2={SVG_HEIGHT / 2}
          stroke="#8b5e34"
          strokeWidth="2"
        />
        <circle
          cx={SVG_WIDTH / 2}
          cy={SVG_HEIGHT / 2}
          r="60"
          fill="none"
          stroke="#8b5e34"
          strokeWidth="2"
        />

        <rect x="170" y="1" width="160" height="190" fill="none" stroke="#8b5e34" strokeWidth="2" />
        <rect x="190" y="1" width="120" height="190" fill="none" stroke="#8b5e34" strokeWidth="2" />
        <path
          d={topFreeThrowArcPath()}
          fill="none"
          stroke="#8b5e34"
          strokeWidth="2"
          data-testid="top-key-arc"
        />
        <path
          d={topArc.d}
          fill="none"
          stroke="#8b5e34"
          strokeWidth="2"
          data-testid="top-three-arc"
        />
        <line
          x1={topArc.leftX}
          y1="1"
          x2={topArc.leftX}
          y2={topArc.y}
          stroke="#8b5e34"
          strokeWidth="2"
        />
        <line
          x1={topArc.rightX}
          y1="1"
          x2={topArc.rightX}
          y2={topArc.y}
          stroke="#8b5e34"
          strokeWidth="2"
        />
        <rect x="220" y="40" width="60" height="2" fill="#8b5e34" />
        <circle cx="250" cy="52.5" r="7.5" fill="none" stroke="#8b5e34" strokeWidth="2" />

        <rect
          x="170"
          y="750"
          width="160"
          height="190"
          fill="none"
          stroke="#8b5e34"
          strokeWidth="2"
        />
        <rect
          x="190"
          y="750"
          width="120"
          height="190"
          fill="none"
          stroke="#8b5e34"
          strokeWidth="2"
        />
        <path
          d={bottomFreeThrowArcPath()}
          fill="none"
          stroke="#8b5e34"
          strokeWidth="2"
          data-testid="bottom-key-arc"
        />
        <path
          d={bottomArc.d}
          fill="none"
          stroke="#8b5e34"
          strokeWidth="2"
          data-testid="bottom-three-arc"
        />
        <line
          x1={bottomArc.leftX}
          y1={bottomArc.y}
          x2={bottomArc.leftX}
          y2={SVG_HEIGHT - 1}
          stroke="#8b5e34"
          strokeWidth="2"
        />
        <line
          x1={bottomArc.rightX}
          y1={bottomArc.y}
          x2={bottomArc.rightX}
          y2={SVG_HEIGHT - 1}
          stroke="#8b5e34"
          strokeWidth="2"
        />
        <rect x="220" y="898" width="60" height="2" fill="#8b5e34" />
        <circle cx="250" cy="887.5" r="7.5" fill="none" stroke="#8b5e34" strokeWidth="2" />

        {selectedPoint ? (
          <>
            <circle
              cx={(selectedPoint.x / 100) * SVG_WIDTH}
              cy={(selectedPoint.y / 100) * SVG_HEIGHT}
              r="9"
              fill="#ef4444"
              stroke="#7f1d1d"
              strokeWidth="2"
            />
            <circle
              cx={(selectedPoint.x / 100) * SVG_WIDTH}
              cy={(selectedPoint.y / 100) * SVG_HEIGHT}
              r="18"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              opacity="0.45"
            />
          </>
        ) : null}
      </svg>
      <p className="mt-2 text-xs text-slate-500">Tap/click the court to select play location.</p>
    </div>
  );
}
