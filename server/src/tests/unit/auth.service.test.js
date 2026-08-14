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

jest.mock('../../modules/analytics/analytics.service', () => ({
  captureEventDetached: jest.fn(),
  pseudonymousId: jest.fn((email) => `anon_${email}`),
}));

const repository = require('../../modules/auth/auth.repository');
const analyticsService = require('../../modules/analytics/analytics.service');
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

  describe('analytics events', () => {
    function mockNewUser() {
      repository.findUserByEmail.mockResolvedValue(null);
      repository.createUser.mockResolvedValue({
        _id: 'user-1',
        email: 'player@example.com',
        name: 'Player One',
        roles: ['user'],
        plan: 'starter',
        emailVerified: true,
        authProvider: 'local',
      });
    }

    test('register captures user_registered and a first login', async () => {
      mockNewUser();

      await authService.register(
        { email: 'player@example.com', name: 'Player One', password: 'password123' },
        { userAgent: 'jest', ip: '127.0.0.1' }
      );

      // Acquisition and engagement stay separate: user_registered fires once
      // per account ever, user_logged_in on every return. Auto-login means
      // they land back to back the first time, flagged by is_first_login.
      expect(analyticsService.captureEventDetached).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'user_registered',
        properties: { auth_provider: 'local' },
      });
      expect(analyticsService.captureEventDetached).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'user_logged_in',
        properties: { auth_provider: 'local', is_first_login: true },
      });
    });

    test('register captures registration_failed without storing the address', async () => {
      repository.findUserByEmail.mockResolvedValue({ _id: 'existing' });

      await expect(
        authService.register(
          { email: 'taken@example.com', name: 'Someone', password: 'password123' },
          { userAgent: 'jest', ip: '127.0.0.1' }
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(analyticsService.pseudonymousId).toHaveBeenCalledWith('taken@example.com');
      expect(analyticsService.captureEventDetached).toHaveBeenCalledWith({
        distinctId: 'anon_taken@example.com',
        event: 'registration_failed',
        properties: { reason: 'email_in_use' },
      });
    });

    test('login captures user_logged_in as a return visit', async () => {
      repository.findUserByEmail.mockResolvedValue({
        _id: 'user-1',
        email: 'player@example.com',
        name: 'Player One',
        passwordHash: await require('bcryptjs').hash('password123', 4),
        authProvider: 'local',
        roles: ['user'],
        plan: 'starter',
      });

      await authService.login(
        { email: 'player@example.com', password: 'password123' },
        { userAgent: 'jest', ip: '127.0.0.1' }
      );

      expect(analyticsService.captureEventDetached).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'user_logged_in',
        properties: { auth_provider: 'local', is_first_login: false },
      });
    });

    test('refreshing a session does not count as a login', async () => {
      const jwt = require('jsonwebtoken');
      const { env } = require('../../config/env');
      const sessionId = 'session-1';
      const refreshToken = jwt.sign({ sub: 'user-1', sid: sessionId }, env.JWT_REFRESH_SECRET, {
        expiresIn: '7d',
      });

      repository.findSessionById.mockResolvedValue({
        _id: sessionId,
        userId: 'user-1',
        refreshTokenHash: require('crypto').createHash('sha256').update(refreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      });
      repository.findUserById.mockResolvedValue({
        _id: 'user-1',
        email: 'player@example.com',
        name: 'Player One',
        authProvider: 'local',
        roles: ['user'],
        plan: 'starter',
      });

      await authService.refresh(refreshToken, { userAgent: 'jest', ip: '127.0.0.1' });

      // Refresh rotates tokens every ~15 minutes for an active user. Counting
      // it as a login would turn an engagement metric into a session-duration
      // proxy and inflate event volume for no analytical gain.
      expect(analyticsService.captureEventDetached).not.toHaveBeenCalled();
    });

    test('a failed login captures nothing', async () => {
      repository.findUserByEmail.mockResolvedValue(null);

      await expect(
        authService.login(
          { email: 'nobody@example.com', password: 'password123' },
          { userAgent: 'jest', ip: '127.0.0.1' }
        )
      ).rejects.toMatchObject({ statusCode: 401 });

      // Failed logins are a security signal, not an acquisition one, and
      // capturing them would put unverified addresses into analytics.
      expect(analyticsService.captureEventDetached).not.toHaveBeenCalled();
    });

    test('a new Google account captures registration and first login once', async () => {
      const googleUser = {
        _id: 'google-user-1',
        email: 'google@example.com',
        name: 'Google Player',
        authProvider: 'google',
        emailVerified: true,
        roles: ['user'],
        plan: 'starter',
      };
      repository.findOrCreateGoogleUser.mockResolvedValue({ user: googleUser, isNew: true });

      const exchangeToken = await authService.prepareGoogleExchange({
        id: 'google-profile-1',
        email: 'google@example.com',
        name: 'Google Player',
      });

      expect(analyticsService.captureEventDetached).toHaveBeenCalledWith({
        distinctId: 'google-user-1',
        event: 'user_registered',
        properties: { auth_provider: 'google' },
      });

      repository.findUserById.mockResolvedValue(googleUser);
      await authService.exchangeGoogleOAuthToken(exchangeToken, {
        userAgent: 'jest',
        ip: '127.0.0.1',
      });

      expect(analyticsService.captureEventDetached).toHaveBeenCalledWith({
        distinctId: 'google-user-1',
        event: 'user_logged_in',
        properties: { auth_provider: 'google', is_first_login: true },
      });
    });

    test('an existing Google account is captured only as a return login', async () => {
      const googleUser = {
        _id: 'google-user-1',
        email: 'google@example.com',
        name: 'Google Player',
        authProvider: 'google',
        emailVerified: true,
        roles: ['user'],
        plan: 'starter',
      };
      repository.findOrCreateGoogleUser.mockResolvedValue({ user: googleUser, isNew: false });

      const exchangeToken = await authService.prepareGoogleExchange({
        id: 'google-profile-1',
        email: 'google@example.com',
        name: 'Google Player',
      });
      repository.findUserById.mockResolvedValue(googleUser);
      await authService.exchangeGoogleOAuthToken(exchangeToken, {
        userAgent: 'jest',
        ip: '127.0.0.1',
      });

      expect(analyticsService.captureEventDetached).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'user_registered' })
      );
      expect(analyticsService.captureEventDetached).toHaveBeenCalledWith({
        distinctId: 'google-user-1',
        event: 'user_logged_in',
        properties: { auth_provider: 'google', is_first_login: false },
      });
    });
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
