import { describe, expect, test } from 'vitest';
import { normalizeComparableText, parseSpokenNumber, prepareVoiceText } from './voiceText';

describe('voiceText', () => {
  test('normalizes case, punctuation, spacing, apostrophes, hyphens, and diacritics', () => {
    expect(normalizeComparableText("  JOSÉ O'Neal—Smith!  ")).toBe('jose oneal smith');
  });

  test('bounds transcript length and token count', () => {
    expect(prepareVoiceText('')).toEqual({ ok: false, reason: 'empty' });
    expect(prepareVoiceText('a'.repeat(161))).toEqual({ ok: false, reason: 'too_long' });
    expect(prepareVoiceText(Array.from({ length: 21 }, () => 'word').join(' '))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });

  test.each([
    [['0'], 0],
    [['999'], 999],
    [['zero'], 0],
    [['seven'], 7],
    [['twenty', 'one'], 21],
    [['ninety', 'nine'], 99],
    [['too'], null],
    [['one', 'hundred'], null],
    [['1000'], null],
  ])('parses supported number tokens %j', (tokens, expected) => {
    expect(parseSpokenNumber(tokens)).toBe(expected);
  });
});
