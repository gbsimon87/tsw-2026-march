const mongoose = require('mongoose');

const LEAGUE_ID = '507f1f77bcf86cd799439011';
const SEASON_ID = '507f1f77bcf86cd799439021';
const HOME_ID = '507f1f77bcf86cd799439031';
const AWAY_ID = '507f1f77bcf86cd799439032';
const OWNER_ID = '507f1f77bcf86cd799439041';
const STRANGER_TEAM_ID = '507f1f77bcf86cd799439099';

jest.mock('../../modules/games/games.repository', () => ({
  listLeagueGamesByLeagueId: jest.fn(),
  insertManyGames: jest.fn(),
  deleteReplaceableLeagueGames: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => {
  const actual = jest.requireActual('../../modules/leagues/leagues.repository');
  return {
    ...actual,
    findLeagueById: jest.fn(),
    findActiveLeagueManager: jest.fn(),
    listLeagueTeams: jest.fn(),
  };
});

jest.mock('../../modules/leagues/seasons.repository', () => {
  const actual = jest.requireActual('../../modules/leagues/seasons.repository');
  return { ...actual, findSeasonById: jest.fn() };
});

const gamesRepository = require('../../modules/games/games.repository');
const leaguesRepository = require('../../modules/leagues/leagues.repository');
const seasonsRepository = require('../../modules/leagues/seasons.repository');
const service = require('../../modules/leagues/leagues.service');

function payload(overrides = {}) {
  return {
    replaceExisting: false,
    games: [
      {
        homeLeagueTeamId: HOME_ID,
        awayLeagueTeamId: AWAY_ID,
        scheduledAt: '2026-09-05T10:00:00.000Z',
        venue: '  Court 1  ',
      },
    ],
    ...overrides,
  };
}

describe('bulkCreateLeagueGamesForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    leaguesRepository.findLeagueById.mockResolvedValue({
      _id: LEAGUE_ID,
      ownerUserId: OWNER_ID,
      status: 'active',
      currentSeasonId: SEASON_ID,
    });
    seasonsRepository.findSeasonById.mockResolvedValue({ _id: SEASON_ID, status: 'active' });
    leaguesRepository.listLeagueTeams.mockResolvedValue([
      { _id: HOME_ID, name: 'Hawks' },
      { _id: AWAY_ID, name: 'Bisons' },
    ]);
    gamesRepository.deleteReplaceableLeagueGames.mockResolvedValue(3);
    gamesRepository.insertManyGames.mockImplementation(async (docs) =>
      docs.map((doc, index) => ({ ...doc, _id: `game-${index}` }))
    );
  });

  it('creates games as scheduled fixtures with a trimmed venue', async () => {
    const result = await service.bulkCreateLeagueGamesForUser(OWNER_ID, LEAGUE_ID, payload());

    expect(result.created).toBe(1);

    const [docs] = gamesRepository.insertManyGames.mock.calls[0];
    expect(docs[0]).toMatchObject({
      ownerUserId: OWNER_ID,
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: LEAGUE_ID,
      seasonId: SEASON_ID,
      homeLeagueTeamId: HOME_ID,
      awayLeagueTeamId: AWAY_ID,
      trackedLeagueTeamId: HOME_ID,
      status: 'scheduled',
      venue: 'Court 1',
    });
    expect(docs[0].title).toBe('Bisons at Hawks');
    expect(docs[0].scheduledAt).toEqual(new Date('2026-09-05T10:00:00.000Z'));
  });

  it('omits an empty venue rather than storing a blank string', async () => {
    await service.bulkCreateLeagueGamesForUser(
      OWNER_ID,
      LEAGUE_ID,
      payload({
        games: [
          {
            homeLeagueTeamId: HOME_ID,
            awayLeagueTeamId: AWAY_ID,
            scheduledAt: '2026-09-05T10:00:00.000Z',
            venue: '   ',
          },
        ],
      })
    );

    const [docs] = gamesRepository.insertManyGames.mock.calls[0];
    expect(docs[0].venue).toBeUndefined();
  });

  it('does not delete anything when replaceExisting is false', async () => {
    const result = await service.bulkCreateLeagueGamesForUser(OWNER_ID, LEAGUE_ID, payload());

    expect(gamesRepository.deleteReplaceableLeagueGames).not.toHaveBeenCalled();
    expect(result.replaced).toBe(0);
  });

  it('replaces before inserting and reports the count when replaceExisting is true', async () => {
    const result = await service.bulkCreateLeagueGamesForUser(
      OWNER_ID,
      LEAGUE_ID,
      payload({ replaceExisting: true })
    );

    expect(gamesRepository.deleteReplaceableLeagueGames).toHaveBeenCalledWith(LEAGUE_ID, SEASON_ID);
    expect(result.replaced).toBe(3);

    const deleteOrder = gamesRepository.deleteReplaceableLeagueGames.mock.invocationCallOrder[0];
    const insertOrder = gamesRepository.insertManyGames.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(insertOrder);
  });

  it('rejects a team that belongs to another league, writing nothing', async () => {
    await expect(
      service.bulkCreateLeagueGamesForUser(
        OWNER_ID,
        LEAGUE_ID,
        payload({
          games: [
            {
              homeLeagueTeamId: HOME_ID,
              awayLeagueTeamId: STRANGER_TEAM_ID,
              scheduledAt: '2026-09-05T10:00:00.000Z',
            },
          ],
        })
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(gamesRepository.insertManyGames).not.toHaveBeenCalled();
    expect(gamesRepository.deleteReplaceableLeagueGames).not.toHaveBeenCalled();
  });

  it('validates every row before writing, even when a later row is bad', async () => {
    await expect(
      service.bulkCreateLeagueGamesForUser(
        OWNER_ID,
        LEAGUE_ID,
        payload({
          replaceExisting: true,
          games: [
            {
              homeLeagueTeamId: HOME_ID,
              awayLeagueTeamId: AWAY_ID,
              scheduledAt: '2026-09-05T10:00:00.000Z',
            },
            {
              homeLeagueTeamId: HOME_ID,
              awayLeagueTeamId: STRANGER_TEAM_ID,
              scheduledAt: '2026-09-12T10:00:00.000Z',
            },
          ],
        })
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    // The bad second row must abort the whole batch — nothing deleted, nothing written.
    expect(gamesRepository.deleteReplaceableLeagueGames).not.toHaveBeenCalled();
    expect(gamesRepository.insertManyGames).not.toHaveBeenCalled();
  });

  it('rejects when the league has no active season', async () => {
    leaguesRepository.findLeagueById.mockResolvedValue({
      _id: LEAGUE_ID,
      ownerUserId: OWNER_ID,
      status: 'active',
      currentSeasonId: null,
    });

    await expect(
      service.bulkCreateLeagueGamesForUser(OWNER_ID, LEAGUE_ID, payload())
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(gamesRepository.insertManyGames).not.toHaveBeenCalled();
  });

  it('rejects when the active season is already completed', async () => {
    seasonsRepository.findSeasonById.mockResolvedValue({ _id: SEASON_ID, status: 'completed' });

    await expect(
      service.bulkCreateLeagueGamesForUser(OWNER_ID, LEAGUE_ID, payload())
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(gamesRepository.insertManyGames).not.toHaveBeenCalled();
  });

  it('rejects a user who neither owns nor manages the league', async () => {
    leaguesRepository.findActiveLeagueManager.mockResolvedValue(null);
    const strangerId = new mongoose.Types.ObjectId().toString();

    await expect(
      service.bulkCreateLeagueGamesForUser(strangerId, LEAGUE_ID, payload())
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(gamesRepository.insertManyGames).not.toHaveBeenCalled();
  });

  it('allows an active league manager who is not the owner', async () => {
    leaguesRepository.findActiveLeagueManager.mockResolvedValue({ _id: 'mgr-1' });
    const managerId = new mongoose.Types.ObjectId().toString();

    const result = await service.bulkCreateLeagueGamesForUser(managerId, LEAGUE_ID, payload());

    expect(result.created).toBe(1);
  });

  it('rejects an invalid league id', async () => {
    await expect(
      service.bulkCreateLeagueGamesForUser(OWNER_ID, 'not-an-id', payload())
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
