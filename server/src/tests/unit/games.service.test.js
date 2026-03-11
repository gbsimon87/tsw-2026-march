const { computeBoxScore } = require('../../modules/games/games.service');
const { STAT_TYPES } = require('../../modules/shared/stats.constants');

describe('games service box score', () => {
  test('computes player and team totals from events', () => {
    const team = {
      players: [
        { _id: '111111111111111111111111', displayName: 'Alex', isActive: true },
        { _id: '222222222222222222222222', displayName: 'Blake', isActive: true },
      ],
    };

    const game = {
      events: [
        { playerId: '111111111111111111111111', statType: STAT_TYPES.FT_MADE },
        { playerId: '111111111111111111111111', statType: STAT_TYPES.FG2_MADE },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.FG3_MADE },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.FG3_MISS },
      ],
    };

    const box = computeBoxScore(game, team);
    const alex = box.players.find((row) => row.displayName === 'Alex');
    const blake = box.players.find((row) => row.displayName === 'Blake');

    expect(alex.ftm).toBe(1);
    expect(alex.fta).toBe(1);
    expect(alex.fg2m).toBe(1);
    expect(alex.fg2a).toBe(1);
    expect(alex.points).toBe(3);

    expect(blake.fg3m).toBe(1);
    expect(blake.fg3a).toBe(2);
    expect(blake.points).toBe(3);

    expect(box.teamTotals.points).toBe(6);
  });
});
