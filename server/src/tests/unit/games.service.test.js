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
  releaseGameSummaryLock: jest.fn(),
  saveGameSummary: jest.fn(),
}));

jest.mock('../../modules/teams/teams.service', () => ({
  scheduleTeamSeasonSummaryRecompute: jest.fn(),
}));

jest.mock('../../modules/feed/feed.service', () => ({
  refreshGameCardPostsForGame: jest.fn(() => Promise.resolve()),
  autoPublishForFinalizedGame: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../config/env', () => ({
  env: { AUTO_FEED_ENABLED: false },
}));

jest.mock('../../modules/billing/billing.service', () => ({
  getBillingSummary: jest.fn(() => ({
    plan: 'free',
    subscriptionStatus: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  })),
  getLeagueBillingSummary: jest.fn(() => ({
    plan: 'free',
    subscriptionStatus: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  })),
  isTeamActive: jest.fn(() => true),
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
  scheduleLeagueAggregateRecompute: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeagueTeamById: jest.fn(() => Promise.resolve(null)),
  findLeagueById: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('mongoose', () => ({
  Schema: Object.assign(
    function Schema() {
      return { index: jest.fn() };
    },
    { Types: { ObjectId: function ObjectId() {} } }
  ),
  model: jest.fn(() => ({})),
  models: {},
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
  releaseGameSummaryLock,
  saveGameSummary,
} = require('../../modules/games/games.repository');
const { buildGameRecap } = require('../../modules/games/gameRecap.service');
const { buildPersistedGameSummary } = require('../../modules/games/gameSummaryAi.service');
const {
  getLeagueContextForGame,
  getLeagueRosterSnapshotForTeam,
  getLeagueTeamRosterSnapshotForGame,
  canEditCompletedLeagueGame,
} = require('../../modules/leagues/leagues.service');
const {
  computeBoxScore,
  createGameForUser,
  appendEventForUser,
  removeEventForUser,
  updateEventForUser,
  finishGameForUser,
  getGameForUser,
  setGameLineup,
  computeGameFinalScore,
} = require('../../modules/games/games.service');
const { STAT_TYPES } = require('../../modules/shared/stats.constants');
const { autoPublishForFinalizedGame } = require('../../modules/feed/feed.service');
const { env } = require('../../config/env');

// The post-response schedulers (scheduleLeagueRecomputeForGame,
// scheduleTeamSummaryRecomputeForGame, scheduleFeedCardRefreshForGame) fire
// via setImmediate — flush pending immediates after every test so they run
// (and hit their mocks) before Jest tears down the module registry, instead
// of firing into a torn-down environment after the test file finishes.
afterEach(() => new Promise((resolve) => setImmediate(resolve)));

// OPT-020: the AI summary is generated inside a setImmediate (post-response).
// Tests that assert on the generation must flush the immediate queue AND let
// the async chain inside it settle. Two ticks: one to run the setImmediate
// callback, and enough microtask draining for its awaited claim/build/save.
async function flushAsyncScheduler() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function buildPlayers(players) {
  const list = players.map((player) => ({ ...player }));
  list.id = (playerId) => list.find((player) => String(player._id) === String(playerId)) || null;
  return list;
}

// Mimics the subset of Mongoose's DocumentArray API the event mutators use:
// events.id(eventId) to find a subdocument, and event.deleteOne() to remove it
// from the parent array in place.
function buildEvents(events) {
  const list = events.map((event) => ({ ...event }));
  list.id = (eventId) => list.find((event) => String(event._id) === String(eventId)) || null;
  list.forEach((event) => {
    event.deleteOne = () => {
      const index = list.findIndex((e) => String(e._id) === String(event._id));
      if (index >= 0) list.splice(index, 1);
    };
  });
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

    // OPT-020: finish returns immediately without waiting on OpenAI — the
    // summary is not yet generated when the response is produced.
    expect(result).toBeDefined();
    expect(game.status).toBe('completed');
    expect(saveGame).toHaveBeenCalledTimes(1);
    expect(buildPersistedGameSummary).not.toHaveBeenCalled();

    // Generation runs post-response; flush the scheduler and assert it landed.
    await flushAsyncScheduler();

    expect(claimGameSummaryGeneration).toHaveBeenCalledTimes(1);
    expect(buildPersistedGameSummary).toHaveBeenCalledTimes(1);
    expect(saveGameSummary).toHaveBeenCalledTimes(1);
    expect(game.aiSummary).toEqual(summary);
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
      events: [{ playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG2_MADE }],
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
      events: [{ playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG2_MADE }],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);
    claimGameSummaryGeneration.mockResolvedValue(null);

    await finishGameForUser('user-1', 'game-1');
    await flushAsyncScheduler();

    // The post-response scheduler attempted the claim but lost it → no build.
    expect(claimGameSummaryGeneration).toHaveBeenCalledTimes(1);
    expect(buildPersistedGameSummary).not.toHaveBeenCalled();
    expect(saveGameSummary).not.toHaveBeenCalled();
  });

  test('releases the summary lock when generation fails so a later finish can retry', async () => {
    const game = buildDualLeagueGame({
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      events: [{ playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG2_MADE }],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);
    claimGameSummaryGeneration.mockResolvedValue(game); // we win the claim
    buildPersistedGameSummary.mockRejectedValue(new Error('openai down'));
    releaseGameSummaryLock.mockResolvedValue(game);

    // finish itself must not reject even though generation will fail post-response.
    await expect(finishGameForUser('user-1', 'game-1')).resolves.toBeDefined();
    await flushAsyncScheduler();

    expect(claimGameSummaryGeneration).toHaveBeenCalledTimes(1);
    expect(buildPersistedGameSummary).toHaveBeenCalledTimes(1);
    expect(saveGameSummary).not.toHaveBeenCalled();
    // OPT-020 retry-on-cleared: the lock we claimed is released on failure.
    expect(releaseGameSummaryLock).toHaveBeenCalledTimes(1);
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

describe('games service auto feed trigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canEditCompletedLeagueGame.mockImplementation(() => false);
    buildGameRecap.mockReturnValue({
      home: { name: 'Home Squad', points: 72 },
      away: { name: 'Away Squad', points: 68 },
      topPerformers: [],
      keyMoments: [],
    });
    claimGameSummaryGeneration.mockResolvedValue(null);
  });

  afterEach(() => {
    env.AUTO_FEED_ENABLED = false;
  });

  test('does not call autoPublishForFinalizedGame when the feature flag is off', async () => {
    env.AUTO_FEED_ENABLED = false;
    const game = buildDualLeagueGame({
      events: [
        { playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG3_MADE },
        { playerId: 'away-snap-1', teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    });
    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    await finishGameForUser('user-1', 'game-1');
    await flushAsyncScheduler();

    expect(autoPublishForFinalizedGame).not.toHaveBeenCalled();
  });

  test('calls autoPublishForFinalizedGame post-response when the feature flag is on', async () => {
    env.AUTO_FEED_ENABLED = true;
    const game = buildDualLeagueGame({
      events: [
        { playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG3_MADE },
        { playerId: 'away-snap-1', teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    });
    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    const result = await finishGameForUser('user-1', 'game-1');

    // Fires post-response — not yet called synchronously with the finish result.
    expect(result).toBeDefined();
    expect(autoPublishForFinalizedGame).not.toHaveBeenCalled();

    await flushAsyncScheduler();

    expect(autoPublishForFinalizedGame).toHaveBeenCalledWith('game-1');
  });

  test('a failure in autoPublishForFinalizedGame does not affect the finish response', async () => {
    env.AUTO_FEED_ENABLED = true;
    autoPublishForFinalizedGame.mockRejectedValue(new Error('feed service down'));
    const game = buildDualLeagueGame({
      events: [
        { playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG3_MADE },
        { playerId: 'away-snap-1', teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    });
    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    await expect(finishGameForUser('user-1', 'game-1')).resolves.toBeDefined();
    await flushAsyncScheduler();
  });
});

describe('games service league tie guard (OPT-024)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canEditCompletedLeagueGame.mockImplementation(() => false);
  });

  test('finishGameForUser rejects a league game that would finish tied', async () => {
    const game = buildDualLeagueGame({
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      events: [
        { playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG2_MADE },
        { playerId: 'away-snap-1', teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    await expect(finishGameForUser('user-1', 'game-1')).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('cannot end in a tie'),
    });
    expect(game.status).not.toBe('completed');
    expect(saveGame).not.toHaveBeenCalled();
  });

  test('finishGameForUser allows a league game with a clear winner', async () => {
    const game = buildDualLeagueGame({
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      events: [
        { playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG3_MADE },
        { playerId: 'away-snap-1', teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    await expect(finishGameForUser('user-1', 'game-1')).resolves.toBeDefined();
    expect(game.status).toBe('completed');
    expect(saveGame).toHaveBeenCalledTimes(1);
  });

  test('standalone (non-league) games are not blocked by the tie guard', async () => {
    const game = buildDualLeagueGame({
      gameContext: 'standalone',
      leagueId: null,
      homeLeagueTeamId: null,
      awayLeagueTeamId: null,
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      events: [
        { playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG2_MADE },
        { playerId: 'away-snap-1', teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    await expect(finishGameForUser('user-1', 'game-1')).resolves.toBeDefined();
    expect(game.status).toBe('completed');
  });
});

describe('games service frozen box score (OPT-012)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canEditCompletedLeagueGame.mockImplementation(() => false);
  });

  test('finishGameForUser freezes boxScore and gameSummary on completion', async () => {
    const game = buildDualLeagueGame({
      aiSummary: { text: 'Already have one.', source: 'ai', generatedAt: new Date() },
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      events: [
        { playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG3_MADE },
        { playerId: 'away-snap-1', teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    await finishGameForUser('user-1', 'game-1');

    expect(game.status).toBe('completed');
    expect(game.boxScore).toEqual({
      home: expect.objectContaining({ players: expect.any(Array) }),
      away: expect.objectContaining({ players: expect.any(Array) }),
    });
    expect(game.gameSummary).toEqual(
      expect.objectContaining({ homePoints: 3, awayPoints: 2, teamPoints: 3, opponentPoints: 2 })
    );
  });

  test('getGameForUser serves the frozen boxScore/gameSummary for a completed game', async () => {
    const frozenBoxScore = { home: { players: [], totals: {} }, away: { players: [], totals: {} } };
    const frozenSummary = { homePoints: 99, awayPoints: 1, teamPoints: 99, opponentPoints: 1 };
    const game = buildDualLeagueGame({
      status: 'completed',
      boxScore: frozenBoxScore,
      gameSummary: frozenSummary,
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      // Live events would compute a totally different score than the frozen
      // summary above — proves the frozen data is served, not recomputed.
      events: [{ playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG2_MADE }],
    });

    findGameById.mockResolvedValue(game);

    const result = await getGameForUser('user-1', 'game-1');

    expect(result.boxScore).toBe(frozenBoxScore);
    expect(result.gameSummary).toBe(frozenSummary);
  });

  test('T-13: a one-sided league game reflects the league live entitlements (active → premium)', async () => {
    getLeagueTeamRosterSnapshotForGame.mockResolvedValue({
      league: {
        _id: 'league-1',
        name: 'City League',
        plan: 'league',
        subscriptionStatus: 'active',
      },
      trackedTeam: { _id: 'lt-1', name: 'Hawks', slug: 'hawks', logo: null },
      team: { players: [] },
    });

    const game = {
      _id: 'game-1',
      ownerUserId: 'user-1',
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'lt-1',
      status: 'in_progress',
      rosterSnapshot: [],
      events: [],
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      updatedAt: new Date('2026-03-12T00:00:00.000Z'),
    };
    findGameById.mockResolvedValue(game);

    const result = await getGameForUser('user-1', 'game-1');
    expect(result.team.entitlements.canViewReplay).toBe(true);
    expect(result.team.entitlements.canViewShotMaps).toBe(true);
  });

  test('T-13: a lapsed/free league game loses premium views (downgrade safety)', async () => {
    getLeagueTeamRosterSnapshotForGame.mockResolvedValue({
      league: {
        _id: 'league-1',
        name: 'City League',
        plan: 'free',
        subscriptionStatus: 'inactive',
      },
      trackedTeam: { _id: 'lt-1', name: 'Hawks', slug: 'hawks', logo: null },
      team: { players: [] },
    });

    const game = {
      _id: 'game-1',
      ownerUserId: 'user-1',
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'lt-1',
      status: 'in_progress',
      rosterSnapshot: [],
      events: [],
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      updatedAt: new Date('2026-03-12T00:00:00.000Z'),
    };
    findGameById.mockResolvedValue(game);

    const result = await getGameForUser('user-1', 'game-1');
    expect(result.team.entitlements.canViewReplay).toBe(false);
    expect(result.team.entitlements.canViewShotMaps).toBe(false);
  });

  test('getGameForUser falls back to live compute when no frozen data exists', async () => {
    const game = buildDualLeagueGame({
      status: 'completed',
      boxScore: null,
      gameSummary: null,
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      events: [{ playerId: 'home-snap-1', teamSide: 'home', statType: STAT_TYPES.FG3_MADE }],
    });

    findGameById.mockResolvedValue(game);

    const result = await getGameForUser('user-1', 'game-1');

    expect(result.gameSummary).toEqual(
      expect.objectContaining({ homePoints: 3, teamPoints: 3, awayPoints: 0 })
    );
  });

  test('appendEventForUser refreezes boxScore after editing a completed game', async () => {
    const homePlayers = [
      buildLeagueSnapshotPlayer('home-snap-1', 'Home One'),
      buildLeagueSnapshotPlayer('home-snap-2', 'Home Two'),
      buildLeagueSnapshotPlayer('home-snap-3', 'Home Three'),
      buildLeagueSnapshotPlayer('home-snap-4', 'Home Four'),
      buildLeagueSnapshotPlayer('home-snap-5', 'Home Five'),
    ];
    const awayPlayers = [
      buildLeagueSnapshotPlayer('away-snap-1', 'Away One'),
      buildLeagueSnapshotPlayer('away-snap-2', 'Away Two'),
      buildLeagueSnapshotPlayer('away-snap-3', 'Away Three'),
      buildLeagueSnapshotPlayer('away-snap-4', 'Away Four'),
      buildLeagueSnapshotPlayer('away-snap-5', 'Away Five'),
    ];
    const game = buildDualLeagueGame({
      status: 'completed',
      boxScore: { home: { players: [], totals: { points: 0 } }, away: { players: [], totals: {} } },
      gameSummary: { homePoints: 0, awayPoints: 0, teamPoints: 0, opponentPoints: 0 },
      homeRosterSnapshot: homePlayers,
      awayRosterSnapshot: awayPlayers,
      homeCurrentLineupPlayerIds: homePlayers.map((player) => player._id),
      awayCurrentLineupPlayerIds: awayPlayers.map((player) => player._id),
    });

    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);
    canEditCompletedLeagueGame.mockResolvedValue(true);

    const result = await appendEventForUser('user-1', 'game-1', {
      teamSide: 'home',
      playerId: 'home-snap-1',
      statType: STAT_TYPES.FG3_MADE,
    });

    // The stale frozen summary (all zeroes) must have been refreshed.
    expect(game.gameSummary.homePoints).toBe(3);
    expect(result.gameSummary.homePoints).toBe(3);
  });
});

describe('games service event mutation contract (OPT-015)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canEditCompletedLeagueGame.mockImplementation(() => false);
  });

  function buildSlimTestGame(overrides = {}) {
    const homePlayers = [
      buildLeagueSnapshotPlayer('home-snap-1', 'Home One'),
      buildLeagueSnapshotPlayer('home-snap-2', 'Home Two'),
      buildLeagueSnapshotPlayer('home-snap-3', 'Home Three'),
      buildLeagueSnapshotPlayer('home-snap-4', 'Home Four'),
      buildLeagueSnapshotPlayer('home-snap-5', 'Home Five'),
    ];
    const awayPlayers = [
      buildLeagueSnapshotPlayer('away-snap-1', 'Away One'),
      buildLeagueSnapshotPlayer('away-snap-2', 'Away Two'),
      buildLeagueSnapshotPlayer('away-snap-3', 'Away Three'),
      buildLeagueSnapshotPlayer('away-snap-4', 'Away Four'),
      buildLeagueSnapshotPlayer('away-snap-5', 'Away Five'),
    ];
    return buildDualLeagueGame({
      homeRosterSnapshot: homePlayers,
      awayRosterSnapshot: awayPlayers,
      homeCurrentLineupPlayerIds: homePlayers.map((player) => player._id),
      awayCurrentLineupPlayerIds: awayPlayers.map((player) => player._id),
      ...overrides,
    });
  }

  test('appendEventForUser returns the slim delta shape, not the full game-detail response', async () => {
    const game = buildSlimTestGame();
    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    const result = await appendEventForUser('user-1', 'game-1', {
      teamSide: 'home',
      playerId: 'home-snap-1',
      statType: STAT_TYPES.FG2_MADE,
    });

    // Present: what the tracker actually renders after a tracked stat.
    expect(result).toHaveProperty('game');
    expect(result).toHaveProperty('lineups');
    expect(result).toHaveProperty('boxScore');
    expect(result).toHaveProperty('gameSummary');
    expect(result).toHaveProperty('canEditCompletedGame');
    // Absent: recap/highlights/team context — unchanged per-event, and the
    // client's merge (`{...current, ...response}`) leaves the initial-load
    // values in place when these keys aren't present in the response.
    expect(result).not.toHaveProperty('recap');
    expect(result).not.toHaveProperty('highlights');
    expect(result).not.toHaveProperty('team');
    expect(result).not.toHaveProperty('opponentTeam');
    expect(result).not.toHaveProperty('participants');
    expect(result).not.toHaveProperty('league');
    expect(result).not.toHaveProperty('teamEntitlements');
    expect(result).not.toHaveProperty('aiSummary');
    expect(result).not.toHaveProperty('replayFilters');
  });

  test('appendEventForUser does not re-fetch the game a second time (no extra findGameById)', async () => {
    const game = buildSlimTestGame();
    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    await appendEventForUser('user-1', 'game-1', {
      teamSide: 'home',
      playerId: 'home-snap-1',
      statType: STAT_TYPES.FG2_MADE,
    });

    // getGameForUser used to re-run assertGameAccess (a second findGameById)
    // just to build the response from data already in memory post-save.
    expect(findGameById).toHaveBeenCalledTimes(1);
  });

  test('a concurrent write on a stale doc is rejected with 409, not silently clobbered', async () => {
    const game = buildSlimTestGame();
    findGameById.mockResolvedValue(game);
    const versionError = new Error('No matching document found');
    versionError.name = 'VersionError';
    saveGame.mockRejectedValue(versionError);

    await expect(
      appendEventForUser('user-1', 'game-1', {
        teamSide: 'home',
        playerId: 'home-snap-1',
        statType: STAT_TYPES.FG2_MADE,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('a non-version save error still propagates as-is', async () => {
    const game = buildSlimTestGame();
    findGameById.mockResolvedValue(game);
    saveGame.mockRejectedValue(new Error('disk full'));

    await expect(
      appendEventForUser('user-1', 'game-1', {
        teamSide: 'home',
        playerId: 'home-snap-1',
        statType: STAT_TYPES.FG2_MADE,
      })
    ).rejects.toThrow('disk full');
  });

  test('removeEventForUser returns the slim delta shape', async () => {
    const game = buildSlimTestGame({
      events: buildEvents([
        { _id: 'evt-1', teamSide: 'home', playerId: 'home-snap-1', statType: 'FG2_MADE' },
      ]),
    });
    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    const result = await removeEventForUser('user-1', 'game-1', 'evt-1');

    expect(result).toHaveProperty('boxScore');
    expect(result).toHaveProperty('gameSummary');
    expect(result).not.toHaveProperty('recap');
    expect(result).not.toHaveProperty('team');
  });

  test('updateEventForUser returns the slim delta shape', async () => {
    const game = buildSlimTestGame({
      events: buildEvents([
        { _id: 'evt-1', teamSide: 'home', playerId: 'home-snap-1', statType: 'FG2_MADE' },
      ]),
    });
    findGameById.mockResolvedValue(game);
    saveGame.mockResolvedValue(game);

    const result = await updateEventForUser('user-1', 'game-1', 'evt-1', {
      statType: 'FG3_MADE',
    });

    expect(result).toHaveProperty('boxScore');
    expect(result).toHaveProperty('gameSummary');
    expect(result).not.toHaveProperty('recap');
    expect(result).not.toHaveProperty('team');
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

describe('computeGameFinalScore (OPT-008)', () => {
  test('maps dual_team events to home/away points', () => {
    const game = {
      trackingMode: 'dual_team',
      events: [
        { teamSide: 'home', statType: STAT_TYPES.FG3_MADE },
        { teamSide: 'home', statType: STAT_TYPES.FT_MADE },
        { teamSide: 'away', statType: STAT_TYPES.FG2_MADE },
      ],
    };

    expect(computeGameFinalScore(game)).toEqual({ home: 4, away: 2 });
  });

  test('maps one_sided events to tracked (home) vs opponent (away)', () => {
    const game = {
      trackingMode: 'one_sided',
      events: [
        { statType: STAT_TYPES.FG2_MADE },
        { statType: STAT_TYPES.FG3_MADE },
        { statType: STAT_TYPES.OPP_FG2_MADE },
      ],
    };

    expect(computeGameFinalScore(game)).toEqual({ home: 5, away: 2 });
  });

  test('returns zeroes for a game with no events', () => {
    expect(computeGameFinalScore({ trackingMode: 'one_sided', events: [] })).toEqual({
      home: 0,
      away: 0,
    });
  });
});
