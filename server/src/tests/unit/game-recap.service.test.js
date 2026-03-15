const { buildGameRecap } = require('../../modules/games/gameRecap.service');

describe('game recap service', () => {
  test('builds recap from game events and box score', () => {
    const game = {
      status: 'completed',
      opponent: 'Wildcats',
      completedAt: '2026-03-12T19:20:00.000Z',
      events: [
        {
          _id: 'e1',
          playerId: 'p1',
          statType: 'FG3_MADE',
          zoneId: 'WING_LEFT_3',
          x: 18,
          y: 40,
          occurredAt: '2026-03-12T18:03:00.000Z',
        },
        {
          _id: 'e2',
          playerId: 'p2',
          statType: 'AST',
          occurredAt: '2026-03-12T18:03:20.000Z',
        },
      ],
    };
    const team = {
      _id: 'team-1',
      name: 'TSW Team',
      players: [
        { _id: 'p1', displayName: 'Alex' },
        { _id: 'p2', displayName: 'Jordan' },
      ],
    };
    const boxScore = {
      players: [
        { playerId: 'p1', displayName: 'Alex', points: 3, reb: 0, ast: 0 },
        { playerId: 'p2', displayName: 'Jordan', points: 0, reb: 0, ast: 1 },
      ],
      teamTotals: {
        points: 3,
        reb: 0,
        ast: 1,
      },
    };

    const recap = buildGameRecap(game, team, boxScore);

    expect(recap.statusLabel).toBe('Final');
    expect(recap.team.points).toBe(3);
    expect(recap.opponent.name).toBe('Wildcats');
    expect(recap.topPerformers[0].displayName).toBe('Alex');
    expect(recap.teamStats.fg3.made).toBe(1);
    expect(recap.keyMoments[0].statType).toBe('FG3_MADE');
    expect(recap.shotSnapshot.events).toHaveLength(1);
  });
});
