const { decryptSecret, encryptSecret, randomToken } = require('../../utils/crypto');

describe('secret encryption helpers', () => {
  const key = 'ab'.repeat(32);

  test('round trips a secret with authenticated encryption', () => {
    const encrypted = encryptSecret('sensitive-token', key, { associatedData: 'instagram:v1' });
    expect(encrypted).not.toContain('sensitive-token');
    expect(decryptSecret(encrypted, key, { associatedData: 'instagram:v1' })).toBe(
      'sensitive-token'
    );
  });

  test('rejects tampering and mismatched associated data', () => {
    const encrypted = encryptSecret('sensitive-token', key, { associatedData: 'instagram:v1' });
    expect(() => decryptSecret(encrypted, key, { associatedData: 'instagram:v2' })).toThrow(
      'could not be decrypted'
    );
  });

  test('generates URL-safe random state', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
