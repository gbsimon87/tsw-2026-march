// Mux game video Task 3c — the video access policy (plan R1/R9; rulings P1–P4).
//
// Every decision function is driven through each reason/status. Repository
// reads and the games/leagues service helpers are mocked at their module
// boundaries (E2); the billing catalog and entitlement resolver are REAL, so
// "Starter grants replay" (R1) is asserted against the actual catalog rather
// than a stub.
const mockEnv = {};
const mockMux = { isMuxConfigured: jest.fn() };
const mockLeaguesRepository = {
  findLeagueVideoPolicyById: jest.fn(),
  findActiveLeagueManager: jest.fn(),
};
const mockTeamsRepository = { findTeamBillingStateById: jest.fn() };
const mockFeedRepository = { findLiveHighlightClipPost: jest.fn() };
const mockGamesService = { canAccessGame: jest.fn(), buildGameMarketing: jest.fn() };
const mockLeaguesService = { isLeaguePublic: jest.fn() };

jest.mock('../../config/env', () => ({ env: mockEnv }));
jest.mock('../../modules/video/mux.client', () => mockMux);
jest.mock('../../modules/leagues/leagues.repository', () => mockLeaguesRepository);
jest.mock('../../modules/teams/teams.repository', () => mockTeamsRepository);
jest.mock('../../modules/feed/feed.repository', () => mockFeedRepository);
jest.mock('../../modules/games/games.service', () => mockGamesService);
jest.mock('../../modules/leagues/leagues.service', () => mockLeaguesService);

const { ApiError } = require('../../utils/apiError');
const { entitlementsForPlan } = require('../../modules/billing/plan-catalog');
const policy = require('../../modules/video/video.policy');

const GAME_ID = '64b7f0c2a1b2c3d4e5f60718';
const LEAGUE_ID = '64b7f0c2a1b2c3d4e5f60719';
const OWNER_ID = '64b7f0c2a1b2c3d4e5f6071a';
const MANAGER_ID = '64b7f0c2a1b2c3d4e5f6071b';
const STRANGER_ID = '64b7f0c2a1b2c3d4e5f6071c';
const EVENT_ID = '64b7f0c2a1b2c3d4e5f6071d';
const OTHER_EVENT_ID = '64b7f0c2a1b2c3d4e5f6071e';
const PLAYER_ID = '64b7f0c2a1b2c3d4e5f6071f';
const ASSISTER_ID = '64b7f0c2a1b2c3d4e5f60720';
const LEGACY_SNAPSHOT_ID = '64b7f0c2a1b2c3d4e5f60721';
const HOME_LEAGUE_TEAM_ID = '64b7f0c2a1b2c3d4e5f60722';
const AWAY_LEAGUE_TEAM_ID = '64b7f0c2a1b2c3d4e5f60723';
const TEAM_ID = '64b7f0c2a1b2c3d4e5f60724';
const HOME_TEAM_ID = '64b7f0c2a1b2c3d4e5f60725';
const AWAY_TEAM_ID = '64b7f0c2a1b2c3d4e5f60726';
const POST_ID = '64b7f0c2a1b2c3d4e5f60727';
const NOW = new Date('2026-10-04T12:00:00.000Z');

function leagueGame(overrides = {}) {
  return {
    _id: GAME_ID,
    gameContext: 'league',
    leagueId: LEAGUE_ID,
    trackingMode: 'dual_team',
    status: 'completed',
    ownerUserId: OWNER_ID,
    homeLeagueTeamId: HOME_LEAGUE_TEAM_ID,
    awayLeagueTeamId: AWAY_LEAGUE_TEAM_ID,
    homeRosterSnapshot: [{ _id: PLAYER_ID, leaguePlayerId: PLAYER_ID, displayName: 'A' }],
    awayRosterSnapshot: [{ _id: ASSISTER_ID, leaguePlayerId: ASSISTER_ID, displayName: 'B' }],
    events: [{ _id: EVENT_ID, statType: 'FG2_MADE', playerId: PLAYER_ID, videoTimestamp: 42 }],
    ...overrides,
  };
}

function standaloneGame(overrides = {}) {
  return {
    _id: GAME_ID,
    gameContext: 'standalone',
    trackingMode: 'single_team',
    teamId: TEAM_ID,
    status: 'completed',
    ownerUserId: OWNER_ID,
    events: [{ _id: EVENT_ID, statType: 'FG2_MADE', playerId: PLAYER_ID, videoTimestamp: 42 }],
    ...overrides,
  };
}

function hosting(overrides = {}) {
  return {
    enabled: true,
    maxStoredMinutes: 600,
    maxConcurrentUploads: 2,
    maxCreatesPerDay: 5,
    publicClips: { status: 'granted' },
    ...overrides,
  };
}

function leagueDoc(overrides = {}) {
  return {
    _id: LEAGUE_ID,
    ownerUserId: OWNER_ID,
    name: 'Video League',
    status: 'active',
    isPublic: true,
    plan: 'league',
    billingSource: 'stripe',
    subscriptionStatus: 'active',
    social: { marketing: { status: 'granted' } },
    videoHosting: hosting(),
    ...overrides,
  };
}

function marketing(overrides = {}) {
  return {
    canFeature: true,
    reason: 'granted',
    restrictedPlayerIds: [],
    handles: {},
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  mockEnv.MUX_UPLOADS_ENABLED = true;
  mockEnv.MUX_PUBLIC_CLIPS_ENABLED = true;
  mockMux.isMuxConfigured.mockReturnValue(true);
  mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(leagueDoc());
  mockLeaguesRepository.findActiveLeagueManager.mockResolvedValue(null);
  mockTeamsRepository.findTeamBillingStateById.mockResolvedValue(null);
  mockFeedRepository.findLiveHighlightClipPost.mockResolvedValue({
    _id: POST_ID,
    highlightClip: { gameId: GAME_ID, eventId: EVENT_ID },
  });
  mockGamesService.canAccessGame.mockResolvedValue(false);
  mockGamesService.buildGameMarketing.mockResolvedValue(marketing());
  mockLeaguesService.isLeaguePublic.mockResolvedValue(true);
});

// ─── P1 upload allowance ─────────────────────────────────────────────────────

describe('resolveUploadAllowance (P1 conditions 1, 2, 4, 5)', () => {
  test('league owner on a granted league is allowed; resource = the League (P2); limits from the grant', async () => {
    const decision = await policy.resolveUploadAllowance({
      userId: OWNER_ID,
      game: leagueGame({ status: 'in_progress' }),
      now: NOW,
    });
    expect(decision).toEqual({
      allowed: true,
      reason: null,
      billingResource: { type: 'league', id: LEAGUE_ID },
      limits: { maxStoredMinutes: 600, maxConcurrentUploads: 2, maxCreatesPerDay: 5 },
    });
    expect(mockLeaguesRepository.findActiveLeagueManager).not.toHaveBeenCalled();
  });

  test('an active league manager is allowed', async () => {
    mockLeaguesRepository.findActiveLeagueManager.mockResolvedValue({ _id: 'm1' });
    const decision = await policy.resolveUploadAllowance({
      userId: MANAGER_ID,
      game: leagueGame(),
    });
    expect(decision.allowed).toBe(true);
    expect(mockLeaguesRepository.findActiveLeagueManager).toHaveBeenCalledWith(
      LEAGUE_ID,
      MANAGER_ID
    );
  });

  const denied = (reason) => ({ allowed: false, reason, billingResource: null, limits: null });

  test.each([
    [
      'Mux not configured',
      () => mockMux.isMuxConfigured.mockReturnValue(false),
      {},
      'hosting_disabled',
    ],
    [
      'MUX_UPLOADS_ENABLED false',
      () => {
        mockEnv.MUX_UPLOADS_ENABLED = false;
      },
      {},
      'hosting_disabled',
    ],
    [
      'MUX_UPLOADS_ENABLED unset',
      () => {
        delete mockEnv.MUX_UPLOADS_ENABLED;
      },
      {},
      'hosting_disabled',
    ],
    ['signed out', () => {}, { userId: null }, 'unauthenticated'],
    ['standalone game', () => {}, { game: standaloneGame() }, 'not_league_game'],
    [
      'league game without a leagueId',
      () => {},
      { game: leagueGame({ leagueId: null }) },
      'not_league_game',
    ],
    ['scheduled game', () => {}, { game: leagueGame({ status: 'scheduled' }) }, 'game_scheduled'],
    [
      'league missing',
      () => mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(null),
      {},
      'league_not_found',
    ],
    [
      'team manager / unrelated user (not owner, not active league manager)',
      () => {},
      { userId: STRANGER_ID },
      'not_league_manager',
    ],
    [
      'grant disabled',
      () =>
        mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
          leagueDoc({ videoHosting: hosting({ enabled: false }) })
        ),
      {},
      'league_not_granted',
    ],
    [
      'lean League with no videoHosting at all → closed',
      () =>
        mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
          leagueDoc({ videoHosting: undefined })
        ),
      {},
      'league_not_granted',
    ],
    [
      'grant enabled as a truthy non-boolean is not a grant',
      () =>
        mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
          leagueDoc({ videoHosting: hosting({ enabled: 'yes' }) })
        ),
      {},
      'league_not_granted',
    ],
  ])('%s → %s', async (_label, arrange, input, reason) => {
    arrange();
    const decision = await policy.resolveUploadAllowance({
      userId: OWNER_ID,
      game: leagueGame(),
      now: NOW,
      ...input,
    });
    expect(decision).toEqual(denied(reason));
  });

  test('checks are ordered cheapest first: env closed ⇒ no League read', async () => {
    mockEnv.MUX_UPLOADS_ENABLED = false;
    await policy.resolveUploadAllowance({ userId: OWNER_ID, game: leagueGame() });
    expect(mockLeaguesRepository.findLeagueVideoPolicyById).not.toHaveBeenCalled();
  });

  test('missing limit fields on a lean grant fall back to the schema defaults (0/1/3)', async () => {
    mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
      leagueDoc({ videoHosting: { enabled: true } })
    );
    const decision = await policy.resolveUploadAllowance({
      userId: OWNER_ID,
      game: leagueGame(),
    });
    expect(decision.limits).toEqual({
      maxStoredMinutes: 0,
      maxConcurrentUploads: 1,
      maxCreatesPerDay: 3,
    });
  });

  test('a repository failure is an infrastructure error and propagates', async () => {
    mockLeaguesRepository.findLeagueVideoPolicyById.mockRejectedValue(new Error('db down'));
    await expect(
      policy.resolveUploadAllowance({ userId: OWNER_ID, game: leagueGame() })
    ).rejects.toThrow('db down');
  });
});

// ─── Narrow billing read ─────────────────────────────────────────────────────

describe('resolveGameReplayEntitlement (narrow live billing read, R1)', () => {
  test('the real catalog: Starter grants replay', () => {
    expect(entitlementsForPlan('starter').canViewReplay).toBe(true);
  });

  test.each([
    ['active League subscription', leagueDoc(), true],
    // Inactive Stripe status falls back to Starter, which still grants replay.
    ['lapsed League (falls back to Starter)', leagueDoc({ subscriptionStatus: 'canceled' }), true],
    ['comp League', leagueDoc({ billingSource: 'comp', subscriptionStatus: 'inactive' }), true],
    ['League missing', null, false],
  ])('league game, %s → %s', async (_label, league, expected) => {
    mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(league);
    await expect(policy.resolveGameReplayEntitlement(leagueGame())).resolves.toBe(expected);
    expect(mockLeaguesRepository.findLeagueVideoPolicyById).toHaveBeenCalledWith(LEAGUE_ID);
    expect(mockTeamsRepository.findTeamBillingStateById).not.toHaveBeenCalled();
  });

  test('a preloaded League is used instead of a second read', async () => {
    await expect(
      policy.resolveGameReplayEntitlement(leagueGame(), { league: leagueDoc() })
    ).resolves.toBe(true);
    expect(mockLeaguesRepository.findLeagueVideoPolicyById).not.toHaveBeenCalled();
  });

  test('standalone single-team: reads that Team only', async () => {
    mockTeamsRepository.findTeamBillingStateById.mockResolvedValue({
      _id: TEAM_ID,
      plan: 'starter',
      subscriptionStatus: 'inactive',
      billingSource: 'stripe',
    });
    await expect(policy.resolveGameReplayEntitlement(standaloneGame())).resolves.toBe(true);
    expect(mockTeamsRepository.findTeamBillingStateById).toHaveBeenCalledTimes(1);
    expect(mockTeamsRepository.findTeamBillingStateById).toHaveBeenCalledWith(TEAM_ID);
    expect(mockLeaguesRepository.findLeagueVideoPolicyById).not.toHaveBeenCalled();
  });

  test('standalone with no surviving Team → false (fail closed)', async () => {
    await expect(policy.resolveGameReplayEntitlement(standaloneGame())).resolves.toBe(false);
  });

  test('standalone dual-team: either side granting is enough (one Team deleted)', async () => {
    mockTeamsRepository.findTeamBillingStateById.mockImplementation(async (id) =>
      id === AWAY_TEAM_ID ? { _id: AWAY_TEAM_ID, plan: 'team_extra' } : null
    );
    const game = standaloneGame({
      trackingMode: 'dual_team',
      teamId: null,
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
    });
    await expect(policy.resolveGameReplayEntitlement(game)).resolves.toBe(true);
    expect(mockTeamsRepository.findTeamBillingStateById.mock.calls.map(([id]) => id)).toEqual([
      HOME_TEAM_ID,
      AWAY_TEAM_ID,
    ]);
  });

  test('duplicate team ids are read once', async () => {
    mockTeamsRepository.findTeamBillingStateById.mockResolvedValue({ plan: 'starter' });
    const game = standaloneGame({ homeTeamId: TEAM_ID, awayTeamId: null });
    await policy.resolveGameReplayEntitlement(game);
    expect(mockTeamsRepository.findTeamBillingStateById).toHaveBeenCalledTimes(1);
  });

  test('no game → false', async () => {
    await expect(policy.resolveGameReplayEntitlement(null)).resolves.toBe(false);
  });
});

// ─── P3 full-game playback ───────────────────────────────────────────────────

describe('resolveFullGamePlaybackAccess (P3)', () => {
  test('anonymous → 401 without consulting the null-user access path', async () => {
    const decision = await policy.resolveFullGamePlaybackAccess({
      userId: null,
      game: leagueGame(),
    });
    expect(decision).toEqual({ allowed: false, status: 401, reason: 'unauthenticated' });
    expect(mockGamesService.canAccessGame).not.toHaveBeenCalled();
  });

  test('missing game → 404', async () => {
    const decision = await policy.resolveFullGamePlaybackAccess({ userId: OWNER_ID, game: null });
    expect(decision).toEqual({ allowed: false, status: 404, reason: 'game_not_found' });
  });

  test('unrelated authenticated viewer → 404', async () => {
    const decision = await policy.resolveFullGamePlaybackAccess({
      userId: STRANGER_ID,
      game: leagueGame(),
    });
    expect(decision).toEqual({ allowed: false, status: 404, reason: 'no_game_access' });
    expect(mockGamesService.canAccessGame).toHaveBeenCalledWith(STRANGER_ID, leagueGame());
    expect(mockLeaguesRepository.findLeagueVideoPolicyById).not.toHaveBeenCalled();
  });

  test('a 404 ApiError from the league lookup inside canAccessGame is a "no", not a throw', async () => {
    mockGamesService.canAccessGame.mockRejectedValue(new ApiError(404, 'League not found'));
    const decision = await policy.resolveFullGamePlaybackAccess({
      userId: MANAGER_ID,
      game: leagueGame(),
    });
    expect(decision).toEqual({ allowed: false, status: 404, reason: 'no_game_access' });
  });

  test('an infrastructure failure inside canAccessGame propagates', async () => {
    mockGamesService.canAccessGame.mockRejectedValue(new Error('db down'));
    await expect(
      policy.resolveFullGamePlaybackAccess({ userId: MANAGER_ID, game: leagueGame() })
    ).rejects.toThrow('db down');
  });

  test('manager with a live replay entitlement → allowed (real Starter catalog)', async () => {
    mockGamesService.canAccessGame.mockResolvedValue(true);
    mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
      leagueDoc({ plan: 'starter', subscriptionStatus: 'inactive' })
    );
    const decision = await policy.resolveFullGamePlaybackAccess({
      userId: MANAGER_ID,
      game: leagueGame(),
    });
    expect(decision).toEqual({ allowed: true, status: 200, reason: null });
  });

  test('standalone team owner with a Starter team → allowed', async () => {
    mockGamesService.canAccessGame.mockResolvedValue(true);
    mockTeamsRepository.findTeamBillingStateById.mockResolvedValue({ plan: 'starter' });
    const decision = await policy.resolveFullGamePlaybackAccess({
      userId: OWNER_ID,
      game: standaloneGame(),
    });
    expect(decision.allowed).toBe(true);
  });

  test('entitlement false → 403', async () => {
    mockGamesService.canAccessGame.mockResolvedValue(true);
    // No billing document survives, so the narrow read cannot grant replay.
    mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(null);
    const decision = await policy.resolveFullGamePlaybackAccess({
      userId: MANAGER_ID,
      game: leagueGame(),
    });
    expect(decision).toEqual({ allowed: false, status: 403, reason: 'replay_not_entitled' });
  });
});

// ─── P4 clip playback ────────────────────────────────────────────────────────

describe('resolveClipPlaybackAccess (P4)', () => {
  const clip = (input = {}) =>
    policy.resolveClipPlaybackAccess({
      userId: null,
      game: leagueGame(),
      eventId: EVENT_ID,
      now: NOW,
      ...input,
    });

  describe('manager path', () => {
    beforeEach(() => mockGamesService.canAccessGame.mockResolvedValue(true));

    test('canAccessGame → allowed as manager, no publication locks consulted', async () => {
      mockEnv.MUX_PUBLIC_CLIPS_ENABLED = false;
      mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
        leagueDoc({ isPublic: false, videoHosting: undefined })
      );
      const decision = await clip({
        userId: MANAGER_ID,
        game: leagueGame({ status: 'in_progress' }),
      });
      expect(decision).toEqual({ allowed: true, status: 200, reason: null, audience: 'manager' });
      expect(mockFeedRepository.findLiveHighlightClipPost).not.toHaveBeenCalled();
      expect(mockGamesService.buildGameMarketing).not.toHaveBeenCalled();
    });

    test('manager on a standalone game → allowed', async () => {
      const decision = await clip({ userId: OWNER_ID, game: standaloneGame() });
      expect(decision.audience).toBe('manager');
      expect(decision.allowed).toBe(true);
    });

    test('manager asking for an event that does not exist on the game → 404', async () => {
      const decision = await clip({ userId: MANAGER_ID, eventId: OTHER_EVENT_ID });
      expect(decision).toEqual({
        allowed: false,
        status: 404,
        reason: 'event_not_found',
        audience: null,
      });
    });
  });

  test('missing game → 401 signed out / 404 signed in', async () => {
    expect(await clip({ game: null })).toMatchObject({ status: 401, reason: 'game_not_found' });
    expect(await clip({ userId: STRANGER_ID, game: null })).toMatchObject({
      status: 404,
      reason: 'game_not_found',
    });
  });

  test('every lock satisfied → anonymous viewer gets a public clip', async () => {
    const decision = await clip();
    expect(decision).toEqual({ allowed: true, status: 200, reason: null, audience: 'public' });
    expect(mockGamesService.canAccessGame).not.toHaveBeenCalled();
    expect(mockFeedRepository.findLiveHighlightClipPost).toHaveBeenCalledWith({
      gameId: GAME_ID,
      eventId: EVENT_ID,
    });
    expect(mockLeaguesService.isLeaguePublic).toHaveBeenCalledWith(LEAGUE_ID);
    const [marketingGame, marketingContext] = mockGamesService.buildGameMarketing.mock.calls[0];
    expect(marketingGame._id).toBe(GAME_ID);
    expect(marketingContext.league).toEqual(leagueDoc());
  });

  test('every lock satisfied → unrelated signed-in viewer gets a public clip', async () => {
    const decision = await clip({ userId: STRANGER_ID });
    expect(decision).toEqual({ allowed: true, status: 200, reason: null, audience: 'public' });
  });

  test('an event id given as an ObjectId-like value still matches', async () => {
    const decision = await clip({ eventId: { toString: () => EVENT_ID } });
    expect(decision.allowed).toBe(true);
    expect(mockFeedRepository.findLiveHighlightClipPost).toHaveBeenCalledWith({
      gameId: GAME_ID,
      eventId: EVENT_ID,
    });
  });

  // Each lock missing, on its own. The client only ever sees 401/404; the
  // internal reason names the check that failed.
  test.each([
    ['event missing', () => ({ eventId: OTHER_EVENT_ID }), 'event_not_found'],
    [
      'MUX_PUBLIC_CLIPS_ENABLED false',
      () => {
        mockEnv.MUX_PUBLIC_CLIPS_ENABLED = false;
      },
      'public_clips_disabled',
    ],
    [
      'MUX_PUBLIC_CLIPS_ENABLED unset',
      () => {
        delete mockEnv.MUX_PUBLIC_CLIPS_ENABLED;
      },
      'public_clips_disabled',
    ],
    ['standalone game', () => ({ game: standaloneGame() }), 'not_league_game'],
    [
      'game in progress',
      () => ({ game: leagueGame({ status: 'in_progress' }) }),
      'game_not_completed',
    ],
    [
      'League missing',
      () => mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(null),
      'league_not_found',
    ],
    [
      'footage grant unrecorded',
      () =>
        mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
          leagueDoc({ videoHosting: hosting({ publicClips: { status: 'unrecorded' } }) })
        ),
      'publication_not_granted',
    ],
    [
      'footage grant withdrawn',
      () =>
        mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
          leagueDoc({ videoHosting: hosting({ publicClips: { status: 'withdrawn' } }) })
        ),
      'publication_not_granted',
    ],
    [
      'lean League with no videoHosting → closed',
      () =>
        mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
          leagueDoc({ videoHosting: undefined })
        ),
      'publication_not_granted',
    ],
    [
      'lean League with videoHosting but no publicClips → closed',
      () =>
        mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(
          leagueDoc({ videoHosting: { enabled: true } })
        ),
      'publication_not_granted',
    ],
    [
      'league turned private',
      () => mockLeaguesService.isLeaguePublic.mockResolvedValue(false),
      'league_not_public',
    ],
    [
      'share deleted (no live highlight_clip post for {gameId, eventId})',
      () => mockFeedRepository.findLiveHighlightClipPost.mockResolvedValue(null),
      'share_not_found',
    ],
    [
      'marketing canFeature false',
      () =>
        mockGamesService.buildGameMarketing.mockResolvedValue(
          marketing({ canFeature: false, reason: 'permission_declined' })
        ),
      'marketing_not_permitted',
    ],
    [
      'marketing block missing',
      () => mockGamesService.buildGameMarketing.mockResolvedValue(null),
      'marketing_not_permitted',
    ],
    [
      'restricted scorer',
      () =>
        mockGamesService.buildGameMarketing.mockResolvedValue(
          marketing({ restrictedPlayerIds: [PLAYER_ID] })
        ),
      'player_restricted',
    ],
    [
      'restricted related player (assist) — everyone filmed is covered',
      () => {
        mockGamesService.buildGameMarketing.mockResolvedValue(
          marketing({ restrictedPlayerIds: [ASSISTER_ID] })
        );
        return {
          game: leagueGame({
            events: [
              {
                _id: EVENT_ID,
                statType: 'FG2_MADE',
                playerId: PLAYER_ID,
                relatedPlayerId: ASSISTER_ID,
              },
            ],
          }),
        };
      },
      'player_restricted',
    ],
    [
      'restricted player on a legacy snapshot row (event id ≠ leaguePlayerId)',
      () => {
        mockGamesService.buildGameMarketing.mockResolvedValue(
          marketing({ restrictedPlayerIds: [PLAYER_ID] })
        );
        return {
          game: leagueGame({
            homeRosterSnapshot: [{ _id: LEGACY_SNAPSHOT_ID, leaguePlayerId: PLAYER_ID }],
            events: [{ _id: EVENT_ID, statType: 'FG2_MADE', playerId: LEGACY_SNAPSHOT_ID }],
          }),
        };
      },
      'player_restricted',
    ],
    [
      'event with no player cannot be cleared',
      () => ({ game: leagueGame({ events: [{ _id: EVENT_ID, statType: 'FG2_MADE' }] }) }),
      'player_unknown',
    ],
  ])('%s → denied (%s)', async (_label, arrange, reason) => {
    const input = arrange() || {};
    const signedOut = await clip(input);
    expect(signedOut).toEqual({ allowed: false, status: 401, reason, audience: null });

    const signedIn = await clip({ ...input, userId: STRANGER_ID });
    expect(signedIn).toEqual({ allowed: false, status: 404, reason, audience: null });
  });

  test('a 404 ApiError from canAccessGame falls through to the public path', async () => {
    mockGamesService.canAccessGame.mockRejectedValue(new ApiError(404, 'League not found'));
    const decision = await clip({ userId: STRANGER_ID });
    expect(decision.audience).toBe('public');
  });

  test('cheap locks short-circuit before the share lookup and marketing reads', async () => {
    mockEnv.MUX_PUBLIC_CLIPS_ENABLED = false;
    await clip();
    expect(mockLeaguesRepository.findLeagueVideoPolicyById).not.toHaveBeenCalled();
    expect(mockFeedRepository.findLiveHighlightClipPost).not.toHaveBeenCalled();
    expect(mockGamesService.buildGameMarketing).not.toHaveBeenCalled();
  });

  test('an infrastructure failure in the share lookup propagates', async () => {
    mockFeedRepository.findLiveHighlightClipPost.mockRejectedValue(new Error('db down'));
    await expect(clip()).rejects.toThrow('db down');
  });
});

// ─── P4 publication gate for T7 ──────────────────────────────────────────────

describe('canPublishMuxClips (P4 gate without the share lookup)', () => {
  test('every lock satisfied → allowed, carrying the restricted ids for per-event checks', async () => {
    mockGamesService.buildGameMarketing.mockResolvedValue(
      marketing({ restrictedPlayerIds: [ASSISTER_ID] })
    );
    const decision = await policy.canPublishMuxClips({ game: leagueGame(), now: NOW });
    expect(decision).toEqual({
      allowed: true,
      reason: null,
      restrictedPlayerIds: [ASSISTER_ID],
    });
    expect(mockFeedRepository.findLiveHighlightClipPost).not.toHaveBeenCalled();
  });

  test('a preloaded league is used instead of a read', async () => {
    const decision = await policy.canPublishMuxClips({ game: leagueGame(), league: leagueDoc() });
    expect(decision.allowed).toBe(true);
    expect(mockLeaguesRepository.findLeagueVideoPolicyById).not.toHaveBeenCalled();
  });

  test.each([
    [
      'env lock off',
      () => {
        mockEnv.MUX_PUBLIC_CLIPS_ENABLED = false;
      },
      'public_clips_disabled',
    ],
    ['no game', () => ({ game: null }), 'game_not_found'],
    ['standalone game', () => ({ game: standaloneGame() }), 'not_league_game'],
    ['scheduled', () => ({ game: leagueGame({ status: 'scheduled' }) }), 'game_not_completed'],
    [
      'League missing',
      () => mockLeaguesRepository.findLeagueVideoPolicyById.mockResolvedValue(null),
      'league_not_found',
    ],
    [
      'grant withdrawn',
      () => ({
        league: leagueDoc({ videoHosting: hosting({ publicClips: { status: 'withdrawn' } }) }),
      }),
      'publication_not_granted',
    ],
    [
      'no videoHosting',
      () => ({ league: leagueDoc({ videoHosting: null }) }),
      'publication_not_granted',
    ],
    [
      'league private',
      () => mockLeaguesService.isLeaguePublic.mockResolvedValue(false),
      'league_not_public',
    ],
    [
      'marketing blocked',
      () => mockGamesService.buildGameMarketing.mockResolvedValue(marketing({ canFeature: false })),
      'marketing_not_permitted',
    ],
  ])('%s → %s', async (_label, arrange, reason) => {
    const input = arrange() || {};
    const decision = await policy.canPublishMuxClips({ game: leagueGame(), ...input });
    expect(decision).toEqual({ allowed: false, reason, restrictedPlayerIds: [] });
  });
});

describe('isEventSubjectRestricted', () => {
  const game = leagueGame({
    homeRosterSnapshot: [{ _id: LEGACY_SNAPSHOT_ID, leaguePlayerId: PLAYER_ID }],
  });

  test.each([
    ['unrestricted scorer', { playerId: PLAYER_ID }, [], false],
    ['restricted scorer by id', { playerId: PLAYER_ID }, [PLAYER_ID], true],
    [
      'restricted scorer via snapshot leaguePlayerId',
      { playerId: LEGACY_SNAPSHOT_ID },
      [PLAYER_ID],
      true,
    ],
    [
      'restricted related player',
      { playerId: PLAYER_ID, relatedPlayerId: ASSISTER_ID },
      [ASSISTER_ID],
      true,
    ],
    ['no player at all (cannot be cleared)', {}, [], true],
    ['no event', null, [], true],
  ])('%s → %s', (_label, event, restricted, expected) => {
    expect(policy.isEventSubjectRestricted({ game, event, restrictedPlayerIds: restricted })).toBe(
      expected
    );
  });
});

describe('module shape', () => {
  test('exports the decision functions T4/T6/T7 consume', () => {
    expect(Object.keys(policy).sort()).toEqual(
      [
        'CLIP_ACCESS_REASONS',
        'FULL_GAME_ACCESS_REASONS',
        'UPLOAD_ALLOWANCE_REASONS',
        'canPublishMuxClips',
        'isEventSubjectRestricted',
        'resolveClipPlaybackAccess',
        'resolveFullGamePlaybackAccess',
        'resolveGameReplayEntitlement',
        'resolveUploadAllowance',
      ].sort()
    );
  });
});
