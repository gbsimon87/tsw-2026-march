jest.mock('../../modules/leagues/leagues.repository', () => ({
  createLeague: jest.fn(),
  listLeaguesByOwner: jest.fn(),
  listPublicLeagues: jest.fn(),
  findLeagueById: jest.fn(),
  findLeagueByIdAndOwner: jest.fn(),
  findLeagueBySlug: jest.fn(),
  listLeaguesByIds: jest.fn(),
  saveLeague: jest.fn(),
  createLeagueTeam: jest.fn(),
  listLeagueTeams: jest.fn(),
  findLeagueTeamByIdAndLeague: jest.fn(),
  findLeagueTeamByLeagueAndSlug: jest.fn(),
  saveLeagueTeam: jest.fn(),
  createLeaguePlayer: jest.fn(),
  findLeaguePlayerById: jest.fn(),
  findLeaguePlayerByIdAndTeam: jest.fn(),
  listLeaguePlayers: jest.fn(),
  saveLeaguePlayer: jest.fn(),
  createLeagueTeamMember: jest.fn(),
  findActiveLeagueTeamMember: jest.fn(),
  findLeagueTeamMemberById: jest.fn(),
  listLeagueTeamMembers: jest.fn(),
  listLeagueMembershipsForUser: jest.fn(),
  saveLeagueTeamMember: jest.fn(),
  createLeagueJoinRequest: jest.fn(),
  findLeagueJoinRequestById: jest.fn(),
  findPendingLeagueJoinRequest: jest.fn(),
  listLeagueJoinRequests: jest.fn(),
  saveLeagueJoinRequest: jest.fn(),
}));

jest.mock('../../modules/games/games.repository', () => ({
  listLeagueGamesByLeagueId: jest.fn(),
}));

jest.mock('../../modules/auth/auth.repository', () => ({
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
}));

jest.mock('../../modules/feed/cloudinary.client', () => ({
  uploadImageBuffer: jest.fn(),
  destroyImage: jest.fn(),
  isCloudinaryConfigured: jest.fn(() => true),
}));

const {
  findLeagueById,
  listLeagueTeams,
  listLeaguePlayers,
} = require('../../modules/leagues/leagues.repository');
const {
  getLeagueRosterSnapshotForTeam,
  listTeamsForLeagueViewer,
} = require('../../modules/leagues/leagues.service');

function buildLeagueTeam(id, name) {
  return {
    _id: id,
    leagueId: 'league-1',
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    logo: null,
    colors: [],
    status: 'active',
    createdAt: new Date('2026-03-12T00:00:00.000Z'),
    updatedAt: new Date('2026-03-12T00:00:00.000Z'),
  };
}

describe('leagues service roster snapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('maps active league players into game roster snapshots', async () => {
    listLeaguePlayers.mockResolvedValue([
      {
        _id: 'player-1',
        displayName: 'Alex',
        jerseyNumber: 7,
        position: 'PG',
        claimedByUserId: 'user-2',
        isActive: true,
      },
      {
        _id: 'player-2',
        displayName: 'Blake',
        jerseyNumber: 8,
        position: 'SG',
        claimedByUserId: null,
        isActive: false,
      },
    ]);

    const snapshot = await getLeagueRosterSnapshotForTeam('team-1');

    expect(snapshot).toEqual([
      {
        leaguePlayerId: 'player-1',
        displayName: 'Alex',
        jerseyNumber: 7,
        position: 'PG',
        claimedByUserId: 'user-2',
        isClaimed: true,
        isActive: true,
      },
    ]);
  });

  test('includes roster counts in league team list rows', async () => {
    findLeagueById.mockResolvedValue({
      _id: 'league-1',
      ownerUserId: 'user-1',
    });
    listLeagueTeams.mockResolvedValue([
      buildLeagueTeam('team-1', 'Home Squad'),
      buildLeagueTeam('team-2', 'Away Squad'),
    ]);
    listLeaguePlayers.mockImplementation((leagueTeamId) =>
      Promise.resolve(
        leagueTeamId === 'team-1'
          ? [
              { _id: 'p1', isActive: true },
              { _id: 'p2', isActive: false },
            ]
          : [
              { _id: 'p3', isActive: true },
              { _id: 'p4', isActive: true },
              { _id: 'p5', isActive: true },
            ]
      )
    );

    const teams = await listTeamsForLeagueViewer('user-1', 'league-1');

    expect(teams).toEqual([
      expect.objectContaining({
        id: 'team-1',
        rosterCount: 2,
        activeRosterCount: 1,
      }),
      expect.objectContaining({
        id: 'team-2',
        rosterCount: 3,
        activeRosterCount: 3,
      }),
    ]);
  });
});
