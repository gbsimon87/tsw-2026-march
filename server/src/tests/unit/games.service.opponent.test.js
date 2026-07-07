jest.mock('../../modules/teams/teams.repository', () => ({
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
}));

jest.mock('../../modules/games/games.repository', () => ({
  createGame: jest.fn(),
  listGamesByOwner: jest.fn(),
  findGameByIdAndOwner: jest.fn(),
  findGameById: jest.fn(),
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
  isTeamActive: jest.fn(() => true),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  getLeagueContextForGame: jest.fn(),
  getLeagueRosterSnapshotForTeam: jest.fn(),
  getLeagueTeamRosterSnapshotForGame: jest.fn(),
  canManageLeagueGame: jest.fn(() => false),
  scheduleLeagueAggregateRecompute: jest.fn(),
}));

jest.mock('mongoose', () => ({
  Schema: Object.assign(
    function Schema() {
      return { index: jest.fn() };
    },
    { Types: { ObjectId: function ObjectId() {} } }
  ),
  model: jest.fn(() => ({})),
  models: {},
  Types: {
    ObjectId: {
      isValid: jest.fn(() => true),
    },
  },
}));

const { findTeamByIdAndOwner, findTeamById } = require('../../modules/teams/teams.repository');
const {
  createGame,
  listGamesByOwner,
  findGameById,
} = require('../../modules/games/games.repository');
const {
  createGameForUser,
  listGamesForUser,
  getGameForUser,
  getPublicGame,
} = require('../../modules/games/games.service');

describe('games service opponent support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('persists opponent when creating a game', async () => {
    findTeamByIdAndOwner.mockResolvedValue({ _id: 'team-1' });
    createGame.mockResolvedValue({
      _id: 'game-1',
      ownerUserId: 'user-1',
      teamId: 'team-1',
      title: 'Friday Night',
      opponent: 'Falcons',
      status: 'in_progress',
      scheduledAt: null,
      completedAt: null,
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      updatedAt: new Date('2026-03-12T00:00:00.000Z'),
      events: [],
    });

    const game = await createGameForUser('user-1', {
      teamId: 'team-1',
      title: 'Friday Night',
      opponent: 'Falcons',
    });

    expect(createGame).toHaveBeenCalledWith(
      expect.objectContaining({
        opponent: 'Falcons',
      })
    );
    expect(game.opponent).toBe('Falcons');
  });

  test('listGamesForUser includes opponent and null fallback', async () => {
    findTeamById.mockResolvedValue({ _id: 'team-1', name: 'Team', players: [] });
    listGamesByOwner.mockResolvedValue([
      {
        _id: 'game-1',
        teamId: 'team-1',
        title: 'Game 1',
        opponent: 'Raptors',
        status: 'in_progress',
        scheduledAt: null,
        completedAt: null,
        events: [],
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
        updatedAt: new Date('2026-03-12T00:00:00.000Z'),
      },
      {
        _id: 'game-2',
        teamId: 'team-1',
        title: 'Game 2',
        opponent: null,
        status: 'completed',
        scheduledAt: null,
        completedAt: new Date('2026-03-12T01:00:00.000Z'),
        events: [],
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
        updatedAt: new Date('2026-03-12T01:00:00.000Z'),
      },
    ]);

    // OPT-018: listGamesForUser now returns { games, nextCursor }.
    const { games, nextCursor } = await listGamesForUser('user-1');

    expect(games[0].opponent).toBe('Raptors');
    expect(games[1].opponent).toBeNull();
    // No limit passed → unbounded (internal) path, no cursor.
    expect(nextCursor).toBeNull();
  });

  test('OPT-018: paginated list splits the over-fetch and emits nextCursor', async () => {
    findTeamById.mockResolvedValue({ _id: 'team-1', name: 'Team', players: [] });
    // limit=2 → repo over-fetches 3 (limit+1); service must return 2 items and
    // a cursor equal to the 2nd (last emitted) game's _id.
    const rows = [
      { _id: 'g1', teamId: 'team-1', title: 'G1', status: 'in_progress', events: [] },
      { _id: 'g2', teamId: 'team-1', title: 'G2', status: 'in_progress', events: [] },
      { _id: 'g3', teamId: 'team-1', title: 'G3', status: 'in_progress', events: [] },
    ];
    listGamesByOwner.mockResolvedValue(rows);

    const { games, nextCursor } = await listGamesForUser('user-1', { limit: 2 });

    expect(games).toHaveLength(2);
    expect(games.map((g) => g.id)).toEqual(['g1', 'g2']); // extra row trimmed
    expect(nextCursor).toBe('g2'); // cursor = last EMITTED game
  });

  test('OPT-018: paginated list with no further page returns nextCursor null', async () => {
    findTeamById.mockResolvedValue({ _id: 'team-1', name: 'Team', players: [] });
    // Only 2 rows for limit=2 → batch not exceeded → no next page.
    listGamesByOwner.mockResolvedValue([
      { _id: 'g1', teamId: 'team-1', title: 'G1', status: 'in_progress', events: [] },
      { _id: 'g2', teamId: 'team-1', title: 'G2', status: 'in_progress', events: [] },
    ]);

    const { games, nextCursor } = await listGamesForUser('user-1', { limit: 2 });

    expect(games).toHaveLength(2);
    expect(nextCursor).toBeNull();
  });

  test('getGameForUser returns game opponent in detail payload', async () => {
    findTeamByIdAndOwner.mockResolvedValue({
      _id: 'team-1',
      name: 'Team',
      players: [],
    });
    findGameById.mockResolvedValue({
      _id: 'game-1',
      ownerUserId: 'user-1',
      teamId: 'team-1',
      title: 'Detail Game',
      opponent: 'Sharks',
      status: 'in_progress',
      scheduledAt: null,
      completedAt: null,
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      updatedAt: new Date('2026-03-12T00:00:00.000Z'),
      events: [],
    });

    const result = await getGameForUser('user-1', 'game-1');
    expect(result.game.opponent).toBe('Sharks');
  });

  test('getPublicGame returns detail payload without owner user id', async () => {
    findTeamByIdAndOwner.mockResolvedValue({
      _id: 'team-1',
      name: 'Team',
      players: [],
    });
    findGameById.mockResolvedValue({
      _id: 'game-1',
      ownerUserId: 'user-1',
      teamId: 'team-1',
      title: 'Public Game',
      opponent: 'Wolves',
      status: 'completed',
      scheduledAt: null,
      completedAt: null,
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      updatedAt: new Date('2026-03-12T00:00:00.000Z'),
      events: [],
    });

    const result = await getPublicGame('game-1');

    expect(result.game.opponent).toBe('Wolves');
    expect(result.game.ownerUserId).toBeUndefined();
  });
});
