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
  findLeagueStandings: jest.fn(),
  upsertLeagueStandings: jest.fn(),
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
  findLeagueStandings,
  upsertLeagueStandings,
} = require('../../modules/leagues/leagues.repository');
const { listLeagueGamesByLeagueId } = require('../../modules/games/games.repository');
const {
  getLeagueRosterSnapshotForTeam,
  listTeamsForLeagueViewer,
  getLeagueStandings,
  computeLeagueStandings,
  recomputeLeagueAggregates,
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

describe('league standings materialisation (OPT-010)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // One completed dual_team game: team-a (home) 20, team-b (away) 12.
  function seedTeamsAndGames() {
    listLeagueTeams.mockResolvedValue([
      buildLeagueTeam('team-a', 'Alpha'),
      buildLeagueTeam('team-b', 'Bravo'),
    ]);
    listLeagueGamesByLeagueId.mockResolvedValue([
      {
        _id: 'g1',
        status: 'completed',
        trackingMode: 'dual_team',
        homeLeagueTeamId: 'team-a',
        awayLeagueTeamId: 'team-b',
        finalScore: { home: 20, away: 12 },
        events: [],
      },
    ]);
  }

  test('getLeagueStandings returns materialised rows on a hit (no live compute)', async () => {
    const storedRows = [{ teamId: 'team-a', teamName: 'Alpha', wins: 1 }];
    findLeagueStandings.mockResolvedValue({ leagueId: 'league-1', rows: storedRows });

    const result = await getLeagueStandings('league-1');

    expect(result).toBe(storedRows);
    // Materialised hit must NOT touch the live-compute data sources.
    expect(listLeagueGamesByLeagueId).not.toHaveBeenCalled();
    expect(upsertLeagueStandings).not.toHaveBeenCalled();
  });

  test('getLeagueStandings computes + persists on a miss (self-backfill)', async () => {
    findLeagueStandings.mockResolvedValue(null);
    upsertLeagueStandings.mockResolvedValue({});
    seedTeamsAndGames();

    const result = await getLeagueStandings('league-1');

    // Backfilled and persisted.
    expect(upsertLeagueStandings).toHaveBeenCalledTimes(1);
    const [persistedLeagueId, persistedRows] = upsertLeagueStandings.mock.calls[0];
    expect(persistedLeagueId).toBe('league-1');
    expect(persistedRows).toBe(result);
    // Alpha won (top row).
    expect(result[0]).toMatchObject({
      teamId: 'team-a',
      wins: 1,
      pointsFor: 20,
      pointsAgainst: 12,
    });
    expect(result[1]).toMatchObject({ teamId: 'team-b', losses: 1, pointsFor: 12 });
  });

  test('materialised rows == live compute (parity)', async () => {
    seedTeamsAndGames();
    const live = await computeLeagueStandings('league-1');

    // recompute persists exactly what the live compute produced.
    upsertLeagueStandings.mockResolvedValue({});
    seedTeamsAndGames();
    const recomputed = await recomputeLeagueAggregates('league-1');

    expect(recomputed).toEqual(live);
    expect(upsertLeagueStandings).toHaveBeenCalledWith('league-1', recomputed);
  });

  test('pre-fetched teams/games bypass the materialised read', async () => {
    const teams = [buildLeagueTeam('team-a', 'Alpha'), buildLeagueTeam('team-b', 'Bravo')];
    const games = [
      {
        _id: 'g1',
        status: 'completed',
        trackingMode: 'dual_team',
        homeLeagueTeamId: 'team-a',
        awayLeagueTeamId: 'team-b',
        finalScore: { home: 8, away: 8 },
        events: [],
      },
    ];

    const result = await getLeagueStandings('league-1', { teams, games });

    // No materialised read, no persist — computed straight from in-hand data.
    expect(findLeagueStandings).not.toHaveBeenCalled();
    expect(upsertLeagueStandings).not.toHaveBeenCalled();
    // 8-8 tie: home wins per current tie rule.
    expect(result[0]).toMatchObject({ teamId: 'team-a', wins: 1 });
    expect(result[1]).toMatchObject({ teamId: 'team-b', losses: 1 });
  });
});
