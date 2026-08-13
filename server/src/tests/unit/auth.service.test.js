jest.mock('../../modules/auth/auth.repository', () => ({
  createUser: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  findOrCreateGoogleUser: jest.fn(),
  findOrCreateSystemUser: jest.fn(),
  upsertSession: jest.fn(),
  findSessionById: jest.fn(),
  deleteSessionById: jest.fn(),
  deleteSessionsByUserId: jest.fn(),
  createAuthToken: jest.fn(),
  findAuthTokenByHashAndType: jest.fn(),
  invalidateTokensForUserByType: jest.fn(),
  markAuthTokenUsed: jest.fn(),
  markEmailVerified: jest.fn(),
  updateUserPassword: jest.fn(),
}));

jest.mock('../../services/email.service', () => ({
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('../../services/authToken.service', () => ({
  generateRawToken: jest.fn(() => 'raw-verification-token'),
  hashAuthToken: jest.fn(() => 'hashed-token'),
  buildTokenExpiry: jest.fn(() => new Date('2030-01-01T00:00:00.000Z')),
}));

const repository = require('../../modules/auth/auth.repository');
const authService = require('../../modules/auth/auth.service');

describe('auth service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('register creates a local account and signs the user in', async () => {
    repository.findUserByEmail.mockResolvedValue(null);
    repository.createUser.mockResolvedValue({
      _id: 'user-1',
      email: 'player@example.com',
      name: 'Player One',
      roles: ['user'],
      plan: 'free',
      emailVerified: true,
      authProvider: 'local',
    });

    const result = await authService.register(
      {
        email: 'player@example.com',
        name: 'Player One',
        password: 'password123',
      },
      { userAgent: 'jest', ip: '127.0.0.1' }
    );

    // Registration issues a session directly rather than bouncing the new user
    // to the login form to re-enter the credentials they just chose.
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user.email).toBe('player@example.com');
    expect(repository.upsertSession).toHaveBeenCalledTimes(1);
  });

  test('register rejects an email that is already in use', async () => {
    repository.findUserByEmail.mockResolvedValue({ _id: 'existing', email: 'taken@example.com' });

    await expect(
      authService.register(
        { email: 'taken@example.com', name: 'Someone', password: 'password123' },
        { userAgent: 'jest', ip: '127.0.0.1' }
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(repository.createUser).not.toHaveBeenCalled();
    expect(repository.upsertSession).not.toHaveBeenCalled();
  });

  test('requestEmailVerification returns a generic response when verification is not required', async () => {
    repository.findUserByEmail.mockResolvedValue({
      _id: 'user-1',
      email: 'player@example.com',
      name: 'Player One',
      authProvider: 'local',
      emailVerified: true,
    });

    const result = await authService.requestEmailVerification('player@example.com');

    expect(result.message).toBe(
      'If an account exists for that email, a verification link has been sent.'
    );
    expect(result.verificationUrl).toBeNull();
  });

  test('login rejects the reserved system account even if a password hash is ever set', async () => {
    repository.findUserByEmail.mockResolvedValue({
      _id: 'system-1',
      email: 'system@tsw.internal',
      authProvider: 'system',
      passwordHash: 'some-hash',
    });

    await expect(
      authService.login({ email: 'system@tsw.internal', password: 'whatever' }, {})
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('login rejects a user with no passwordHash (covers the system user by default)', async () => {
    repository.findUserByEmail.mockResolvedValue({
      _id: 'system-1',
      email: 'system@tsw.internal',
      authProvider: 'system',
      passwordHash: null,
    });

    await expect(
      authService.login({ email: 'system@tsw.internal', password: 'whatever' }, {})
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('getSystemUserId creates the system user once and caches the id across calls', async () => {
    repository.findOrCreateSystemUser.mockResolvedValue({
      _id: 'system-1',
      email: 'system@tsw.internal',
      authProvider: 'system',
    });

    const first = await authService.getSystemUserId();
    const second = await authService.getSystemUserId();

    expect(first).toBe('system-1');
    expect(second).toBe('system-1');
    expect(repository.findOrCreateSystemUser).toHaveBeenCalledTimes(1);
  });
});
