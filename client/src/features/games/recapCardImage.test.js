import { describe, expect, test } from 'vitest';
import { createRecapCardDataUrl, createRecapCardSvg } from './recapCardImage';
import { recapFixture } from '../feed/components/posts/cardFixtures';

describe('recapCardImage', () => {
  test('creates a header-style SVG recap card', () => {
    const svg = createRecapCardSvg(recapFixture, {
      teamColors: ['#f59e0b'],
    });

    expect(svg).toContain('Final');
    expect(svg).toContain('TSW Blue');
    expect(svg).toContain('x="960"');
    expect(svg).not.toContain('TOP PERFORMERS');
    expect(svg).toMatchSnapshot();
  });

  test('creates a data URL from the SVG recap card', async () => {
    const dataUrl = await createRecapCardDataUrl(recapFixture, {
      teamColors: ['#f59e0b'],
    });

    expect(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  });
});
