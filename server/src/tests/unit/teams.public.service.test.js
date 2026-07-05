jest.mock('../../modules/teams/teams.repository', () => ({
  createTeam: jest.fn(),
  listTeamsByOwner: jest.fn(),
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
  listTeams: jest.fn(),
  saveTeam: jest.fn(),
}));

jest.mock('../../modules/games/games.repository', () => ({
  listGamesByTeamId: jest.fn(),
  listPublicCompletedGames: jest.fn(),
}));

jest.mock('../../modules/billing/billing.service', () => ({
  getBillingSummary: jest.fn(() => ({
    plan: 'free',
    subscriptionStatus: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  })),
  getTeamEntitlements: jest.fn(() => ({})),
}));

jest.mock('mongoose', () => ({
  Schema: Object.assign(
    function Schema() {
      return {
        index: jest.fn(),
      };
    },
    {
      Types: {
        ObjectId: function ObjectId() {},
      },
    }
  ),
  model: jest.fn(() => ({})),
  models: {},
  Types: {
    ObjectId: {
      isValid: jest.fn(() => true),
    },
  },
}));

const { findTeamById, listTeams } = require('../../modules/teams/teams.repository');
const {
  listGamesByTeamId,
  listPublicCompletedGames,
} = require('../../modules/games/games.repository');
const {
  getPublicTeam,
  getPublicPlayer,
  getPublicOpponentBySlug,
  listPublicExploreGames,
  buildPublicTeamSummary,
  buildPublicPlayerSummary,
  buildPublicPlayerGameRows,
  slugifyOpponentName,
} = require('../../modules/teams/teams.service');

describe('teams public service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns active players only and sorts jersey numbers first', async () => {
    findTeamById.mockResolvedValue({
      _id: 'team-1',
      name: 'TSW Blue',
      logo: { url: 'https://example.com/team-logo.png', width: 128, height: 128 },
      players: [
        { _id: 'p1', displayName: 'Chris', jerseyNumber: null, isActive: true },
        { _id: 'p2', displayName: 'Alex', jerseyNumber: 4, isActive: true },
        { _id: 'p3', displayName: 'Jordan', jerseyNumber: 12, isActive: false },
      ],
    });
    listGamesByTeamId.mockResolvedValue([]);

    const result = await getPublicTeam('team-1');

    expect(result.team.logo).toEqual({
      url: 'https://example.com/team-logo.png',
      width: 128,
      height: 128,
    });
    expect(result.team.players).toEqual([
      { id: 'p2', displayName: 'Alex', jerseyNumber: 4, position: null },
      { id: 'p1', displayName: 'Chris', jerseyNumber: null, position: null },
    ]);
  });

  test('includes public game summaries with computed team points, future visibility, and summary totals', async () => {
    findTeamById.mockResolvedValue({
      _id: 'team-1',
      name: 'TSW Blue',
      players: [
        { _id: 'p1', displayName: 'Alex', isActive: true },
        { _id: 'p2', displayName: 'Chris', isActive: false },
      ],
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
        events: [
          { playerId: 'p1', statType: 'FG2_MADE' },
          { playerId: 'p1', statType: 'FG2_MISS' },
          { playerId: 'p1', statType: 'FT_MADE' },
          { playerId: 'p1', statType: 'FT_MISS' },
          { playerId: 'p2', statType: 'FG3_MADE' },
          { playerId: 'p1', statType: 'AST' },
          { playerId: 'p2', statType: 'FG3_MISS' },
          { playerId: 'p2', statType: 'DREB' },
        ],
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

    expect(result.summary).toEqual({
      gamesCount: 1,
      points: 6,
      opponentPoints: 0,
      fg2: { made: 1, missed: 1, attempts: 2, percentage: 50 },
      fg3: { made: 1, missed: 1, attempts: 2, percentage: 50 },
      ft: { made: 1, missed: 1, attempts: 2, percentage: 50 },
      boxScore: {
        players: [
          {
            playerId: 'p1',
            displayName: 'Alex',
            ftm: 1,
            fta: 2,
            fg2m: 1,
            fg2a: 2,
            fg3m: 0,
            fg3a: 0,
            ast: 1,
            oreb: 0,
            dreb: 0,
            stl: 0,
            tov: 0,
            foul: 0,
            blk: 0,
            reb: 0,
            points: 3,
            position: null,
            leaguePlayerId: null,
            gamesPlayed: 1,
            pointsPerGame: 3,
            assistsPerGame: 1,
            reboundsPerGame: 0,
            stealsPerGame: 0,
            turnoversPerGame: 0,
            foulsPerGame: 0,
          },
          {
            playerId: 'p2',
            displayName: 'Chris',
            ftm: 0,
            fta: 0,
            fg2m: 0,
            fg2a: 0,
            fg3m: 1,
            fg3a: 2,
            ast: 0,
            oreb: 0,
            dreb: 1,
            stl: 0,
            tov: 0,
            foul: 0,
            blk: 0,
            reb: 1,
            points: 3,
            position: null,
            leaguePlayerId: null,
            gamesPlayed: 1,
            pointsPerGame: 3,
            assistsPerGame: 0,
            reboundsPerGame: 1,
            stealsPerGame: 0,
            turnoversPerGame: 0,
            foulsPerGame: 0,
          },
        ],
        teamTotals: {
          ftm: 1,
          fta: 2,
          fg2m: 1,
          fg2a: 2,
          fg3m: 1,
          fg3a: 2,
          ast: 1,
          oreb: 0,
          dreb: 1,
          stl: 0,
          tov: 0,
          foul: 0,
          blk: 0,
          reb: 1,
          points: 6,
        },
        opponentTotals: {
          points: 0,
        },
      },
    });

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

  test('returns zeroed summary when no completed public games qualify', () => {
    const result = buildPublicTeamSummary(
      [
        {
          status: 'in_progress',
          scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
          events: [{ statType: 'FG2_MADE' }],
        },
        {
          status: 'completed',
          scheduledAt: new Date('2099-03-10T00:00:00.000Z'),
          events: [{ statType: 'FG3_MADE' }],
        },
      ],
      { players: [] }
    );

    expect(result).toEqual({
      gamesCount: 0,
      points: 0,
      opponentPoints: 0,
      fg2: { made: 0, missed: 0, attempts: 0, percentage: null },
      fg3: { made: 0, missed: 0, attempts: 0, percentage: null },
      ft: { made: 0, missed: 0, attempts: 0, percentage: null },
      boxScore: {
        players: [],
        teamTotals: {
          ftm: 0,
          fta: 0,
          fg2m: 0,
          fg2a: 0,
          fg3m: 0,
          fg3a: 0,
          ast: 0,
          oreb: 0,
          dreb: 0,
          stl: 0,
          tov: 0,
          foul: 0,
          blk: 0,
          reb: 0,
          points: 0,
        },
        opponentTotals: {
          points: 0,
        },
      },
    });
  });

  test('computes per-game averages from total public completed games and zeroes them when none qualify', () => {
    const summary = buildPublicTeamSummary(
      [
        {
          status: 'completed',
          scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
          events: [
            { playerId: 'p1', statType: 'FG2_MADE' },
            { playerId: 'p1', statType: 'DREB' },
          ],
        },
        {
          status: 'completed',
          scheduledAt: new Date('2026-03-12T00:00:00.000Z'),
          events: [
            { playerId: 'p1', statType: 'FG3_MADE' },
            { playerId: 'p1', statType: 'OREB' },
          ],
        },
      ],
      {
        players: [{ _id: 'p1', displayName: 'Alex', isActive: true }],
      }
    );

    expect(summary.boxScore.players).toEqual([
      expect.objectContaining({
        playerId: 'p1',
        points: 5,
        gamesPlayed: 2,
        reb: 2,
        pointsPerGame: 2.5,
        assistsPerGame: 0,
        reboundsPerGame: 1,
        stealsPerGame: 0,
        turnoversPerGame: 0,
        foulsPerGame: 0,
      }),
    ]);

    const zeroSummary = buildPublicTeamSummary(
      [
        {
          status: 'in_progress',
          scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
          events: [{ playerId: 'p1', statType: 'FG2_MADE' }],
        },
      ],
      {
        players: [{ _id: 'p1', displayName: 'Alex', isActive: true }],
      }
    );

    expect(zeroSummary.boxScore.players).toEqual([
      expect.objectContaining({
        playerId: 'p1',
        gamesPlayed: 0,
        pointsPerGame: 0,
        assistsPerGame: 0,
        reboundsPerGame: 0,
        stealsPerGame: 0,
        turnoversPerGame: 0,
        foulsPerGame: 0,
      }),
    ]);
  });

  test('returns player public profile summary and most recent game rows first', async () => {
    findTeamById.mockResolvedValue({
      _id: 'team-1',
      name: 'TSW Blue',
      logo: { url: 'https://example.com/team-logo.png', width: 128, height: 128 },
      players: [
        { _id: 'p1', displayName: 'Alex', jerseyNumber: 12, isActive: true },
        { _id: 'p2', displayName: 'Chris', jerseyNumber: 4, isActive: true },
      ],
    });
    listTeams.mockResolvedValue([{ _id: 'team-2', name: 'Hawks' }]);
    listGamesByTeamId.mockResolvedValue([
      {
        _id: 'g1',
        title: 'vs Falcons',
        opponent: 'Falcons',
        status: 'completed',
        scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
        completedAt: new Date('2026-03-10T02:00:00.000Z'),
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        events: [
          { playerId: 'p1', statType: 'FG2_MADE' },
          { playerId: 'p2', statType: 'AST' },
          { playerId: 'p1', statType: 'OREB' },
        ],
      },
      {
        _id: 'g2',
        title: 'vs Hawks',
        opponent: 'Hawks',
        status: 'completed',
        scheduledAt: new Date('2026-03-12T00:00:00.000Z'),
        completedAt: new Date('2026-03-12T02:00:00.000Z'),
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
        events: [
          { playerId: 'p1', statType: 'FG3_MADE' },
          { playerId: 'p1', statType: 'AST' },
          { playerId: 'p1', statType: 'DREB' },
        ],
      },
      {
        _id: 'g3',
        title: 'vs Future',
        opponent: 'Future',
        status: 'completed',
        scheduledAt: new Date('2099-03-12T00:00:00.000Z'),
        completedAt: new Date('2099-03-12T02:00:00.000Z'),
        createdAt: new Date('2099-03-12T00:00:00.000Z'),
        events: [{ playerId: 'p1', statType: 'FG2_MADE' }],
      },
    ]);

    const result = await getPublicPlayer('team-1', 'p1');

    expect(result.team).toEqual(
      expect.objectContaining({
        id: 'team-1',
        name: 'TSW Blue',
        logo: {
          url: 'https://example.com/team-logo.png',
          width: 128,
          height: 128,
        },
      })
    );
    expect(result.player).toEqual({
      id: 'p1',
      displayName: 'Alex',
      jerseyNumber: 12,
      position: null,
    });
    expect(result.summary).toEqual({
      gamesCount: 2,
      points: 5,
      reb: 2,
      ast: 1,
      stl: 0,
      tov: 0,
      foul: 0,
      pointsPerGame: 2.5,
      reboundsPerGame: 1,
      assistsPerGame: 0.5,
      stealsPerGame: 0,
      turnoversPerGame: 0,
      foulsPerGame: 0,
    });
    expect(result.games.map((game) => game.gameId)).toEqual(['g2', 'g1']);
    expect(result.games[0].opponentDestination).toEqual({
      kind: 'team',
      href: '/teams/team-2',
      label: 'Hawks',
      teamId: 'team-2',
      opponentSlug: null,
    });
    expect(result.games[1].opponentDestination).toEqual({
      kind: 'opponent_placeholder',
      href: '/opponents/falcons',
      label: 'Falcons',
      teamId: null,
      opponentSlug: 'falcons',
    });
    expect(result.games[0].stats).toEqual({
      ftm: 0,
      fta: 0,
      fg2m: 0,
      fg2a: 0,
      fg3m: 1,
      fg3a: 1,
      ast: 1,
      oreb: 0,
      dreb: 1,
      stl: 0,
      tov: 0,
      foul: 0,
      reb: 1,
      points: 3,
    });
  });

  test('returns zero rows for included games where the player recorded no events', () => {
    const team = {
      _id: 'team-1',
      players: [{ _id: 'p1', displayName: 'Alex', jerseyNumber: 12, isActive: true }],
    };
    const player = team.players[0];
    const rows = buildPublicPlayerGameRows(
      [
        {
          _id: 'g1',
          title: 'vs Falcons',
          opponent: 'Falcons',
          status: 'completed',
          scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
          completedAt: new Date('2026-03-10T02:00:00.000Z'),
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
          events: [{ playerId: 'other', statType: 'FG2_MADE' }],
        },
      ],
      team,
      player
    );

    expect(rows).toEqual([
      {
        gameId: 'g1',
        opponent: 'Falcons',
        title: 'vs Falcons',
        date: new Date('2026-03-10T00:00:00.000Z'),
        scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
        completedAt: new Date('2026-03-10T02:00:00.000Z'),
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        opponentDestination: {
          kind: 'opponent_placeholder',
          href: '/opponents/falcons',
          label: 'Falcons',
          teamId: null,
          opponentSlug: 'falcons',
        },
        stats: {
          ftm: 0,
          fta: 0,
          fg2m: 0,
          fg2a: 0,
          fg3m: 0,
          fg3a: 0,
          ast: 0,
          oreb: 0,
          dreb: 0,
          stl: 0,
          tov: 0,
          foul: 0,
          reb: 0,
          points: 0,
        },
      },
    ]);

    expect(buildPublicPlayerSummary(rows)).toEqual({
      gamesCount: 1,
      points: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      tov: 0,
      foul: 0,
      pointsPerGame: 0,
      reboundsPerGame: 0,
      assistsPerGame: 0,
      stealsPerGame: 0,
      turnoversPerGame: 0,
      foulsPerGame: 0,
    });
  });

  test('buildPublicPlayerGameRows links matching opponent names to public team pages', () => {
    const team = {
      _id: 'team-1',
      players: [{ _id: 'p1', displayName: 'Alex', jerseyNumber: 12, isActive: true }],
    };
    const player = team.players[0];
    const rows = buildPublicPlayerGameRows(
      [
        {
          _id: 'g1',
          title: 'vs Hawks',
          opponent: 'hAwKs',
          status: 'completed',
          scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
          completedAt: new Date('2026-03-10T02:00:00.000Z'),
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
          events: [{ playerId: 'p1', statType: 'FG2_MADE' }],
        },
      ],
      team,
      player,
      new Map([['hawks', { id: 'team-2', name: 'Hawks' }]])
    );

    expect(rows[0].opponentDestination).toEqual({
      kind: 'team',
      href: '/teams/team-2',
      label: 'Hawks',
      teamId: 'team-2',
      opponentSlug: null,
    });
  });

  test('returns grouped related public games for an opponent slug', async () => {
    listPublicCompletedGames.mockResolvedValue([
      {
        _id: 'g1',
        teamId: 'team-1',
        title: 'vs Falcons',
        opponent: 'Falcons',
        status: 'completed',
        scheduledAt: new Date('2026-03-12T00:00:00.000Z'),
        completedAt: new Date('2026-03-12T02:00:00.000Z'),
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
        events: [{ statType: 'FG2_MADE' }],
      },
      {
        _id: 'g2',
        teamId: 'team-2',
        title: 'vs Falcons',
        opponent: 'Falcons',
        status: 'completed',
        scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
        completedAt: new Date('2026-03-10T02:00:00.000Z'),
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        events: [{ statType: 'FG3_MADE' }],
      },
    ]);
    findTeamById
      .mockResolvedValueOnce({ _id: 'team-1', name: 'TSW Blue' })
      .mockResolvedValueOnce({ _id: 'team-2', name: 'TSW Red' });

    const result = await getPublicOpponentBySlug(slugifyOpponentName('Falcons'));

    expect(result.opponent).toEqual({
      slug: 'falcons',
      displayName: 'Falcons',
      matchedTeam: null,
    });
    expect(result.summary.gamesCount).toBe(2);
    expect(result.relatedGames).toEqual([
      expect.objectContaining({
        id: 'g1',
        team: { id: 'team-1', name: 'TSW Blue' },
      }),
      expect.objectContaining({
        id: 'g2',
        team: { id: 'team-2', name: 'TSW Red' },
      }),
    ]);
  });

  test('returns 404 when no related public games exist for opponent slug', async () => {
    listPublicCompletedGames.mockResolvedValue([]);

    await expect(getPublicOpponentBySlug('missing-team')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Opponent not found',
    });
  });

  test('returns 404 when public player does not exist on the team', async () => {
    findTeamById.mockResolvedValue({
      _id: 'team-1',
      name: 'TSW Blue',
      players: [{ _id: 'p1', displayName: 'Alex', isActive: true }],
    });

    await expect(getPublicPlayer('team-1', 'missing-player')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Player not found',
    });
  });

  test('returns recent public explore games with one game per team', async () => {
    listPublicCompletedGames.mockResolvedValue([
      {
        _id: 'g1',
        teamId: 'team-1',
        title: 'vs Falcons',
        opponent: 'Falcons',
        status: 'completed',
        scheduledAt: new Date('2026-03-12T00:00:00.000Z'),
        completedAt: new Date('2026-03-12T02:00:00.000Z'),
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
        events: [{ statType: 'FG2_MADE' }],
      },
      {
        _id: 'g2',
        teamId: 'team-1',
        title: 'vs Hawks',
        opponent: 'Hawks',
        status: 'completed',
        scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
        completedAt: new Date('2026-03-10T02:00:00.000Z'),
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        events: [{ statType: 'FG3_MADE' }],
      },
      {
        _id: 'g3',
        teamId: 'team-2',
        title: 'vs Lions',
        opponent: 'Lions',
        status: 'completed',
        scheduledAt: new Date('2026-03-11T00:00:00.000Z'),
        completedAt: new Date('2026-03-11T02:00:00.000Z'),
        createdAt: new Date('2026-03-11T00:00:00.000Z'),
        events: [{ statType: 'FT_MADE' }],
      },
      {
        _id: 'g4',
        teamId: 'team-3',
        title: 'vs Future',
        opponent: 'Future',
        status: 'completed',
        scheduledAt: new Date('2099-03-11T00:00:00.000Z'),
        completedAt: new Date('2099-03-11T02:00:00.000Z'),
        createdAt: new Date('2026-03-11T00:00:00.000Z'),
        events: [{ statType: 'FT_MADE' }],
      },
    ]);
    findTeamById
      .mockResolvedValueOnce({ _id: 'team-1', name: 'TSW Blue' })
      .mockResolvedValueOnce({ _id: 'team-2', name: 'TSW Red' });

    const games = await listPublicExploreGames();

    expect(games).toEqual([
      expect.objectContaining({
        id: 'g1',
        opponent: 'Falcons',
        teamPoints: 2,
        team: { id: 'team-1', name: 'TSW Blue' },
      }),
      expect.objectContaining({
        id: 'g3',
        opponent: 'Lions',
        teamPoints: 1,
        team: { id: 'team-2', name: 'TSW Red' },
      }),
    ]);
  });
});
