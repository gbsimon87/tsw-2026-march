const LEAGUE_ID = '507f1f77bcf86cd799439011';
const SEASON_ID = '507f1f77bcf86cd799439021';
const TEAM_ID = '507f1f77bcf86cd799439031';
const OTHER_TEAM_ID = '507f1f77bcf86cd799439032';
const OWNER_ID = '507f1f77bcf86cd799439041';
const STRANGER_ID = '507f1f77bcf86cd799439042';
const MANAGER_ID = '507f1f77bcf86cd799439043';

jest.mock('../../modules/leagues/leagues.repository', () => {
  const actual = jest.requireActual('../../modules/leagues/leagues.repository');
  return {
    ...actual,
    findLeagueById: jest.fn(),
    findActiveLeagueManager: jest.fn(),
    findActiveLeagueTeamMember: jest.fn(),
    listLeagueTeams: jest.fn(),
    listLeaguePlayers: jest.fn(),
    listLeaguePlayerStats: jest.fn(),
  };
});

jest.mock('../../modules/leagues/seasons.repository', () => {
  const actual = jest.requireActual('../../modules/leagues/seasons.repository');
  return { ...actual, findSeasonById: jest.fn() };
});

jest.mock('../../modules/games/games.repository', () => ({
  listLeagueGamesForCompleteness: jest.fn(),
}));

jest.mock('../../modules/leagues/dataCompleteness.repository', () => ({
  listDismissals: jest.fn(),
  upsertDismissal: jest.fn(),
  deleteDismissal: jest.fn(),
}));

const leaguesRepository = require('../../modules/leagues/leagues.repository');
const seasonsRepository = require('../../modules/leagues/seasons.repository');
const gamesRepository = require('../../modules/games/games.repository');
const dismissalRepository = require('../../modules/leagues/dataCompleteness.repository');
const service = require('../../modules/leagues/dataCompleteness.service');

function activeRoster(teamId, count) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `5000000000000000000000${teamId.slice(-2)}${i}`,
    leagueTeamId: teamId,
    displayName: `Player ${i}`,
    jerseyNumber: i + 1,
    isActive: true,
    claimedByUserId: OWNER_ID,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();

  leaguesRepository.findLeagueById.mockResolvedValue({
    _id: LEAGUE_ID,
    ownerUserId: OWNER_ID,
    status: 'active',
    currentSeasonId: SEASON_ID,
  });
  seasonsRepository.findSeasonById.mockResolvedValue({
    _id: SEASON_ID,
    name: 'Spring 2026',
    status: 'active',
  });
  leaguesRepository.listLeagueTeams.mockResolvedValue([
    { _id: TEAM_ID, name: 'Ballers', logo: { url: 'x' } },
  ]);
  leaguesRepository.listLeaguePlayers.mockImplementation((teamId) =>
    Promise.resolve(String(teamId) === TEAM_ID ? activeRoster(TEAM_ID, 5) : [])
  );
  leaguesRepository.listLeaguePlayerStats.mockResolvedValue([]);
  gamesRepository.listLeagueGamesForCompleteness.mockResolvedValue([]);
  dismissalRepository.listDismissals.mockResolvedValue([]);
});

describe('getDataCompletenessForUser', () => {
  it('rejects a user who is neither owner, league manager, nor team manager', async () => {
    leaguesRepository.findActiveLeagueManager.mockResolvedValue(null);
    leaguesRepository.findActiveLeagueTeamMember.mockResolvedValue(null);

    await expect(service.getDataCompletenessForUser(STRANGER_ID, LEAGUE_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('returns an empty report when the league has no active season', async () => {
    leaguesRepository.findLeagueById.mockResolvedValue({
      _id: LEAGUE_ID,
      ownerUserId: OWNER_ID,
      status: 'active',
      currentSeasonId: null,
    });

    const report = await service.getDataCompletenessForUser(OWNER_ID, LEAGUE_ID);

    expect(report.seasonId).toBeNull();
    expect(report.categories).toEqual([]);
    expect(report.counts).toEqual({ high: 0, medium: 0, low: 0, dismissed: 0 });
  });

  it('marks dismissed issues rather than hiding them', async () => {
    leaguesRepository.listLeagueTeams.mockResolvedValue([
      { _id: TEAM_ID, name: 'Ballers', logo: null },
    ]);
    dismissalRepository.listDismissals.mockResolvedValue([{ issueKey: `no_logo:${TEAM_ID}` }]);

    const report = await service.getDataCompletenessForUser(OWNER_ID, LEAGUE_ID);
    const logoCategory = report.categories.find((c) => c.key === 'no_logo');

    expect(logoCategory.items[0].dismissed).toBe(true);
    expect(report.counts.dismissed).toBe(1);
    expect(report.counts.low).toBe(0);
  });

  it('limits a team manager to their own team roster issues', async () => {
    leaguesRepository.findActiveLeagueManager.mockResolvedValue(null);
    leaguesRepository.findActiveLeagueTeamMember.mockImplementation((teamId) =>
      String(teamId) === TEAM_ID ? { role: 'manager' } : null
    );
    leaguesRepository.listLeagueTeams.mockResolvedValue([
      { _id: TEAM_ID, name: 'Ballers', logo: null },
      { _id: OTHER_TEAM_ID, name: 'Hoops', logo: null },
    ]);
    leaguesRepository.listLeaguePlayers.mockResolvedValue([]);

    const report = await service.getDataCompletenessForUser(MANAGER_ID, LEAGUE_ID);
    const teamIds = report.categories
      .flatMap((c) => c.items)
      .map((i) => i.leagueTeamId)
      .filter(Boolean);

    expect(teamIds.every((id) => id === TEAM_ID)).toBe(true);
    expect(teamIds).not.toContain(OTHER_TEAM_ID);
  });

  it('includes the season name so the panel can say which season it audited', async () => {
    const report = await service.getDataCompletenessForUser(OWNER_ID, LEAGUE_ID);
    expect(report.seasonName).toBe('Spring 2026');
  });
});

describe('dismissIssueForUser', () => {
  it('rejects a team manager — dismissal is a league-wide judgement', async () => {
    leaguesRepository.findActiveLeagueManager.mockResolvedValue(null);
    leaguesRepository.findActiveLeagueTeamMember.mockResolvedValue({ role: 'manager' });

    await expect(
      service.dismissIssueForUser(MANAGER_ID, LEAGUE_ID, { issueKey: 'no_logo:1', note: null })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('stores a dismissal scoped to the current season', async () => {
    dismissalRepository.upsertDismissal.mockResolvedValue({});

    await service.dismissIssueForUser(OWNER_ID, LEAGUE_ID, {
      issueKey: `no_logo:${TEAM_ID}`,
      note: null,
    });

    expect(dismissalRepository.upsertDismissal).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: SEASON_ID, issueKey: `no_logo:${TEAM_ID}` })
    );
  });

  it('refuses to dismiss when there is no active season', async () => {
    leaguesRepository.findLeagueById.mockResolvedValue({
      _id: LEAGUE_ID,
      ownerUserId: OWNER_ID,
      status: 'active',
      currentSeasonId: null,
    });

    await expect(
      service.dismissIssueForUser(OWNER_ID, LEAGUE_ID, { issueKey: 'no_logo:1', note: null })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('restoreIssueForUser', () => {
  it('removes the dismissal', async () => {
    dismissalRepository.deleteDismissal.mockResolvedValue(1);

    const result = await service.restoreIssueForUser(OWNER_ID, LEAGUE_ID, `no_logo:${TEAM_ID}`);

    expect(result).toEqual({ issueKey: `no_logo:${TEAM_ID}`, dismissed: false });
  });
});
