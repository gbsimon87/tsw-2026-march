// Guard against the "mock hides a missing export" gap: follows.service.test.js
// mocks leagues.service / leagues.repository, so it can't catch the real module
// failing to export a symbol the follows module imports. This bit us once —
// `assertLeagueVisible` was defined in leagues.service.js but never added to its
// module.exports, so every league/leagueTeam follow threw a runtime 500
// ("assertLeagueVisible is not a function") that all mocked tests passed through.
//
// These assertions require the REAL modules (no mocks) and check the exact
// symbols follows.service.js depends on actually exist as functions.
const leaguesService = require('../../modules/leagues/leagues.service');
const leaguesRepository = require('../../modules/leagues/leagues.repository');

describe('follows module external dependency contract', () => {
  test('leagues.service exports the helpers follows.service imports', () => {
    expect(typeof leaguesService.assertLeagueVisible).toBe('function');
    expect(typeof leaguesService.assembleLeagueProfilesForUser).toBe('function');
  });

  test('leagues.repository exports the batch getters follows.service imports', () => {
    expect(typeof leaguesRepository.listLeaguesByIds).toBe('function');
    expect(typeof leaguesRepository.listLeagueTeamsByIds).toBe('function');
  });
});
