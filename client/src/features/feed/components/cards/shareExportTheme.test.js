import { describe, expect, it } from 'vitest';

import { COLORS, nameFontSize, readableAccent } from './shareExportTheme';

describe('readableAccent', () => {
  it('falls back to gold when no usable team colour is given', () => {
    expect(readableAccent([])).toBe(COLORS.gold);
    expect(readableAccent(undefined)).toBe(COLORS.gold);
    expect(readableAccent(['not-a-hex'])).toBe(COLORS.gold);
  });

  it('falls back to gold for greys, which carry no team identity', () => {
    expect(readableAccent(['#4a4a4a'])).toBe(COLORS.gold);
  });

  it('lifts a near-black team colour to something legible on the board', () => {
    // #112233 is the seeded TSW Blue; unlifted it disappears against #12211A.
    const accent = readableAccent(['#112233']);
    expect(accent).not.toBe('#112233');
    expect(accent).toMatch(/^#[0-9a-f]{6}$/);

    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(accent.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r); // hue survives the lift — still blue
    expect(Math.max(r, g, b)).toBeGreaterThan(140); // and it is actually bright
  });

  it('skips entries that are not valid hex and uses the first that is', () => {
    expect(readableAccent([null, '#d4af37'])).toBe(readableAccent(['#d4af37']));
  });
});

describe('nameFontSize', () => {
  it('steps down as names get longer so they still fit the measure', () => {
    const short = nameFontSize('Amy Ng');
    const medium = nameFontSize('Jordan Miles-Barr');
    const long = nameFontSize('Christopher Adebayo-Whitfield');

    expect(short).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(long);
  });

  it('handles an empty name without throwing', () => {
    expect(nameFontSize('')).toBeGreaterThan(0);
    expect(nameFontSize(undefined)).toBeGreaterThan(0);
  });
});
