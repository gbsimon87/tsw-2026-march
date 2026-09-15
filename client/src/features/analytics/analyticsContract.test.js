import { describe, expect, test } from 'vitest';
import { BROWSER_EVENT_NAMES, parseBrowserEvent } from './analyticsContract';

// docs/posthog.md §16.5: "event names and properties are allow-listed". The
// contract runs before every browser capture, so an event that fails here can
// never reach PostHog regardless of what a call site passed.
describe('browser analytics contract', () => {
  test('rejects an event name that is not on the allowlist', () => {
    expect(parseBrowserEvent('button_clicked', {})).toBeNull();
    expect(parseBrowserEvent('game_tracking_finished', { game_id: 'game-1' })).toBeNull();
  });

  test('rejects a value outside the approved enum', () => {
    expect(parseBrowserEvent('signup_cta_clicked', { source: 'mystery_banner' })).toBeNull();
    expect(
      parseBrowserEvent('auth_page_viewed', { mode: 'signup', has_redirect: false })
    ).toBeNull();
  });

  test('rejects a missing required property rather than sending a partial event', () => {
    expect(parseBrowserEvent('auth_page_viewed', { mode: 'login' })).toBeNull();
    expect(parseBrowserEvent('game_highlight_reel_shared', { game_id: 'game-1' })).toBeNull();
  });

  // §8: the sanitizer in lib/posthog.js is the final net, but the contract is
  // the one that should stop free text and redirect URLs at the call site.
  test('drops a smuggled free-text or URL property instead of forwarding it', () => {
    const parsed = parseBrowserEvent('auth_page_viewed', {
      mode: 'login',
      has_redirect: true,
      redirect_url: '/games/abc?token=secret',
      email: 'player@example.com',
    });

    expect(parsed).toEqual({ mode: 'login', has_redirect: true });
  });

  test('returns only the parsed shape for a valid event', () => {
    expect(parseBrowserEvent('oauth_started', { provider: 'google', mode: 'register' })).toEqual({
      provider: 'google',
      mode: 'register',
    });
  });

  // Social backlog rank 5.
  describe('attribution and sharing events', () => {
    test('accepts a landing described only by allow-listed campaign values', () => {
      expect(
        parseBrowserEvent('social_landing_viewed', {
          first_touch_source: 'instagram',
          first_touch_medium: 'organic_social',
          first_touch_campaign: 'launch_2026q3',
          is_tagged: true,
          route_pattern: '/games/:gameId',
        })
      ).toMatchObject({ first_touch_source: 'instagram', is_tagged: true });
    });

    test('rejects a source or medium outside the attribution vocabulary', () => {
      const base = {
        first_touch_medium: 'organic_social',
        first_touch_campaign: 'none',
        is_tagged: true,
        route_pattern: '/pulse',
      };
      expect(
        parseBrowserEvent('social_landing_viewed', { ...base, first_touch_source: 'ig' })
      ).toBeNull();
      expect(
        parseBrowserEvent('social_landing_viewed', {
          ...base,
          first_touch_source: 'instagram',
          first_touch_medium: 'carrier_pigeon',
        })
      ).toBeNull();
    });

    test('rejects a raw landing URL smuggled onto a landing event', () => {
      // route_pattern is the only location-shaped property allowed anywhere in
      // this contract (§11.1); a full URL must not ride alongside it.
      expect(
        parseBrowserEvent('social_landing_viewed', {
          first_touch_source: 'tiktok',
          first_touch_medium: 'organic_social',
          first_touch_campaign: 'none',
          is_tagged: true,
          route_pattern: '/games/:gameId',
          landing_url: 'https://thesportyway.com/games/abc?utm_source=tiktok',
        })
      ).not.toHaveProperty('landing_url');
    });

    test('holds shares to the handbook shape, and refuses an unlisted surface', () => {
      expect(
        parseBrowserEvent('share_completed', {
          target_type: 'player_game_card',
          method: 'download',
          source: 'game_detail',
          format: 'story',
          result: 'succeeded',
        })
      ).toMatchObject({ target_type: 'player_game_card', result: 'succeeded' });

      expect(
        parseBrowserEvent('share_initiated', {
          target_type: 'game_card',
          method: 'download',
          source: 'somewhere_new',
        })
      ).toBeNull();
      // `share_completed` exists to record success; a failure is its absence.
      expect(
        parseBrowserEvent('share_completed', {
          target_type: 'game_card',
          method: 'native',
          source: 'pulse',
          result: 'failed',
        })
      ).toBeNull();
    });

    test('keeps contact-form fields out of a league enquiry', () => {
      expect(
        parseBrowserEvent('league_enquiry_submitted', {
          interest: 'league-setup',
          role: 'club-director',
          email: 'jane@club.com',
          club_name: 'Eastside Hoops',
          message: 'Two games a week',
        })
      ).toBeNull();

      expect(
        parseBrowserEvent('league_enquiry_submitted', {
          interest: 'league-setup',
          role: 'club-director',
        })
      ).toEqual({ interest: 'league-setup', role: 'club-director' });
    });
  });

  test('the allowlist holds only the browser-owned events in the handbook', () => {
    // Every server-owned outcome event must be absent: the browser cannot
    // confirm it succeeded (§11.10, "client-side success events").
    for (const serverOwned of [
      'user_registered',
      'user_logged_in',
      'resource_created',
      'roster_populated',
      'game_scheduled',
      'game_tracking_started',
      'game_completed',
    ]) {
      expect(BROWSER_EVENT_NAMES).not.toContain(serverOwned);
    }
  });
});
