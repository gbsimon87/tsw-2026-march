import { describe, expect, test } from 'vitest';
import { buildFreeThrowPayload, buildShotStatType, inferCourtSelection } from './courtInference';

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
