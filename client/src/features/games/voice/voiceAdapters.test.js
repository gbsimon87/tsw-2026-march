import { describe, expect, test } from 'vitest';
import { getVoiceAdapter } from './voiceAdapters';

describe('getVoiceAdapter', () => {
  test('returns the basketball adapter for the supported sport', () => {
    expect(getVoiceAdapter('basketball')).toMatchObject({
      parsePrimary: expect.any(Function),
      parseFollowUp: expect.any(Function),
    });
  });

  test('fails closed for missing and unknown sports', () => {
    expect(getVoiceAdapter()).toBeNull();
    expect(getVoiceAdapter('football')).toBeNull();
  });
});
