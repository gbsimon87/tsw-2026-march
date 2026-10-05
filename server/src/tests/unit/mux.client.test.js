jest.mock('../../config/env', () => ({
  env: {
    MUX_TOKEN_ID: 'tid',
    MUX_TOKEN_SECRET: 'tsecret',
    MUX_WEBHOOK_SECRET: 'wh',
    MUX_SIGNING_KEY_ID: 'kid',
    MUX_SIGNING_PRIVATE_KEY: 'key',
    MUX_MAX_RESOLUTION_TIER: '1080p',
  },
}));

const { env } = require('../../config/env');
const mux = require('../../modules/video/mux.client');

function res(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  };
}

describe('mux.client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('isMuxConfigured requires all five values', () => {
    expect(mux.isMuxConfigured()).toBe(true);
    const saved = env.MUX_WEBHOOK_SECRET;
    env.MUX_WEBHOOK_SECRET = undefined;
    expect(mux.isMuxConfigured()).toBe(false);
    env.MUX_WEBHOOK_SECRET = saved;
  });

  test('createDirectUpload sends signed policy, basic quality, tier, passthrough, Basic auth', async () => {
    fetch.mockResolvedValue(res(201, { data: { id: 'up1', url: 'https://upload.example/x' } }));
    const out = await mux.createDirectUpload({ gameId: 'game-1', corsOrigin: 'https://app.test' });
    expect(out).toEqual({ id: 'up1', url: 'https://upload.example/x' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.mux.com/video/v1/uploads');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('tid:tsecret').toString('base64')}`
    );
    const body = JSON.parse(init.body);
    expect(body.cors_origin).toBe('https://app.test');
    expect(body.new_asset_settings).toEqual({
      playback_policies: ['signed'],
      video_quality: 'basic',
      max_resolution_tier: '1080p',
      passthrough: 'game-1',
    });
    expect(body.new_asset_settings.playback_policy).toBeUndefined();
  });

  test('getDirectUpload and getAsset return data', async () => {
    fetch.mockResolvedValueOnce(res(200, { data: { id: 'up1', status: 'waiting' } }));
    expect(await mux.getDirectUpload('up1')).toEqual({ id: 'up1', status: 'waiting' });
    expect(fetch.mock.calls[0][0]).toBe('https://api.mux.com/video/v1/uploads/up1');
    fetch.mockResolvedValueOnce(res(200, { data: { id: 'a1', duration: 12 } }));
    expect(await mux.getAsset('a1')).toEqual({ id: 'a1', duration: 12 });
    expect(fetch.mock.calls[1][0]).toBe('https://api.mux.com/video/v1/assets/a1');
  });

  describe('cancelDirectUpload', () => {
    test('cancelled on 200', async () => {
      fetch.mockResolvedValue(res(200, { data: { id: 'up1', status: 'cancelled' } }));
      expect(await mux.cancelDirectUpload('up1')).toEqual({ outcome: 'cancelled' });
      expect(fetch.mock.calls[0][0]).toBe('https://api.mux.com/video/v1/uploads/up1/cancel');
      expect(fetch.mock.calls[0][1].method).toBe('PUT');
    });

    test('completed with assetId when 400 and upload already produced an asset', async () => {
      fetch
        .mockResolvedValueOnce(res(400, { error: { messages: ['not waiting'] } }))
        .mockResolvedValueOnce(
          res(200, { data: { id: 'up1', status: 'asset_created', asset_id: 'a9' } })
        );
      expect(await mux.cancelDirectUpload('up1')).toEqual({ outcome: 'completed', assetId: 'a9' });
    });

    test('cancelled when 400 and upload is already cancelled', async () => {
      fetch
        .mockResolvedValueOnce(res(400, {}))
        .mockResolvedValueOnce(res(200, { data: { id: 'up1', status: 'cancelled' } }));
      expect(await mux.cancelDirectUpload('up1')).toEqual({ outcome: 'cancelled' });
    });

    test('completed with assetId when 403 "no longer possible" and upload has an asset', async () => {
      fetch
        .mockResolvedValueOnce(
          res(403, { error: { messages: ['Cancellation no longer possible'] } })
        )
        .mockResolvedValueOnce(
          res(200, { data: { id: 'up1', status: 'asset_created', asset_id: 'a9' } })
        );
      expect(await mux.cancelDirectUpload('up1')).toEqual({ outcome: 'completed', assetId: 'a9' });
    });

    test('any status carrying asset_id resolves to completed', async () => {
      fetch
        .mockResolvedValueOnce(res(409, {}))
        .mockResolvedValueOnce(res(200, { data: { id: 'up1', status: 'weird', asset_id: 'a3' } }));
      expect(await mux.cancelDirectUpload('up1')).toEqual({ outcome: 'completed', assetId: 'a3' });
    });

    test.each(['timed_out', 'errored'])(
      '%s upload without asset is expired (terminal no-op)',
      async (status) => {
        fetch
          .mockResolvedValueOnce(res(403, {}))
          .mockResolvedValueOnce(res(200, { data: { id: 'up1', status } }));
        expect(await mux.cancelDirectUpload('up1')).toEqual({ outcome: 'expired' });
      }
    );

    test('waiting after a refused cancel throws retryable', async () => {
      fetch
        .mockResolvedValueOnce(res(400, {}))
        .mockResolvedValueOnce(res(200, { data: { id: 'up1', status: 'waiting' } }));
      await expect(mux.cancelDirectUpload('up1')).rejects.toMatchObject({ retryable: true });
    });

    test('unknown status after refusal throws non-retryable', async () => {
      fetch
        .mockResolvedValueOnce(res(400, {}))
        .mockResolvedValueOnce(res(200, { data: { id: 'up1', status: 'mystery' } }));
      await expect(mux.cancelDirectUpload('up1')).rejects.toMatchObject({ retryable: false });
    });

    test('401 and 429 are not treated as refusals and do not query the upload', async () => {
      fetch.mockResolvedValueOnce(res(401, {}));
      await expect(mux.cancelDirectUpload('up1')).rejects.toMatchObject({
        status: 401,
        retryable: true,
      });
      fetch.mockResolvedValueOnce(res(429, {}));
      await expect(mux.cancelDirectUpload('up1')).rejects.toMatchObject({
        status: 429,
        retryable: true,
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('gone on 404', async () => {
      fetch.mockResolvedValue(res(404, {}));
      expect(await mux.cancelDirectUpload('up1')).toEqual({ outcome: 'gone' });
    });

    test('5xx throws retryable', async () => {
      fetch.mockResolvedValue(res(503, {}));
      await expect(mux.cancelDirectUpload('up1')).rejects.toMatchObject({
        status: 503,
        retryable: true,
      });
    });
  });

  describe('deleteAsset', () => {
    test('deleted on 204', async () => {
      fetch.mockResolvedValue(res(204));
      expect(await mux.deleteAsset('a1')).toEqual({ outcome: 'deleted' });
      expect(fetch.mock.calls[0][1].method).toBe('DELETE');
    });
    test('gone on 404', async () => {
      fetch.mockResolvedValue(res(404, {}));
      expect(await mux.deleteAsset('a1')).toEqual({ outcome: 'gone' });
    });
    test('400 and 500 throw with retryable flag', async () => {
      fetch.mockResolvedValueOnce(res(400, {}));
      await expect(mux.deleteAsset('a1')).rejects.toMatchObject({ status: 400, retryable: false });
      fetch.mockResolvedValueOnce(res(500, {}));
      await expect(mux.deleteAsset('a1')).rejects.toMatchObject({ status: 500, retryable: true });
    });
    // V4: a credential/permission failure (token rotation, read-only token)
    // is operator-fixable, never proof the asset is gone — keep retrying.
    test('401 and 403 are retryable', async () => {
      fetch.mockResolvedValueOnce(res(401, {}));
      await expect(mux.deleteAsset('a1')).rejects.toMatchObject({ status: 401, retryable: true });
      fetch.mockResolvedValueOnce(res(403, {}));
      await expect(mux.deleteAsset('a1')).rejects.toMatchObject({ status: 403, retryable: true });
    });
    test('429 is retryable; network error is retryable with null status', async () => {
      fetch.mockResolvedValueOnce(res(429, {}));
      await expect(mux.deleteAsset('a1')).rejects.toMatchObject({ status: 429, retryable: true });
      fetch.mockRejectedValueOnce(new Error('ECONNRESET'));
      await expect(mux.deleteAsset('a1')).rejects.toMatchObject({ status: null, retryable: true });
    });
  });

  test('errors never contain credentials or upload URLs', async () => {
    fetch.mockResolvedValue(res(500, { error: { messages: ['boom'] } }));
    const err = await mux.getAsset('a1').catch((e) => e);
    expect(JSON.stringify({ m: err.message, s: err.stack })).not.toMatch(/tsecret|dGlk/);
  });
});
