import { beforeEach, describe, expect, test, vi } from 'vitest';

const posthogMocks = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  register: vi.fn(),
  set_config: vi.fn(),
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

async function loadPostHogModule({ analytics = 'true', key = 'ph_test_key' } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_APP_ENV', 'production');
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1');
  vi.stubEnv('VITE_ENABLE_ANALYTICS', analytics);
  vi.stubEnv('VITE_POSTHOG_KEY', key);
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://app.posthog.com');

  return import('./posthog');
}

describe('posthog lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    consentMocks.hasAccepted.mockReturnValue(false);
  });

  test('initializes in memory-only persistence before consent', async () => {
    const { initPostHog } = await loadPostHogModule();

    initPostHog();

    // UK PUECR attaches its obligation to writing an identifier to the device,
    // so nothing may be stored until the visitor accepts.
    expect(posthogMocks.init).toHaveBeenCalledWith(
      'ph_test_key',
      expect.objectContaining({
        api_host: 'https://app.posthog.com',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: true,
        disable_session_recording: true,
        persistence: 'memory',
      })
    );
  });

  test('initializes with persistent storage when consent was already given', async () => {
    consentMocks.hasAccepted.mockReturnValue(true);
    const { initPostHog } = await loadPostHogModule();

    initPostHog();

    expect(posthogMocks.init).toHaveBeenCalledWith(
      'ph_test_key',
      expect.objectContaining({ persistence: 'localStorage+cookie' })
    );
  });

  test('registers app_env so events identify the environment that sent them', async () => {
    const { initPostHog } = await loadPostHogModule();

    initPostHog();

    const { loaded } = posthogMocks.init.mock.calls[0][1];
    const instance = { register: vi.fn() };
    loaded(instance);

    expect(instance.register).toHaveBeenCalledWith({ app_env: 'production' });
  });

  test('accepting consent upgrades persistence in place', async () => {
    const { acceptPostHogConsent, initPostHog } = await loadPostHogModule();

    initPostHog();
    acceptPostHogConsent();

    expect(posthogMocks.set_config).toHaveBeenCalledWith({
      persistence: 'localStorage+cookie',
    });
  });

  test('declining consent switches to memory before resetting', async () => {
    const { declinePostHogConsent, initPostHog } = await loadPostHogModule();

    initPostHog();
    declinePostHogConsent();

    expect(posthogMocks.reset).toHaveBeenCalled();
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

    const missingKeyModule = await loadPostHogModule({ key: '' });
    missingKeyModule.initPostHog();

    expect(posthogMocks.init).not.toHaveBeenCalled();
  });

  test('captures page views and identifies only after initialization', async () => {
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

  test('does not identify before consent, even when initialized', async () => {
    const { capturePostHogPageView, identifyPostHogUser, initPostHog } = await loadPostHogModule();

    initPostHog();
    capturePostHogPageView({ path: '/pulse' });
    identifyPostHogUser('user-1', { plan: 'pro' });

    // Anonymous visits are still counted so traffic totals stay honest, but in
    // memory-only mode there is no durable id to merge — identifying here would
    // create a person with no history and no way to link later sessions.
    expect(posthogMocks.capture).toHaveBeenCalledWith('$pageview', { path: '/pulse' });
    expect(posthogMocks.identify).not.toHaveBeenCalled();
  });
});
