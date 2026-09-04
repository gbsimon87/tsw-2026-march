import { describe, expect, test } from 'vitest';
import { buildFreeThrowPayload, buildShotStatType, inferCourtSelection } from './courtInference';
import { COURT_V2_CALIBRATION, DEFAULT_COURT_IMAGE_CALIBRATION } from './courtImageCalibration';

// basketball_court_2.png is 820x1708. Every v2 case below is a pixel position
// measured off the shipped art, converted to the image percentages the tracker
// actually records, so a calibration regression fails these rather than
// silently reclassifying live shots.
const V2_IMAGE_WIDTH = 820;
const V2_IMAGE_HEIGHT = 1708;

function v2Pixel(px, py) {
  return [(px / V2_IMAGE_WIDTH) * 100, (py / V2_IMAGE_HEIGHT) * 100];
}

function inferV2(px, py) {
  const [x, y] = v2Pixel(px, py);
  return inferCourtSelection(x, y, COURT_V2_CALIBRATION);
}

describe('courtInference', () => {
  test('infers corner three on full court', () => {
    const selection = inferCourtSelection(95, 92);

    expect(selection.shotFamily).toBe('FG3');
    expect(selection.zoneId).toBe('CORNER_RIGHT_3');
    expect(selection.nearestHoop).toBe('south');
  });

  test('infers paint two-pointer', () => {
    const selection = inferCourtSelection(50, 85);

    expect(selection.shotFamily).toBe('FG2');
    expect(selection.zoneId).toBe('PAINT');
  });

  test('infers backcourt when near half court', () => {
    const selection = inferCourtSelection(50, 50);

    expect(selection.zoneId).toBe('BACKCOURT');
  });

  test('builds stat type from inferred family and outcome', () => {
    expect(buildShotStatType('FG3', 'made')).toBe('FG3_MADE');
    expect(buildShotStatType('FG2', 'miss')).toBe('FG2_MISS');
  });

  test('builds fixed free throw payload by hoop side', () => {
    const north = buildFreeThrowPayload('north', 'made');
    const south = buildFreeThrowPayload('south', 'miss');

    expect(north.zoneId).toBe('FREE_THROW_LINE');
    expect(north.statType).toBe('FT_MADE');
    expect(north.y).toBeLessThan(50);

    expect(south.statType).toBe('FT_MISS');
    expect(south.y).toBeGreaterThan(50);
  });
});

describe('courtInference on the court-v2 layout', () => {
  // Painted 3PT apex sits at y=575px; the boundary must fall between these two.
  test('separates 2PT from 3PT across the painted top-of-key arc', () => {
    const inside = inferV2(409, 560);
    const outside = inferV2(409, 590);

    expect(inside.shotFamily).toBe('FG2');
    expect(outside.shotFamily).toBe('FG3');
    expect(inside.zoneId).toBe('TOP_KEY');
    expect(outside.zoneId).toBe('TOP_KEY');
  });

  // The same arc sampled on the wing, where a hoop-centred radius would be
  // ~2ft wrong. On row y=470 the painted line sits at x=196.5 and x=626.5.
  test('separates 2PT from 3PT across the painted wing arc', () => {
    expect(inferV2(180, 470).shotFamily).toBe('FG3');
    expect(inferV2(205, 470).shotFamily).toBe('FG2');
    expect(inferV2(638, 470).shotFamily).toBe('FG3');
    expect(inferV2(615, 470).shotFamily).toBe('FG2');
  });

  test('names both corners outside the arc near the baseline', () => {
    const left = inferV2(100, 200);
    const right = inferV2(720, 200);

    expect(left.shotFamily).toBe('FG3');
    expect(left.zoneId).toBe('CORNER_LEFT_3');
    expect(right.shotFamily).toBe('FG3');
    expect(right.zoneId).toBe('CORNER_RIGHT_3');
  });

  test('reads the paint inside the painted lane', () => {
    const selection = inferV2(409, 250);

    expect(selection.shotFamily).toBe('FG2');
    expect(selection.zoneId).toBe('PAINT');
    expect(selection.nearestHoop).toBe('north');
  });

  test('picks the nearer hoop from each end of the court', () => {
    expect(inferV2(409, 250).nearestHoop).toBe('north');
    expect(inferV2(409, 1460).nearestHoop).toBe('south');
  });

  // Both ends are drawn symmetrically (south arc fits r=19.369ft at 8.66ft vs
  // north r=19.372ft at 8.68ft), so one calibration must serve both.
  test('classifies the south arc the same as the north', () => {
    expect(inferV2(409, 1147).shotFamily).toBe('FG2');
    expect(inferV2(409, 1117).shotFamily).toBe('FG3');
  });

  test('reads half court as backcourt', () => {
    expect(inferV2(409, 853).zoneId).toBe('BACKCOURT');
  });

  test('places the free throw marker inside the layout court rect', () => {
    const north = buildFreeThrowPayload('north', 'made', COURT_V2_CALIBRATION);
    const south = buildFreeThrowPayload('south', 'made', COURT_V2_CALIBRATION);

    expect(north.x).toBeCloseTo(49.91, 1);
    expect(north.y).toBeGreaterThan(COURT_V2_CALIBRATION.courtRect.top);
    expect(north.y).toBeLessThan(50);
    expect(south.y).toBeGreaterThan(50);
    expect(south.y).toBeLessThan(
      COURT_V2_CALIBRATION.courtRect.top + COURT_V2_CALIBRATION.courtRect.height
    );
  });
});

// v2's lane (13.5ft) and free-throw line (20.7ft) are not regulation, so both
// are versioned. Without that the marker lands 1.7ft off the painted stripe
// and FREE_THROW_LINE can never resolve.
describe('courtInference lane and free-throw geometry per layout', () => {
  test('places the v2 free throw marker on the painted stripe at y=459.5px', () => {
    const north = buildFreeThrowPayload('north', 'made', COURT_V2_CALIBRATION);

    expect((north.y / 100) * 1708).toBeCloseTo(459.5, 0);
  });

  // Not 1708-459.5: the court rect is not vertically centred in the image
  // (top 8.72%, bottom 91.21%), so the south stripe is measured from the south
  // baseline at y=1558px, giving 1558 - 20.72ft*14.9894px/ft = 1247.4px.
  test('mirrors the v2 free throw marker onto the painted south stripe', () => {
    const south = buildFreeThrowPayload('south', 'made', COURT_V2_CALIBRATION);

    expect((south.y / 100) * 1708).toBeCloseTo(1247.4, 0);
  });

  test('resolves FREE_THROW_LINE on the painted v2 stripe', () => {
    expect(inferV2(409, 459).zoneId).toBe('FREE_THROW_LINE');
  });

  test('stops calling PAINT outside the painted v2 lane', () => {
    // Painted lane edge is x=309.5/512.5px; 290 is outside it.
    expect(inferV2(409, 250).zoneId).toBe('PAINT');
    expect(inferV2(290, 250).zoneId).toBe('MID_RANGE_LEFT');
    expect(inferV2(528, 250).zoneId).toBe('MID_RANGE_RIGHT');
  });

  test('leaves the legacy free throw spot at the regulation 19ft', () => {
    const legacyNorth = buildFreeThrowPayload('north', 'made');
    const explicit = buildFreeThrowPayload('north', 'made', DEFAULT_COURT_IMAGE_CALIBRATION);

    expect(legacyNorth.y).toBeCloseTo(explicit.y, 5);
    expect(legacyNorth.zoneId).toBe('FREE_THROW_LINE');
  });
});
