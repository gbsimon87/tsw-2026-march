jest.mock('../../modules/teams/teams.repository', () => ({
  createTeam: jest.fn(),
  listTeamsByOwner: jest.fn(),
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
  saveTeam: jest.fn(),
}));

jest.mock('../../modules/games/games.repository', () => ({
  listGamesByTeamId: jest.fn(),
}));

jest.mock('mongoose', () => ({
  Types: {
    ObjectId: {
      isValid: jest.fn(() => true),
    },
  },
}));

const { findTeamById } = require('../../modules/teams/teams.repository');
const { listGamesByTeamId } = require('../../modules/games/games.repository');
const { getPublicTeam } = require('../../modules/teams/teams.service');

describe('teams public service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns active players only and sorts jersey numbers first', async () => {
    findTeamById.mockResolvedValue({
      _id: 'team-1',
      name: 'TSW Blue',
      players: [
        { _id: 'p1', displayName: 'Chris', jerseyNumber: null, isActive: true },
        { _id: 'p2', displayName: 'Alex', jerseyNumber: 4, isActive: true },
        { _id: 'p3', displayName: 'Jordan', jerseyNumber: 12, isActive: false },
      ],
    });
    listGamesByTeamId.mockResolvedValue([]);

    const result = await getPublicTeam('team-1');

    expect(result.team.players).toEqual([
      { id: 'p2', displayName: 'Alex', jerseyNumber: 4 },
      { id: 'p1', displayName: 'Chris', jerseyNumber: null },
    ]);
  });

  test('includes public game summaries with computed team points and future visibility', async () => {
    findTeamById.mockResolvedValue({
      _id: 'team-1',
      name: 'TSW Blue',
      players: [],
    });
    listGamesByTeamId.mockResolvedValue([
      {
        _id: 'g1',
        title: 'vs Falcons',
        opponent: 'Falcons',
        status: 'completed',
        scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
        completedAt: new Date('2026-03-10T02:00:00.000Z'),
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        events: [{ statType: 'FG2_MADE' }, { statType: 'FT_MADE' }, { statType: 'FG3_MADE' }],
      },
      {
        _id: 'g2',
        title: 'vs Hawks',
        opponent: 'Hawks',
        status: 'in_progress',
        scheduledAt: new Date('2099-03-10T00:00:00.000Z'),
        completedAt: null,
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        events: [],
      },
    ]);

    const result = await getPublicTeam('team-1');

    expect(result.games).toEqual([
      expect.objectContaining({
        id: 'g1',
        teamPoints: 6,
        isPubliclyViewable: true,
      }),
      expect.objectContaining({
        id: 'g2',
        teamPoints: null,
        isPubliclyViewable: false,
      }),
    ]);
  });
});
