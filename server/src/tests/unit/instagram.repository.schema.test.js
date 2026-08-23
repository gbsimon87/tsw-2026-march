const {
  InstagramConnection,
  InstagramOAuthState,
} = require('../../modules/social/instagram/instagram.repository');

describe('Instagram persistence schema', () => {
  test('enforces one Instagram platform connection', () => {
    const platformIndex = InstagramConnection.schema
      .indexes()
      .find(([fields]) => fields.platform === 1);
    expect(platformIndex?.[1]?.unique).toBe(true);
  });

  test('keeps encrypted access tokens out of normal queries', () => {
    expect(InstagramConnection.schema.path('encryptedAccessToken').options.select).toBe(false);
  });

  test('makes OAuth state hashes unique and expires state records', () => {
    const indexes = InstagramOAuthState.schema.indexes();
    const stateIndex = indexes.find(([fields]) => fields.stateHash === 1);
    const expiryIndex = indexes.find(([fields]) => fields.expiresAt === 1);
    expect(stateIndex?.[1]?.unique).toBe(true);
    expect(expiryIndex?.[1]?.expireAfterSeconds).toBe(0);
  });
});
