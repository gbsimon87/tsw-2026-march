const {
  identityId,
  identityIds,
  identityGames,
} = require('../../modules/scrimmages/scrimmages.identity');
const { aggregateScrimmageStats } = require('../../modules/scrimmages/scrimmages.scoring');
test('merged records contribute to one profile across weeks without rewriting history', () => {
  const series = { playerMerges: [{ fromPlayerId: 'old', toPlayerId: 'kept' }] };
  const games = ['old', 'kept'].map((id, index) => ({
    status: 'completed',
    scrimmageSessionId: `week-${index}`,
    scoringRules: { insideArc: 1, outsideArc: 2 },
    homeRosterSnapshot: [{ _id: id, displayName: 'Original name' }],
    homeStartingLineupPlayerIds: [id],
    awayRosterSnapshot: [{ _id: 'other', displayName: 'Kyle' }],
    awayStartingLineupPlayerIds: ['other'],
    events: [
      { playerId: id, statType: 'FG2_MADE', teamSide: 'home', videoTimestamp: 4355 + index },
    ],
  }));
  const snapshot = JSON.stringify(games);
  const normalized = identityGames(games, series, [{ _id: 'kept', displayName: 'John' }]);
  const stats = aggregateScrimmageStats(normalized, undefined, 'season').find(
    (row) => row.playerId === 'kept'
  );
  expect(stats).toMatchObject({
    points: 2,
    makes: 2,
    gamesPlayed: 2,
    weeksPlayed: 2,
    wins: 2,
    displayName: 'John',
  });
  expect(JSON.stringify(games)).toBe(snapshot);
  expect(normalized[0].events[0].videoTimestamp).toBe(4355);
  expect(identityId(series, 'old')).toBe('kept');
  expect(identityIds(series, 'old')).toEqual(['kept', 'old']);
});
