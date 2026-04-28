jest.mock('../../modules/auth/auth.repository', () => ({
  createUser: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  findOrCreateGoogleUser: jest.fn(),
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

  test('register creates a local account without requiring email verification', async () => {
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

    const result = await authService.register({
      email: 'player@example.com',
      name: 'Player One',
      password: 'password123',
    });

    expect(result.message).toBe('Registration successful. You can now sign in.');
    expect(result.verificationUrl).toBeNull();
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
});
