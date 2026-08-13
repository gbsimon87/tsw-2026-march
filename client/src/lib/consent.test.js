import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CONSENT_ACCEPTED,
  CONSENT_DECLINED,
  CONSENT_VERSION,
  clearConsent,
  hasAccepted,
  readConsent,
  writeConsent,
} from './consent';

const STORAGE_KEY = 'tsw_consent';
const NOW = Date.parse('2026-08-13T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

// This project's jsdom environment exposes `window.localStorage` as a bare
// object with no Storage methods, so tests that touch storage must supply
// their own. A Map-backed stub keeps the real semantics (string keys and
// values, missing key -> null) without depending on jsdom's implementation.
function installStorageStub() {
  const store = new Map();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}

function seed(record) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

beforeEach(() => {
  installStorageStub();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('consent storage', () => {
  test('no stored decision reads as undecided', () => {
    expect(readConsent(NOW)).toBeNull();
    expect(hasAccepted(NOW)).toBe(false);
  });

  test('round-trips an accepted decision', () => {
    writeConsent(CONSENT_ACCEPTED, NOW);

    expect(readConsent(NOW)).toBe(CONSENT_ACCEPTED);
    expect(hasAccepted(NOW)).toBe(true);
  });

  test('a declined decision is remembered, so the banner does not nag', () => {
    writeConsent(CONSENT_DECLINED, NOW);

    expect(readConsent(NOW)).toBe(CONSENT_DECLINED);
    expect(hasAccepted(NOW)).toBe(false);
  });

  test('clearConsent returns the visitor to undecided', () => {
    writeConsent(CONSENT_ACCEPTED, NOW);
    clearConsent();

    expect(readConsent(NOW)).toBeNull();
  });
});

describe('consent expiry and versioning', () => {
  test('a decision under 12 months old still stands', () => {
    writeConsent(CONSENT_ACCEPTED, NOW);

    expect(readConsent(NOW + 364 * DAY)).toBe(CONSENT_ACCEPTED);
  });

  test('a decision over 12 months old is treated as undecided', () => {
    writeConsent(CONSENT_ACCEPTED, NOW);

    expect(readConsent(NOW + 366 * DAY)).toBeNull();
  });

  test('a decision from an older consent version is re-asked', () => {
    seed({
      decision: CONSENT_ACCEPTED,
      version: CONSENT_VERSION - 1,
      decidedAt: new Date(NOW).toISOString(),
    });

    expect(readConsent(NOW)).toBeNull();
  });
});

describe('consent storage is defensive', () => {
  test('malformed JSON reads as undecided rather than throwing', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json');

    expect(readConsent(NOW)).toBeNull();
  });

  test('an unrecognised decision value reads as undecided', () => {
    seed({ decision: 'maybe', version: CONSENT_VERSION, decidedAt: new Date(NOW).toISOString() });

    expect(readConsent(NOW)).toBeNull();
  });

  test('a future timestamp is rejected rather than trusted', () => {
    seed({
      decision: CONSENT_ACCEPTED,
      version: CONSENT_VERSION,
      decidedAt: new Date(NOW + DAY).toISOString(),
    });

    expect(readConsent(NOW)).toBeNull();
  });

  test('unavailable storage reads as undecided instead of throwing', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => readConsent(NOW)).not.toThrow();
    expect(readConsent(NOW)).toBeNull();
  });

  test('unavailable storage does not break writing a decision', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => writeConsent(CONSENT_ACCEPTED, NOW)).not.toThrow();
  });
});
