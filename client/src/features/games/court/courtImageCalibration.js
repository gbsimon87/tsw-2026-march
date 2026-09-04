function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const DEFAULT_COURT_IMAGE_CALIBRATION = {
  // Court lines in basketball_court_1.png are nearly edge-to-edge with a thin border.
  courtRect: {
    left: 0.7,
    top: 0.4,
    width: 98.6,
    height: 99.2,
  },
  // Tuned for basketball_court_1.png so 3PT inference matches visible line distance better.
  inference: {
    threePointRadiusFeet: 22.2,
    threePointCenterLocalYFeet: 0,
    cornerThreeMaxLocalYFeet: 15.5,
    cornerThreeXFeet: 21.2,
    laneHalfWidthFeet: 8,
    freeThrowLineLocalYFeet: 19 - 5.25,
  },
};

// OPT-025: measured from the shipped basketball_court_2.png (820x1708) rather
// than copied from legacy - its geometry is genuinely different. Sidelines sit
// at x=34.5/784 and baselines at y=149/1558, giving a court rect of
// 749.5 x 1409px = 0.53194, within 0.004% of the regulation 50:94.
//
// The painted 3PT line is a straight corner segment plus an arc, like a real
// court: |x| is dead constant at 19.00ft from the baseline up to y=275px
// (localY ~3.2ft), then curves. Fitting only the curved rows gives r=18.7ft
// centred 9.6ft from the baseline - 4.4ft past the model's 5.25ft hoop, hence
// the centre offset. The values below are a deliberate compromise, not that
// raw fit: because inferCourtSelection ORs the corner and arc rules, an
// offset-centre arc bulges slightly outside the straight corner near the
// baseline. Measured against every painted pixel, these numbers keep the
// 2PT/3PT boundary within 0.31ft of the paint on average (p95 0.61ft), with
// the residual error confined to the baseline corners. Both ends are drawn
// symmetrically, so one calibration serves both.
export const COURT_V2_CALIBRATION = {
  courtRect: {
    left: 4.21,
    top: 8.72,
    width: 91.4,
    height: 82.49,
  },
  inference: {
    threePointRadiusFeet: 19.37,
    threePointCenterLocalYFeet: 3.43,
    // Measured off the paint: the straight corner segment sits at 19.00ft and
    // runs up to localY 3.2ft before the line starts curving.
    cornerThreeMaxLocalYFeet: 3.2,
    cornerThreeXFeet: 19.0,
    // v2's lane and free-throw line are NOT regulation either, so they are
    // versioned alongside the arc - otherwise the free-throw marker lands
    // 1.7ft off the painted stripe and FREE_THROW_LINE never resolves.
    laneHalfWidthFeet: 6.67,
    freeThrowLineLocalYFeet: 15.47,
  },
};

export function imageToCourt(point, calibration = DEFAULT_COURT_IMAGE_CALIBRATION) {
  const { left, top, width, height } = calibration.courtRect;

  return {
    x: clamp(((point.x - left) / width) * 100, 0, 100),
    y: clamp(((point.y - top) / height) * 100, 0, 100),
  };
}

export function courtToImage(point, calibration = DEFAULT_COURT_IMAGE_CALIBRATION) {
  const { left, top, width, height } = calibration.courtRect;

  return {
    x: clamp(left + (point.x / 100) * width, 0, 100),
    y: clamp(top + (point.y / 100) * height, 0, 100),
  };
}
