const mockCapture = jest.fn();

jest.mock('posthog-node', () => ({
  PostHog: jest.fn().mockImplementation(() => ({ capture: mockCapture })),
}));

jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'production',
    APP_ENV: 'development',
    POSTHOG_KEY: 'phc_test_key',
    POSTHOG_HOST: 'https://eu.i.posthog.com',
  },
}));

const mockLoggerWarn = jest.fn();
jest.mock('../../config/logger', () => ({
  logger: { debug: jest.fn(), warn: mockLoggerWarn },
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
      });

      await flush();

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'user_registered',
        properties: { auth_provider: 'local', app_env: 'development' },
      });
    });

    test('swallows a capture failure so analytics cannot break an auth flow', async () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error('posthog unreachable');
      });

      expect(() =>
        analyticsService.captureEventDetached({ distinctId: 'user-1', event: 'user_logged_in' })
      ).not.toThrow();

      await flush();

      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });

  describe('pseudonymousId', () => {
    test('is stable for the same email, so repeated failures group together', () => {
      expect(analyticsService.pseudonymousId('player@example.com')).toBe(
        analyticsService.pseudonymousId('player@example.com')
      );
    });

    test('normalises case and surrounding whitespace', () => {
      expect(analyticsService.pseudonymousId('  Player@Example.com  ')).toBe(
        analyticsService.pseudonymousId('player@example.com')
      );
    });

    test('differs between addresses', () => {
      expect(analyticsService.pseudonymousId('a@example.com')).not.toBe(
        analyticsService.pseudonymousId('b@example.com')
      );
    });

    test('does not leak the address it was derived from', () => {
      const id = analyticsService.pseudonymousId('player@example.com');

      expect(id).not.toContain('player');
      expect(id).not.toContain('example.com');
      expect(id).toMatch(/^anon_[a-f0-9]{32}$/);
    });
  });
});
