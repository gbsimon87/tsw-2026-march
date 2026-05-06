import { beforeEach, describe, expect, test, vi } from 'vitest';

const posthogMocks = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: posthogMocks,
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
  });

  test('initializes PostHog for explicit page-view tracking only', async () => {
    const { initPostHog } = await loadPostHogModule();

    initPostHog();

    expect(posthogMocks.init).toHaveBeenCalledWith('ph_test_key', {
      api_host: 'https://app.posthog.com',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: 'localStorage+cookie',
    });
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
});
