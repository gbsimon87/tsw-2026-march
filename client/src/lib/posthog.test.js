import { beforeEach, describe, expect, test, vi } from 'vitest';

const posthogMocks = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  register: vi.fn(),
  set_config: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}));

const consentMocks = vi.hoisted(() => ({
  hasAccepted: vi.fn(() => false),
}));

vi.mock('posthog-js', () => ({
  default: posthogMocks,
}));

vi.mock('./consent', async (importOriginal) => ({
  ...(await importOriginal()),
  hasAccepted: consentMocks.hasAccepted,
}));

async function loadPostHogModule({ analytics = 'true', key = 'phc_test_key' } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_APP_ENV', 'production');
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1');
  vi.stubEnv('VITE_ENABLE_ANALYTICS', analytics);
  vi.stubEnv('VITE_APP_VERSION', 'test-build');
  vi.stubEnv('VITE_POSTHOG_KEY', key);
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com');

  return import('./posthog');
}

describe('posthog lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    consentMocks.hasAccepted.mockReturnValue(false);
  });

  test('initializes opted out with memory-only persistence before consent', async () => {
    const { initPostHog } = await loadPostHogModule();

    initPostHog();

    // UK PUECR attaches its obligation to writing an identifier to the device,
    // so nothing may be stored until the visitor accepts.
    expect(posthogMocks.init).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        opt_out_capturing_by_default: true,
        persistence: 'memory',
      })
    );
  });

  test('initializes with persistent storage when consent was already given', async () => {
    consentMocks.hasAccepted.mockReturnValue(true);
    const { initPostHog } = await loadPostHogModule();

    initPostHog();

    expect(posthogMocks.init).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({ persistence: 'localStorage+cookie' })
    );
  });

  test('registers app_env so events identify the environment that sent them', async () => {
    const { initPostHog } = await loadPostHogModule();

    initPostHog();

    const { loaded } = posthogMocks.init.mock.calls[0][1];
    const instance = { register: vi.fn() };
    loaded(instance);

    expect(instance.register).toHaveBeenCalledWith(
      expect.objectContaining({
        app_env: 'production',
        app_version: 'test-build',
        event_schema_version: 1,
        event_source: 'browser',
      })
    );
  });

  test('accepting consent upgrades persistence in place', async () => {
    const { acceptPostHogConsent, initPostHog } = await loadPostHogModule();

    initPostHog();
    acceptPostHogConsent();

    expect(posthogMocks.set_config).toHaveBeenCalledWith({
      persistence: 'localStorage+cookie',
    });
    expect(posthogMocks.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  test('declining consent switches to memory before resetting', async () => {
    const { declinePostHogConsent, initPostHog } = await loadPostHogModule();

    initPostHog();
    declinePostHogConsent();

    expect(posthogMocks.reset).toHaveBeenCalled();
    expect(posthogMocks.opt_out_capturing).toHaveBeenCalledTimes(1);
    expect(posthogMocks.set_config).toHaveBeenCalledWith({ persistence: 'memory' });

    // Order matters: reset() writes a fresh anonymous id using whatever
    // persistence is configured, so resetting first would put a new id on disk
    // moments after the visitor asked us not to.
    expect(posthogMocks.set_config.mock.invocationCallOrder[0]).toBeLessThan(
      posthogMocks.reset.mock.invocationCallOrder[0]
    );
  });

  test('identify reports whether it actually ran', async () => {
    const { identifyPostHogUser, initPostHog } = await loadPostHogModule();

    initPostHog();

    // Callers need to distinguish "identified" from "skipped, retry after
    // consent" — otherwise a signed-in user who accepts stays anonymous.
    expect(identifyPostHogUser('user-1', {})).toBe(false);

    consentMocks.hasAccepted.mockReturnValue(true);
    expect(identifyPostHogUser('user-1', {})).toBe(true);
  });

  test('consent transitions are inert when analytics never initialized', async () => {
    const { acceptPostHogConsent, declinePostHogConsent } = await loadPostHogModule({
      analytics: 'false',
    });

    acceptPostHogConsent();
    declinePostHogConsent();

    expect(posthogMocks.set_config).not.toHaveBeenCalled();
    expect(posthogMocks.reset).not.toHaveBeenCalled();
  });

  test('does not initialize without analytics enabled and a key', async () => {
    const disabledModule = await loadPostHogModule({ analytics: 'false' });
    disabledModule.initPostHog();

    expect(posthogMocks.init).not.toHaveBeenCalled();

    await expect(loadPostHogModule({ key: '' })).rejects.toThrow(/valid phc_ project key/i);
  });

  test('captures page views and identifies only after initialization and consent', async () => {
    consentMocks.hasAccepted.mockReturnValue(true);
    const { capturePostHogPageView, identifyPostHogUser, initPostHog, resetPostHogUser } =
      await loadPostHogModule();

    capturePostHogPageView({ path: '/before-init' });
    identifyPostHogUser('user-1', { plan: 'pro' });
    resetPostHogUser();

    expect(posthogMocks.capture).not.toHaveBeenCalled();
    expect(posthogMocks.identify).not.toHaveBeenCalled();
    expect(posthogMocks.reset).not.toHaveBeenCalled();

    initPostHog();
    capturePostHogPageView({ path: '/feed' });
    identifyPostHogUser('user-1', { plan: 'pro' });
    resetPostHogUser();

    expect(posthogMocks.capture).toHaveBeenCalledWith('$pageview', { path: '/feed' });
    expect(posthogMocks.identify).toHaveBeenCalledWith('user-1', { plan: 'pro' });
    expect(posthogMocks.reset).toHaveBeenCalledTimes(1);
  });

  test('does not capture or identify before consent, even when initialized', async () => {
    const { capturePostHogPageView, identifyPostHogUser, initPostHog } = await loadPostHogModule();

    initPostHog();
    capturePostHogPageView({ path: '/pulse' });
    identifyPostHogUser('user-1', { plan: 'pro' });

    expect(posthogMocks.capture).not.toHaveBeenCalled();
    expect(posthogMocks.identify).not.toHaveBeenCalled();
  });

  test('strips URL, token, and free-text fields in the final safety net', async () => {
    const { sanitizePostHogEvent } = await loadPostHogModule({ analytics: 'false' });

    expect(
      sanitizePostHogEvent({
        event: 'safe',
        properties: {
          route_pattern: '/games/:gameId',
          url: 'https://example.com/?token=secret',
          nested: { email: 'player@example.com', allowed: true },
        },
      })
    ).toEqual({
      event: 'safe',
      properties: { route_pattern: '/games/:gameId', nested: { allowed: true } },
    });
  });

  // Regression: posthog-js stashes the PROJECT API key (the public phc_ token)
  // on every event as `properties.token`, then reads it back off the first
  // event of a batch to build the request's `api_key`. Stripping it sent every
  // batch with no api_key, so ingestion could not resolve the team and
  // rejected the lot with a misleading "missing event name attribute" 400.
  test('preserves the SDK project key that posthog-js reads back as api_key', async () => {
    const { sanitizePostHogEvent } = await loadPostHogModule({ analytics: 'false' });

    expect(
      sanitizePostHogEvent({
        event: '$pageview',
        properties: { token: 'phc_project_key', route_pattern: '/about' },
      })
    ).toEqual({
      event: '$pageview',
      properties: { token: 'phc_project_key', route_pattern: '/about' },
    });
  });

  test('still strips any affixed token-ish property, and nested ones', async () => {
    const { sanitizePostHogEvent } = await loadPostHogModule({ analytics: 'false' });

    expect(
      sanitizePostHogEvent({
        event: '$pageview',
        properties: {
          token: 'phc_project_key',
          reset_token: 'secret',
          token_id: 'secret',
          $session_token: 'secret',
          nested: { token: 'secret' },
          route_pattern: '/about',
        },
      })
    ).toEqual({
      event: '$pageview',
      properties: { token: 'phc_project_key', nested: {}, route_pattern: '/about' },
    });
  });

  test('does not deny-list the SDK project key at the posthog-js layer', async () => {
    const { default: posthog } = await import('posthog-js');
    const { initPostHog } = await loadPostHogModule({ analytics: 'true' });
    initPostHog();

    const [, options] = posthog.init.mock.calls[0];
    expect(options.property_denylist).not.toContain('token');
    expect(options.property_denylist).toContain('$current_url');
  });
});
