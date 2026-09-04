import { describe, expect, test } from 'vitest';
import {
  COURT_LAYOUTS,
  CURRENT_COURT_LAYOUT_ID,
  LEGACY_COURT_LAYOUT_ID,
  isKnownCourtLayoutId,
  resolveCourtLayout,
} from './courtLayouts';
import { COURT_V2_CALIBRATION, DEFAULT_COURT_IMAGE_CALIBRATION } from './courtImageCalibration';

describe('courtLayouts', () => {
  test('resolves a stamped layout id to its own asset and calibration', () => {
    const layout = resolveCourtLayout(CURRENT_COURT_LAYOUT_ID);

    expect(layout.id).toBe(CURRENT_COURT_LAYOUT_ID);
    expect(layout.calibration).toBe(COURT_V2_CALIBRATION);
    expect(layout.image).not.toBe(COURT_LAYOUTS[LEGACY_COURT_LAYOUT_ID].image);
  });

  test('fails closed to legacy for absent and unknown ids', () => {
    for (const id of [undefined, null, '', 'court-v9', 'legacy-v0']) {
      const layout = resolveCourtLayout(id);

      expect(layout.id).toBe(LEGACY_COURT_LAYOUT_ID);
      expect(layout.calibration).toBe(DEFAULT_COURT_IMAGE_CALIBRATION);
    }
  });

  // A plain `COURT_LAYOUTS[id]` lookup reaches Object.prototype, so these would
  // resolve to an inherited value and fail OPEN with no image or dimensions.
  test('fails closed for inherited property names, not just unknown ids', () => {
    for (const id of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      const layout = resolveCourtLayout(id);

      expect(layout.id).toBe(LEGACY_COURT_LAYOUT_ID);
      expect(isKnownCourtLayoutId(id)).toBe(false);
    }
  });

  test('reports which ids are known so unknown ones can be observed', () => {
    expect(isKnownCourtLayoutId(LEGACY_COURT_LAYOUT_ID)).toBe(true);
    expect(isKnownCourtLayoutId(CURRENT_COURT_LAYOUT_ID)).toBe(true);
    expect(isKnownCourtLayoutId('court-v9')).toBe(false);
    expect(isKnownCourtLayoutId(undefined)).toBe(false);
  });

  test('every layout carries an image, intrinsic size and calibration together', () => {
    for (const layout of Object.values(COURT_LAYOUTS)) {
      expect(typeof layout.image).toBe('string');
      expect(layout.width).toBeGreaterThan(0);
      expect(layout.height).toBeGreaterThan(0);
      expect(layout.calibration.courtRect).toBeTruthy();
      expect(layout.calibration.inference).toBeTruthy();
    }
  });

  test('legacy keeps the 420x760 box its stored markers were recorded against', () => {
    const legacy = COURT_LAYOUTS[LEGACY_COURT_LAYOUT_ID];

    expect(legacy.width).toBe(420);
    expect(legacy.height).toBe(760);
  });
});
