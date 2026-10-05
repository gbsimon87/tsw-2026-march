// V10: the dual-team retrack script deletes scheduled games. A game carrying
// hosted video must never be deleted, or its billed Mux asset is stranded.
jest.mock('../../config/db', () => ({ connectDb: jest.fn(), disconnectDb: jest.fn() }));

const {
  replaceGuardReasons,
  buildDeleteFilter,
} = require('../../scripts/retrack-league-games-dual');

const LEAGUE_ID = 'league-1';
const eligible = (overrides) => ({
  _id: 'g1',
  status: 'scheduled',
  trackingMode: 'one_sided',
  events: [],
  homeLeagueTeamId: 'h',
  awayLeagueTeamId: 'a',
  video: null,
  ...overrides,
});

describe('retrack-league-games-dual guards', () => {
  test('an eligible scheduled game has no reasons to skip', () => {
    expect(replaceGuardReasons(eligible(), new Set(['g1']))).toEqual([]);
  });

  test('a game carrying hosted video is left untouched', () => {
    const game = eligible({ video: { provider: 'mux', generationId: 'gen-1' } });
    expect(replaceGuardReasons(game, new Set(['g1']))).toContain('has hosted video');
  });

  test('the delete filter re-asserts that the game has no video', () => {
    expect(buildDeleteFilter({ ids: ['g1'], leagueId: LEAGUE_ID })).toMatchObject({
      _id: { $in: ['g1'] },
      leagueId: LEAGUE_ID,
      status: 'scheduled',
      trackingMode: 'one_sided',
      video: null,
    });
  });
});
