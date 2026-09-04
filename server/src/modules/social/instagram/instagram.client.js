const { env } = require('../../../config/env');

const MAX_CAPTION_CHARACTERS = 2200;
const FINISHED_STATUS = 'FINISHED';
const FAILED_STATUSES = new Set(['ERROR', 'EXPIRED']);

class InstagramPublishingError extends Error {
  constructor(
    message,
    {
      code = 'INSTAGRAM_REQUEST_FAILED',
      httpStatus = null,
      retryable = false,
      details = null,
      cause = null,
    } = {}
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = 'InstagramPublishingError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.details = details;
  }
}

function assertIdentifier(value, fieldName) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new InstagramPublishingError(`${fieldName} is invalid`, {
      code: 'INSTAGRAM_INVALID_INPUT',
    });
  }
  return value;
}

function normalizeMediaUrl(value, fieldName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new InstagramPublishingError(`${fieldName} must be a valid public HTTPS URL`, {
      code: 'INSTAGRAM_INVALID_INPUT',
    });
  }

  if (parsed.protocol !== 'https:') {
    throw new InstagramPublishingError(`${fieldName} must be a valid public HTTPS URL`, {
      code: 'INSTAGRAM_INVALID_INPUT',
    });
  }

  return parsed.toString();
}

function normalizeCaption(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new InstagramPublishingError('caption must be a string', {
      code: 'INSTAGRAM_INVALID_INPUT',
    });
  }

  const caption = value.trim();
  if (caption.length > MAX_CAPTION_CHARACTERS) {
    throw new InstagramPublishingError(
      `caption must be ${MAX_CAPTION_CHARACTERS} characters or fewer`,
      { code: 'INSTAGRAM_INVALID_INPUT' }
    );
  }
  return caption || null;
}

function buildForm(values) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    form.set(key, String(value));
  }
  return form;
}

function isInstagramPublishingConfigured(config = env) {
  return Boolean(
    config.INSTAGRAM_PUBLISHING_ENABLED &&
    config.INSTAGRAM_GRAPH_API_VERSION &&
    config.INSTAGRAM_USER_ID &&
    config.INSTAGRAM_ACCESS_TOKEN
  );
}

class InstagramClient {
  constructor({
    accessToken,
    apiVersion,
    instagramUserId,
    baseUrl = 'https://graph.instagram.com',
    timeoutMs = 10000,
    fetchImpl = global.fetch,
    sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }) {
    if (!accessToken || typeof accessToken !== 'string') {
      throw new InstagramPublishingError('Instagram access token is required', {
        code: 'INSTAGRAM_CONFIGURATION_ERROR',
      });
    }
    if (!/^v\d+\.\d+$/.test(apiVersion || '')) {
      throw new InstagramPublishingError('Instagram Graph API version is invalid', {
        code: 'INSTAGRAM_CONFIGURATION_ERROR',
      });
    }
    if (typeof fetchImpl !== 'function') {
      throw new InstagramPublishingError('A fetch implementation is required', {
        code: 'INSTAGRAM_CONFIGURATION_ERROR',
      });
    }

    const parsedBaseUrl = new URL(baseUrl);
    if (parsedBaseUrl.protocol !== 'https:') {
      throw new InstagramPublishingError('Instagram Graph API base URL must use HTTPS', {
        code: 'INSTAGRAM_CONFIGURATION_ERROR',
      });
    }

    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
    this.instagramUserId = assertIdentifier(instagramUserId, 'instagramUserId');
    this.baseUrl = parsedBaseUrl.toString().replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.sleepImpl = sleepImpl;
  }

  buildUrl(path, query = {}) {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    return url;
  }

  async request(method, path, { query, form } = {}) {
    const url = this.buildUrl(path, query);
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
    };

    let body;
    if (form) {
      body = buildForm(form);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new InstagramPublishingError(
        timedOut ? 'Instagram request timed out' : 'Instagram request failed before a response',
        {
          code: timedOut ? 'INSTAGRAM_TIMEOUT' : 'INSTAGRAM_NETWORK_ERROR',
          retryable: true,
          cause: error,
        }
      );
    }

    const rawBody = await response.text().catch(() => '');
    let payload = null;
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const graphError = payload?.error || {};
      throw new InstagramPublishingError(
        graphError.message || `Instagram request failed with status ${response.status}`,
        {
          code: 'INSTAGRAM_API_ERROR',
          httpStatus: response.status,
          retryable:
            graphError.is_transient === true || response.status === 429 || response.status >= 500,
          details: {
            graphCode: graphError.code ?? null,
            graphSubcode: graphError.error_subcode ?? null,
            graphType: graphError.type ?? null,
            traceId: graphError.fbtrace_id ?? null,
            requestId: response.headers?.get?.('x-fb-request-id') || null,
          },
        }
      );
    }

    if (!payload || typeof payload !== 'object') {
      throw new InstagramPublishingError('Instagram returned an invalid JSON response', {
        code: 'INSTAGRAM_INVALID_RESPONSE',
        httpStatus: response.status,
        retryable: true,
      });
    }

    return payload;
  }

  async verifyConnection() {
    const account = await this.request('GET', this.instagramUserId, {
      query: { fields: 'id,username,account_type' },
    });

    return {
      id: account.id || null,
      username: account.username || null,
      accountType: account.account_type || null,
    };
  }

  async createImageContainer({ imageUrl, caption }) {
    const payload = await this.request('POST', `${this.instagramUserId}/media`, {
      form: {
        image_url: normalizeMediaUrl(imageUrl, 'imageUrl'),
        caption: normalizeCaption(caption),
      },
    });

    return assertIdentifier(payload.id, 'containerId');
  }

  async createReelContainer({ videoUrl, caption, shareToFeed = true }) {
    const payload = await this.request('POST', `${this.instagramUserId}/media`, {
      form: {
        media_type: 'REELS',
        video_url: normalizeMediaUrl(videoUrl, 'videoUrl'),
        caption: normalizeCaption(caption),
        share_to_feed: shareToFeed,
      },
    });

    return assertIdentifier(payload.id, 'containerId');
  }

  async getContainerStatus(containerId) {
    const id = assertIdentifier(containerId, 'containerId');
    const payload = await this.request('GET', id, {
      query: { fields: 'status_code,status' },
    });

    return {
      id: payload.id || id,
      statusCode: payload.status_code || null,
      status: payload.status || null,
    };
  }

  async waitForContainer(containerId, { maxAttempts = 10, intervalMs = 1000 } = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new InstagramPublishingError('maxAttempts must be a positive integer', {
        code: 'INSTAGRAM_INVALID_INPUT',
      });
    }
    if (!Number.isInteger(intervalMs) || intervalMs < 0) {
      throw new InstagramPublishingError('intervalMs must be a non-negative integer', {
        code: 'INSTAGRAM_INVALID_INPUT',
      });
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const status = await this.getContainerStatus(containerId);
      if (status.statusCode === FINISHED_STATUS) return status;
      if (FAILED_STATUSES.has(status.statusCode)) {
        throw new InstagramPublishingError(
          status.status || `Instagram container entered ${status.statusCode}`,
          {
            code: 'INSTAGRAM_CONTAINER_FAILED',
            retryable: false,
            details: status,
          }
        );
      }
      if (attempt < maxAttempts) await this.sleepImpl(intervalMs);
    }

    throw new InstagramPublishingError('Instagram container was not ready before the deadline', {
      code: 'INSTAGRAM_CONTAINER_TIMEOUT',
      retryable: true,
      details: { containerId, maxAttempts, intervalMs },
    });
  }

  async publishContainer(containerId) {
    const id = assertIdentifier(containerId, 'containerId');
    const payload = await this.request('POST', `${this.instagramUserId}/media_publish`, {
      form: { creation_id: id },
    });

    return assertIdentifier(payload.id, 'mediaId');
  }

  async getPublishedMedia(mediaId) {
    const id = assertIdentifier(mediaId, 'mediaId');
    const payload = await this.request('GET', id, {
      query: { fields: 'id,permalink' },
    });
    return {
      id: payload.id || id,
      permalink: payload.permalink || null,
    };
  }

  async publishImage(input, waitOptions) {
    const containerId = await this.createImageContainer(input);
    await this.waitForContainer(containerId, waitOptions);
    const mediaId = await this.publishContainer(containerId);
    return { containerId, mediaId };
  }

  async publishReel(input, waitOptions) {
    const containerId = await this.createReelContainer(input);
    await this.waitForContainer(containerId, waitOptions);
    const mediaId = await this.publishContainer(containerId);
    return { containerId, mediaId };
  }
}

function createInstagramClientFromEnv(options = {}) {
  if (!isInstagramPublishingConfigured()) {
    throw new InstagramPublishingError('Instagram publishing is not configured', {
      code: 'INSTAGRAM_CONFIGURATION_ERROR',
    });
  }

  return new InstagramClient({
    accessToken: env.INSTAGRAM_ACCESS_TOKEN,
    apiVersion: env.INSTAGRAM_GRAPH_API_VERSION,
    instagramUserId: env.INSTAGRAM_USER_ID,
    baseUrl: env.INSTAGRAM_GRAPH_API_BASE_URL,
    timeoutMs: env.INSTAGRAM_REQUEST_TIMEOUT_MS,
    ...options,
  });
}

module.exports = {
  InstagramClient,
  InstagramPublishingError,
  MAX_CAPTION_CHARACTERS,
  createInstagramClientFromEnv,
  isInstagramPublishingConfigured,
};
