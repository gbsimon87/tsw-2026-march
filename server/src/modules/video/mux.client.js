const { env } = require('../../config/env');

const MUX_API_BASE = 'https://api.mux.com';
const MUX_REQUEST_TIMEOUT_MS = 15000;
// A 3-6 GB game over leisure-centre Wi-Fi needs more than Mux's 1 h default.
const DIRECT_UPLOAD_TIMEOUT_SECONDS = 6 * 60 * 60;

/**
 * Thrown for every non-2xx Mux response the caller is not expected to handle
 * as a normal outcome (404 on cancel/delete), and for network/timeout errors.
 *   status    HTTP status, or null for network errors / timeouts
 *   retryable true for 408, 429, 5xx and network errors
 * The message never contains credentials, tokens or upload URLs.
 */
class MuxApiError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'MuxApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isMuxConfigured() {
  return Boolean(
    env.MUX_TOKEN_ID &&
    env.MUX_TOKEN_SECRET &&
    env.MUX_WEBHOOK_SECRET &&
    env.MUX_SIGNING_KEY_ID &&
    env.MUX_SIGNING_PRIVATE_KEY
  );
}

async function muxRequest(method, path, body) {
  let response;
  try {
    response = await fetch(`${MUX_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(MUX_REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    // Network failure / timeout. Do not forward the cause message verbatim.
    throw new MuxApiError(
      `Mux request failed (${method} network error: ${cause?.name || 'Error'})`,
      {
        retryable: true,
      }
    );
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = Array.isArray(payload?.error?.messages)
      ? `: ${payload.error.messages.join('; ')}`
      : '';
    throw new MuxApiError(`Mux request failed (${response.status})${detail}`, {
      status: response.status,
      retryable: isRetryableStatus(response.status),
    });
  }
  return payload?.data ?? null;
}

/** @returns {Promise<{id: string, url: string}>} url is a secret; never log it. */
async function createDirectUpload({ gameId, corsOrigin }) {
  const data = await muxRequest('POST', '/video/v1/uploads', {
    cors_origin: corsOrigin,
    timeout: DIRECT_UPLOAD_TIMEOUT_SECONDS,
    new_asset_settings: {
      playback_policies: ['signed'],
      video_quality: 'basic',
      max_resolution_tier: env.MUX_MAX_RESOLUTION_TIER,
      passthrough: String(gameId),
    },
  });
  return { id: data.id, url: data.url };
}

/** @returns {Promise<object>} Mux upload (status, asset_id, ...). Throws MuxApiError (404 included). */
function getDirectUpload(uploadId) {
  return muxRequest('GET', `/video/v1/uploads/${encodeURIComponent(uploadId)}`);
}

/** @returns {Promise<object>} Mux asset (status, duration, playback_ids, ...). Throws MuxApiError (404 included). */
function getAsset(assetId) {
  return muxRequest('GET', `/video/v1/assets/${encodeURIComponent(assetId)}`);
}

/**
 * @returns {Promise<
 *   {outcome:'cancelled'} | {outcome:'completed', assetId:string} |
 *   {outcome:'expired'} | {outcome:'gone'}>}
 * 'cancelled': Mux cancelled the upload (or it was already cancelled).
 * 'completed': the upload already produced an asset (any status carrying an
 *   asset_id): the caller must delete that asset.
 * 'expired': upload is timed_out/errored with no asset; nothing to clean up.
 * 'gone': 404.
 * Mux only allows cancel in `waiting`; a refusal (400/403/409/422...) is
 * classified from the upload's own status. A `waiting` upload after a refusal
 * is a transient race and throws a retryable MuxApiError. Anything else throws.
 */
async function cancelDirectUpload(uploadId) {
  try {
    await muxRequest('PUT', `/video/v1/uploads/${encodeURIComponent(uploadId)}/cancel`);
    return { outcome: 'cancelled' };
  } catch (error) {
    if (error.status === 404) return { outcome: 'gone' };
    const refused = error.status >= 400 && error.status < 500 && ![401, 429].includes(error.status);
    if (!refused) throw error;
  }
  let upload;
  try {
    upload = await getDirectUpload(uploadId);
  } catch (error) {
    if (error.status === 404) return { outcome: 'gone' };
    throw error;
  }
  if (upload?.asset_id) return { outcome: 'completed', assetId: upload.asset_id };
  if (upload?.status === 'cancelled') return { outcome: 'cancelled' };
  if (upload?.status === 'timed_out' || upload?.status === 'errored') return { outcome: 'expired' };
  throw new MuxApiError(
    `Mux upload could not be cancelled (status ${upload?.status ?? 'unknown'})`,
    {
      status: upload?.status === 'waiting' ? 409 : 400,
      retryable: upload?.status === 'waiting',
    }
  );
}

/** @returns {Promise<{outcome:'deleted'|'gone'}>} 404 is 'gone'; everything else non-2xx throws MuxApiError. */
async function deleteAsset(assetId) {
  try {
    await muxRequest('DELETE', `/video/v1/assets/${encodeURIComponent(assetId)}`);
    return { outcome: 'deleted' };
  } catch (error) {
    if (error.status === 404) return { outcome: 'gone' };
    throw error;
  }
}

module.exports = {
  MuxApiError,
  isMuxConfigured,
  createDirectUpload,
  getDirectUpload,
  getAsset,
  cancelDirectUpload,
  deleteAsset,
};
