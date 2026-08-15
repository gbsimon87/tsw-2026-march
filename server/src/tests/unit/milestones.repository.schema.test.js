const {
  PlayerMilestone,
  buildDedupeKey,
} = require('../../modules/milestones/milestones.repository');
const { MILESTONE_FAMILIES } = require('../../modules/milestones/milestones.catalog');

describe('buildDedupeKey', () => {
  test('omits the game for once-per-career milestones', () => {
    expect(
      buildDedupeKey({
        careerKey: 'user:abc',
        milestoneKey: 'career_points_1000',
        family: MILESTONE_FAMILIES.CAREER_THRESHOLD,
        sourceGameId: 'game1',
      })
    ).toBe('user:abc|career_points_1000');
  });

  test('omits the game for firsts', () => {
    expect(
      buildDedupeKey({
        careerKey: 'player:xyz',
        milestoneKey: 'first_career_three',
        family: MILESTONE_FAMILIES.FIRST,
        sourceGameId: 'game1',
      })
    ).toBe('player:xyz|first_career_three');
  });

  test('includes the game for repeatable single-game feats', () => {
    expect(
      buildDedupeKey({
        careerKey: 'user:abc',
        milestoneKey: 'triple_double',
        family: MILESTONE_FAMILIES.SINGLE_GAME_FEAT,
        sourceGameId: 'game1',
      })
    ).toBe('user:abc|triple_double|game1');
  });
});

describe('PlayerMilestone schema', () => {
  test('declares a unique index on dedupeKey', () => {
    const indexes = PlayerMilestone.schema.indexes();
    const dedupe = indexes.find(([fields]) => fields.dedupeKey === 1);
    expect(dedupe).toBeDefined();
    expect(dedupe[1].unique).toBe(true);
  });

  test('indexes the profile and unified-profile read paths', () => {
    const indexes = PlayerMilestone.schema.indexes();
    const byPlayer = indexes.find(
      ([fields]) => fields.leaguePlayerId === 1 && fields.achievedAt === -1
    );
    const byUser = indexes.find(
      ([fields]) => fields.claimedByUserId === 1 && fields.achievedAt === -1
    );
    expect(byPlayer).toBeDefined();
    expect(byUser).toBeDefined();
  });

  test('indexes sourceGameId for edit re-evaluation', () => {
    const indexes = PlayerMilestone.schema.indexes();
    expect(indexes.find(([fields]) => fields.sourceGameId === 1)).toBeDefined();
  });

  test('rejects an unknown family', () => {
    const doc = new PlayerMilestone({
      leagueId: '507f1f77bcf86cd799439011',
      careerKey: 'user:abc',
      leaguePlayerId: '507f1f77bcf86cd799439012',
      leagueTeamId: '507f1f77bcf86cd799439013',
      milestoneKey: 'career_points_500',
      family: 'not_a_family',
      tier: 'feed',
      sourceGameId: '507f1f77bcf86cd799439014',
      achievedAt: new Date(),
      dedupeKey: 'user:abc|career_points_500',
    });
    const error = doc.validateSync();
    expect(error.errors.family).toBeDefined();
  });
});
