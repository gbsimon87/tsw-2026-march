const {
  InstagramClient,
  InstagramPublishingError,
  isInstagramPublishingConfigured,
} = require('../../modules/social/instagram/instagram.client');

function jsonResponse(payload, { ok = true, status = 200, headers = {} } = {}) {
  return {
    ok,
    status,
    text: jest.fn(async () => JSON.stringify(payload)),
    headers: {
      get: jest.fn((name) => headers[name.toLowerCase()] || null),
    },
  };
}

function createClient(overrides = {}) {
  return new InstagramClient({
    accessToken: 'secret-token',
    apiVersion: 'v23.0',
    instagramUserId: '17841400000000000',
    fetchImpl: jest.fn(),
    sleepImpl: jest.fn(async () => {}),
    ...overrides,
  });
}

function requestParts(fetchMock, index) {
  const [url, options] = fetchMock.mock.calls[index];
  return {
    url: new URL(String(url)),
    options,
    form: options.body ? new URLSearchParams(options.body.toString()) : null,
  };
}

describe('InstagramClient', () => {
  test('verifies the configured professional account without putting the token in the URL', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        id: '17841400000000000',
        username: 'the_sporty_way',
        account_type: 'BUSINESS',
      })
    );
    const client = createClient({ fetchImpl });

    await expect(client.verifyConnection()).resolves.toEqual({
      id: '17841400000000000',
      username: 'the_sporty_way',
      accountType: 'BUSINESS',
    });

    const { url, options } = requestParts(fetchImpl, 0);
    expect(url.pathname).toBe('/v23.0/17841400000000000');
    expect(url.searchParams.get('fields')).toBe('id,username,account_type');
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(options.headers.Authorization).toBe('Bearer secret-token');
  });

  test('creates, waits for, and publishes an image container', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'container_1' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'container_1', status_code: 'FINISHED', status: 'Finished' })
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'media_1' }));
    const client = createClient({ fetchImpl });

    await expect(
      client.publishImage({
        imageUrl: 'https://cdn.example.com/social/final-score.png',
        caption: 'Final score. Full box score in profile.',
      })
    ).resolves.toEqual({ containerId: 'container_1', mediaId: 'media_1' });

    const createRequest = requestParts(fetchImpl, 0);
    expect(createRequest.url.pathname).toBe('/v23.0/17841400000000000/media');
    expect(createRequest.options.method).toBe('POST');
    expect(createRequest.form.get('image_url')).toBe(
      'https://cdn.example.com/social/final-score.png'
    );
    expect(createRequest.form.get('caption')).toBe('Final score. Full box score in profile.');

    const statusRequest = requestParts(fetchImpl, 1);
    expect(statusRequest.url.pathname).toBe('/v23.0/container_1');
    expect(statusRequest.url.searchParams.get('fields')).toBe('status_code,status');

    const publishRequest = requestParts(fetchImpl, 2);
    expect(publishRequest.url.pathname).toBe('/v23.0/17841400000000000/media_publish');
    expect(publishRequest.form.get('creation_id')).toBe('container_1');
  });

  test('creates a Reel container with explicit feed placement', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ id: 'reel_container' }));
    const client = createClient({ fetchImpl });

    await client.createReelContainer({
      videoUrl: 'https://cdn.example.com/social/tracker-demo.mp4',
      caption: 'One tap. The whole game updates.',
      shareToFeed: false,
    });

    const { form } = requestParts(fetchImpl, 0);
    expect(form.get('media_type')).toBe('REELS');
    expect(form.get('video_url')).toBe('https://cdn.example.com/social/tracker-demo.mp4');
    expect(form.get('share_to_feed')).toBe('false');
  });

  test('reads the permalink after publication without exposing the token in the URL', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ id: 'media_1', permalink: 'https://www.instagram.com/p/demo/' })
    );
    const client = createClient({ fetchImpl });

    await expect(client.getPublishedMedia('media_1')).resolves.toEqual({
      id: 'media_1',
      permalink: 'https://www.instagram.com/p/demo/',
    });
    const { url, options } = requestParts(fetchImpl, 0);
    expect(url.pathname).toBe('/v23.0/media_1');
    expect(url.searchParams.get('fields')).toBe('id,permalink');
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(options.headers.Authorization).toBe('Bearer secret-token');
  });

  test('polls an in-progress container until it is ready', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'container_1', status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'container_1', status_code: 'FINISHED' }));
    const sleepImpl = jest.fn(async () => {});
    const client = createClient({ fetchImpl, sleepImpl });

    await expect(
      client.waitForContainer('container_1', { maxAttempts: 2, intervalMs: 25 })
    ).resolves.toEqual({ id: 'container_1', statusCode: 'FINISHED', status: null });
    expect(sleepImpl).toHaveBeenCalledWith(25);
  });

  test('stops immediately when Instagram reports a failed container', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ id: 'container_1', status_code: 'ERROR', status: 'Unsupported format' })
    );
    const client = createClient({ fetchImpl });

    await expect(client.waitForContainer('container_1')).rejects.toMatchObject({
      code: 'INSTAGRAM_CONTAINER_FAILED',
      retryable: false,
      message: 'Unsupported format',
    });
  });

  test('normalizes Graph API errors without exposing the access token', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse(
        {
          error: {
            message: 'Rate limit reached',
            type: 'OAuthException',
            code: 4,
            error_subcode: 2207051,
            is_transient: true,
            fbtrace_id: 'trace-1',
          },
        },
        { ok: false, status: 429, headers: { 'x-fb-request-id': 'request-1' } }
      )
    );
    const client = createClient({ fetchImpl });

    let thrown;
    try {
      await client.verifyConnection();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InstagramPublishingError);
    expect(thrown).toMatchObject({
      code: 'INSTAGRAM_API_ERROR',
      httpStatus: 429,
      retryable: true,
      details: {
        graphCode: 4,
        graphSubcode: 2207051,
        graphType: 'OAuthException',
        traceId: 'trace-1',
        requestId: 'request-1',
      },
    });
    expect(JSON.stringify(thrown)).not.toContain('secret-token');
  });

  test('rejects non-HTTPS media before calling Instagram', async () => {
    const fetchImpl = jest.fn();
    const client = createClient({ fetchImpl });

    await expect(
      client.createImageContainer({ imageUrl: 'http://localhost/card.png', caption: '' })
    ).rejects.toMatchObject({ code: 'INSTAGRAM_INVALID_INPUT' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('recognizes only complete, enabled configuration', () => {
    expect(
      isInstagramPublishingConfigured({
        INSTAGRAM_PUBLISHING_ENABLED: true,
        INSTAGRAM_GRAPH_API_VERSION: 'v23.0',
        INSTAGRAM_USER_ID: '17841400000000000',
        INSTAGRAM_ACCESS_TOKEN: 'token',
      })
    ).toBe(true);
    expect(
      isInstagramPublishingConfigured({
        INSTAGRAM_PUBLISHING_ENABLED: false,
        INSTAGRAM_GRAPH_API_VERSION: 'v23.0',
        INSTAGRAM_USER_ID: '17841400000000000',
        INSTAGRAM_ACCESS_TOKEN: 'token',
      })
    ).toBe(false);
  });
});
