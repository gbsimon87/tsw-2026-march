export const COURT_WIDTH_FEET = 50;
export const COURT_LENGTH_FEET = 94;
export const SVG_WIDTH = 500;
export const SVG_HEIGHT = 940;
export const HOOP_OFFSET_FROM_BASELINE_FEET = 5.25;
export const HOOP_X_FEET = COURT_WIDTH_FEET / 2;
export const THREE_POINT_RADIUS_FEET = 23.75;
export const CORNER_THREE_X_FEET = 22;
export const CORNER_THREE_MAX_LOCAL_Y_FEET = 14;
export const LANE_HALF_WIDTH_FEET = 8;
export const FREE_THROW_LINE_LOCAL_Y_FEET = 19 - HOOP_OFFSET_FROM_BASELINE_FEET;
export const BACKCOURT_LOCAL_Y_FEET = 40;

export const NORTH_HOOP = {
  side: 'north',
  xFeet: HOOP_X_FEET,
  yFeet: HOOP_OFFSET_FROM_BASELINE_FEET,
};

export const SOUTH_HOOP = {
  side: 'south',
  xFeet: HOOP_X_FEET,
  yFeet: COURT_LENGTH_FEET - HOOP_OFFSET_FROM_BASELINE_FEET,
};

const HOOPS = [NORTH_HOOP, SOUTH_HOOP];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toNormalizedPoint(rawX, rawY) {
  return {
    x: clamp(rawX, 0, 100),
    y: clamp(rawY, 0, 100),
  };
}

export function normalizedToFeet(point) {
  return {
    xFeet: (point.x / 100) * COURT_WIDTH_FEET,
    yFeet: (point.y / 100) * COURT_LENGTH_FEET,
  };
}

export function feetToNormalized(xFeet, yFeet) {
  return {
    x: (xFeet / COURT_WIDTH_FEET) * 100,
    y: (yFeet / COURT_LENGTH_FEET) * 100,
  };
}

export function feetToSvgX(xFeet) {
  return (xFeet / COURT_WIDTH_FEET) * SVG_WIDTH;
}

export function feetToSvgY(yFeet) {
  return (yFeet / COURT_LENGTH_FEET) * SVG_HEIGHT;
}

function distanceToHoop(pointFeet, hoop) {
  const dx = pointFeet.xFeet - hoop.xFeet;
  const dy = pointFeet.yFeet - hoop.yFeet;
  return Math.sqrt(dx * dx + dy * dy);
}

export function nearestHoop(pointFeet) {
  const [first, second] = HOOPS;
  const firstDistance = distanceToHoop(pointFeet, first);
  const secondDistance = distanceToHoop(pointFeet, second);
  return firstDistance <= secondDistance ? first : second;
}

export function toLocalCourt(pointFeet, hoop) {
  const localX = pointFeet.xFeet - hoop.xFeet;
  const localY =
    hoop.side === 'north' ? pointFeet.yFeet - hoop.yFeet : hoop.yFeet - pointFeet.yFeet;

  return {
    localX,
    localY,
  };
}

export function freeThrowSpotForHoopSide(side) {
  const yFeet = side === 'north' ? 19 : COURT_LENGTH_FEET - 19;
  return feetToNormalized(HOOP_X_FEET, yFeet);
}
