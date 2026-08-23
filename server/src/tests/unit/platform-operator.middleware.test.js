const { ApiError } = require('../../utils/apiError');

const mockFindUserById = jest.fn();
jest.mock('../../modules/auth/auth.repository', () => ({ findUserById: mockFindUserById }));

const { platformOperatorMiddleware } = require('../../middleware/auth.middleware');

function runMiddleware(auth) {
  return new Promise((resolve) => {
    const req = { auth };
    platformOperatorMiddleware(req, {}, (error) => resolve({ error, req }));
  });
}

describe('platform operator middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects an ordinary authenticated user', async () => {
    mockFindUserById.mockResolvedValue({ roles: ['user'] });
    const { error } = await runMiddleware({ userId: 'user-1', sessionId: 'session-1' });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(403);
  });

  test('allows and attaches a platform operator', async () => {
    const operator = { _id: 'user-1', roles: ['user', 'platform_operator'] };
    mockFindUserById.mockResolvedValue(operator);
    const { error, req } = await runMiddleware({ userId: 'user-1', sessionId: 'session-1' });
    expect(error).toBeUndefined();
    expect(req.platformOperator).toBe(operator);
  });
});
