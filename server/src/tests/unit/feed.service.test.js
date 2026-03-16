jest.mock('../../modules/feed/feed.repository', () => ({
  createPost: jest.fn(),
  listPosts: jest.fn(),
  findPostById: jest.fn(),
  deletePostById: jest.fn(),
}));

jest.mock('../../modules/feed/cloudinary.client', () => ({
  uploadImageBuffer: jest.fn(),
  destroyImage: jest.fn(),
  isCloudinaryConfigured: jest.fn(() => true),
}));

jest.mock('../../modules/auth/auth.repository', () => ({
  findUserById: jest.fn(),
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

const { createPost, listPosts, findPostById } = require('../../modules/feed/feed.repository');
const { uploadImageBuffer } = require('../../modules/feed/cloudinary.client');
const { findUserById } = require('../../modules/auth/auth.repository');
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
      team: { id: 't1', name: 'TSW Blue', logo: { url: 'https://example.com/team-logo.png' } },
      recap: { team: { name: 'TSW Blue', points: 70 }, opponent: { name: 'Falcons' } },
    });
    getPublicTeam.mockRejectedValue(new Error('missing'));

    const result = await service.listFeedPosts('user-1', { limit: 20 });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe('post-2');
    expect(result.posts[0].gameCard.teamLogo).toEqual({
      url: 'https://example.com/team-logo.png',
    });
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
