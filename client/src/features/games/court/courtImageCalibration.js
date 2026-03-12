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
    cornerThreeMaxLocalYFeet: 15.5,
    cornerThreeXFeet: 21.2,
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
