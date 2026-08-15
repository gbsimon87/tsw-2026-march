const { Post, deleteAutoPostsForGameIds } = require('../../modules/feed/feed.repository');

describe('Post schema — milestone posts', () => {
  test('accepts the milestone type', () => {
    const doc = new Post({
      creatorUserId: '507f1f77bcf86cd799439011',
      type: 'milestone',
      milestoneCard: {
        milestoneId: '507f1f77bcf86cd799439012',
        leaguePlayerId: '507f1f77bcf86cd799439013',
        leagueTeamId: '507f1f77bcf86cd799439014',
        gameId: '507f1f77bcf86cd799439015',
        auto: true,
      },
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  test('declares a unique sparse index on milestoneCard.milestoneId', () => {
    const index = Post.schema
      .indexes()
      .find(([fields]) => fields['milestoneCard.milestoneId'] === 1);
    expect(index).toBeDefined();
    expect(index[1].unique).toBe(true);
    expect(index[1].sparse).toBe(true);
  });
});

describe('deleteAutoPostsForGameIds — league going private', () => {
  afterEach(() => jest.restoreAllMocks());

  // Spec §5.4 and §10: flipping a league to private must remove its
  // system-authored milestone cards along with the game cards and highlight
  // clips. The milestone RECORDS are deliberately retained — profile links are
  // already withheld while a league is private.
  test('includes system-authored milestone posts in the deletion', async () => {
    const deleteMany = jest.spyOn(Post, 'deleteMany').mockResolvedValue({ deletedCount: 3 });

    await deleteAutoPostsForGameIds(['g1', 'g2'], 'system-user-1');

    const filter = deleteMany.mock.calls[0][0];
    const milestoneClause = filter.$or.find((clause) => clause.type === 'milestone');
    expect(milestoneClause).toEqual({
      type: 'milestone',
      'milestoneCard.gameId': { $in: ['g1', 'g2'] },
      creatorUserId: 'system-user-1',
    });
  });

  test('is a no-op for an empty game list', async () => {
    const deleteMany = jest.spyOn(Post, 'deleteMany');
    const result = await deleteAutoPostsForGameIds([], 'system-user-1');
    expect(result).toEqual({ deletedCount: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
