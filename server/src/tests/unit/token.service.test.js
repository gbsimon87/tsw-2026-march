const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../../services/token.service');

describe('token service', () => {
  test('signs and verifies access token', () => {
    const token = signAccessToken({ sub: 'abc', sid: 'session-1' });
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe('abc');
    expect(payload.sid).toBe('session-1');
  });

  test('signs and verifies refresh token', () => {
    const token = signRefreshToken({ sub: 'xyz', sid: 'session-2' });
    const payload = verifyRefreshToken(token);

    expect(payload.sub).toBe('xyz');
    expect(payload.sid).toBe('session-2');
  });
});
