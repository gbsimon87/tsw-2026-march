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
