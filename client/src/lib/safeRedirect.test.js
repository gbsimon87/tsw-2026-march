import { describe, expect, it } from 'vitest';
import { isSafeInternalPath, safeInternalPath } from './safeRedirect';

describe('isSafeInternalPath', () => {
  it('accepts an ordinary internal path', () => {
    expect(isSafeInternalPath('/pulse')).toBe(true);
    expect(isSafeInternalPath('/onboarding?step=profiles')).toBe(true);
    expect(isSafeInternalPath('/league/metro/teams/a/players/b')).toBe(true);
  });

  it('rejects a protocol-relative URL that only looks internal', () => {
    // The vector a bare startsWith('/') check lets through.
    expect(isSafeInternalPath('//evil.com')).toBe(false);
    expect(isSafeInternalPath('//evil.com/pulse')).toBe(false);
  });

  it('rejects a backslash-smuggled host', () => {
    expect(isSafeInternalPath('/\\evil.com')).toBe(false);
    expect(isSafeInternalPath('/\\/evil.com')).toBe(false);
  });

  it('rejects an absolute URL', () => {
    expect(isSafeInternalPath('https://evil.com')).toBe(false);
    expect(isSafeInternalPath('http://evil.com')).toBe(false);
    expect(isSafeInternalPath('javascript:alert(1)')).toBe(false);
    expect(isSafeInternalPath('data:text/html,<script>')).toBe(false);
  });

  it('rejects a relative path with no leading slash', () => {
    expect(isSafeInternalPath('pulse')).toBe(false);
    expect(isSafeInternalPath('../admin')).toBe(false);
  });

  it('rejects empty and non-string values', () => {
    expect(isSafeInternalPath('')).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(42)).toBe(false);
    expect(isSafeInternalPath({})).toBe(false);
  });
});

describe('safeInternalPath', () => {
  it('returns a safe path unchanged', () => {
    expect(safeInternalPath('/pulse')).toBe('/pulse');
  });

  it('returns undefined by default for an unsafe path', () => {
    expect(safeInternalPath('//evil.com')).toBeUndefined();
    expect(safeInternalPath('https://evil.com')).toBeUndefined();
  });

  it('returns the supplied fallback for an unsafe path', () => {
    expect(safeInternalPath('//evil.com', '')).toBe('');
    expect(safeInternalPath('https://evil.com', '/pulse')).toBe('/pulse');
  });
});
