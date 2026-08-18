import { describe, expect, test } from 'vitest';
import { buildHighlightReelSegments, selectFeaturedHighlights } from './highlightReel';

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function highlight(eventId, statType, videoTimestamp, videoUrl = VIDEO_URL) {
  return { eventId, statType, videoTimestamp, videoUrl };
}

describe('highlight reel selection', () => {
  test('selects made shots first while preserving source order within a priority', () => {
    const selected = selectFeaturedHighlights(
      [
        highlight('assist', 'AST', 15),
        highlight('two', 'FG2_MADE', 25),
        highlight('three', 'FG3_MADE', 35),
        highlight('block', 'BLK', 45),
      ],
      3
    );

    expect(selected.map((item) => item.eventId)).toEqual(['three', 'two', 'assist']);
  });

  test('filters invalid timestamps and unsupported video URLs', () => {
    const selected = selectFeaturedHighlights([
      highlight('valid', 'FG3_MADE', 35),
      highlight('missing-time', 'FG2_MADE', null),
      highlight('not-youtube', 'AST', 25, 'https://example.com/game.mp4'),
    ]);

    expect(selected.map((item) => item.eventId)).toEqual(['valid']);
  });

  test('deduplicates moments from the same play and returns the reel chronologically', () => {
    const segments = buildHighlightReelSegments([
      highlight('late-three', 'FG3_MADE', 100),
      highlight('early-two', 'FG2_MADE', 20),
      highlight('same-play-assist', 'AST', 22),
      highlight('block', 'BLK', 70),
    ]);

    expect(segments.map((item) => item.eventId)).toEqual(['early-two', 'block', 'late-three']);
    expect(segments[0]).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 15,
      endSeconds: 25,
    });
  });

  test('never creates a negative clip start', () => {
    const [segment] = buildHighlightReelSegments([highlight('opening', 'FG3_MADE', 2)]);

    expect(segment.startSeconds).toBe(0);
    expect(segment.endSeconds).toBe(7);
  });
});
