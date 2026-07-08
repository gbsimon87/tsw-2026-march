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
  findLeagueTeamById: jest.fn(),
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
  listLeaguePlayerStats: jest.fn(),
  replaceLeaguePlayerStats: jest.fn(),
  findActiveLeagueManager: jest.fn(),
  listLeaguesByManager: jest.fn(() => Promise.resolve([])),
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
  findLeagueBySlug,
  listLeagueTeams,
  listLeaguePlayers,
  findLeagueStandings,
  upsertLeagueStandings,
  listLeaguePlayerStats,
  replaceLeaguePlayerStats,
  findActiveLeagueManager,
  listLeagueMembershipsForUser,
  listLeaguesByOwner,
  listLeaguesByIds,
  listLeaguesByManager,
  findLeagueTeamById,
  findLeaguePlayerById,
} = require('../../modules/leagues/leagues.repository');
const { listLeagueGamesByLeagueId } = require('../../modules/games/games.repository');
const { STAT_TYPES, TEAM_SIDES } = require('../../modules/shared/stats.constants');
const {
  getLeagueRosterSnapshotForTeam,
  listTeamsForLeagueViewer,
  getLeagueStandings,
  computeLeagueStandings,
  computeLeaguePlayerStats,
  deriveLeaguePlayerScores,
  getLeaguePlayerStats,
  getPublicLeagueLeaders,
  getPublicLeagueBySlug,
  recomputeLeagueAggregates,
  isLeaguePublic,
  getPublicLeagueTeamById,
  getPublicLeaguePlayerById,
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
    // OPT-024: league games can't end tied (finishGameForUser rejects it), but
    // this path computes straight from in-hand data, so a tied finalScore from
    // before the guard existed must be recorded honestly as a tie — not a
    // phantom home win.
    expect(result[0]).toMatchObject({ teamId: 'team-a', wins: 0, losses: 0, ties: 1 });
    expect(result[1]).toMatchObject({ teamId: 'team-b', wins: 0, losses: 0, ties: 1 });
  });
});

describe('league player stats materialisation (OPT-011)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // One completed dual_team game. Home roster: player-1 (2 made 3s + 1 made FT
  // = 7 pts, 1 game). Away roster: player-2 (1 made 2 = 2 pts, 1 game).
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
        trackedLeagueTeamId: 'team-a',
        homeRosterSnapshot: [{ _id: 'p1', leaguePlayerId: 'lp1', displayName: 'Alex' }],
        awayRosterSnapshot: [{ _id: 'p2', leaguePlayerId: 'lp2', displayName: 'Sam' }],
        events: [
          { teamSide: TEAM_SIDES.HOME, playerId: 'p1', statType: STAT_TYPES.FG3_MADE },
          { teamSide: TEAM_SIDES.HOME, playerId: 'p1', statType: STAT_TYPES.FG3_MADE },
          { teamSide: TEAM_SIDES.HOME, playerId: 'p1', statType: STAT_TYPES.FT_MADE },
          { teamSide: TEAM_SIDES.AWAY, playerId: 'p2', statType: STAT_TYPES.FG2_MADE },
        ],
      },
    ]);
  }

  test('computeLeaguePlayerStats accumulates raw per-player totals across teams', async () => {
    seedTeamsAndGames();

    const rows = await computeLeaguePlayerStats('league-1');

    expect(rows).toHaveLength(2);
    const alex = rows.find((r) => r.leaguePlayerId === 'lp1');
    const sam = rows.find((r) => r.leaguePlayerId === 'lp2');
    expect(alex).toMatchObject({
      leagueTeamId: 'team-a',
      gamesCount: 1,
      fg3m: 2,
      fg3a: 2,
      ftm: 1,
      fta: 1,
      points: 7,
    });
    expect(sam).toMatchObject({
      leagueTeamId: 'team-b',
      gamesCount: 1,
      fg2m: 1,
      fg2a: 1,
      points: 2,
    });
  });

  test('deriveLeaguePlayerScores computes ppg/fantasy/DPOY from raw totals', () => {
    const row = {
      gamesCount: 2,
      points: 20,
      reb: 10,
      ast: 4,
      stl: 2,
      blk: 1,
      tov: 3,
      fg2m: 4,
      fg2a: 8,
      fg3m: 2,
      fg3a: 4,
    };

    const scores = deriveLeaguePlayerScores(row);

    expect(scores.ppg).toBe(10);
    expect(scores.rpg).toBe(5);
    expect(scores.apg).toBe(2);
    expect(scores.fgMade).toBe(6);
    expect(scores.fgAttempted).toBe(12);
    expect(scores.fgPercentage).toBe(0.5);
    // fantasy = ppg*1 + rpg*1.2 + apg*1.5 + spg*2 + bpg*2 + topg*-1
    expect(scores.fantasyScore).toBeCloseTo(10 + 5 * 1.2 + 2 * 1.5 + 1 * 2 + 0.5 * 2 - 1.5);
  });

  test('getLeaguePlayerStats returns materialised rows on a hit (no live compute)', async () => {
    const storedRows = [{ leaguePlayerId: 'lp1', gamesCount: 3 }];
    listLeaguePlayerStats.mockResolvedValue(storedRows);

    const result = await getLeaguePlayerStats('league-1');

    expect(result).toBe(storedRows);
    expect(listLeagueGamesByLeagueId).not.toHaveBeenCalled();
    expect(replaceLeaguePlayerStats).not.toHaveBeenCalled();
  });

  test('getLeaguePlayerStats computes + persists on a miss (self-backfill)', async () => {
    listLeaguePlayerStats.mockResolvedValue([]);
    replaceLeaguePlayerStats.mockResolvedValue([]);
    seedTeamsAndGames();

    const result = await getLeaguePlayerStats('league-1');

    expect(replaceLeaguePlayerStats).toHaveBeenCalledWith('league-1', result);
    expect(result).toHaveLength(2);
  });

  test('recomputeLeagueAggregates persists both standings and player stats from one fetch', async () => {
    seedTeamsAndGames();
    upsertLeagueStandings.mockResolvedValue({});
    replaceLeaguePlayerStats.mockResolvedValue([]);

    await recomputeLeagueAggregates('league-1');

    // Teams/games fetched once (not once per aggregate).
    expect(listLeagueTeams).toHaveBeenCalledTimes(1);
    expect(listLeagueGamesByLeagueId).toHaveBeenCalledTimes(1);
    expect(upsertLeagueStandings).toHaveBeenCalledTimes(1);
    expect(replaceLeaguePlayerStats).toHaveBeenCalledTimes(1);
    const [, persistedPlayerRows] = replaceLeaguePlayerStats.mock.calls[0];
    expect(persistedPlayerRows).toHaveLength(2);
  });

  test('a recompute triggered mid-flight re-runs once afterwards (dirty flag)', async () => {
    upsertLeagueStandings.mockResolvedValue({});
    replaceLeaguePlayerStats.mockResolvedValue([]);
    listLeagueGamesByLeagueId.mockResolvedValue([]);

    // Block the FIRST pass on its teams fetch so a second trigger can land
    // mid-flight; subsequent fetches resolve immediately.
    const teams = [buildLeagueTeam('team-a', 'Alpha')];
    let releaseFirst;
    listLeagueTeams
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve(teams);
          })
      )
      .mockResolvedValue(teams);

    const first = recomputeLeagueAggregates('league-1');
    // Second trigger while the first is still reading — must not be dropped.
    const second = recomputeLeagueAggregates('league-1');
    releaseFirst();
    await Promise.all([first, second]);
    // Let the dirty re-run (scheduled in the finally block) complete.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    // One persist from the first pass + one from the dirty re-run.
    expect(upsertLeagueStandings).toHaveBeenCalledTimes(2);
    expect(replaceLeaguePlayerStats).toHaveBeenCalledTimes(2);
  });

  test('leaders resolve team/player identity from materialised rows with ObjectId ids (regression)', async () => {
    // Materialised rows come back from .lean() with ObjectId (non-string) ids.
    // Simulate that shape: objects whose only string form is via toString().
    const objectId = (value) => ({ toString: () => value });

    findLeagueBySlug.mockResolvedValue({
      _id: 'league-1',
      slug: 'test-league',
      isPublic: true,
      status: 'active',
    });
    listLeagueTeams.mockResolvedValue([buildLeagueTeam('team-a', 'Alpha')]);
    listLeaguePlayers.mockResolvedValue([
      {
        _id: 'p-current',
        leaguePlayerId: 'lp1',
        displayName: 'Alex Current',
        jerseyNumber: 9,
        position: 'PG',
        claimedByUserId: null,
        isActive: true,
      },
    ]);
    listLeaguePlayerStats.mockResolvedValue([
      {
        leagueTeamId: objectId('team-a'),
        leaguePlayerId: objectId('lp1'),
        displayName: 'Alex Stored',
        gamesCount: 1,
        points: 10,
        reb: 2,
        ast: 1,
        stl: 0,
        blk: 0,
        tov: 0,
        foul: 0,
        ftm: 0,
        fta: 0,
        fg2m: 5,
        fg2a: 6,
        fg3m: 0,
        fg3a: 0,
        oreb: 1,
        dreb: 1,
      },
    ]);

    const { leaders } = await getPublicLeagueLeaders('test-league', 5);

    expect(leaders).toHaveLength(1);
    // Before the 2026-07-06 fix these were all null on the materialised path
    // because Map lookups keyed by strings were fed ObjectIds.
    expect(leaders[0]).toMatchObject({
      leaguePlayerId: 'lp1',
      displayName: 'Alex Current',
      jerseyNumber: 9,
      position: 'PG',
      teamName: 'Alpha',
      teamSlug: 'alpha',
    });
  });
});

describe('private league visibility on public-slug routes (OPT-024)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function seedPrivateLeague(overrides = {}) {
    findLeagueBySlug.mockResolvedValue({
      _id: 'league-1',
      slug: 'secret-league',
      ownerUserId: 'owner-1',
      isPublic: false,
      status: 'active',
      ...overrides,
    });
    listLeagueTeams.mockResolvedValue([]);
    listLeagueGamesByLeagueId.mockResolvedValue([]);
    findLeagueStandings.mockResolvedValue({ leagueId: 'league-1', rows: [] });
    upsertLeagueStandings.mockResolvedValue({});
    listLeaguePlayerStats.mockResolvedValue([]);
    replaceLeaguePlayerStats.mockResolvedValue({});
    findActiveLeagueManager.mockResolvedValue(null);
    listLeagueMembershipsForUser.mockResolvedValue([]);
  }

  test('anonymous visitor gets 404, not a hint the league exists', async () => {
    seedPrivateLeague();

    await expect(getPublicLeagueBySlug('secret-league', null)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('a signed-in stranger (no membership) also gets 404', async () => {
    seedPrivateLeague();

    await expect(getPublicLeagueBySlug('secret-league', 'stranger-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('the league owner can view their own private league via the public slug route', async () => {
    seedPrivateLeague();

    const league = await getPublicLeagueBySlug('secret-league', 'owner-1');
    expect(league.slug).toBe('secret-league');
  });

  test('an active league manager can view a private league via the public slug route', async () => {
    seedPrivateLeague();
    findActiveLeagueManager.mockResolvedValue({ leagueId: 'league-1', userId: 'manager-1' });

    const league = await getPublicLeagueBySlug('secret-league', 'manager-1');
    expect(league.slug).toBe('secret-league');
  });

  test('a rostered player (leagueTeamMember) can view a private league via the public slug route', async () => {
    seedPrivateLeague();
    listLeagueMembershipsForUser.mockResolvedValue([
      { leagueId: 'league-1', leagueTeamId: 'team-a', role: 'player', status: 'active' },
    ]);

    const league = await getPublicLeagueBySlug('secret-league', 'player-1');
    expect(league.slug).toBe('secret-league');
  });

  test('public leagues are unaffected — anonymous visitors can still view them', async () => {
    seedPrivateLeague({ isPublic: true });

    const league = await getPublicLeagueBySlug('secret-league', null);
    expect(league.slug).toBe('secret-league');
  });
});

describe('TSW-005 — league feed-sharing support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listLeaguesByOwner.mockResolvedValue([]);
    listLeaguesByIds.mockResolvedValue([]);
    listLeaguesByManager.mockResolvedValue([]);
    listLeagueMembershipsForUser.mockResolvedValue([]);
  });

  test('isLeaguePublic is true for a public, active league', async () => {
    findLeagueById.mockResolvedValue({ _id: 'league-1', isPublic: true, status: 'active' });

    await expect(isLeaguePublic('league-1')).resolves.toBe(true);
  });

  test('isLeaguePublic is false for a private league', async () => {
    findLeagueById.mockResolvedValue({ _id: 'league-1', isPublic: false, status: 'active' });

    await expect(isLeaguePublic('league-1')).resolves.toBe(false);
  });

  test('isLeaguePublic is false for an archived league even if isPublic is true', async () => {
    findLeagueById.mockResolvedValue({ _id: 'league-1', isPublic: true, status: 'archived' });

    await expect(isLeaguePublic('league-1')).resolves.toBe(false);
  });

  test('isLeaguePublic is false when the league does not exist', async () => {
    findLeagueById.mockResolvedValue(null);

    await expect(isLeaguePublic('missing-league')).resolves.toBe(false);
  });

  test("getPublicLeagueTeamById aggregates only the team's own events across its completed games", async () => {
    findLeagueTeamById.mockResolvedValue(buildLeagueTeam('team-a', 'Alpha'));
    listLeagueGamesByLeagueId.mockResolvedValue([
      {
        _id: 'g1',
        status: 'completed',
        trackingMode: 'dual_team',
        homeLeagueTeamId: 'team-a',
        awayLeagueTeamId: 'team-b',
        homeRosterSnapshot: [{ _id: 'p1', leaguePlayerId: 'lp1', displayName: 'Alex' }],
        awayRosterSnapshot: [{ _id: 'p2', leaguePlayerId: 'lp2', displayName: 'Sam' }],
        events: [
          { teamSide: TEAM_SIDES.HOME, playerId: 'p1', statType: STAT_TYPES.FG3_MADE },
          { teamSide: TEAM_SIDES.AWAY, playerId: 'p2', statType: STAT_TYPES.FG2_MADE },
        ],
      },
    ]);

    const result = await getPublicLeagueTeamById('team-a');

    expect(result.team.name).toBe('Alpha');
    expect(result.summary.gamesCount).toBe(1);
    // Only team-a's (home) events should count — the away team's FG2_MADE
    // must not leak into team-a's aggregate.
    expect(result.summary.points).toBe(3);
  });

  test('getPublicLeaguePlayerById returns a card-sized summary for a league player', async () => {
    findLeaguePlayerById.mockResolvedValue({
      _id: 'lp1',
      leagueTeamId: 'team-a',
      displayName: 'Alex',
      jerseyNumber: 7,
      position: 'PG',
      isActive: true,
      claimedByUserId: null,
    });
    findLeagueTeamById.mockResolvedValue(buildLeagueTeam('team-a', 'Alpha'));
    listLeagueTeams.mockResolvedValue([buildLeagueTeam('team-a', 'Alpha')]);
    listLeagueGamesByLeagueId.mockResolvedValue([
      {
        _id: 'g1',
        status: 'completed',
        trackingMode: 'dual_team',
        homeLeagueTeamId: 'team-a',
        awayLeagueTeamId: 'team-b',
        homeRosterSnapshot: [{ _id: 'p1', leaguePlayerId: 'lp1', displayName: 'Alex' }],
        awayRosterSnapshot: [],
        events: [{ teamSide: TEAM_SIDES.HOME, playerId: 'p1', statType: STAT_TYPES.FG3_MADE }],
      },
    ]);

    const result = await getPublicLeaguePlayerById('lp1');

    expect(result.player.displayName).toBe('Alex');
    expect(result.team.name).toBe('Alpha');
    expect(result.summary.gamesCount).toBe(1);
    expect(result.summary.pointsPerGame).toBe(3);
  });
});
