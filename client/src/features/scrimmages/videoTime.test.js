import { describe, expect, test } from 'vitest';
import { formatVideoTime, gameVideoLink, parseVideoTime } from './videoTime';

describe('full-session video positions', () => {
  test.each([
    ['1:12:35', 4355],
    ['2:00:00', 7200],
    ['12:35', 755],
    ['4355', 4355],
    ['1:01:12.5', 3672.5],
    ['0:00', 0],
    ['24:00:00', 86400],
  ])('parses %s', (text, seconds) => {
    expect(parseVideoTime(text)).toBe(seconds);
    expect(parseVideoTime(formatVideoTime(seconds))).toBe(seconds);
  });
  test.each(['', '-1', '1:60', '1:99:00', '1:2:3:4', '24:00:01', 'abc'])(
    'rejects invalid position %s',
    (text) => expect(parseVideoTime(text)).toBeNull()
  );
  test('links to a game offset without losing the original recording ID', () => {
    expect(gameVideoLink('https://youtu.be/dQw4w9WgXcQ', 4355.5)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4355s'
    );
    expect(gameVideoLink(null, 0)).toBeNull();
  });
});
