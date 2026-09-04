import { describe, expect, it } from 'vitest';

import {
  COLORS,
  DISPLAY_ADVANCE,
  IDENTITY_MEASURE,
  fitDisplaySize,
  fitLineSize,
  readableAccent,
} from './shareExportTheme';

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

// Rebuilds the greedy wrap the fitter models, so a test failure means the
// chosen size genuinely does not fit rather than that a constant moved.
function wrappedLines(text, fontSize, measure) {
  const perLine = Math.max(1, Math.floor(measure / (fontSize * DISPLAY_ADVANCE)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const needed = used ? word.length + 1 : word.length;
    if (used && used + needed > perLine) {
      lines += 1;
      used = word.length;
    } else {
      used += needed;
    }
  }
  return lines;
}

describe('fitDisplaySize', () => {
  const BOX = { measure: IDENTITY_MEASURE, maxLines: 3, maxHeight: 200 };

  // The bug this guards: at a fixed size a long club name overflowed the 3-line
  // clamp, so the export rendered "Northside Community Warriors" — a different,
  // shorter name. The full string stayed in the DOM, so getByText still passed.
  it('shrinks a long club name until all of it fits the box', () => {
    const name = 'Northside Community Warriors Basketball Club';
    const { fontSize, lines } = fitDisplaySize(name, BOX);

    expect(wrappedLines(name, fontSize, BOX.measure)).toBeLessThanOrEqual(BOX.maxLines);
    expect(lines * fontSize * 0.86).toBeLessThanOrEqual(BOX.maxHeight);
  });

  it('keeps every realistic name inside its box', () => {
    const names = [
      'Amy Ng',
      'Jordan Miles',
      'Christopher Adebayo-Whitfield',
      'Northside Community Warriors Basketball Club',
      'Wolverhampton Wanderers Basketball',
      '#12 Alex Carter',
    ];

    for (const name of names) {
      const { fontSize } = fitDisplaySize(name, BOX);
      expect(wrappedLines(name, fontSize, BOX.measure)).toBeLessThanOrEqual(BOX.maxLines);
    }
  });

  it('gives a short name the largest size on the ladder', () => {
    expect(fitDisplaySize('Amy Ng', BOX).fontSize).toBe(100);
  });

  it('sizes down as a name gets longer', () => {
    const short = fitDisplaySize('Amy Ng', BOX).fontSize;
    const long = fitDisplaySize('Northside Community Warriors Basketball Club', BOX).fontSize;
    expect(long).toBeLessThan(short);
  });

  it('respects an explicit maximum, for names sharing a row with a figure', () => {
    expect(fitDisplaySize('Falcons', { ...BOX, max: 52 }).fontSize).toBeLessThanOrEqual(52);
  });

  it('handles an empty name without throwing', () => {
    expect(fitDisplaySize('', BOX).fontSize).toBeGreaterThan(0);
    expect(fitDisplaySize(undefined, BOX).fontSize).toBeGreaterThan(0);
  });
});

describe('fitLineSize', () => {
  const BOX = { measure: IDENTITY_MEASURE, max: 25, min: 16, tracking: 0.2 };

  it('keeps a short team name at full size', () => {
    expect(fitLineSize('TSW Blue', BOX)).toBe(25);
  });

  it('shrinks a long team name so it stays on one line', () => {
    const name = 'Northside Community Warriors Basketball Club';
    const size = fitLineSize(name, BOX);
    expect(size).toBeLessThan(25);
    expect(name.length * size * 0.802).toBeLessThanOrEqual(IDENTITY_MEASURE);
  });

  it('never shrinks below the legible floor', () => {
    expect(fitLineSize('x'.repeat(400), BOX)).toBe(16);
  });
});
