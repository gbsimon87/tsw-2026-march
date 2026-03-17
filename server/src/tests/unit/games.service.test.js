jest.mock('../../modules/teams/teams.repository', () => ({
  findTeamByIdAndOwner: jest.fn(),
}));

jest.mock('../../modules/games/games.repository', () => ({
  findGameByIdAndOwner: jest.fn(),
  saveGame: jest.fn(),
}));

jest.mock('../../modules/billing/billing.service', () => ({
  getBillingSummary: jest.fn(() => ({
    plan: 'free',
    subscriptionStatus: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  })),
  getTeamEntitlements: jest.fn(() => ({
    canViewReplay: false,
    canViewShotMaps: false,
  })),
}));

jest.mock('../../modules/games/gameRecap.service', () => ({
  buildGameRecap: jest.fn(() => ({ summary: [] })),
}));

jest.mock('mongoose', () => ({
  Types: {
    ObjectId: {
      isValid: jest.fn(() => true),
    },
  },
}));

const { findTeamByIdAndOwner } = require('../../modules/teams/teams.repository');
const { findGameByIdAndOwner, saveGame } = require('../../modules/games/games.repository');
const { computeBoxScore, setGameLineup } = require('../../modules/games/games.service');
const { STAT_TYPES } = require('../../modules/shared/stats.constants');

function buildPlayers(players) {
  const list = players.map((player) => ({ ...player }));
  list.id = (playerId) => list.find((player) => String(player._id) === String(playerId)) || null;
  return list;
}

describe('games service box score', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('computes player and team totals from events', () => {
    const team = {
      players: buildPlayers([
        { _id: '111111111111111111111111', displayName: 'Alex', isActive: true },
        { _id: '222222222222222222222222', displayName: 'Blake', isActive: true },
      ]),
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
      players: buildPlayers([
        { _id: '111111111111111111111111', displayName: 'Alex', isActive: true },
      ]),
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

  test('ignores opponent rebound and substitution events in box score totals', () => {
    const team = {
      players: buildPlayers([
        { _id: '111111111111111111111111', displayName: 'Alex', isActive: true },
        { _id: '222222222222222222222222', displayName: 'Blake', isActive: true },
      ]),
    };
    const game = {
      events: [
        { playerId: '111111111111111111111111', statType: STAT_TYPES.SUB_OUT },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.SUB_IN },
        { statType: STAT_TYPES.OPP_REB },
        { playerId: '111111111111111111111111', statType: STAT_TYPES.STL },
      ],
    };

    const box = computeBoxScore(game, team);

    expect(box.teamTotals.reb).toBe(0);
    expect(box.teamTotals.stl).toBe(1);
    expect(box.players.find((row) => row.displayName === 'Alex').stl).toBe(1);
  });
});

describe('games service lineups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saves a valid starting lineup', async () => {
    const team = {
      _id: 'team-1',
      players: buildPlayers([
        { _id: 'player-1', displayName: 'Alex', isActive: true },
        { _id: 'player-2', displayName: 'Blake', isActive: true },
        { _id: 'player-3', displayName: 'Casey', isActive: true },
        { _id: 'player-4', displayName: 'Drew', isActive: true },
        { _id: 'player-5', displayName: 'Evan', isActive: true },
        { _id: 'player-6', displayName: 'Flynn', isActive: true },
      ]),
    };
    const game = {
      _id: 'game-1',
      teamId: 'team-1',
      status: 'in_progress',
      events: [],
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
    };

    findGameByIdAndOwner.mockResolvedValue(game);
    findTeamByIdAndOwner.mockResolvedValue(team);
    saveGame.mockResolvedValue(game);

    const result = await setGameLineup('user-1', 'game-1', [
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]);

    expect(game.startingLineupPlayerIds).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]);
    expect(game.currentLineupPlayerIds).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]);
    expect(result.game.currentLineupPlayerIds).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]);
  });

  test('rejects a lineup with duplicate players', async () => {
    const team = {
      _id: 'team-1',
      players: buildPlayers([
        { _id: 'player-1', displayName: 'Alex', isActive: true },
        { _id: 'player-2', displayName: 'Blake', isActive: true },
        { _id: 'player-3', displayName: 'Casey', isActive: true },
        { _id: 'player-4', displayName: 'Drew', isActive: true },
        { _id: 'player-5', displayName: 'Evan', isActive: true },
      ]),
    };
    const game = {
      _id: 'game-1',
      teamId: 'team-1',
      status: 'in_progress',
      events: [],
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
    };

    findGameByIdAndOwner.mockResolvedValue(game);
    findTeamByIdAndOwner.mockResolvedValue(team);

    await expect(
      setGameLineup('user-1', 'game-1', [
        'player-1',
        'player-1',
        'player-2',
        'player-3',
        'player-4',
      ])
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
