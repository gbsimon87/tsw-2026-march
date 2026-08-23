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
  INSTAGRAM_REQUEST_TIMEOUT_MS: 1000,
};

const mockRepository = {
  createOAuthState: jest.fn(),
  consumeOAuthState: jest.fn(),
  upsertConnection: jest.fn(),
  findConnection: jest.fn(),
  updateConnectionVerification: jest.fn(),
  revokeConnection: jest.fn(),
};

jest.mock('../../config/env', () => ({ env: mockEnv }));
jest.mock('../../modules/social/instagram/instagram.repository', () => mockRepository);

const service = require('../../modules/social/instagram/instagram.oauth.service');

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
    expect(result.connection.username).toBe('tsw_test');
    expect(JSON.stringify(result)).not.toContain('encrypted-secret');
  });
});
