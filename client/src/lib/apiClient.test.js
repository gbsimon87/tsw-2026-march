import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './apiClient';

vi.mock('./consent', () => ({
  getAnalyticsConsentHeader: vi.fn(() => 'accepted;version=2'),
}));

describe('apiClient request timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects with a timeout error instead of hanging forever on a stalled request', async () => {
    // Simulate a backend/network stall: fetch's promise never settles on its own,
    // only reacting to the AbortController signal apiClient attaches.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          })
      )
    );

    const pending = apiClient.post('/games/g1/events', { statType: 'FG2_MADE' });
    const assertion = expect(pending).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it('propagates positive versioned analytics consent to the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
      }))
    );

    await apiClient.get('/health');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-analytics-consent': 'accepted;version=2' }),
      })
    );
  });
});
