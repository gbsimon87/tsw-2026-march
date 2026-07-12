jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeagueById: jest.fn(),
  findLeagueByIdAndOwner: jest.fn(),
  saveLeague: jest.fn(),
  listLeagueTeams: jest.fn(),
  findActiveLeagueManager: jest.fn(),
  listLeagueMembershipsForUser: jest.fn(),
  findLeagueStandings: jest.fn(),
  upsertLeagueStandings: jest.fn(),
  listLeaguePlayerStats: jest.fn(),
  replaceLeaguePlayerStats: jest.fn(),
}));

jest.mock('../../modules/leagues/seasons.repository', () => ({
  createSeason: jest.fn(),
  findSeasonById: jest.fn(),
  findSeasonByIdAndLeague: jest.fn(),
  listSeasonsByLeague: jest.fn(),
  saveSeason: jest.fn(),
}));

jest.mock('../../modules/games/games.repository', () => ({
  listLeagueGamesByLeagueId: jest.fn(),
}));

jest.mock('../../modules/billing/billing.service', () => ({
  getLeagueEntitlements: jest.fn(),
}));

const {
  findLeagueById,
  findLeagueByIdAndOwner,
  saveLeague,
  listLeagueTeams,
  findActiveLeagueManager,
  listLeagueMembershipsForUser,
  upsertLeagueStandings,
  replaceLeaguePlayerStats,
} = require('../../modules/leagues/leagues.repository');
const {
  createSeason,
  findSeasonById,
  findSeasonByIdAndLeague,
  saveSeason,
} = require('../../modules/leagues/seasons.repository');
const { listLeagueGamesByLeagueId } = require('../../modules/games/games.repository');
const { getLeagueEntitlements } = require('../../modules/billing/billing.service');
const {
  createSeasonForLeague,
  completeSeasonForUser,
  listSeasonsForLeague,
  ensureSeasonEditable,
} = require('../../modules/leagues/leagues.service');

function buildLeague(overrides = {}) {
  return {
    _id: 'league-1',
    ownerUserId: 'owner-1',
    currentSeasonId: null,
    plan: 'league',
    subscriptionStatus: 'active',
    ...overrides,
  };
}

describe('createSeasonForLeague', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listLeagueTeams.mockResolvedValue([]);
    listLeagueGamesByLeagueId.mockResolvedValue([]);
    upsertLeagueStandings.mockResolvedValue({});
    replaceLeaguePlayerStats.mockResolvedValue([]);
  });

  test('non-owner is rejected with 404 (assertLeagueOwner mirrors owner-only convention)', async () => {
    findLeagueByIdAndOwner.mockResolvedValue(null);

    await expect(
      createSeasonForLeague('stranger-1', 'league-1', { label: 'Spring 2026' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(createSeason).not.toHaveBeenCalled();
  });

  test('throws 402 when the league does not have an active League Pro subscription', async () => {
    findLeagueByIdAndOwner.mockResolvedValue(
      buildLeague({ plan: 'free', subscriptionStatus: 'inactive' })
    );
    getLeagueEntitlements.mockReturnValue({ canManageLeague: false });

    await expect(
      createSeasonForLeague('owner-1', 'league-1', { label: 'Spring 2026' })
    ).rejects.toMatchObject({ statusCode: 402 });

    expect(createSeason).not.toHaveBeenCalled();
  });

  test('throws 400 when a season is already active for the league', async () => {
    const league = buildLeague({ currentSeasonId: 'season-old' });
    findLeagueByIdAndOwner.mockResolvedValue(league);
    getLeagueEntitlements.mockReturnValue({ canManageLeague: true });
    findSeasonById.mockResolvedValue({ _id: 'season-old', status: 'active' });

    await expect(
      createSeasonForLeague('owner-1', 'league-1', { label: 'Spring 2026' })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(createSeason).not.toHaveBeenCalled();
    expect(saveLeague).not.toHaveBeenCalled();
  });

  test('allows creating a new season when the prior current season is already completed', async () => {
    const league = buildLeague({ currentSeasonId: 'season-old' });
    findLeagueByIdAndOwner.mockResolvedValue(league);
    getLeagueEntitlements.mockReturnValue({ canManageLeague: true });
    findSeasonById.mockResolvedValue({ _id: 'season-old', status: 'completed' });
    createSeason.mockResolvedValue({
      _id: 'season-new',
      leagueId: 'league-1',
      label: 'Fall 2026',
      status: 'active',
      startedAt: new Date('2026-07-10T00:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    });
    saveLeague.mockResolvedValue(league);

    const result = await createSeasonForLeague('owner-1', 'league-1', { label: 'Fall 2026' });

    expect(result).toMatchObject({ id: 'season-new', label: 'Fall 2026', status: 'active' });
    expect(league.currentSeasonId).toBe('season-new');
    expect(saveLeague).toHaveBeenCalledWith(league);
  });

  test('success path creates the season, sets currentSeasonId, saves the league, and does no roster-cloning writes', async () => {
    const league = buildLeague();
    findLeagueByIdAndOwner.mockResolvedValue(league);
    getLeagueEntitlements.mockReturnValue({ canManageLeague: true });
    createSeason.mockResolvedValue({
      _id: 'season-1',
      leagueId: 'league-1',
      label: 'Spring 2026',
      status: 'active',
      startedAt: new Date('2026-07-10T00:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    });
    saveLeague.mockResolvedValue(league);

    const result = await createSeasonForLeague('owner-1', 'league-1', { label: 'Spring 2026' });

    expect(createSeason).toHaveBeenCalledWith({
      leagueId: 'league-1',
      label: 'Spring 2026',
      status: 'active',
      createdByUserId: 'owner-1',
    });
    expect(league.currentSeasonId).toBe('season-1');
    expect(saveLeague).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      id: 'season-1',
      leagueId: 'league-1',
      label: 'Spring 2026',
      status: 'active',
    });

    // Rosters carry over automatically — no LeagueTeam/LeaguePlayer/
    // LeagueTeamMember/LeagueManager repo writes should happen here.
    expect(listLeagueTeams).not.toHaveBeenCalled();
  });
});

describe('completeSeasonForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listLeagueTeams.mockResolvedValue([]);
    listLeagueGamesByLeagueId.mockResolvedValue([]);
    upsertLeagueStandings.mockResolvedValue({});
    replaceLeaguePlayerStats.mockResolvedValue([]);
  });

  test('non-owner is rejected with 404', async () => {
    findLeagueByIdAndOwner.mockResolvedValue(null);

    await expect(completeSeasonForUser('stranger-1', 'league-1', 'season-1')).rejects.toMatchObject(
      { statusCode: 404 }
    );

    expect(saveSeason).not.toHaveBeenCalled();
  });

  test('404 when the season does not belong to that league', async () => {
    findLeagueByIdAndOwner.mockResolvedValue(buildLeague());
    findSeasonByIdAndLeague.mockResolvedValue(null);

    await expect(
      completeSeasonForUser('owner-1', 'league-1', 'season-missing')
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(saveSeason).not.toHaveBeenCalled();
  });

  test('400 when the season is already completed', async () => {
    findLeagueByIdAndOwner.mockResolvedValue(buildLeague());
    findSeasonByIdAndLeague.mockResolvedValue({
      _id: 'season-1',
      leagueId: 'league-1',
      status: 'completed',
    });

    await expect(completeSeasonForUser('owner-1', 'league-1', 'season-1')).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(saveSeason).not.toHaveBeenCalled();
  });

  test('success path sets status/completedAt, saves, and freezes aggregates via recomputeLeagueAggregates', async () => {
    findLeagueByIdAndOwner.mockResolvedValue(buildLeague());
    const season = {
      _id: 'season-1',
      leagueId: 'league-1',
      label: 'Spring 2026',
      status: 'active',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    findSeasonByIdAndLeague.mockResolvedValue(season);
    saveSeason.mockImplementation((s) => Promise.resolve(s));

    const result = await completeSeasonForUser('owner-1', 'league-1', 'season-1');

    expect(season.status).toBe('completed');
    expect(season.completedAt).toBeInstanceOf(Date);
    expect(saveSeason).toHaveBeenCalledWith(season);
    // recomputeLeagueAggregates freezes standings/player stats for the season.
    expect(listLeagueTeams).toHaveBeenCalledWith('league-1');
    expect(listLeagueGamesByLeagueId).toHaveBeenCalledWith('league-1', 'season-1');
    expect(upsertLeagueStandings).toHaveBeenCalledWith('league-1', 'season-1', expect.any(Array));
    expect(replaceLeaguePlayerStats).toHaveBeenCalledWith(
      'league-1',
      'season-1',
      expect.any(Array)
    );
    expect(result).toMatchObject({ id: 'season-1', status: 'completed' });
  });
});

describe('listSeasonsForLeague', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('the league owner can list seasons', async () => {
    findLeagueById.mockResolvedValue(buildLeague());
    const { listSeasonsByLeague } = require('../../modules/leagues/seasons.repository');
    listSeasonsByLeague.mockResolvedValue([
      { _id: 's1', leagueId: 'league-1', label: 'Spring 2026', status: 'active' },
    ]);

    const seasons = await listSeasonsForLeague('owner-1', 'league-1');

    expect(seasons).toEqual([
      expect.objectContaining({ id: 's1', label: 'Spring 2026', status: 'active' }),
    ]);
  });

  test('an active league manager can list seasons', async () => {
    findLeagueById.mockResolvedValue(buildLeague({ ownerUserId: 'someone-else' }));
    findActiveLeagueManager.mockResolvedValue({ leagueId: 'league-1', userId: 'manager-1' });
    const { listSeasonsByLeague } = require('../../modules/leagues/seasons.repository');
    listSeasonsByLeague.mockResolvedValue([]);

    await expect(listSeasonsForLeague('manager-1', 'league-1')).resolves.toEqual([]);
  });

  test('a rostered team member (team_manager/helper/player) can list seasons', async () => {
    findLeagueById.mockResolvedValue(buildLeague({ ownerUserId: 'someone-else' }));
    findActiveLeagueManager.mockResolvedValue(null);
    listLeagueMembershipsForUser.mockResolvedValue([
      { leagueId: 'league-1', leagueTeamId: 'team-a', role: 'player', status: 'active' },
    ]);
    const { listSeasonsByLeague } = require('../../modules/leagues/seasons.repository');
    listSeasonsByLeague.mockResolvedValue([]);

    await expect(listSeasonsForLeague('player-1', 'league-1')).resolves.toEqual([]);
  });

  test('a non-participant is rejected with 403', async () => {
    findLeagueById.mockResolvedValue(buildLeague({ ownerUserId: 'someone-else' }));
    findActiveLeagueManager.mockResolvedValue(null);
    listLeagueMembershipsForUser.mockResolvedValue([]);

    await expect(listSeasonsForLeague('stranger-1', 'league-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('ensureSeasonEditable', () => {
  test('throws 400 for a null season', () => {
    expect(() => ensureSeasonEditable(null)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test('throws 400 for a completed season', () => {
    expect(() => ensureSeasonEditable({ status: 'completed' })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  test('passes silently for an active season', () => {
    expect(() => ensureSeasonEditable({ status: 'active' })).not.toThrow();
  });
});
