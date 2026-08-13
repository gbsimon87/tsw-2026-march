import { beforeEach, describe, expect, test, vi } from 'vitest';

const trackEventMock = vi.hoisted(() => vi.fn());
vi.mock('./trackEvent', () => ({ trackEvent: trackEventMock }));

import {
  SIGNUP_SOURCE,
  trackAuthPageViewed,
  trackOauthStarted,
  trackSignupCtaClicked,
} from './signupEvents';

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

describe('trackOauthStarted', () => {
  test('records the hand-off to an external provider', () => {
    trackOauthStarted({ provider: 'google', mode: 'register' });

    // The visitor leaves the site here. Without this event, an abandoned
    // round-trip — cancelled, wrong account, provider error — looks identical
    // to someone who reached the form and never filled it in.
    expect(trackEventMock).toHaveBeenCalledWith('oauth_started', {
      provider: 'google',
      mode: 'register',
    });
  });

  test('distinguishes the login entry point from the register one', () => {
    trackOauthStarted({ provider: 'google', mode: 'login' });

    expect(trackEventMock).toHaveBeenCalledWith('oauth_started', {
      provider: 'google',
      mode: 'login',
    });
  });
});
