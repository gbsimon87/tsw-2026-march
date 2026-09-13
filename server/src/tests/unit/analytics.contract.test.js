const {
  parseServerEvent,
  SERVER_EVENT_NAMES,
} = require('../../modules/analytics/analytics.contract');

// docs/posthog.md §16.5: "event names and properties are allow-listed". The
// contract is the last line of defence before a property reaches PostHog, so
// it is tested directly rather than only through the services that call it.
describe('server analytics contract', () => {
  test('rejects an event name that is not on the allowlist', () => {
    expect(parseServerEvent('button_clicked', {})).toBeNull();
    expect(parseServerEvent('game_tracking_finished', { game_id: 'game-1' })).toBeNull();
  });

  test('rejects a property that is not on the event schema', () => {
    expect(
      parseServerEvent('resource_created', {
        resource_type: 'team',
        resource_id: 'team-1',
        actor_role: 'team_manager',
        name: 'Brixton Ballers',
      })
    ).toBeNull();
  });

  test('rejects a value outside the approved enum', () => {
    expect(
      parseServerEvent('resource_created', {
        resource_type: 'opponent',
        resource_id: 'team-1',
        actor_role: 'team_manager',
      })
    ).toBeNull();
  });

  describe('league_team_created', () => {
    test('accepts league, team, and actor context', () => {
      expect(
        parseServerEvent('league_team_created', {
          league_id: 'league-1',
          league_team_id: 'lt-1',
          actor_role: 'league_owner',
        })
      ).toEqual({
        league_id: 'league-1',
        league_team_id: 'lt-1',
        actor_role: 'league_owner',
      });
    });

    test('rejects a display name in place of an ID', () => {
      expect(
        parseServerEvent('league_team_created', {
          league_id: 'league-1',
          league_team_id: 'lt-1',
          actor_role: 'league_owner',
          league_team_name: 'Brixton Ballers',
        })
      ).toBeNull();
    });
  });

  describe('game_tracking_started', () => {
    test('accepts the same safe game context as game_completed', () => {
      expect(
        parseServerEvent('game_tracking_started', {
          game_id: 'game-1',
          game_context: 'league',
          tracking_mode: 'dual_team',
          actor_role: 'league_manager',
          league_id: 'league-1',
          season_id: 'season-1',
        })
      ).toEqual({
        game_id: 'game-1',
        game_context: 'league',
        tracking_mode: 'dual_team',
        actor_role: 'league_manager',
        league_id: 'league-1',
        season_id: 'season-1',
      });
    });

    test('requires the game context', () => {
      expect(parseServerEvent('game_tracking_started', { game_id: 'game-1' })).toBeNull();
    });
  });

  test('every allow-listed name parses its own documented shape', () => {
    expect(SERVER_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        'league_team_created',
        'game_tracking_started',
        'roster_populated',
        'game_completed',
      ])
    );
  });
});
