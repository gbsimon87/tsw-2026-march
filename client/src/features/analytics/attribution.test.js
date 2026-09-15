import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONSENT_ACCEPTED, CONSENT_DECLINED, clearConsent, writeConsent } from '../../lib/consent';
import {
  DEFAULT_CAMPAIGN,
  arrivedFromSocial,
  attributionProperties,
  buildTaggedUrl,
  captureFirstTouch,
  clearFirstTouch,
  getFirstTouch,
  isCampaignLanding,
  persistFirstTouchOnConsent,
  readAttribution,
} from './attribution';

const ORIGIN = 'https://thesportyway.com';
const STORAGE_KEY = 'tsw_first_touch';

// This project's jsdom exposes window.localStorage as a bare object with no
// Storage methods, so storage-backed tests supply their own (same stub as
// ConsentBanner.test.jsx).
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

beforeEach(() => {
  installStorageStub();
  clearFirstTouch();
  clearConsent();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildTaggedUrl', () => {
  it('tags a link with the platform it is being posted to', () => {
    expect(buildTaggedUrl(`${ORIGIN}/games/g1`, { source: 'instagram' })).toBe(
      `${ORIGIN}/games/g1?utm_source=instagram&utm_medium=organic_social&utm_campaign=${DEFAULT_CAMPAIGN}`
    );
    expect(buildTaggedUrl(`${ORIGIN}/games/g1`, { source: 'tiktok' })).toContain(
      'utm_source=tiktok'
    );
  });

  it('leaves a link alone rather than tagging it with something unusable', () => {
    // `direct` and `referral` are conclusions the parser reaches, not things an
    // operator posts to; an untaggable source must not corrupt the link.
    expect(buildTaggedUrl(`${ORIGIN}/games/g1`, { source: 'direct' })).toBe(`${ORIGIN}/games/g1`);
    expect(buildTaggedUrl(`${ORIGIN}/games/g1`, { source: 'carrier-pigeon' })).toBe(
      `${ORIGIN}/games/g1`
    );
    expect(buildTaggedUrl('', { source: 'instagram' })).toBe('');
    // A caption is better off with the plain string than with a broken link.
    expect(buildTaggedUrl('not a url', { source: 'instagram' })).toBe('not a url');
  });

  it('drops an unknown campaign but keeps the source', () => {
    const url = buildTaggedUrl(`${ORIGIN}/games/g1`, {
      source: 'instagram',
      campaign: 'whatever_someone_typed',
    });
    expect(url).toContain('utm_source=instagram');
    expect(url).not.toContain('utm_campaign');
  });

  it('round-trips through the parser', () => {
    const tagged = buildTaggedUrl(`${ORIGIN}/games/g1`, { source: 'tiktok' });
    expect(readAttribution({ search: new URL(tagged).search })).toEqual({
      source: 'tiktok',
      medium: 'organic_social',
      campaign: DEFAULT_CAMPAIGN,
      is_tagged: true,
    });
  });
});

describe('readAttribution', () => {
  it('prefers an explicit tag over the referrer', () => {
    expect(
      readAttribution({
        search: '?utm_source=instagram&utm_medium=organic_social',
        referrer: 'https://www.google.com/search?q=secret+terms',
      })
    ).toMatchObject({ source: 'instagram', is_tagged: true });
  });

  it('ignores a source outside the vocabulary instead of passing it through', () => {
    expect(readAttribution({ search: '?utm_source=ig', referrer: '' })).toMatchObject({
      source: 'direct',
      is_tagged: false,
    });
  });

  it('reads the referring host, never the referrer URL', () => {
    expect(
      readAttribution({ referrer: 'https://l.instagram.com/?u=https%3A%2F%2Fexample.com' })
    ).toMatchObject({ source: 'instagram', medium: 'organic_social', is_tagged: false });
    expect(readAttribution({ referrer: 'https://m.facebook.com/story' })).toMatchObject({
      source: 'facebook',
    });
    expect(readAttribution({ referrer: 'https://www.google.co.uk/search' })).toMatchObject({
      // google.co.uk is not in the host list, so it is an honest `referral`
      // rather than a guess dressed up as search.
      source: 'referral',
      medium: 'referral',
    });
  });

  it('names an unrecognised site a referral', () => {
    expect(readAttribution({ referrer: 'https://someblog.example/post' })).toMatchObject({
      source: 'referral',
    });
  });

  it('treats an in-app navigation as no arrival at all', () => {
    expect(readAttribution({ referrer: `${ORIGIN}/pulse`, origin: ORIGIN })).toBeNull();
  });

  it('falls back to direct for a missing or unparseable referrer', () => {
    expect(readAttribution({})).toMatchObject({ source: 'direct', medium: 'none' });
    expect(readAttribution({ referrer: 'not-a-url' })).toMatchObject({ source: 'direct' });
  });

  it('replaces a mismatched medium with the one its source implies', () => {
    expect(
      readAttribution({ search: '?utm_source=instagram&utm_medium=carrier_pigeon' })
    ).toMatchObject({ source: 'instagram', medium: 'organic_social' });
  });
});

describe('first touch', () => {
  const arrival = { search: '?utm_source=instagram', referrer: '', origin: ORIGIN };

  it('keeps the first arrival and ignores every later one', () => {
    expect(captureFirstTouch(arrival).source).toBe('instagram');
    expect(captureFirstTouch({ search: '?utm_source=tiktok', referrer: '' }).source).toBe(
      'instagram'
    );
    expect(getFirstTouch().source).toBe('instagram');
  });

  it('stays in memory until the visitor accepts analytics', () => {
    captureFirstTouch(arrival);
    // Non-essential storage under UK PUECR: nothing is written before consent.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    writeConsent(CONSENT_ACCEPTED);
    expect(persistFirstTouchOnConsent()).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).source).toBe('instagram');
  });

  it('writes nothing at all for a visitor who declines', () => {
    captureFirstTouch(arrival);
    writeConsent(CONSENT_DECLINED);

    expect(persistFirstTouchOnConsent()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    // They are still attributed for this session; it just dies with the tab.
    expect(getFirstTouch().source).toBe('instagram');
  });

  it('writes straight through when consent is already in place', () => {
    writeConsent(CONSENT_ACCEPTED);
    captureFirstTouch(arrival);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).source).toBe('instagram');
  });

  it('survives a new tab, and a later arrival still does not overwrite it', () => {
    // A fresh tab: beforeEach emptied memory, and a previous visit left this.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        source: 'instagram',
        medium: 'organic_social',
        campaign: null,
        is_tagged: true,
      })
    );

    expect(captureFirstTouch({ search: '?utm_source=tiktok', referrer: '' }).source).toBe(
      'instagram'
    );
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).source).toBe('instagram');
  });

  it('rejects a hand-edited stored record rather than trusting it', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ source: 'javascript:alert(1)' }));
    expect(getFirstTouch()).toBeNull();

    window.localStorage.setItem(STORAGE_KEY, '{{{not json');
    expect(getFirstTouch()).toBeNull();
  });

  it('survives storage being unavailable', () => {
    // Safari private mode, or storage disabled: the write throws and the
    // attribution still has to hold for this session.
    writeConsent(CONSENT_ACCEPTED);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => captureFirstTouch(arrival)).not.toThrow();
    expect(getFirstTouch().source).toBe('instagram');
  });
});

describe('landing classification', () => {
  it('counts a social or tagged arrival as a campaign landing', () => {
    captureFirstTouch({ search: '?utm_source=instagram', referrer: '' });
    expect(isCampaignLanding()).toBe(true);
    expect(arrivedFromSocial()).toBe(true);

    clearFirstTouch();
    captureFirstTouch({ search: '?utm_source=email', referrer: '' });
    // Tagged but not social: still a campaign TSW can take credit for.
    expect(isCampaignLanding()).toBe(true);
    expect(arrivedFromSocial()).toBe(false);
  });

  it('does not count a direct or search arrival as a campaign landing', () => {
    captureFirstTouch({ search: '', referrer: '' });
    expect(isCampaignLanding()).toBe(false);

    clearFirstTouch();
    captureFirstTouch({ search: '', referrer: 'https://www.google.com/search' });
    expect(isCampaignLanding()).toBe(false);
    expect(arrivedFromSocial()).toBe(false);
  });
});

describe('attributionProperties', () => {
  it('emits a flat, allow-listed bag with nothing URL-shaped in it', () => {
    captureFirstTouch({ search: '?utm_source=tiktok', referrer: 'https://www.tiktok.com/@x' });

    expect(attributionProperties()).toEqual({
      first_touch_source: 'tiktok',
      first_touch_medium: 'organic_social',
      first_touch_campaign: 'none',
    });
  });

  it('reports nothing when there is no first touch', () => {
    expect(attributionProperties(null)).toBeNull();
  });
});
