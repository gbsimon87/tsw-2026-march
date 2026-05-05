import { describe, expect, test } from 'vitest';
import { createRecapCardDataUrl, createRecapCardSvg } from './recapCardImage';
import { recapFixture } from '../feed/components/posts/cardFixtures';

describe('recapCardImage', () => {
  test('creates a broadcast-style SVG recap card', () => {
    const svg = createRecapCardSvg(recapFixture, {
      teamColors: ['#f59e0b'],
    });

    expect(svg).toContain('GAME RECAP');
    expect(svg).toContain('TOP PERFORMERS');
    expect(svg).toContain('TSW Blue');
    expect(svg).toMatchSnapshot();
  });

  test('creates a data URL from the SVG recap card', async () => {
    const dataUrl = await createRecapCardDataUrl(recapFixture, {
      teamColors: ['#f59e0b'],
    });

    expect(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  });
});
