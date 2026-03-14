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
        { playerId: '222222222222222222222222', statType: STAT_TYPES.AST },
        { playerId: '111111111111111111111111', statType: STAT_TYPES.OREB },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.FG3_MADE },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.FG3_MISS },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.DREB },
      ],
    };

    const box = computeBoxScore(game, team);
    const alex = box.players.find((row) => row.displayName === 'Alex');
    const blake = box.players.find((row) => row.displayName === 'Blake');

    expect(alex.ftm).toBe(1);
    expect(alex.fta).toBe(1);
    expect(alex.fg2m).toBe(1);
    expect(alex.fg2a).toBe(1);
    expect(alex.ast).toBe(0);
    expect(alex.oreb).toBe(1);
    expect(alex.dreb).toBe(0);
    expect(alex.reb).toBe(1);
    expect(alex.points).toBe(3);

    expect(blake.fg3m).toBe(1);
    expect(blake.fg3a).toBe(2);
    expect(blake.ast).toBe(1);
    expect(blake.oreb).toBe(0);
    expect(blake.dreb).toBe(1);
    expect(blake.reb).toBe(1);
    expect(blake.points).toBe(3);

    expect(box.teamTotals.points).toBe(6);
    expect(box.teamTotals.ast).toBe(1);
    expect(box.teamTotals.oreb).toBe(1);
    expect(box.teamTotals.dreb).toBe(1);
    expect(box.teamTotals.reb).toBe(2);
  });

  test('creates fallback player rows for rebound-only unknown players', () => {
    const team = {
      players: [{ _id: '111111111111111111111111', displayName: 'Alex', isActive: true }],
    };
    const game = {
      events: [{ playerId: '999999999999999999999999', statType: STAT_TYPES.OREB }],
    };

    const box = computeBoxScore(game, team);
    const fallback = box.players.find((row) => row.playerId === '999999999999999999999999');

    expect(fallback.displayName).toContain('Unknown');
    expect(fallback.ast).toBe(0);
    expect(fallback.oreb).toBe(1);
    expect(fallback.reb).toBe(1);
    expect(box.teamTotals.reb).toBe(1);
    expect(box.teamTotals.points).toBe(0);
  });
});
