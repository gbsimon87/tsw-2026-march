const { env } = require('../../../config/env');
const { ApiError } = require('../../../utils/apiError');
const { decryptSecret, encryptSecret, randomToken, sha256 } = require('../../../utils/crypto');
const { InstagramClient } = require('./instagram.client');
const repository = require('./instagram.repository');

const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_AAD_PREFIX = 'instagram-access-token';

function isInstagramOAuthConfigured(config = env) {
  return Boolean(
    config.INSTAGRAM_OAUTH_ENABLED &&
    config.INSTAGRAM_APP_ID &&
    config.INSTAGRAM_APP_SECRET &&
    config.INSTAGRAM_OAUTH_REDIRECT_URL &&
    config.INSTAGRAM_GRAPH_API_VERSION &&
    config.INSTAGRAM_TOKEN_ENCRYPTION_KEY
  );
}

function assertConfigured() {
  if (!isInstagramOAuthConfigured()) {
    throw new ApiError(503, 'Instagram connection is not configured');
  }
}

function tokenAssociatedData(keyVersion = env.INSTAGRAM_TOKEN_KEY_VERSION) {
  return `${TOKEN_AAD_PREFIX}:${keyVersion}`;
}

function firstDataObject(payload) {
  if (Array.isArray(payload?.data)) return payload.data[0] || {};
  return payload;
}

function normalizeGrantedScopes(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
  }
  return [];
}

function serializeConnection(connection) {
  if (!connection || connection.status !== 'connected') return null;
  return {
    id: String(connection._id),
    accountId: connection.externalAccountId,
    username: connection.username,
    accountType: connection.accountType || null,
    grantedScopes: connection.grantedScopes || [],
    tokenExpiresAt: connection.tokenExpiresAt || null,
    connectedAt: connection.connectedAt,
    lastVerifiedAt: connection.lastVerifiedAt,
  };
}

async function requestJson(url, options, fetchImpl = global.fetch) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(env.INSTAGRAM_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(502, 'Instagram authentication request failed');
  }

  const rawBody = await response.text().catch(() => '');
  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
    // The OAuth response historically serialises `user_id` as a JSON number,
    // while Instagram IDs exceed JavaScript's safe-integer range. Preserve the
    // exact digits from the response body before using the ID in Graph paths.
    const userIdMatch = rawBody.match(/"user_id"\s*:\s*"?(\d+)"?/);
    if (payload && userIdMatch) payload.user_id = userIdMatch[1];
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new ApiError(
      502,
      payload?.error_message || payload?.error?.message || 'Instagram authentication failed'
    );
  }
  return payload;
}

async function createAuthorization({ userId, sessionId }) {
  assertConfigured();
  const state = randomToken();
  await repository.createOAuthState({
    stateHash: sha256(state),
    userId,
    sessionId,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });

  const authorizationUrl = new URL(env.INSTAGRAM_OAUTH_AUTHORIZE_URL);
  authorizationUrl.searchParams.set('client_id', env.INSTAGRAM_APP_ID);
  authorizationUrl.searchParams.set('redirect_uri', env.INSTAGRAM_OAUTH_REDIRECT_URL);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', INSTAGRAM_SCOPES.join(','));
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('enable_fb_login', '0');
  authorizationUrl.searchParams.set('force_authentication', '1');

  return { authorizationUrl: authorizationUrl.toString() };
}

async function consumeAuthorizationState({ state, userId, sessionId }) {
  if (!state) throw new ApiError(400, 'Instagram authorization state is missing');
  const consumed = await repository.consumeOAuthState({
    stateHash: sha256(state),
    userId,
    sessionId,
  });
  if (!consumed) throw new ApiError(400, 'Instagram authorization state is invalid or expired');
}

async function cancelAuthorization({ state, userId, sessionId }) {
  assertConfigured();
  await consumeAuthorizationState({ state, userId, sessionId });
}

async function exchangeAuthorizationCode(code, fetchImpl) {
  const form = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    client_secret: env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: env.INSTAGRAM_OAUTH_REDIRECT_URL,
    code,
  });

  const payload = await requestJson(
    env.INSTAGRAM_OAUTH_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    },
    fetchImpl
  );
  const token = firstDataObject(payload);
  if (payload.user_id) token.user_id = payload.user_id;
  return token;
}

async function exchangeLongLivedToken(shortLivedToken, fetchImpl) {
  // Meta requires the short-lived credential in this exchange query string.
  // The URL is deliberately never returned, logged, or attached to errors.
  const url = new URL('/access_token', env.INSTAGRAM_GRAPH_API_BASE_URL);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', env.INSTAGRAM_APP_SECRET);
  url.searchParams.set('access_token', shortLivedToken);
  return firstDataObject(await requestJson(url, { method: 'GET' }, fetchImpl));
}

async function completeAuthorization({ code, state, userId, sessionId, fetchImpl = global.fetch }) {
  assertConfigured();
  if (!code || !state) throw new ApiError(400, 'Instagram authorization response is incomplete');
  await consumeAuthorizationState({ state, userId, sessionId });

  const shortLived = await exchangeAuthorizationCode(code, fetchImpl);
  if (!shortLived.access_token || !shortLived.user_id) {
    throw new ApiError(502, 'Instagram token response was incomplete');
  }
  const grantedScopes = normalizeGrantedScopes(shortLived.permissions);
  const missingScopes = INSTAGRAM_SCOPES.filter((scope) => !grantedScopes.includes(scope));
  if (missingScopes.length > 0) {
    throw new ApiError(400, 'Instagram did not grant all required publishing permissions', {
      missingScopes,
    });
  }

  const longLived = await exchangeLongLivedToken(shortLived.access_token, fetchImpl);
  if (!longLived.access_token) throw new ApiError(502, 'Instagram long-lived token was missing');

  const client = new InstagramClient({
    accessToken: longLived.access_token,
    apiVersion: env.INSTAGRAM_GRAPH_API_VERSION,
    instagramUserId: String(shortLived.user_id),
    baseUrl: env.INSTAGRAM_GRAPH_API_BASE_URL,
    timeoutMs: env.INSTAGRAM_REQUEST_TIMEOUT_MS,
    fetchImpl,
  });
  const account = await client.verifyConnection();
  if (!account.id || !account.username) {
    throw new ApiError(502, 'Instagram account verification response was incomplete');
  }
  if (!['BUSINESS', 'MEDIA_CREATOR'].includes(account.accountType)) {
    throw new ApiError(400, 'Instagram account must be a Business or Creator account');
  }

  const now = new Date();
  const expiresIn = Number(longLived.expires_in);
  const keyVersion = env.INSTAGRAM_TOKEN_KEY_VERSION;
  const connection = await repository.upsertConnection({
    externalAccountId: account.id,
    username: account.username,
    accountType: account.accountType,
    encryptedAccessToken: encryptSecret(
      longLived.access_token,
      env.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
      {
        associatedData: tokenAssociatedData(keyVersion),
      }
    ),
    tokenKeyVersion: keyVersion,
    tokenExpiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(now.getTime() + expiresIn * 1000)
        : null,
    grantedScopes: grantedScopes.filter((scope) => INSTAGRAM_SCOPES.includes(scope)),
    connectedByUserId: userId,
    connectedAt: now,
    lastVerifiedAt: now,
  });

  return serializeConnection(connection);
}

async function getStatus() {
  const connection = await repository.findConnection();
  return {
    configured: isInstagramOAuthConfigured(),
    connection: serializeConnection(connection),
  };
}

async function verifyStoredConnection({ fetchImpl = global.fetch } = {}) {
  assertConfigured();
  const connection = await repository.findConnection({ includeToken: true });
  if (!connection || connection.status !== 'connected' || !connection.encryptedAccessToken) {
    throw new ApiError(404, 'No connected Instagram account');
  }
  if (connection.tokenKeyVersion !== env.INSTAGRAM_TOKEN_KEY_VERSION) {
    throw new ApiError(503, 'Instagram token key version requires rotation');
  }

  let accessToken;
  try {
    accessToken = decryptSecret(
      connection.encryptedAccessToken,
      env.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
      { associatedData: tokenAssociatedData(connection.tokenKeyVersion) }
    );
  } catch {
    throw new ApiError(503, 'Instagram credential could not be decrypted');
  }

  const client = new InstagramClient({
    accessToken,
    apiVersion: env.INSTAGRAM_GRAPH_API_VERSION,
    instagramUserId: connection.externalAccountId,
    baseUrl: env.INSTAGRAM_GRAPH_API_BASE_URL,
    timeoutMs: env.INSTAGRAM_REQUEST_TIMEOUT_MS,
    fetchImpl,
  });
  const account = await client.verifyConnection();
  const updated = await repository.updateConnectionVerification({
    username: account.username || connection.username,
    accountType: account.accountType || connection.accountType,
  });
  return serializeConnection(updated);
}

async function disconnect(userId) {
  const connection = await repository.revokeConnection({ userId });
  return { disconnected: Boolean(connection) };
}

module.exports = {
  INSTAGRAM_SCOPES,
  cancelAuthorization,
  completeAuthorization,
  createAuthorization,
  disconnect,
  getStatus,
  isInstagramOAuthConfigured,
  serializeConnection,
  verifyStoredConnection,
};
