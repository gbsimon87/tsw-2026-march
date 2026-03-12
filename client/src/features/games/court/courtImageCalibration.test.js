import { describe, expect, test } from 'vitest';
import {
  DEFAULT_COURT_IMAGE_CALIBRATION,
  courtToImage,
  imageToCourt,
} from './courtImageCalibration';

describe('courtImageCalibration', () => {
  test('maps image point to court point and back consistently', () => {
    const imagePoint = { x: 50, y: 50 };
    const courtPoint = imageToCourt(imagePoint, DEFAULT_COURT_IMAGE_CALIBRATION);
    const mappedBack = courtToImage(courtPoint, DEFAULT_COURT_IMAGE_CALIBRATION);

    expect(courtPoint.x).toBeGreaterThan(0);
    expect(courtPoint.y).toBeGreaterThan(0);
    expect(mappedBack.x).toBeCloseTo(imagePoint.x, 2);
    expect(mappedBack.y).toBeCloseTo(imagePoint.y, 2);
  });
});
