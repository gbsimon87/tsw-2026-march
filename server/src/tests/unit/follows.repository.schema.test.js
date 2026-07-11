// Schema-introspection guard for the Follow model (no DB connection). Locks in
// the polymorphic-ready shape and the two indexes the follow feature depends
// on: the unique dedupe guard and the keyset listing index.
const mongoose = require('mongoose');

require('../../modules/follows/follows.repository');

const Follow = mongoose.model('Follow');

describe('Follow schema', () => {
  test('declares followerUserId, targetType, targetId', () => {
    expect(Follow.schema.path('followerUserId').instance).toBe('ObjectId');
    expect(Follow.schema.path('targetType').instance).toBe('String');
    expect(Follow.schema.path('targetId').instance).toBe('ObjectId');
  });

  test('targetType enum is users-only in v1 with a default of "user"', () => {
    const targetType = Follow.schema.path('targetType');
    expect(targetType.enumValues).toEqual(['user']);
    expect(targetType.defaultValue).toBe('user');
  });

  test('has a unique dedupe index and a keyset listing index', () => {
    const indexes = Follow.schema.indexes();

    const unique = indexes.find(
      ([keys]) => keys.followerUserId === 1 && keys.targetType === 1 && keys.targetId === 1
    );
    expect(unique).toBeDefined();
    expect(unique[1]).toMatchObject({ unique: true });

    const listing = indexes.find(([keys]) => keys.followerUserId === 1 && keys._id === -1);
    expect(listing).toBeDefined();
  });
});
