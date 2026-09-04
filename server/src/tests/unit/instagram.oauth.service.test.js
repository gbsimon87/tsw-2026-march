const mockEnv = {
  INSTAGRAM_OAUTH_ENABLED: true,
  INSTAGRAM_APP_ID: '1234567890',
  INSTAGRAM_APP_SECRET: 'test-app-secret',
  INSTAGRAM_OAUTH_REDIRECT_URL: 'http://localhost:4001/api/v1/social/instagram/oauth/callback',
  INSTAGRAM_OAUTH_AUTHORIZE_URL: 'https://www.instagram.com/oauth/authorize',
  INSTAGRAM_OAUTH_TOKEN_URL: 'https://api.instagram.com/oauth/access_token',
  INSTAGRAM_GRAPH_API_BASE_URL: 'https://graph.instagram.com',
  INSTAGRAM_GRAPH_API_VERSION: 'v23.0',
  INSTAGRAM_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
  INSTAGRAM_TOKEN_KEY_VERSION: 'v1',
  INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY: undefined,
  INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION: undefined,
  INSTAGRAM_REQUEST_TIMEOUT_MS: 1000,
  INSTAGRAM_PUBLISHING_ENABLED: false,
};

const mockRepository = {
  createOAuthState: jest.fn(),
  consumeOAuthState: jest.fn(),
  upsertConnection: jest.fn(),
  findConnection: jest.fn(),
  updateConnectionVerification: jest.fn(),
  revokeConnection: jest.fn(),
  claimTokenRefresh: jest.fn(),
  completeTokenRefresh: jest.fn(),
  failTokenRefresh: jest.fn(),
  rotateConnectionToken: jest.fn(),
};

jest.mock('../../config/env', () => ({ env: mockEnv }));
jest.mock('../../modules/social/instagram/instagram.repository', () => mockRepository);

const service = require('../../modules/social/instagram/instagram.oauth.service');
const { encryptSecret } = require('../../utils/crypto');

function jsonResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
    headers: { get: jest.fn(() => null) },
  };
}

function rawJsonResponse(rawBody, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(rawBody),
    headers: { get: jest.fn(() => null) },
  };
}

describe('Instagram OAuth service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.failTokenRefresh.mockResolvedValue(null);
    mockEnv.INSTAGRAM_TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
    mockEnv.INSTAGRAM_TOKEN_KEY_VERSION = 'v1';
    mockEnv.INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY = undefined;
    mockEnv.INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION = undefined;
    mockEnv.INSTAGRAM_PUBLISHING_ENABLED = false;
  });

  test('creates a scoped authorization URL and persists only a state hash', async () => {
    mockRepository.createOAuthState.mockResolvedValue({});

    const result = await service.createAuthorization({ userId: 'user-1', sessionId: 'session-1' });
    const url = new URL(result.authorizationUrl);

    expect(url.origin).toBe('https://www.instagram.com');
    expect(url.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_content_publish'
    );
    expect(url.searchParams.get('state')).toBeTruthy();
    const stored = mockRepository.createOAuthState.mock.calls[0][0];
    expect(stored.stateHash).not.toBe(url.searchParams.get('state'));
    expect(stored.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.userId).toBe('user-1');
    expect(stored.sessionId).toBe('session-1');
  });

  test('rejects an invalid or reused state before token exchange', async () => {
    mockRepository.consumeOAuthState.mockResolvedValue(null);
    const fetchImpl = jest.fn();

    await expect(
      service.completeAuthorization({
        code: 'authorization-code',
        state: 'invalid-state',
        userId: 'user-1',
        sessionId: 'session-1',
        fetchImpl,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('validates and consumes state when the operator cancels at Instagram', async () => {
    mockRepository.consumeOAuthState.mockResolvedValue({ _id: 'state-1' });
    await service.cancelAuthorization({
      state: 'valid-state',
      userId: 'user-1',
      sessionId: 'session-1',
    });
    expect(mockRepository.consumeOAuthState).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', sessionId: 'session-1' })
    );
  });

  test('rejects a connection when content publishing permission was not granted', async () => {
    mockRepository.consumeOAuthState.mockResolvedValue({ _id: 'state-1' });
    const fetchImpl = jest.fn().mockResolvedValueOnce(
      jsonResponse({
        access_token: 'short-lived-token',
        user_id: '17841400000000001',
        permissions: ['instagram_business_basic'],
      })
    );

    await expect(
      service.completeAuthorization({
        code: 'authorization-code',
        state: 'valid-state',
        userId: 'user-1',
        sessionId: 'session-1',
        fetchImpl,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { missingScopes: ['instagram_business_content_publish'] },
    });
    expect(mockRepository.upsertConnection).not.toHaveBeenCalled();
  });

  test('exchanges, verifies, encrypts, and saves a long-lived token', async () => {
    mockRepository.consumeOAuthState.mockResolvedValue({ _id: 'state-1' });
    mockRepository.upsertConnection.mockImplementation(async (input) => ({
      _id: 'connection-1',
      status: 'connected',
      ...input,
    }));
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        rawJsonResponse(
          '{"data":[{"access_token":"short-lived-token","user_id":17841400000000001,"permissions":"instagram_business_basic,instagram_business_content_publish"}]}'
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'long-lived-token', token_type: 'bearer', expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: '17841400000000001', username: 'tsw_test', account_type: 'BUSINESS' })
      );

    const result = await service.completeAuthorization({
      code: 'authorization-code',
      state: 'valid-state',
      userId: 'user-1',
      sessionId: 'session-1',
      fetchImpl,
    });

    expect(result).toMatchObject({ username: 'tsw_test', accountType: 'BUSINESS' });
    const saved = mockRepository.upsertConnection.mock.calls[0][0];
    expect(saved.encryptedAccessToken).not.toContain('long-lived-token');
    expect(JSON.stringify(result)).not.toContain('long-lived-token');
    expect(saved.tokenExpiresAt).toBeInstanceOf(Date);
    expect(fetchImpl.mock.calls[2][1].headers.Authorization).toBe('Bearer long-lived-token');
    expect(fetchImpl.mock.calls[2][0].pathname).toContain('17841400000000001');
  });

  test('status never returns an encrypted credential', async () => {
    mockRepository.findConnection.mockResolvedValue({
      _id: 'connection-1',
      status: 'connected',
      externalAccountId: '17841400000000000',
      username: 'tsw_test',
      encryptedAccessToken: 'encrypted-secret',
      grantedScopes: service.INSTAGRAM_SCOPES,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
    });

    const result = await service.getStatus();
    expect(result.configured).toBe(true);
    expect(result.publishingEnabled).toBe(false);
    expect(result.connection.username).toBe('tsw_test');
    expect(JSON.stringify(result)).not.toContain('encrypted-secret');
  });

  test('creates an internal publishing client from the encrypted OAuth credential', async () => {
    const now = new Date('2026-09-05T00:00:00.000Z');
    mockRepository.findConnection.mockResolvedValue({
      _id: 'connection-1',
      status: 'connected',
      externalAccountId: '17841400000000000',
      username: 'tsw_test',
      encryptedAccessToken: encryptSecret('stored-token', mockEnv.INSTAGRAM_TOKEN_ENCRYPTION_KEY, {
        associatedData: 'instagram-access-token:v1',
      }),
      tokenKeyVersion: 'v1',
      tokenExpiresAt: new Date('2026-10-05T00:00:00.000Z'),
      grantedScopes: service.INSTAGRAM_SCOPES,
    });

    const result = await service.createStoredInstagramClient({ now });

    expect(mockRepository.findConnection).toHaveBeenCalledWith({ includeToken: true });
    expect(result.connection._id).toBe('connection-1');
    expect(result.client.instagramUserId).toBe('17841400000000000');
    expect(result.client.accessToken).toBe('stored-token');
  });

  test('refreshes an eligible token and records its new expiry without exposing it', async () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    const encryptedAccessToken = encryptSecret(
      'current-long-lived-token',
      mockEnv.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
      { associatedData: 'instagram-access-token:v1' }
    );
    mockRepository.claimTokenRefresh.mockResolvedValue({
      _id: 'connection-1',
      status: 'connected',
      externalAccountId: '17841400000000000',
      username: 'tsw_test',
      encryptedAccessToken,
      tokenKeyVersion: 'v1',
      tokenObtainedAt: new Date('2026-09-02T12:00:00.000Z'),
      tokenExpiresAt: new Date('2026-10-20T12:00:00.000Z'),
      connectedAt: new Date('2026-09-02T12:00:00.000Z'),
      lastVerifiedAt: now,
    });
    mockRepository.completeTokenRefresh.mockImplementation(async (input) => ({
      _id: 'connection-1',
      status: 'connected',
      externalAccountId: '17841400000000000',
      username: 'tsw_test',
      connectedAt: new Date('2026-09-02T12:00:00.000Z'),
      lastVerifiedAt: now,
      lastTokenRefreshedAt: now,
      ...input,
    }));
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ access_token: 'replacement-long-lived-token', expires_in: 5184000 })
      );

    const result = await service.refreshStoredToken({ userId: 'operator-1', fetchImpl, now });

    const refreshUrl = fetchImpl.mock.calls[0][0];
    expect(refreshUrl.pathname).toBe('/refresh_access_token');
    expect(refreshUrl.searchParams.get('grant_type')).toBe('ig_refresh_token');
    expect(refreshUrl.searchParams.get('access_token')).toBe('current-long-lived-token');
    const saved = mockRepository.completeTokenRefresh.mock.calls[0][0];
    expect(saved.userId).toBe('operator-1');
    expect(saved.encryptedAccessToken).not.toContain('replacement-long-lived-token');
    expect(saved.tokenExpiresAt.toISOString()).toBe('2026-11-03T12:00:00.000Z');
    expect(result.lastTokenRefreshedAt).toEqual(now);
    expect(JSON.stringify(result)).not.toContain('replacement-long-lived-token');
    expect(mockRepository.failTokenRefresh).not.toHaveBeenCalled();
  });

  test('rejects a token refresh before the token is 24 hours old and records the attempt', async () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    mockRepository.claimTokenRefresh.mockResolvedValue({
      status: 'connected',
      tokenObtainedAt: new Date('2026-09-04T00:00:00.000Z'),
      tokenExpiresAt: new Date('2026-11-01T00:00:00.000Z'),
    });

    await expect(service.refreshStoredToken({ fetchImpl: jest.fn(), now })).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'INSTAGRAM_TOKEN_TOO_NEW' },
    });
    expect(mockRepository.failTokenRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'INSTAGRAM_TOKEN_TOO_NEW', now })
    );
  });

  test('rotates a token from the configured previous encryption key', async () => {
    const previousKey = 'cd'.repeat(32);
    mockEnv.INSTAGRAM_TOKEN_KEY_VERSION = 'v2';
    mockEnv.INSTAGRAM_TOKEN_ENCRYPTION_KEY = 'ef'.repeat(32);
    mockEnv.INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION = 'v1';
    mockEnv.INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY = previousKey;
    const encryptedAccessToken = encryptSecret('stored-token', previousKey, {
      associatedData: 'instagram-access-token:v1',
    });
    mockRepository.findConnection.mockResolvedValue({
      status: 'connected',
      encryptedAccessToken,
      tokenKeyVersion: 'v1',
    });
    mockRepository.rotateConnectionToken.mockResolvedValue({ tokenKeyVersion: 'v2' });

    await expect(service.rotateStoredTokenEncryption()).resolves.toEqual({
      rotated: true,
      keyVersion: 'v2',
    });
    const rotated = mockRepository.rotateConnectionToken.mock.calls[0][0];
    expect(rotated.expectedKeyVersion).toBe('v1');
    expect(rotated.encryptedAccessToken).not.toContain('stored-token');
    expect(rotated.encryptedAccessToken).not.toBe(encryptedAccessToken);
  });
});
