import { describe, expect, test } from 'vitest';
import { createRecapCardDataUrl, createRecapCardSvg } from './recapCardImage';
import { recapFixture } from '../feed/components/posts/cardFixtures';

describe('recapCardImage', () => {
  test('creates a broadcast-style SVG recap card', () => {
    const svg = createRecapCardSvg(recapFixture, {
      teamLogoUrl: 'https://example.com/team-logo.png',
    });

    expect(svg).toContain('GAME RECAP');
    expect(svg).toContain('TOP PERFORMERS');
    expect(svg).toContain('TSW Blue');
    expect(svg).toMatchSnapshot();
  });

  test('creates a data URL from the SVG recap card', () => {
    const dataUrl = createRecapCardDataUrl(recapFixture, {
      teamLogoUrl: 'https://example.com/team-logo.png',
    });

    expect(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  });
});
