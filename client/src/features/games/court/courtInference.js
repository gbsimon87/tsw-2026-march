import {
  BACKCOURT_LOCAL_Y_FEET,
  CORNER_THREE_MAX_LOCAL_Y_FEET,
  CORNER_THREE_X_FEET,
  FREE_THROW_LINE_LOCAL_Y_FEET,
  LANE_HALF_WIDTH_FEET,
  THREE_POINT_RADIUS_FEET,
  freeThrowSpotForHoopSide,
  nearestHoop,
  normalizedToFeet,
  toLocalCourt,
  toNormalizedPoint,
} from './courtGeometry';
import { courtToImage, imageToCourt } from './courtImageCalibration';

function inferZone(localX, localY, isThreePoint, thresholds) {
  const absX = Math.abs(localX);

  if (localY >= BACKCOURT_LOCAL_Y_FEET) {
    return 'BACKCOURT';
  }

  if (localY <= thresholds.cornerThreeMaxLocalYFeet && absX >= thresholds.cornerThreeXFeet) {
    return localX < 0 ? 'CORNER_LEFT_3' : 'CORNER_RIGHT_3';
  }

  if (Math.abs(localY - FREE_THROW_LINE_LOCAL_Y_FEET) <= 1.25 && absX <= LANE_HALF_WIDTH_FEET) {
    return 'FREE_THROW_LINE';
  }

  if (localY <= 19 && absX <= LANE_HALF_WIDTH_FEET) {
    return 'PAINT';
  }

  if (isThreePoint) {
    if (absX <= 8) {
      return 'TOP_KEY';
    }

    return localX < 0 ? 'WING_LEFT_3' : 'WING_RIGHT_3';
  }

  if (absX <= 6) {
    return 'TOP_KEY';
  }

  return localX < 0 ? 'MID_RANGE_LEFT' : 'MID_RANGE_RIGHT';
}

export function inferCourtSelection(rawX, rawY, calibration) {
  const imagePoint = toNormalizedPoint(rawX, rawY);
  const courtPoint = imageToCourt(imagePoint, calibration);
  const pointFeet = normalizedToFeet(courtPoint);
  const hoop = nearestHoop(pointFeet);
  const { localX, localY } = toLocalCourt(pointFeet, hoop);
  const distance = Math.sqrt(localX * localX + localY * localY);

  const thresholds = {
    threePointRadiusFeet: calibration?.inference?.threePointRadiusFeet ?? THREE_POINT_RADIUS_FEET,
    cornerThreeMaxLocalYFeet:
      calibration?.inference?.cornerThreeMaxLocalYFeet ?? CORNER_THREE_MAX_LOCAL_Y_FEET,
    cornerThreeXFeet: calibration?.inference?.cornerThreeXFeet ?? CORNER_THREE_X_FEET,
  };

  const cornerThree =
    localY <= thresholds.cornerThreeMaxLocalYFeet &&
    Math.abs(localX) >= thresholds.cornerThreeXFeet;
  const arcThree = distance >= thresholds.threePointRadiusFeet;
  const shotFamily = cornerThree || arcThree ? 'FG3' : 'FG2';

  return {
    x: imagePoint.x,
    y: imagePoint.y,
    nearestHoop: hoop.side,
    shotFamily,
    zoneId: inferZone(localX, localY, shotFamily === 'FG3', thresholds),
  };
}

export function buildShotStatType(shotFamily, outcome) {
  if (shotFamily === 'FG3') {
    return outcome === 'made' ? 'FG3_MADE' : 'FG3_MISS';
  }

  return outcome === 'made' ? 'FG2_MADE' : 'FG2_MISS';
}

export function buildFreeThrowPayload(hoopSide, outcome, calibration) {
  const side = hoopSide === 'north' ? 'north' : 'south';
  const courtSpot = freeThrowSpotForHoopSide(side);
  const spot = courtToImage(courtSpot, calibration);

  return {
    statType: outcome === 'made' ? 'FT_MADE' : 'FT_MISS',
    zoneId: 'FREE_THROW_LINE',
    x: Number(spot.x.toFixed(2)),
    y: Number(spot.y.toFixed(2)),
    hoopSide: side,
  };
}
