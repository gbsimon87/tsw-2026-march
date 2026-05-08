jest.mock('../../modules/teams/teams.repository', () => ({
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
}));

jest.mock('../../modules/games/games.repository', () => ({
  createGame: jest.fn(),
  findGameById: jest.fn(),
  findGameByIdAndOwner: jest.fn(),
  saveGame: jest.fn(),
  claimGameSummaryGeneration: jest.fn(),
  saveGameSummary: jest.fn(),
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
}));

jest.mock('../../modules/games/gameRecap.service', () => ({
  buildGameRecap: jest.fn(() => ({ summary: [] })),
}));

jest.mock('../../modules/games/gameSummaryAi.service', () => ({
  buildPersistedGameSummary: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  getLeagueContextForGame: jest.fn(),
  getLeagueRosterSnapshotForTeam: jest.fn(),
  getLeagueTeamRosterSnapshotForGame: jest.fn(),
  canManageLeagueGame: jest.fn(() => false),
  canFinalizeLeagueGame: jest.fn(() => false),
  canEditCompletedLeagueGame: jest.fn(() => false),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeagueTeamById: jest.fn(() => Promise.resolve(null)),
  findLeagueById: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('mongoose', () => ({
  Types: {
    ObjectId: {
      isValid: jest.fn(() => true),
    },
  },
}));

const { findTeamByIdAndOwner } = require('../../modules/teams/teams.repository');
const {
  createGame,
  findGameById,
  saveGame,
  claimGameSummaryGeneration,
  saveGameSummary,
} = require('../../modules/games/games.repository');
const { buildGameRecap } = require('../../modules/games/gameRecap.service');
const { buildPersistedGameSummary } = require('../../modules/games/gameSummaryAi.service');
const {
  getLeagueContextForGame,
  getLeagueRosterSnapshotForTeam,
  canEditCompletedLeagueGame,
} = require('../../modules/leagues/leagues.service');
const {
  computeBoxScore,
  createGameForUser,
  appendEventForUser,
  finishGameForUser,
  getGameForUser,
  setGameLineup,
} = require('../../modules/games/games.service');
const { STAT_TYPES } = require('../../modules/shared/stats.constants');

function buildPlayers(players) {
  const list = players.map((player) => ({ ...player }));
  list.id = (playerId) => list.find((player) => String(player._id) === String(playerId)) || null;
  return list;
}

function buildLeagueSnapshotPlayer(id, displayName) {
  return {
    _id: id,
    leaguePlayerId: `${id}-league`,
    displayName,
    jerseyNumber: null,
    position: null,
    isActive: true,
  };
}

function buildDualLeagueGame(overrides = {}) {
  return {
    _id: 'game-1',
    ownerUserId: 'user-1',
    gameContext: 'league',
    trackingMode: 'dual_team',
    leagueId: 'league-1',
    homeLeagueTeamId: 'home-team',
    awayLeagueTeamId: 'away-team',
    trackedLeagueTeamId: 'home-team',
    initialActiveSide: 'home',
    homeParticipant: {
      side: 'home',
      participantType: 'league_team',
      teamId: null,
      leagueTeamId: 'home-team',
      displayName: 'Home Squad',
      logo: null,
      colors: [],
      billingSnapshot: { plan: 'pro', subscriptionStatus: 'active' },
      entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
    },
    awayParticipant: {
      side: 'away',
      participantType: 'league_team',
      teamId: null,
      leagueTeamId: 'away-team',
      displayName: 'Away Squad',
      logo: null,
      colors: [],
      billingSnapshot: { plan: 'pro', subscriptionStatus: 'active' },
      entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
    },
    title: 'Away Squad at Home Squad',
    status: 'in_progress',
    homeRosterSnapshot: [],
    awayRosterSnapshot: [],
    homeStartingLineupPlayerIds: [],
    homeCurrentLineupPlayerIds: [],
    awayStartingLineupPlayerIds: [],
    awayCurrentLineupPlayerIds: [],
    events: [],
    scheduledAt: null,
    completedAt: null,
    createdAt: new Date('2026-03-12T00:00:00.000Z'),
    updatedAt: new Date('2026-03-12T00:00:00.000Z'),
    ...overrides,
  };
}

describe('games service box score', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('computes player and team totals from events', () => {
    const team = {
      players: buildPlayers([
        { _id: '111111111111111111111111', displayName: 'Alex', isActive: true },
        { _id: '222222222222222222222222', displayName: 'Blake', isActive: true },
      ]),
    };

    const game = {
      events: [
        { playerId: '111111111111111111111111', statType: STAT_TYPES.FT_MADE },
        { playerId: '111111111111111111111111', statType: STAT_TYPES.FG2_MADE },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.AST },
        { playerId: '111111111111111111111111', statType: STAT_TYPES.OREB },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.FG3_MADE },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.FG3_MISS },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.DREB },
      ],
    };

    const box = computeBoxScore(game, team);
    const alex = box.players.find((row) => row.displayName === 'Alex');
    const blake = box.players.find((row) => row.displayName === 'Blake');

    expect(alex.ftm).toBe(1);
    expect(alex.fta).toBe(1);
    expect(alex.fg2m).toBe(1);
    expect(alex.fg2a).toBe(1);
    expect(alex.ast).toBe(0);
    expect(alex.oreb).toBe(1);
    expect(alex.dreb).toBe(0);
    expect(alex.reb).toBe(1);
    expect(alex.points).toBe(3);

    expect(blake.fg3m).toBe(1);
    expect(blake.fg3a).toBe(2);
    expect(blake.ast).toBe(1);
    expect(blake.oreb).toBe(0);
    expect(blake.dreb).toBe(1);
    expect(blake.reb).toBe(1);
    expect(blake.points).toBe(3);

    expect(box.teamTotals.points).toBe(6);
    expect(box.teamTotals.ast).toBe(1);
    expect(box.teamTotals.oreb).toBe(1);
    expect(box.teamTotals.dreb).toBe(1);
    expect(box.teamTotals.reb).toBe(2);
  });

  test('creates fallback player rows for rebound-only unknown players', () => {
    const team = {
      players: buildPlayers([
        { _id: '111111111111111111111111', displayName: 'Alex', isActive: true },
      ]),
    };
    const game = {
      events: [{ playerId: '999999999999999999999999', statType: STAT_TYPES.OREB }],
    };

    const box = computeBoxScore(game, team);
    const fallback = box.players.find((row) => row.playerId === '999999999999999999999999');

    expect(fallback.displayName).toContain('Unknown');
    expect(fallback.ast).toBe(0);
    expect(fallback.oreb).toBe(1);
    expect(fallback.reb).toBe(1);
    expect(box.teamTotals.reb).toBe(1);
    expect(box.teamTotals.points).toBe(0);
  });

  test('ignores opponent rebound and substitution events in box score totals', () => {
    const team = {
      players: buildPlayers([
        { _id: '111111111111111111111111', displayName: 'Alex', isActive: true },
        { _id: '222222222222222222222222', displayName: 'Blake', isActive: true },
      ]),
    };
    const game = {
      events: [
        { playerId: '111111111111111111111111', statType: STAT_TYPES.SUB_OUT },
        { playerId: '222222222222222222222222', statType: STAT_TYPES.SUB_IN },
        { statType: STAT_TYPES.OPP_REB },
        { playerId: '111111111111111111111111', statType: STAT_TYPES.STL },
      ],
    };

    const box = computeBoxScore(game, team);

    expect(box.teamTotals.reb).toBe(0);
    expect(box.teamTotals.stl).toBe(1);
    expect(box.players.find((row) => row.displayName === 'Alex').stl).toBe(1);
  });
});

describe('games service create game', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('persists a trimmed YouTube video URL', async () => {
    findTeamByIdAndOwner.mockResolvedValue({ _id: 'team-1', players: buildPlayers([]) });
    createGame.mockResolvedValue({
      _id: 'game-1',
      ownerUserId: 'user-1',
      teamId: 'team-1',
      title: 'Friday Night',
      opponent: 'Wildcats',
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      status: 'in_progress',
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
      scheduledAt: null,
      completedAt: null,
      createdAt: new Date('2026-03-12T17:45:00.000Z'),
      updatedAt: new Date('2026-03-12T17:45:00.000Z'),
      events: [],
    });

    const result = await createGameForUser('user-1', {
      teamId: 'team-1',
      title: '  Friday Night  ',
      opponent: ' Wildcats ',
      videoUrl: ' https://youtu.be/dQw4w9WgXcQ ',
    });

    expect(createGame).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Friday Night',
        opponent: 'Wildcats',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      })
    );
    expect(result.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  test('creates dual league games with independent home and away roster snapshots', async () => {
    const homeRosterSnapshot = [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')];
    const awayRosterSnapshot = [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')];

    getLeagueContextForGame.mockResolvedValue({
      league: { _id: 'league-1' },
      homeTeam: { _id: 'home-team', name: 'Home Squad', logo: null, colors: [] },
      awayTeam: { _id: 'away-team', name: 'Away Squad', logo: null, colors: [] },
      trackedTeam: { _id: 'away-team', name: 'Away Squad' },
      rosterSnapshot: awayRosterSnapshot,
    });
    getLeagueRosterSnapshotForTeam.mockImplementation((leagueTeamId) =>
      Promise.resolve(leagueTeamId === 'home-team' ? homeRosterSnapshot : awayRosterSnapshot)
    );
    createGame.mockImplementation(async (input) => ({
      _id: 'game-1',
      ...input,
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
      homeStartingLineupPlayerIds: [],
      homeCurrentLineupPlayerIds: [],
      awayStartingLineupPlayerIds: [],
      awayCurrentLineupPlayerIds: [],
      events: [],
      scheduledAt: null,
      completedAt: null,
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      updatedAt: new Date('2026-03-12T00:00:00.000Z'),
    }));

    await createGameForUser('user-1', {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'home-team',
      awayLeagueTeamId: 'away-team',
      initialActiveSide: 'away',
    });

    expect(getLeagueContextForGame).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        trackedLeagueTeamId: 'away-team',
      }),
      { allowManager: true }
    );
    expect(createGame).toHaveBeenCalledWith(
      expect.objectContaining({
        homeRosterSnapshot,
        awayRosterSnapshot,
      })
    );
  });
});

describe('games service roster snapshot repair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLeagueRosterSnapshotForTeam.mockReset();
  });

  test('backfills empty dual league participant rosters when loading a game', async () => {
    const game = buildDualLeagueGame();
    const homeRosterSnapshot = [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')];
    const awayRosterSnapshot = [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')];

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);
    getLeagueRosterSnapshotForTeam.mockImplementation((leagueTeamId) =>
      Promise.resolve(leagueTeamId === 'home-team' ? homeRosterSnapshot : awayRosterSnapshot)
    );

    const result = await getGameForUser('user-1', 'game-1');

    expect(result.participants.home.players).toEqual([
      expect.objectContaining({ id: 'home-snap-1', displayName: 'Home One' }),
    ]);
    expect(result.participants.away.players).toEqual([
      expect.objectContaining({ id: 'away-snap-1', displayName: 'Away One' }),
    ]);
    expect(result.boxScore.home.players).toEqual([
      expect.objectContaining({
        playerId: 'home-snap-1',
        leaguePlayerId: 'home-snap-1-league',
        displayName: 'Home One',
      }),
    ]);
    expect(saveGame).toHaveBeenCalledWith(game);
  });

  test('does not overwrite non-empty roster snapshots', async () => {
    const game = buildDualLeagueGame({
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('existing-home-snap', 'Existing Home')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('existing-away-snap', 'Existing Away')],
    });

    findGameById.mockResolvedValue(game);

    const result = await getGameForUser('user-1', 'game-1');

    expect(getLeagueRosterSnapshotForTeam).not.toHaveBeenCalled();
    expect(saveGame).not.toHaveBeenCalled();
    expect(result.participants.home.players[0]).toEqual(
      expect.objectContaining({ id: 'existing-home-snap', displayName: 'Existing Home' })
    );
  });

  test('allows setting a lineup after backfilling an empty dual league roster', async () => {
    const homeRosterSnapshot = [
      buildLeagueSnapshotPlayer('home-snap-1', 'Home One'),
      buildLeagueSnapshotPlayer('home-snap-2', 'Home Two'),
      buildLeagueSnapshotPlayer('home-snap-3', 'Home Three'),
      buildLeagueSnapshotPlayer('home-snap-4', 'Home Four'),
      buildLeagueSnapshotPlayer('home-snap-5', 'Home Five'),
    ];
    const game = buildDualLeagueGame();

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);
    getLeagueRosterSnapshotForTeam.mockImplementation((leagueTeamId) =>
      Promise.resolve(leagueTeamId === 'home-team' ? homeRosterSnapshot : [])
    );

    const playerIds = homeRosterSnapshot.map((player) => player._id);
    const result = await setGameLineup('user-1', 'game-1', {
      teamSide: 'home',
      playerIds,
    });

    expect(game.homeStartingLineupPlayerIds).toEqual(playerIds);
    expect(game.homeCurrentLineupPlayerIds).toEqual(playerIds);
    expect(result.lineups.home.currentPlayerIds).toEqual(playerIds);
  });
});

describe('games service finish summaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildPersistedGameSummary.mockReset();
    claimGameSummaryGeneration.mockReset();
    saveGameSummary.mockReset();
    canEditCompletedLeagueGame.mockImplementation(() => false);
    buildGameRecap.mockReturnValue({
      home: { name: 'Home Squad', points: 72 },
      away: { name: 'Away Squad', points: 68 },
      topPerformers: [],
      keyMoments: [],
    });
  });

  test('generates and saves a league game summary when finishing a game without one', async () => {
    const game = buildDualLeagueGame({
      homeRosterSnapshot: [
        buildLeagueSnapshotPlayer('home-snap-1', 'Home One'),
        buildLeagueSnapshotPlayer('home-snap-2', 'Home Two'),
      ],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      events: [
        { playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG3_MADE },
        { playerId: 'away-snap-1', teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    });
    const summary = {
      text: 'Home Squad edged Away Squad behind a balanced closing push.',
      source: 'ai',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      generatedAt: new Date('2026-03-12T19:30:00.000Z'),
    };

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);
    claimGameSummaryGeneration.mockResolvedValue(game);
    saveGameSummary.mockImplementation(async (gameId, lockId, savedSummary) => {
      game.aiSummary = savedSummary;
      return game;
    });
    buildPersistedGameSummary.mockResolvedValue(summary);

    const result = await finishGameForUser('user-1', 'game-1');

    expect(game.status).toBe('completed');
    expect(game.aiSummary).toEqual(summary);
    expect(claimGameSummaryGeneration).toHaveBeenCalledTimes(1);
    expect(buildPersistedGameSummary).toHaveBeenCalledTimes(1);
    expect(saveGameSummary).toHaveBeenCalledTimes(1);
    expect(saveGame).toHaveBeenCalledTimes(1);
    expect(result.aiSummary).toEqual(expect.objectContaining({ text: summary.text, source: 'ai' }));
  });

  test('does not regenerate an existing league game summary', async () => {
    const existingSummary = {
      text: 'A saved recap already exists.',
      source: 'fallback',
      generatedAt: new Date('2026-03-12T19:30:00.000Z'),
    };
    const game = buildDualLeagueGame({
      aiSummary: existingSummary,
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    const result = await finishGameForUser('user-1', 'game-1');

    expect(buildPersistedGameSummary).not.toHaveBeenCalled();
    expect(claimGameSummaryGeneration).not.toHaveBeenCalled();
    expect(saveGame).toHaveBeenCalledTimes(1);
    expect(result.aiSummary).toEqual(expect.objectContaining({ text: existingSummary.text }));
  });

  test('does not generate a duplicate summary when another request has claimed generation', async () => {
    const game = buildDualLeagueGame({
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);
    claimGameSummaryGeneration.mockResolvedValue(null);

    await finishGameForUser('user-1', 'game-1');

    expect(claimGameSummaryGeneration).toHaveBeenCalledTimes(1);
    expect(buildPersistedGameSummary).not.toHaveBeenCalled();
    expect(saveGameSummary).not.toHaveBeenCalled();
  });

  test('does not generate summaries for standalone games', async () => {
    const game = {
      _id: 'game-1',
      ownerUserId: 'user-1',
      teamId: 'team-1',
      gameContext: 'standalone',
      trackingMode: 'one_sided',
      title: 'Standalone',
      status: 'in_progress',
      events: [],
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
      scheduledAt: null,
      completedAt: null,
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      updatedAt: new Date('2026-03-12T00:00:00.000Z'),
    };
    findGameById.mockResolvedValue(game);
    findTeamByIdAndOwner.mockResolvedValue({ _id: 'team-1', name: 'Team', players: [] });
    saveGame.mockResolvedValue(game);

    await finishGameForUser('user-1', 'game-1');

    expect(buildPersistedGameSummary).not.toHaveBeenCalled();
    expect(claimGameSummaryGeneration).not.toHaveBeenCalled();
    expect(game.aiSummary).toBeUndefined();
  });

  test('clears saved league summary when completed game stats are edited', async () => {
    const players = [
      buildLeagueSnapshotPlayer('home-snap-1', 'Home One'),
      buildLeagueSnapshotPlayer('home-snap-2', 'Home Two'),
      buildLeagueSnapshotPlayer('home-snap-3', 'Home Three'),
      buildLeagueSnapshotPlayer('home-snap-4', 'Home Four'),
      buildLeagueSnapshotPlayer('home-snap-5', 'Home Five'),
    ];
    const game = buildDualLeagueGame({
      status: 'completed',
      aiSummary: {
        text: 'Old recap.',
        source: 'fallback',
        generatedAt: new Date('2026-03-12T19:30:00.000Z'),
      },
      homeRosterSnapshot: players,
      awayRosterSnapshot: [
        buildLeagueSnapshotPlayer('away-snap-1', 'Away One'),
        buildLeagueSnapshotPlayer('away-snap-2', 'Away Two'),
        buildLeagueSnapshotPlayer('away-snap-3', 'Away Three'),
        buildLeagueSnapshotPlayer('away-snap-4', 'Away Four'),
        buildLeagueSnapshotPlayer('away-snap-5', 'Away Five'),
      ],
      homeCurrentLineupPlayerIds: players.map((player) => player._id),
      awayCurrentLineupPlayerIds: [
        'away-snap-1',
        'away-snap-2',
        'away-snap-3',
        'away-snap-4',
        'away-snap-5',
      ],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);
    canEditCompletedLeagueGame.mockResolvedValue(true);

    await appendEventForUser('user-1', 'game-1', {
      teamSide: 'home',
      playerId: 'home-snap-1',
      statType: STAT_TYPES.FG2_MADE,
    });

    expect(game.aiSummary).toBeNull();
  });
});

describe('games service lineups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saves a valid starting lineup', async () => {
    const team = {
      _id: 'team-1',
      players: buildPlayers([
        { _id: 'player-1', displayName: 'Alex', isActive: true },
        { _id: 'player-2', displayName: 'Blake', isActive: true },
        { _id: 'player-3', displayName: 'Casey', isActive: true },
        { _id: 'player-4', displayName: 'Drew', isActive: true },
        { _id: 'player-5', displayName: 'Evan', isActive: true },
        { _id: 'player-6', displayName: 'Flynn', isActive: true },
      ]),
    };
    const game = {
      _id: 'game-1',
      ownerUserId: 'user-1',
      teamId: 'team-1',
      status: 'in_progress',
      events: [],
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
    };

    findGameById.mockResolvedValue(game);
    findTeamByIdAndOwner.mockResolvedValue(team);
    saveGame.mockResolvedValue(game);

    const result = await setGameLineup('user-1', 'game-1', [
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]);

    expect(game.startingLineupPlayerIds).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]);
    expect(game.currentLineupPlayerIds).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]);
    expect(result.game.currentLineupPlayerIds).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]);
  });

  test('rejects a lineup with duplicate players', async () => {
    const team = {
      _id: 'team-1',
      players: buildPlayers([
        { _id: 'player-1', displayName: 'Alex', isActive: true },
        { _id: 'player-2', displayName: 'Blake', isActive: true },
        { _id: 'player-3', displayName: 'Casey', isActive: true },
        { _id: 'player-4', displayName: 'Drew', isActive: true },
        { _id: 'player-5', displayName: 'Evan', isActive: true },
      ]),
    };
    const game = {
      _id: 'game-1',
      ownerUserId: 'user-1',
      teamId: 'team-1',
      status: 'in_progress',
      events: [],
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
    };

    findGameById.mockResolvedValue(game);
    findTeamByIdAndOwner.mockResolvedValue(team);

    await expect(
      setGameLineup('user-1', 'game-1', [
        'player-1',
        'player-1',
        'player-2',
        'player-3',
        'player-4',
      ])
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
