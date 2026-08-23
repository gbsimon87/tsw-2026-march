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
      defaultGameFormat: {
        regulationSegmentType: 'quarter',
        regulationSegmentDurationSeconds: 600,
        overtimeDurationSeconds: 300,
      },
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
      trackingMode: 'dual_team',
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

  // The Schedule Builder used to hardcode trackingMode 'one_sided', which meant a
  // fixture list could only ever record one team's players — the opposition was
  // reduced to anonymous opp_* totals — and trackingMode is absent from
  // updateGameSchema, so it could not be corrected afterwards. Fixtures now match
  // the dual-team shape the single-game league create path produces.
  it('creates dual-team fixtures so both teams can be tracked', async () => {
    await service.bulkCreateLeagueGamesForUser(OWNER_ID, LEAGUE_ID, payload());

    const [docs] = gamesRepository.insertManyGames.mock.calls[0];
    expect(docs[0]).toMatchObject({
      trackingMode: 'dual_team',
      initialActiveSide: 'home',
      trackedLeagueTeamId: HOME_ID,
      status: 'scheduled',
    });
  });

  it('snapshots both teams as participants, carrying identity and logo', async () => {
    leaguesRepository.listLeagueTeams.mockResolvedValue([
      {
        _id: HOME_ID,
        name: 'Hawks',
        slug: 'hawks',
        colors: ['#123456'],
        logo: {
          url: 'https://res.cloudinary.com/x/image/upload/v1/hawks.webp',
          width: 200,
          height: 100,
        },
      },
      { _id: AWAY_ID, name: 'Bisons', slug: 'bisons' },
    ]);

    await service.bulkCreateLeagueGamesForUser(OWNER_ID, LEAGUE_ID, payload());

    const [docs] = gamesRepository.insertManyGames.mock.calls[0];
    expect(docs[0].homeParticipant).toMatchObject({
      side: 'home',
      participantType: 'league_team',
      leagueTeamId: HOME_ID,
      slug: 'hawks',
      displayName: 'Hawks',
      colors: ['#123456'],
    });
    expect(docs[0].homeParticipant.logo).toMatchObject({ width: 200, height: 100 });
    expect(docs[0].awayParticipant).toMatchObject({
      side: 'away',
      participantType: 'league_team',
      leagueTeamId: AWAY_ID,
      slug: 'bisons',
      displayName: 'Bisons',
    });
    // A team with no uploaded logo must serialise to null, not undefined or {}.
    expect(docs[0].awayParticipant.logo).toBeNull();
  });

  // A fixture can be scheduled months before it is played, so freezing today's
  // roster into it would capture the wrong players. Left empty,
  // repairGameRosterSnapshots (games.service.js) fills both sides from the live
  // league rosters the first time the game is read as 'in_progress' — which is
  // what starting the clock on a scheduled game makes it.
  it('leaves both roster snapshots empty so they fill when tracking starts', async () => {
    await service.bulkCreateLeagueGamesForUser(OWNER_ID, LEAGUE_ID, payload());

    const [docs] = gamesRepository.insertManyGames.mock.calls[0];
    expect(docs[0].homeRosterSnapshot).toEqual([]);
    expect(docs[0].awayRosterSnapshot).toEqual([]);
  });
});
