const mockCapture = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockPostHogConstructor = jest.fn().mockImplementation(() => ({
  capture: mockCapture,
  shutdown: mockShutdown,
}));

jest.mock('posthog-node', () => ({
  PostHog: mockPostHogConstructor,
}));

jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'production',
    APP_ENV: 'development',
    APP_VERSION: 'test-build',
    ENABLE_ANALYTICS: true,
    POSTHOG_KEY: 'phc_test_key',
    POSTHOG_HOST: 'https://eu.i.posthog.com',
  },
}));

const mockLoggerWarn = jest.fn();
jest.mock('../../config/logger', () => ({
  logger: { debug: jest.fn(), warn: mockLoggerWarn },
}));

const mockFindUserById = jest.fn();
jest.mock('../../modules/auth/auth.repository', () => ({
  findUserById: mockFindUserById,
}));

const analyticsService = require('../../modules/analytics/analytics.service');

// Detached capture resolves on a later microtask; let the queue drain.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('analytics service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('captureEventDetached', () => {
    test('captures without the caller awaiting it', async () => {
      analyticsService.captureEventDetached({
        distinctId: 'user-1',
        event: 'user_registered',
        properties: { auth_provider: 'local' },
        consent: { accepted: true, version: 2 },
      });

      await flush();

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'user_registered',
        properties: {
          auth_provider: 'local',
          app_env: 'development',
          app_version: 'test-build',
          event_schema_version: 1,
          event_source: 'api',
          is_internal: false,
          is_demo: false,
        },
      });
    });

    test('swallows a capture failure so analytics cannot break an auth flow', async () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error('posthog unreachable');
      });

      expect(() =>
        analyticsService.captureEventDetached({
          distinctId: 'user-1',
          event: 'user_logged_in',
          properties: { auth_provider: 'local', is_first_login: false },
          consent: { accepted: true, version: 2 },
        })
      ).not.toThrow();

      await flush();

      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });

  describe('client configuration', () => {
    test('flushes every event immediately outside production', () => {
      // posthog-node batches by default, so on a dev server a handful of manual
      // test events never reach the batch threshold and nothing appears in
      // PostHog — the instrumentation looks broken when it is only queued.
      //
      // Re-resolve the module in isolation: in a full-suite run the constructor
      // already ran before this file's mock was attached, so mock.calls is empty.
      jest.isolateModules(() => {
        mockPostHogConstructor.mockClear();
        require('../../modules/analytics/analytics.service');
      });

      const [key, options] = mockPostHogConstructor.mock.calls[0];

      expect(key).toBe('phc_test_key');
      expect(options).toMatchObject({ flushAt: 1, flushInterval: 0 });
    });
  });

  describe('shutdownAnalytics', () => {
    test('flushes queued events on shutdown', async () => {
      await analyticsService.shutdownAnalytics();

      expect(mockShutdown).toHaveBeenCalled();
    });

    test('swallows a shutdown failure rather than blocking process exit', async () => {
      mockShutdown.mockRejectedValueOnce(new Error('network down'));

      await expect(analyticsService.shutdownAnalytics()).resolves.toBeUndefined();
      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });

  test('drops events when consent is missing or the event contract is invalid', async () => {
    await expect(
      analyticsService.captureEvent({
        distinctId: 'user-1',
        event: 'user_registered',
        properties: { auth_provider: 'local' },
      })
    ).resolves.toEqual({ captured: false, reason: 'consent_not_granted' });

    await expect(
      analyticsService.captureEvent({
        distinctId: 'user-1',
        event: 'unknown_event',
        properties: {},
        consent: { accepted: true, version: 2 },
      })
    ).resolves.toEqual({ captured: false, reason: 'invalid_event_contract' });
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

// captureUserEventDetached is the path every resource/activation event takes,
// so docs/posthog.md §16.5 — "analytics failure never fails the application
// operation" — has to hold for it specifically, not only for the auth-flow
// helper above.
describe('captureUserEventDetached', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUserById.mockResolvedValue({ _id: 'user-1', isInternal: false, isDemo: false });
  });

  test('stamps traffic classification from the account, not from the caller', async () => {
    mockFindUserById.mockResolvedValue({ _id: 'user-1', isInternal: true, isDemo: true });

    analyticsService.captureUserEventDetached({
      userId: 'user-1',
      event: 'league_team_created',
      properties: { league_id: 'league-1', league_team_id: 'lt-1', actor_role: 'league_owner' },
      consent: { accepted: true, version: 2 },
    });

    await flush();

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'user-1',
        event: 'league_team_created',
        properties: expect.objectContaining({ is_internal: true, is_demo: true }),
      })
    );
  });

  test.each([
    ['no consent header at all', undefined],
    ['an explicit decline', { accepted: false, version: 2 }],
    ['a consent decision predating the current policy', { accepted: true, version: 1 }],
  ])('sends nothing for %s', async (_label, consent) => {
    analyticsService.captureUserEventDetached({
      userId: 'user-1',
      event: 'game_tracking_started',
      properties: {
        game_id: 'game-1',
        game_context: 'league',
        tracking_mode: 'dual_team',
        actor_role: 'league_owner',
      },
      consent,
    });

    await flush();

    expect(mockCapture).not.toHaveBeenCalled();
  });

  test('swallows a lookup failure so the request that triggered it still succeeds', async () => {
    mockFindUserById.mockRejectedValue(new Error('mongo unreachable'));

    expect(() =>
      analyticsService.captureUserEventDetached({
        userId: 'user-1',
        event: 'roster_populated',
        properties: {
          resource_type: 'league_team',
          resource_id: 'lt-1',
          actor_role: 'league_owner',
          method: 'manual',
        },
        consent: { accepted: true, version: 2 },
      })
    ).not.toThrow();

    await flush();

    expect(mockLoggerWarn).toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
