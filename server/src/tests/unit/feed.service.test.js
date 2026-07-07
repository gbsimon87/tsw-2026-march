jest.mock('../../modules/feed/feed.repository', () => ({
  createPost: jest.fn(),
  listPosts: jest.fn(),
  findPostById: jest.fn(),
  deletePostById: jest.fn(),
  updatePostCardSnapshot: jest.fn(() => Promise.resolve()),
  listGameCardPostsByGameId: jest.fn(() => Promise.resolve([])),
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

jest.mock('../../modules/games/games.repository', () => ({
  findGameById: jest.fn(),
  listCompletedGames: jest.fn(),
}));

jest.mock('../../modules/games/games.service', () => ({
  getPublicGame: jest.fn(),
}));

jest.mock('../../modules/teams/teams.repository', () => ({
  findTeamById: jest.fn(),
  listTeams: jest.fn(),
}));

jest.mock('../../modules/teams/teams.service', () => ({
  getPublicPlayer: jest.fn(),
  getPublicTeam: jest.fn(),
}));

const {
  createPost,
  listPosts,
  findPostById,
  deletePostById,
  updatePostCardSnapshot,
  listGameCardPostsByGameId,
} = require('../../modules/feed/feed.repository');
const {
  uploadImageBuffer,
  uploadVideoBuffer,
  destroyImage,
  destroyVideo,
} = require('../../modules/feed/cloudinary.client');
const { findUserById, findUsersByIds } = require('../../modules/auth/auth.repository');
const { listCompletedGames } = require('../../modules/games/games.repository');
const { getPublicGame } = require('../../modules/games/games.service');
const { findTeamById, listTeams } = require('../../modules/teams/teams.repository');
const { getPublicTeam, getPublicPlayer } = require('../../modules/teams/teams.service');
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
      service.listShareableGames({}),
      service.listShareableTeams({}),
      service.listShareablePlayers({}),
    ]);

    expect(games).toHaveLength(1);
    expect(teams).toHaveLength(1);
    expect(players).toHaveLength(1);
  });
});
