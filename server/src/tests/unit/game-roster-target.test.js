const { resolveRosterTargetForGame } = require('../../modules/games/games.service');

describe('resolveRosterTargetForGame', () => {
  it('maps a standalone one-sided game to the team with no snapshot field', () => {
    const game = {
      gameContext: 'standalone',
      trackingMode: 'one_sided',
      teamId: 'team-1',
    };
    expect(resolveRosterTargetForGame(game, undefined)).toEqual({
      kind: 'standalone',
      teamId: 'team-1',
      snapshotField: null,
    });
  });

  it('maps a league one-sided game to the tracked league team and rosterSnapshot', () => {
    const game = {
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'lt-1',
    };
    expect(resolveRosterTargetForGame(game, undefined)).toEqual({
      kind: 'league',
      leagueId: 'league-1',
      leagueTeamId: 'lt-1',
      snapshotField: 'rosterSnapshot',
    });
  });

  it('maps a league dual-team home side to the home league team and snapshot', () => {
    const game = {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'lt-home',
      awayLeagueTeamId: 'lt-away',
    };
    expect(resolveRosterTargetForGame(game, 'home')).toEqual({
      kind: 'league',
      leagueId: 'league-1',
      leagueTeamId: 'lt-home',
      snapshotField: 'homeRosterSnapshot',
    });
  });

  it('maps a league dual-team away side to the away league team and snapshot', () => {
    const game = {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'lt-home',
      awayLeagueTeamId: 'lt-away',
    };
    expect(resolveRosterTargetForGame(game, 'away')).toEqual({
      kind: 'league',
      leagueId: 'league-1',
      leagueTeamId: 'lt-away',
      snapshotField: 'awayRosterSnapshot',
    });
  });

  it('maps a standalone dual-team away side to the away team and snapshot', () => {
    const game = {
      gameContext: 'standalone',
      trackingMode: 'dual_team',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
    };
    expect(resolveRosterTargetForGame(game, 'away')).toEqual({
      kind: 'standalone',
      teamId: 'team-away',
      snapshotField: 'awayRosterSnapshot',
    });
  });

  it('throws 400 when a dual-team game is given no side', () => {
    const game = {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'lt-home',
      awayLeagueTeamId: 'lt-away',
    };
    expect(() => resolveRosterTargetForGame(game, undefined)).toThrow(
      /side is required for dual-team games/
    );
  });
});
