jest.mock('../../modules/feed/feed.repository', () => ({
  createPost: jest.fn(),
  listPosts: jest.fn(),
  findPostById: jest.fn(),
  deletePostById: jest.fn(),
  updatePostCardSnapshot: jest.fn(() => Promise.resolve()),
  listGameCardPostsByGameId: jest.fn(() => Promise.resolve([])),
  findAutoGameCardPost: jest.fn(() => Promise.resolve(null)),
  findPostByHighlightEventId: jest.fn(() => Promise.resolve(null)),
  findSharedEventIds: jest.fn(() => Promise.resolve([])),
  deleteAutoPostsForGameIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
}));

jest.mock('../../modules/feed/cloudinary.client', () => ({
  uploadImageBuffer: jest.fn(),
  destroyImage: jest.fn(() => Promise.resolve({ result: 'ok' })),
  uploadVideoBuffer: jest.fn(),
  destroyVideo: jest.fn(() => Promise.resolve({ result: 'ok' })),
  isCloudinaryConfigured: jest.fn(() => true),
}));

jest.mock('../../modules/auth/auth.repository', () => ({
  findUserById: jest.fn(),
  findUsersByIds: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/auth/auth.service', () => ({
  getSystemUserId: jest.fn(() => Promise.resolve('system-user-1')),
}));

jest.mock('../../modules/games/games.repository', () => ({
  findGameById: jest.fn(),
  listCompletedGames: jest.fn(),
  listLeagueGamesByLeagueId: jest.fn(() => Promise.resolve([])),
  listLeagueGameIdsByLeagueId: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/games/games.service', () => ({
  getPublicGame: jest.fn(),
  canAccessGame: jest.fn(),
  HIGHLIGHT_STAT_TYPES: new Set(['FG2_MADE', 'FG3_MADE', 'FT_MADE', 'AST', 'STL', 'BLK']),
}));

jest.mock('../../modules/teams/teams.repository', () => ({
  findTeamById: jest.fn(),
  listTeams: jest.fn(),
}));

jest.mock('../../modules/teams/teams.service', () => ({
  getPublicPlayer: jest.fn(),
  getPublicTeam: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(),
  findLeagueTeamById: jest.fn(),
  listLeagueTeams: jest.fn(() => Promise.resolve([])),
  listLeaguePlayers: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  listPublicLeagues: jest.fn(() => Promise.resolve({ leagues: [] })),
  isLeaguePublic: jest.fn(() => Promise.resolve(true)),
  getPublicLeagueTeamById: jest.fn(),
  getPublicLeaguePlayerById: jest.fn(),
}));

const {
  createPost,
  listPosts,
  findPostById,
  deletePostById,
  updatePostCardSnapshot,
  listGameCardPostsByGameId,
  findAutoGameCardPost,
  findSharedEventIds,
  deleteAutoPostsForGameIds,
} = require('../../modules/feed/feed.repository');
const {
  uploadImageBuffer,
  uploadVideoBuffer,
  destroyImage,
  destroyVideo,
} = require('../../modules/feed/cloudinary.client');
const { findUserById, findUsersByIds } = require('../../modules/auth/auth.repository');
const {
  findGameById,
  listCompletedGames,
  listLeagueGamesByLeagueId,
  listLeagueGameIdsByLeagueId,
} = require('../../modules/games/games.repository');
const { getPublicGame } = require('../../modules/games/games.service');
const { findTeamById, listTeams } = require('../../modules/teams/teams.repository');
const { getPublicTeam, getPublicPlayer } = require('../../modules/teams/teams.service');
const {
  findLeagueTeamById,
  listLeagueTeams,
  listLeaguePlayers,
} = require('../../modules/leagues/leagues.repository');
const {
  listPublicLeagues,
  isLeaguePublic,
  getPublicLeagueTeamById,
  getPublicLeaguePlayerById,
} = require('../../modules/leagues/leagues.service');
const { getSystemUserId } = require('../../modules/auth/auth.service');
const service = require('../../modules/feed/feed.service');

describe('feed service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects oversized image uploads', async () => {
    await expect(
      service.createImagePostForUser(
        'user-1',
        { size: 6 * 1024 * 1024, mimetype: 'image/jpeg', buffer: Buffer.from('x') },
        'hello'
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Image exceeds upload size limit',
    });
  });

  test('creates image post with cloudinary metadata', async () => {
    uploadImageBuffer.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/post.jpg',
      public_id: 'posts/demo',
      width: 1200,
      height: 800,
    });
    createPost.mockResolvedValue({
      _id: 'post-1',
      creatorUserId: 'user-1',
      type: 'image',
      caption: 'hello',
      image: {
        url: 'https://res.cloudinary.com/demo/image/upload/post.jpg',
        publicId: 'posts/demo',
        width: 1200,
        height: 800,
      },
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
    });
    findUserById.mockResolvedValue({ _id: 'user-1', name: 'Alex' });

    const result = await service.createImagePostForUser(
      'user-1',
      { size: 1024, mimetype: 'image/jpeg', buffer: Buffer.from('x') },
      'hello'
    );

    expect(uploadImageBuffer).toHaveBeenCalled();
    expect(result.type).toBe('image');
    expect(result.canDelete).toBe(true);
  });

  test('batches creator lookups with one $in instead of one findUserById per post (OPT-017)', async () => {
    listPosts.mockResolvedValue([
      {
        _id: 'post-1',
        creatorUserId: 'user-1',
        type: 'image',
        caption: null,
        image: { url: 'https://res.cloudinary.com/demo/image/upload/a.jpg' },
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
      },
      {
        _id: 'post-2',
        creatorUserId: 'user-2',
        type: 'image',
        caption: null,
        image: { url: 'https://res.cloudinary.com/demo/image/upload/b.jpg' },
        createdAt: new Date('2026-03-09T00:00:00.000Z'),
      },
    ]);
    findUsersByIds.mockResolvedValue([
      { _id: 'user-1', name: 'Alex' },
      { _id: 'user-2', name: 'Sam' },
    ]);

    const result = await service.listFeedPosts(null, { limit: 20 });

    expect(findUsersByIds).toHaveBeenCalledTimes(1);
    expect(findUsersByIds).toHaveBeenCalledWith(['user-1', 'user-2']);
    expect(findUserById).not.toHaveBeenCalled();
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].creator.name).toBe('Alex');
    expect(result.posts[1].creator.name).toBe('Sam');
  });

  test('serves a game card from its denormalised snapshot without re-resolving the game (OPT-017)', async () => {
    const snapshot = {
      gameId: 'g1',
      gameUrl: '/games/g1',
      teamId: 't1',
      teamName: 'TSW Blue',
      teamLogo: null,
      teamColors: [],
      opponent: 'Falcons',
    };
    listPosts.mockResolvedValue([
      {
        _id: 'post-1',
        creatorUserId: 'user-1',
        type: 'game_card',
        caption: null,
        gameCard: { gameId: 'g1', teamId: 't1', cardSnapshot: snapshot },
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
      },
    ]);
    findUsersByIds.mockResolvedValue([{ _id: 'user-1', name: 'Alex' }]);

    const result = await service.listFeedPosts(null, { limit: 20 });

    expect(getPublicGame).not.toHaveBeenCalled();
    expect(result.posts[0].gameCard).toEqual(snapshot);
  });

  test('resolves a game card live and persists the snapshot on a miss (OPT-017 self-backfill)', async () => {
    listPosts.mockResolvedValue([
      {
        _id: 'post-1',
        creatorUserId: 'user-1',
        type: 'game_card',
        caption: null,
        gameCard: { gameId: 'g1', teamId: 't1', cardSnapshot: null },
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
      },
    ]);
    findUsersByIds.mockResolvedValue([{ _id: 'user-1', name: 'Alex' }]);
    getPublicGame.mockResolvedValue({
      game: { id: 'g1', trackingMode: 'one_sided', opponent: 'Falcons' },
      team: { id: 't1', name: 'TSW Blue', logo: null, colors: [] },
    });
    updatePostCardSnapshot.mockResolvedValue({});

    const result = await service.listFeedPosts(null, { limit: 20 });

    expect(getPublicGame).toHaveBeenCalledWith('g1');
    expect(result.posts[0].gameCard).toMatchObject({
      gameId: 'g1',
      teamName: 'TSW Blue',
      opponent: 'Falcons',
    });
    // Persist is fire-and-forget — await the microtask queue so it runs.
    await new Promise((resolve) => setImmediate(resolve));
    expect(updatePostCardSnapshot).toHaveBeenCalledWith(
      'post-1',
      'gameCard',
      result.posts[0].gameCard
    );
  });

  test('creating a player card post snapshots the card at creation time (OPT-017)', async () => {
    const teamId = '507f1f77bcf86cd799439011';
    const playerId = '507f1f77bcf86cd799439012';
    getPublicPlayer.mockResolvedValue({
      team: { id: teamId, name: 'TSW Blue', colors: [], logo: null },
      player: { id: playerId, displayName: 'Alex', jerseyNumber: 4, image: null },
      summary: { gamesCount: 5, pointsPerGame: 10, reboundsPerGame: 3, assistsPerGame: 2 },
    });
    createPost.mockImplementation(async (input) => ({
      _id: 'post-1',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      ...input,
    }));
    findUserById.mockResolvedValue({ _id: 'user-1', name: 'Alex' });

    await service.createPlayerCardPostForUser('user-1', { teamId, playerId });

    const persistedPlayerCard = createPost.mock.calls[0][0].playerCard;
    expect(persistedPlayerCard.cardSnapshot).toMatchObject({
      teamName: 'TSW Blue',
      playerName: 'Alex',
      jerseyNumber: 4,
    });
  });

  test('refreshGameCardPostsForGame re-resolves every game card referencing that game (OPT-017)', async () => {
    listGameCardPostsByGameId.mockResolvedValue([
      { _id: 'post-1', gameCard: { gameId: 'g1', teamId: 't1', cardSnapshot: { stale: true } } },
      { _id: 'post-2', gameCard: { gameId: 'g1', teamId: 't1', cardSnapshot: { stale: true } } },
    ]);
    getPublicGame.mockResolvedValue({
      game: { id: 'g1', trackingMode: 'one_sided', opponent: 'Falcons' },
      team: { id: 't1', name: 'TSW Blue', logo: null, colors: [] },
    });
    updatePostCardSnapshot.mockResolvedValue({});

    await service.refreshGameCardPostsForGame('g1');

    expect(getPublicGame).toHaveBeenCalledTimes(2);
    expect(updatePostCardSnapshot).toHaveBeenCalledTimes(2);
    // Force re-resolve, not the (stale) stored snapshot.
    const [, , freshSnapshot] = updatePostCardSnapshot.mock.calls[0];
    expect(freshSnapshot.stale).toBeUndefined();
  });

  test('does not store a still-processing async eager video URL (OPT-009 regression)', async () => {
    // With eager_async, Cloudinary returns the derived URL with
    // status:'processing' — requesting it mid-transcode 423s, so it must not
    // be persisted as the playback URL.
    uploadVideoBuffer.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/video/upload/original.mov',
      public_id: 'tsw/feed/clip-1',
      resource_type: 'video',
      width: 1280,
      height: 720,
      duration: 12,
      eager: [
        {
          secure_url: 'https://res.cloudinary.com/demo/video/upload/eager-not-ready.mp4',
          status: 'processing',
          batch_id: 'batch-1',
        },
      ],
    });
    createPost.mockImplementation(async (input) => ({
      _id: 'post-v1',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      ...input,
    }));
    findUserById.mockResolvedValue({ _id: 'user-1', name: 'Alex' });

    await service.createVideoPostForUser(
      'user-1',
      { size: 1024, mimetype: 'video/mp4', buffer: Buffer.from('x') },
      null
    );

    const persistedVideo = createPost.mock.calls[0][0].video;
    expect(persistedVideo.url).not.toContain('eager-not-ready');
    // No CLOUDINARY_CLOUD_NAME in the test env, so the on-the-fly builder
    // falls back to the original upload URL.
    expect(persistedVideo.url).toBe('https://res.cloudinary.com/demo/video/upload/original.mov');
  });

  test('uses the eager video URL when the transcode is already complete', async () => {
    uploadVideoBuffer.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/video/upload/original.mov',
      public_id: 'tsw/feed/clip-2',
      resource_type: 'video',
      duration: 12,
      eager: [
        // Synchronous/completed eager entries carry no 'processing' status.
        { secure_url: 'https://res.cloudinary.com/demo/video/upload/eager-ready.mp4' },
      ],
    });
    createPost.mockImplementation(async (input) => ({
      _id: 'post-v2',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      ...input,
    }));
    findUserById.mockResolvedValue({ _id: 'user-1', name: 'Alex' });

    await service.createVideoPostForUser(
      'user-1',
      { size: 1024, mimetype: 'video/mp4', buffer: Buffer.from('x') },
      null
    );

    expect(createPost.mock.calls[0][0].video.url).toBe(
      'https://res.cloudinary.com/demo/video/upload/eager-ready.mp4'
    );
  });

  test('lists feed newest-first and skips broken references', async () => {
    listPosts.mockResolvedValue([
      {
        _id: 'post-2',
        creatorUserId: 'user-1',
        type: 'game_card',
        caption: null,
        gameCard: { gameId: 'g1', teamId: 't1' },
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
      },
      {
        _id: 'post-1',
        creatorUserId: 'user-2',
        type: 'team_card',
        caption: null,
        teamCard: { teamId: 'missing' },
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
      },
    ]);
    findUserById
      .mockResolvedValueOnce({ _id: 'user-1', name: 'Alex' })
      .mockResolvedValueOnce({ _id: 'user-2', name: 'Jordan' });
    getPublicGame.mockResolvedValue({
      game: { id: 'g1', opponent: 'Falcons' },
      team: {
        id: 't1',
        name: 'TSW Blue',
        logo: { url: 'https://example.com/team-logo.png' },
        colors: ['#112233', '#d4af37'],
      },
      recap: { team: { name: 'TSW Blue', points: 70 }, opponent: { name: 'Falcons' } },
    });
    getPublicTeam.mockRejectedValue(new Error('missing'));

    const result = await service.listFeedPosts('user-1', { limit: 20 });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe('post-2');
    expect(result.posts[0].gameCard.teamLogo).toEqual({
      url: 'https://example.com/team-logo.png',
    });
    expect(result.posts[0].gameCard.teamColors).toEqual(['#112233', '#d4af37']);
  });

  test('player cards include team logo fallback metadata', async () => {
    listPosts.mockResolvedValue([
      {
        _id: 'post-3',
        creatorUserId: 'user-1',
        type: 'player_card',
        caption: null,
        playerCard: { teamId: 't1', playerId: 'p1' },
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
      },
    ]);
    findUserById.mockResolvedValue({ _id: 'user-1', name: 'Alex' });
    getPublicPlayer.mockResolvedValue({
      team: {
        id: 't1',
        name: 'TSW Blue',
        logo: { url: 'https://example.com/team-logo.png', width: 128, height: 128 },
        colors: ['#112233', '#d4af37'],
      },
      player: {
        id: 'p1',
        displayName: 'Jordan',
        jerseyNumber: 23,
        image: null,
      },
      summary: {
        gamesCount: 10,
        pointsPerGame: 12,
        reboundsPerGame: 5,
        assistsPerGame: 4,
      },
    });

    const result = await service.listFeedPosts('user-1', { limit: 20 });

    expect(result.posts[0].playerCard.teamLogo).toEqual({
      url: 'https://example.com/team-logo.png',
      width: 128,
      height: 128,
    });
    expect(result.posts[0].playerCard.imageFallback).toBe('team_logo');
    expect(result.posts[0].playerCard.teamColors).toEqual(['#112233', '#d4af37']);
  });

  test('only allows creators to delete posts', async () => {
    findPostById.mockResolvedValue({
      _id: 'post-1',
      creatorUserId: 'owner-1',
    });

    await expect(service.deletePostForUser('other-user', 'post-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('awaits Cloudinary destroy when deleting an image post (OPT-009)', async () => {
    findPostById.mockResolvedValue({
      _id: 'post-1',
      creatorUserId: 'owner-1',
      type: 'image',
      image: { publicId: 'tsw/feed/pic-1' },
    });
    deletePostById.mockResolvedValue(undefined);
    destroyImage.mockResolvedValue({ result: 'ok' });

    const result = await service.deletePostForUser('owner-1', 'post-1');

    expect(deletePostById).toHaveBeenCalledWith('post-1');
    expect(destroyImage).toHaveBeenCalledWith('tsw/feed/pic-1');
    expect(result).toEqual({ deleted: true });
  });

  test('does not fail the delete when a video destroy errors (OPT-009)', async () => {
    findPostById.mockResolvedValue({
      _id: 'post-2',
      creatorUserId: 'owner-1',
      type: 'video',
      video: { publicId: 'tsw/feed/clip-1' },
    });
    deletePostById.mockResolvedValue(undefined);
    destroyVideo.mockRejectedValue(new Error('cloudinary down'));

    // The destroy failure is logged, not thrown — delete still succeeds.
    const result = await service.deletePostForUser('owner-1', 'post-2');

    expect(destroyVideo).toHaveBeenCalledWith('tsw/feed/clip-1');
    expect(result).toEqual({ deleted: true });
  });

  test('lists shareable entities', async () => {
    listCompletedGames.mockResolvedValue([
      {
        _id: 'g1',
        teamId: 't1',
        title: 'vs Falcons',
        opponent: 'Falcons',
        status: 'completed',
        scheduledAt: new Date('2026-03-12T00:00:00.000Z'),
        events: [],
      },
    ]);
    listTeams.mockResolvedValue([
      {
        _id: 't1',
        name: 'TSW Blue',
        players: [{ _id: 'p1', displayName: 'Alex', jerseyNumber: 12, isActive: true }],
      },
    ]);
    findTeamById.mockResolvedValue({ _id: 't1', name: 'TSW Blue' });

    const [games, teams, players] = await Promise.all([
      service.listShareableGames(null, {}),
      service.listShareableTeams(null, {}),
      service.listShareablePlayers(null, {}),
    ]);

    expect(games).toHaveLength(1);
    expect(teams).toHaveLength(1);
    expect(players).toHaveLength(1);
  });

  // TSW-004: buildGameCardSnapshot omitted `recap` entirely, so every card
  // that went through the persisted-snapshot path (as opposed to the live
  // getPublicGame() fallback) rendered 0-0 — FullScreenGameCard/GameCardPost
  // read every score field from gameCard.recap.*. buildGameCardSnapshot's
  // `payload` argument IS a getPublicGame() return value, which already
  // computes `recap` — the fix is copying it through, not recomputing it.
  describe('buildGameCardSnapshot (TSW-004)', () => {
    test('includes recap for a standalone (one-sided) game', () => {
      const payload = {
        game: { id: 'g1', trackingMode: 'one_sided', opponent: 'Falcons' },
        team: { id: 't1', name: 'TSW Blue', logo: null, colors: ['#123456'] },
        participants: null,
        recap: {
          statusLabel: 'Final',
          team: { id: 't1', name: 'TSW Blue', points: 58 },
          opponent: { name: 'Falcons', points: 51 },
          teamStats: { points: 58, reb: 30, ast: 12 },
        },
      };

      const snapshot = service.buildGameCardSnapshot(payload);

      expect(snapshot.recap).toBe(payload.recap);
      expect(snapshot.recap.team.points).toBe(58);
      expect(snapshot.recap.opponent.points).toBe(51);
      expect(snapshot.participants).toBeNull();
    });

    test('includes recap AND participants for a dual-team (league) game', () => {
      const payload = {
        game: { id: 'g2', trackingMode: 'dual_team', opponent: null },
        team: null,
        participants: {
          home: { displayName: 'Home Team', logo: null },
          away: { displayName: 'Away Team', logo: null },
        },
        recap: {
          statusLabel: 'Final',
          home: { name: 'Home Team', points: 64 },
          away: { name: 'Away Team', points: 59 },
        },
      };

      const snapshot = service.buildGameCardSnapshot(payload);

      expect(snapshot.recap).toBe(payload.recap);
      expect(snapshot.recap.home.points).toBe(64);
      expect(snapshot.recap.away.points).toBe(59);
      // Consumers (FullScreenGameCard/GameCardPost) detect dual-team mode via
      // `!!gameCard?.participants` — this was ALSO missing from the old
      // snapshot, so every cached dual-team card rendered as if it were
      // standalone (wrong recap branch) on top of the 0-0 bug.
      expect(snapshot.participants).toBe(payload.participants);
    });
  });

  describe('TSW-005 — league-scoped card support', () => {
    test('buildPlayerCardSnapshot normalises a league player payload', () => {
      const payload = {
        team: {
          id: '2e13ff6bcb41415413eaf71a',
          leagueId: '377fd569971eedeba8fbea28',
          name: 'Rockets',
          logo: null,
          colors: [],
        },
        player: {
          id: '73c99ccbbdad0ab009f59815',
          leagueTeamId: '2e13ff6bcb41415413eaf71a',
          displayName: 'Sam',
          jerseyNumber: 7,
          avatarUrl: 'https://example.com/sam.png',
        },
        summary: { gamesCount: 3, pointsPerGame: 12, reboundsPerGame: 4, assistsPerGame: 2 },
      };

      const snapshot = service.buildPlayerCardSnapshot(payload);

      expect(snapshot.teamId).toBeNull();
      expect(snapshot.leagueTeamId).toBe('2e13ff6bcb41415413eaf71a');
      expect(snapshot.playerId).toBeNull();
      expect(snapshot.leaguePlayerId).toBe('73c99ccbbdad0ab009f59815');
      expect(snapshot.playerImage).toBe('https://example.com/sam.png');
      expect(snapshot.playerUrl).toBeNull();
    });

    test('buildTeamCardSnapshot normalises a league team payload', () => {
      const payload = {
        team: {
          id: '2e13ff6bcb41415413eaf71a',
          leagueId: '377fd569971eedeba8fbea28',
          name: 'Rockets',
          logo: null,
          colors: [],
        },
        summary: { gamesCount: 5, points: 300, fg2: {}, fg3: {}, ft: {} },
      };

      const snapshot = service.buildTeamCardSnapshot(payload);

      expect(snapshot.teamId).toBeNull();
      expect(snapshot.leagueTeamId).toBe('2e13ff6bcb41415413eaf71a');
      expect(snapshot.teamUrl).toBeNull();
    });

    test('createGameCardPostForUser shares a league game for any user', async () => {
      findGameById.mockResolvedValue({
        _id: '0120a4f9196a5f9eb9f523f3',
        gameContext: 'league',
        leagueId: '377fd569971eedeba8fbea28',
        trackedLeagueTeamId: '2e13ff6bcb41415413eaf71a',
        status: 'completed',
        scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      createPost.mockResolvedValue({ _id: 'post-1', type: 'game_card', creatorUserId: 'user-1' });

      await service.createGameCardPostForUser('user-1', { gameId: '0120a4f9196a5f9eb9f523f3' });

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          gameCard: expect.objectContaining({
            gameId: '0120a4f9196a5f9eb9f523f3',
            leagueTeamId: '2e13ff6bcb41415413eaf71a',
          }),
        })
      );
    });

    test('createPlayerCardPostForUser shares a league player for any user', async () => {
      findLeagueTeamById.mockResolvedValue({
        _id: '2e13ff6bcb41415413eaf71a',
        leagueId: '377fd569971eedeba8fbea28',
      });
      getPublicLeaguePlayerById.mockResolvedValue({
        team: {
          id: '2e13ff6bcb41415413eaf71a',
          leagueId: '377fd569971eedeba8fbea28',
          name: 'Rockets',
          logo: null,
          colors: [],
        },
        player: {
          id: '73c99ccbbdad0ab009f59815',
          leagueTeamId: '2e13ff6bcb41415413eaf71a',
          displayName: 'Sam',
          jerseyNumber: 7,
        },
        summary: { gamesCount: 1, pointsPerGame: 10, reboundsPerGame: 2, assistsPerGame: 1 },
      });
      createPost.mockResolvedValue({ _id: 'post-1', type: 'player_card', creatorUserId: 'user-1' });

      await service.createPlayerCardPostForUser('user-1', {
        leagueTeamId: '2e13ff6bcb41415413eaf71a',
        leaguePlayerId: '73c99ccbbdad0ab009f59815',
      });

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          playerCard: expect.objectContaining({
            leagueTeamId: '2e13ff6bcb41415413eaf71a',
            leaguePlayerId: '73c99ccbbdad0ab009f59815',
          }),
        })
      );
    });

    test('createTeamCardPostForUser shares a league team for any user', async () => {
      findLeagueTeamById.mockResolvedValue({
        _id: '2e13ff6bcb41415413eaf71a',
        leagueId: '377fd569971eedeba8fbea28',
      });
      getPublicLeagueTeamById.mockResolvedValue({
        team: {
          id: '2e13ff6bcb41415413eaf71a',
          leagueId: '377fd569971eedeba8fbea28',
          name: 'Rockets',
          logo: null,
          colors: [],
        },
        summary: { gamesCount: 2, points: 100, fg2: {}, fg3: {}, ft: {} },
      });
      createPost.mockResolvedValue({ _id: 'post-1', type: 'team_card', creatorUserId: 'user-1' });

      await service.createTeamCardPostForUser('user-1', {
        leagueTeamId: '2e13ff6bcb41415413eaf71a',
      });

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          teamCard: expect.objectContaining({ leagueTeamId: '2e13ff6bcb41415413eaf71a' }),
        })
      );
    });

    test('standalone create paths are unaffected when no league fields are provided', async () => {
      createPost.mockResolvedValue({ _id: 'post-1', type: 'team_card', creatorUserId: 'user-1' });
      getPublicTeam.mockResolvedValue({
        team: { id: '83f1535f99ab0bf4e9d02dfd', name: 'TSW Blue', logo: null, colors: [] },
        summary: { gamesCount: 1, points: 50, fg2: {}, fg3: {}, ft: {} },
      });

      await service.createTeamCardPostForUser('user-1', { teamId: '83f1535f99ab0bf4e9d02dfd' });

      expect(getPublicLeagueTeamById).not.toHaveBeenCalled();
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          teamCard: expect.objectContaining({ teamId: '83f1535f99ab0bf4e9d02dfd' }),
        })
      );
    });

    test('listShareableGames additively includes a public league game', async () => {
      listCompletedGames.mockResolvedValue([]);
      listTeams.mockResolvedValue([]);
      listPublicLeagues.mockResolvedValue({
        leagues: [{ id: '377fd569971eedeba8fbea28', name: 'City League' }],
      });
      listLeagueGamesByLeagueId.mockResolvedValue([
        {
          _id: 'lg1',
          title: 'Rockets vs Bulls',
          status: 'completed',
          gameContext: 'league',
          homeLeagueTeamId: '2e13ff6bcb41415413eaf71a',
          awayLeagueTeamId: '532bb5a08a3223d8f3b7d927',
          scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      listLeagueTeams.mockResolvedValue([
        { _id: '2e13ff6bcb41415413eaf71a', name: 'Rockets' },
        { _id: '532bb5a08a3223d8f3b7d927', name: 'Bulls' },
      ]);

      const games = await service.listShareableGames('user-1', {});

      expect(games).toHaveLength(1);
      expect(games[0]).toMatchObject({ source: 'league', leagueId: '377fd569971eedeba8fbea28' });
    });

    test('listShareableGames/Teams/Players never surface a private league (listPublicLeagues is the sole gate)', async () => {
      // listPublicLeagues itself filters { isPublic: true, status: 'active' } at
      // the repository layer (leagues.repository.js) — a private league never
      // makes it into the `leagues` array these functions iterate, so it's
      // impossible for its games/teams/players to be queried at all.
      listCompletedGames.mockResolvedValue([]);
      listTeams.mockResolvedValue([]);
      listPublicLeagues.mockResolvedValue({ leagues: [] });

      const [games, teams, players] = await Promise.all([
        service.listShareableGames('user-1', {}),
        service.listShareableTeams('user-1', {}),
        service.listShareablePlayers('user-1', {}),
      ]);

      expect(games).toEqual([]);
      expect(teams).toEqual([]);
      expect(players).toEqual([]);
      expect(listLeagueGamesByLeagueId).not.toHaveBeenCalled();
      expect(listLeagueTeams).not.toHaveBeenCalled();
      expect(listLeaguePlayers).not.toHaveBeenCalled();
    });

    test('createGameCardPostForUser rejects sharing a game from a private (non-public) league', async () => {
      findGameById.mockResolvedValue({
        _id: '0120a4f9196a5f9eb9f523f3',
        gameContext: 'league',
        leagueId: '377fd569971eedeba8fbea28',
        status: 'completed',
        scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      isLeaguePublic.mockResolvedValue(false);

      await expect(
        service.createGameCardPostForUser('user-1', { gameId: '0120a4f9196a5f9eb9f523f3' })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(createPost).not.toHaveBeenCalled();
    });

    test('createPlayerCardPostForUser rejects sharing a player from a private (non-public) league', async () => {
      findLeagueTeamById.mockResolvedValue({
        _id: '2e13ff6bcb41415413eaf71a',
        leagueId: '377fd569971eedeba8fbea28',
      });
      isLeaguePublic.mockResolvedValue(false);

      await expect(
        service.createPlayerCardPostForUser('user-1', {
          leagueTeamId: '2e13ff6bcb41415413eaf71a',
          leaguePlayerId: '73c99ccbbdad0ab009f59815',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(createPost).not.toHaveBeenCalled();
    });

    test('createTeamCardPostForUser rejects sharing a team from a private (non-public) league', async () => {
      findLeagueTeamById.mockResolvedValue({
        _id: '2e13ff6bcb41415413eaf71a',
        leagueId: '377fd569971eedeba8fbea28',
      });
      isLeaguePublic.mockResolvedValue(false);

      await expect(
        service.createTeamCardPostForUser('user-1', { leagueTeamId: '2e13ff6bcb41415413eaf71a' })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(createPost).not.toHaveBeenCalled();
    });

    test('listShareableTeams additively includes a public league team', async () => {
      listTeams.mockResolvedValue([]);
      listPublicLeagues.mockResolvedValue({
        leagues: [{ id: '377fd569971eedeba8fbea28', name: 'City League' }],
      });
      listLeagueTeams.mockResolvedValue([
        { _id: '2e13ff6bcb41415413eaf71a', name: 'Rockets', status: 'active' },
      ]);

      const teams = await service.listShareableTeams('user-1', {});

      expect(teams).toHaveLength(1);
      expect(teams[0]).toMatchObject({
        source: 'league',
        leagueId: '377fd569971eedeba8fbea28',
        leagueTeamId: '2e13ff6bcb41415413eaf71a',
      });
    });

    test('listShareablePlayers additively includes a public league player', async () => {
      listTeams.mockResolvedValue([]);
      listPublicLeagues.mockResolvedValue({
        leagues: [{ id: '377fd569971eedeba8fbea28', name: 'City League' }],
      });
      listLeagueTeams.mockResolvedValue([{ _id: '2e13ff6bcb41415413eaf71a', name: 'Rockets' }]);
      listLeaguePlayers.mockResolvedValue([
        { _id: '73c99ccbbdad0ab009f59815', displayName: 'Sam', jerseyNumber: 7, isActive: true },
      ]);

      const players = await service.listShareablePlayers('user-1', {});

      expect(players).toHaveLength(1);
      expect(players[0]).toMatchObject({
        source: 'league',
        leaguePlayerId: '73c99ccbbdad0ab009f59815',
      });
    });

    test('listShareable* also surface public league entities for an unauthenticated caller', async () => {
      listCompletedGames.mockResolvedValue([]);
      listTeams.mockResolvedValue([]);
      listPublicLeagues.mockResolvedValue({ leagues: [] });

      const [games, teams, players] = await Promise.all([
        service.listShareableGames(null, {}),
        service.listShareableTeams(null, {}),
        service.listShareablePlayers(null, {}),
      ]);

      expect(games).toEqual([]);
      expect(teams).toEqual([]);
      expect(players).toEqual([]);
      expect(listPublicLeagues).toHaveBeenCalled();
    });
  });

  describe('autoPublishForFinalizedGame', () => {
    const publicLeagueGame = {
      _id: 'game-1',
      gameContext: 'league',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'league-team-1',
      status: 'completed',
      videoUrl: null,
      events: [],
    };

    test('publishes an auto game-card for a finalised public-league game', async () => {
      findGameById.mockResolvedValue({ ...publicLeagueGame });
      isLeaguePublic.mockResolvedValue(true);
      createPost.mockResolvedValue({ _id: 'post-1', type: 'game_card' });

      await service.autoPublishForFinalizedGame('game-1');

      expect(getSystemUserId).toHaveBeenCalled();
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorUserId: 'system-user-1',
          type: 'game_card',
          gameCard: expect.objectContaining({ gameId: 'game-1', auto: true }),
        })
      );
    });

    test('does nothing for a private league game', async () => {
      findGameById.mockResolvedValue({ ...publicLeagueGame });
      isLeaguePublic.mockResolvedValue(false);

      await service.autoPublishForFinalizedGame('game-1');

      expect(createPost).not.toHaveBeenCalled();
    });

    test('does nothing for a standalone game', async () => {
      findGameById.mockResolvedValue({
        ...publicLeagueGame,
        gameContext: 'standalone',
        leagueId: null,
      });

      await service.autoPublishForFinalizedGame('game-1');

      expect(isLeaguePublic).not.toHaveBeenCalled();
      expect(createPost).not.toHaveBeenCalled();
    });

    test('does nothing for a game that is not completed', async () => {
      findGameById.mockResolvedValue({ ...publicLeagueGame, status: 'in_progress' });

      await service.autoPublishForFinalizedGame('game-1');

      expect(createPost).not.toHaveBeenCalled();
    });

    test('does nothing when the game cannot be found', async () => {
      findGameById.mockResolvedValue(null);

      await service.autoPublishForFinalizedGame('missing-game');

      expect(createPost).not.toHaveBeenCalled();
    });
  });

  describe('autoCreateGameCardPost (idempotency)', () => {
    const game = { _id: 'game-1', gameContext: 'league', trackedLeagueTeamId: 'league-team-1' };

    test('does not create a second auto card if one already exists', async () => {
      findAutoGameCardPost.mockResolvedValue({ _id: 'existing-post' });

      const result = await service.autoCreateGameCardPost('system-user-1', game);

      expect(createPost).not.toHaveBeenCalled();
      expect(result).toEqual({ _id: 'existing-post' });
    });

    test('treats a concurrent duplicate-key error as a no-op, not a failure', async () => {
      findAutoGameCardPost
        .mockResolvedValueOnce(null) // first check: no existing auto card
        .mockResolvedValueOnce({ _id: 'winner-post' }); // re-fetch after E11000
      const duplicateKeyError = Object.assign(new Error('duplicate key'), { code: 11000 });
      createPost.mockRejectedValue(duplicateKeyError);

      const result = await service.autoCreateGameCardPost('system-user-1', game);

      expect(result).toEqual({ _id: 'winner-post' });
    });

    test('rethrows non-duplicate-key errors', async () => {
      findAutoGameCardPost.mockResolvedValue(null);
      createPost.mockRejectedValue(new Error('mongo is down'));

      await expect(service.autoCreateGameCardPost('system-user-1', game)).rejects.toThrow(
        'mongo is down'
      );
    });
  });

  // PERF-002 (docs/performance-investigation): game_card creation must persist
  // a cardSnapshot like player/team cards already do, so the feed read path
  // never pays the full getPublicGame pipeline per card on first render. Uses
  // the exact buildGameCardSnapshot key set (TSW-004 lesson: assert the shape,
  // not just presence).
  describe('game_card snapshot at creation (PERF-002)', () => {
    const publicGamePayload = {
      game: { id: '0120a4f9196a5f9eb9f523f3', trackingMode: 'one_sided', opponent: 'Falcons' },
      team: { id: 't1', name: 'TSW Blue', logo: null, colors: [] },
      participants: null,
      recap: { statusLabel: 'Final', team: { points: 58 }, opponent: { points: 51 } },
    };

    test('createGameCardPostForUser persists cardSnapshot with the live-path key set', async () => {
      findGameById.mockResolvedValue({
        _id: '0120a4f9196a5f9eb9f523f3',
        gameContext: 'league',
        leagueId: '377fd569971eedeba8fbea28',
        trackedLeagueTeamId: '2e13ff6bcb41415413eaf71a',
        status: 'completed',
        scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      isLeaguePublic.mockResolvedValue(true);
      getPublicGame.mockResolvedValue(publicGamePayload);
      createPost.mockResolvedValue({ _id: 'post-1', type: 'game_card', creatorUserId: 'user-1' });

      await service.createGameCardPostForUser('user-1', { gameId: '0120a4f9196a5f9eb9f523f3' });

      const created = createPost.mock.calls[0][0];
      expect(Object.keys(created.gameCard.cardSnapshot).sort()).toEqual(
        Object.keys(service.buildGameCardSnapshot(publicGamePayload)).sort()
      );
    });

    test('autoCreateGameCardPost persists cardSnapshot too', async () => {
      findAutoGameCardPost.mockResolvedValue(null);
      getPublicGame.mockResolvedValue(publicGamePayload);
      createPost.mockResolvedValue({ _id: 'post-1' });

      await service.autoCreateGameCardPost('system-user-1', {
        _id: '0120a4f9196a5f9eb9f523f3',
        gameContext: 'league',
        trackedLeagueTeamId: '2e13ff6bcb41415413eaf71a',
      });

      expect(createPost.mock.calls[0][0].gameCard.cardSnapshot).toEqual(
        service.buildGameCardSnapshot(publicGamePayload)
      );
    });

    test('a snapshot-resolve failure still creates the post (snapshot null)', async () => {
      findGameById.mockResolvedValue({
        _id: '0120a4f9196a5f9eb9f523f3',
        gameContext: 'league',
        leagueId: '377fd569971eedeba8fbea28',
        trackedLeagueTeamId: '2e13ff6bcb41415413eaf71a',
        status: 'completed',
        scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      isLeaguePublic.mockResolvedValue(true);
      getPublicGame.mockRejectedValue(new Error('resolve failed'));
      createPost.mockResolvedValue({ _id: 'post-1', type: 'game_card', creatorUserId: 'user-1' });

      await service.createGameCardPostForUser('user-1', { gameId: '0120a4f9196a5f9eb9f523f3' });

      expect(createPost.mock.calls[0][0].gameCard.cardSnapshot).toBeNull();
    });
  });

  describe('autoCreateHighlightClipPosts', () => {
    function makeEvent(overrides) {
      return {
        _id: 'event-1',
        statType: 'FG3_MADE',
        videoTimestamp: 42,
        playerId: null,
        ...overrides,
      };
    }

    test('returns zero counts when the game has no linked video', async () => {
      const game = { _id: 'game-1', videoUrl: null, events: [makeEvent({})] };

      const result = await service.autoCreateHighlightClipPosts('system-user-1', game);

      expect(result).toEqual({ created: 0, skipped: 0, capped: false });
      expect(createPost).not.toHaveBeenCalled();
    });

    test('creates a highlight_clip for each eligible, unshared event', async () => {
      const game = {
        _id: 'game-1',
        videoUrl: 'https://youtube.com/watch?v=abc123',
        title: 'Big Game',
        events: [
          makeEvent({ _id: 'e1', statType: 'FG3_MADE', videoTimestamp: 10 }),
          makeEvent({ _id: 'e2', statType: 'AST', videoTimestamp: 20 }),
          makeEvent({ _id: 'e3', statType: 'TOV', videoTimestamp: 30 }), // ineligible statType
          makeEvent({ _id: 'e4', statType: 'FG2_MADE', videoTimestamp: null }), // no timestamp
        ],
      };
      findSharedEventIds.mockResolvedValue([]);
      createPost.mockResolvedValue({ _id: 'clip-post' });

      const result = await service.autoCreateHighlightClipPosts('system-user-1', game);

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.capped).toBe(false);
      expect(createPost).toHaveBeenCalledTimes(2);
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorUserId: 'system-user-1',
          type: 'highlight_clip',
          highlightClip: expect.objectContaining({ gameId: 'game-1', eventId: 'e1' }),
        })
      );
    });

    test('skips events already shared (manually or by a prior auto run)', async () => {
      const game = {
        _id: 'game-1',
        videoUrl: 'https://youtube.com/watch?v=abc123',
        events: [
          makeEvent({ _id: 'e1', statType: 'FG3_MADE', videoTimestamp: 10 }),
          makeEvent({ _id: 'e2', statType: 'AST', videoTimestamp: 20 }),
        ],
      };
      findSharedEventIds.mockResolvedValue(['e1']);
      createPost.mockResolvedValue({ _id: 'clip-post' });

      const result = await service.autoCreateHighlightClipPosts('system-user-1', game);

      expect(result.created).toBe(1);
      expect(createPost).toHaveBeenCalledTimes(1);
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightClip: expect.objectContaining({ eventId: 'e2' }),
        })
      );
    });

    test('caps highlight generation per game and reports the cap', async () => {
      const events = Array.from({ length: 8 }, (_, i) =>
        makeEvent({ _id: `e${i}`, statType: 'FG3_MADE', videoTimestamp: i })
      );
      const game = { _id: 'game-1', videoUrl: 'https://youtube.com/watch?v=abc123', events };
      findSharedEventIds.mockResolvedValue([]);
      createPost.mockResolvedValue({ _id: 'clip-post' });

      const result = await service.autoCreateHighlightClipPosts('system-user-1', game);

      expect(result.created).toBe(5);
      expect(result.capped).toBe(true);
      expect(createPost).toHaveBeenCalledTimes(5);
    });

    test('treats a concurrent duplicate-key error per event as a skip, not a failure', async () => {
      const game = {
        _id: 'game-1',
        videoUrl: 'https://youtube.com/watch?v=abc123',
        events: [
          makeEvent({ _id: 'e1', statType: 'FG3_MADE', videoTimestamp: 10 }),
          makeEvent({ _id: 'e2', statType: 'AST', videoTimestamp: 20 }),
        ],
      };
      findSharedEventIds.mockResolvedValue([]);
      const duplicateKeyError = Object.assign(new Error('duplicate key'), { code: 11000 });
      createPost.mockRejectedValueOnce(duplicateKeyError).mockResolvedValueOnce({ _id: 'clip-2' });

      const result = await service.autoCreateHighlightClipPosts('system-user-1', game);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  describe('reverseAutoPostsForLeague (B2 — league goes private)', () => {
    test('deletes auto posts for every game in the league', async () => {
      listLeagueGameIdsByLeagueId.mockResolvedValue(['game-1', 'game-2']);
      deleteAutoPostsForGameIds.mockResolvedValue({ deletedCount: 3 });

      const result = await service.reverseAutoPostsForLeague('league-1');

      expect(getSystemUserId).toHaveBeenCalled();
      expect(deleteAutoPostsForGameIds).toHaveBeenCalledWith(['game-1', 'game-2'], 'system-user-1');
      expect(result).toEqual({ deletedCount: 3 });
    });

    test('is a no-op when the league has no games', async () => {
      listLeagueGameIdsByLeagueId.mockResolvedValue([]);

      const result = await service.reverseAutoPostsForLeague('league-1');

      expect(deleteAutoPostsForGameIds).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });
  });

  describe('listDiscoverablePlayers', () => {
    test('includes claimedByUserId on league-sourced results, null when unclaimed', async () => {
      listPublicLeagues.mockResolvedValue({
        leagues: [{ id: 'league-1', slug: 'city-league', name: 'City League' }],
      });
      listTeams.mockResolvedValue([]);
      listLeagueTeams.mockResolvedValue([
        { _id: 'team-1', slug: 'hawks', name: 'Hawks', status: 'active' },
      ]);
      listLeaguePlayers.mockResolvedValue([
        {
          _id: 'lp-1',
          displayName: 'Jamie Rivera',
          jerseyNumber: 7,
          position: 'PG',
          isActive: true,
          claimedByUserId: 'user-1',
        },
        {
          _id: 'lp-2',
          displayName: 'Alex Chen',
          jerseyNumber: 9,
          position: 'SG',
          isActive: true,
          claimedByUserId: null,
        },
      ]);

      const results = await service.listDiscoverablePlayers({});

      const claimed = results.find((r) => r.id === 'lp-1');
      const unclaimed = results.find((r) => r.id === 'lp-2');
      expect(claimed.claimedByUserId).toBe('user-1');
      expect(unclaimed.claimedByUserId).toBeNull();
    });
  });
});
