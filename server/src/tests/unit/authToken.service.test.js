const {
  generateRawToken,
  hashAuthToken,
  buildTokenExpiry,
} = require('../../services/authToken.service');

describe('auth token service', () => {
  test('generates random token', () => {
    const tokenA = generateRawToken();
    const tokenB = generateRawToken();

    expect(tokenA).not.toEqual(tokenB);
    expect(tokenA.length).toBeGreaterThan(20);
  });

  test('hashes token deterministically', () => {
    const hashA = hashAuthToken('sample-token');
    const hashB = hashAuthToken('sample-token');

    expect(hashA).toEqual(hashB);
    expect(hashA).not.toEqual('sample-token');
  });

  test('builds expiry per token type', () => {
    const verifyExpiry = buildTokenExpiry('email_verification');
    const resetExpiry = buildTokenExpiry('password_reset');

    expect(verifyExpiry.getTime()).toBeGreaterThan(resetExpiry.getTime());
  });
});
