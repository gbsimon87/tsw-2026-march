import { beforeEach, describe, expect, test, vi } from 'vitest';

const trackEventMock = vi.hoisted(() => vi.fn());
vi.mock('./trackEvent', () => ({ trackEvent: trackEventMock }));

import { SIGNUP_SOURCE, trackAuthPageViewed, trackSignupCtaClicked } from './signupEvents';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('trackSignupCtaClicked', () => {
  test('records where the CTA was clicked', () => {
    trackSignupCtaClicked(SIGNUP_SOURCE.HOME);

    // `source` is what makes the funnel attributable: without it we know
    // someone signed up but not what prompted them.
    expect(trackEventMock).toHaveBeenCalledWith('signup_cta_clicked', { source: 'home' });
  });

  test('source values stay stable, since renaming breaks funnel history', () => {
    expect(SIGNUP_SOURCE).toEqual({
      NAV: 'nav',
      HOME: 'home',
      PULSE: 'pulse',
      FEED_COMPOSER: 'feed_composer',
      FOLLOW_BUTTON: 'follow_button',
      PRICING: 'pricing',
    });
  });
});

describe('trackAuthPageViewed', () => {
  test('records which form was reached', () => {
    trackAuthPageViewed({ mode: 'register' });

    expect(trackEventMock).toHaveBeenCalledWith('auth_page_viewed', {
      mode: 'register',
      redirect_to: false,
    });
  });

  test('flags a gated entry without recording where it came from', () => {
    trackAuthPageViewed({ mode: 'register', redirectTo: '/pulse?compose=1' });

    // Boolean, not the path: the destination can contain ids or query state,
    // and whether the visitor was gated is the part that matters.
    expect(trackEventMock).toHaveBeenCalledWith('auth_page_viewed', {
      mode: 'register',
      redirect_to: true,
    });
  });
});
