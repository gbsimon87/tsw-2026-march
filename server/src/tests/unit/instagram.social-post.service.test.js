const mockCloudinary = {
  destroyImage: jest.fn(),
  isCloudinaryConfigured: jest.fn(),
  uploadImageBuffer: jest.fn(),
};
const mockEnv = { FEED_IMAGE_MAX_BYTES: 5_000_000, INSTAGRAM_PUBLISHING_ENABLED: false };
const mockFeedRepository = { findPostById: jest.fn() };
const mockConnectionRepository = { findConnection: jest.fn() };
const mockRepository = {
  approveSocialPost: jest.fn(),
  cancelSocialPost: jest.fn(),
  createSocialPost: jest.fn(),
  findSocialPostById: jest.fn(),
  listSocialPosts: jest.fn(),
  markReadyForReview: jest.fn(),
  queueSocialPost: jest.fn(),
};

jest.mock('../../config/env', () => ({ env: mockEnv }));
jest.mock('../../modules/feed/cloudinary.client', () => mockCloudinary);
jest.mock('../../modules/feed/feed.repository', () => mockFeedRepository);
jest.mock('../../modules/social/instagram/instagram.repository', () => mockConnectionRepository);
jest.mock('../../modules/social/instagram/instagram.social-post.repository', () => mockRepository);

const service = require('../../modules/social/instagram/instagram.social-post.service');

const file = { size: 1000, mimetype: 'image/png', buffer: Buffer.from('image') };
const input = {
  sourcePostId: '507f1f77bcf86cd799439011',
  caption: 'Demo final score. #TSW',
  attributionUrl: 'https://dev.thesportyway.com/games/demo',
  contentDeclaration: 'demo',
  rightsConfirmed: 'true',
};

function storedPost(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    platform: 'instagram',
    connectionId: '507f1f77bcf86cd799439012',
    source: {
      kind: 'game_card',
      postId: input.sourcePostId,
      snapshot: { teamName: 'Demo Lions' },
    },
    asset: {
      type: 'image',
      url: 'https://res.cloudinary.com/tsw/image/upload/game.png',
      publicId: 'tsw/feed/game',
      sha256: 'c'.repeat(64),
      mimeType: 'image/png',
      width: 2160,
      height: 2700,
    },
    caption: input.caption,
    attributionUrl: input.attributionUrl,
    contentDeclaration: 'demo',
    contentDigest: 'a'.repeat(64),
    status: 'draft',
    rightsConfirmedAt: new Date('2026-09-04T12:00:00.000Z'),
    createdAt: new Date('2026-09-04T12:00:00.000Z'),
    updatedAt: new Date('2026-09-04T12:00:00.000Z'),
    ...overrides,
  };
}

describe('Instagram social-post service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.INSTAGRAM_PUBLISHING_ENABLED = false;
    mockCloudinary.isCloudinaryConfigured.mockReturnValue(true);
    mockCloudinary.destroyImage.mockResolvedValue({});
    mockConnectionRepository.findConnection.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      status: 'connected',
    });
    mockFeedRepository.findPostById.mockResolvedValue({
      _id: input.sourcePostId,
      type: 'game_card',
      gameCard: { cardSnapshot: { teamName: 'Demo Lions' } },
    });
    mockCloudinary.uploadImageBuffer.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/tsw/image/upload/game.png',
      public_id: 'tsw/feed/game',
      width: 2160,
      height: 2700,
    });
    mockRepository.createSocialPost.mockImplementation(async (value) =>
      storedPost({
        ...value,
        _id: '507f1f77bcf86cd799439099',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  test('uploads and records an audited demo game-card draft', async () => {
    const result = await service.createDraft({ userId: 'operator-1', input, file });

    // Social exports must not land in the shared feed folder: retention, audit
    // and deletion all need to reach them without touching user feed images.
    expect(mockCloudinary.uploadImageBuffer).toHaveBeenCalledWith(file, {
      folder: expect.stringMatching(/\/social\/instagram$/),
      publicId: expect.any(String),
      tags: expect.arrayContaining(['tsw-social', 'tsw-social-instagram']),
    });
    const created = mockRepository.createSocialPost.mock.calls[0][0];
    expect(created).toMatchObject({
      status: 'draft',
      contentDeclaration: 'demo',
      createdByUserId: 'operator-1',
      rightsConfirmedByUserId: 'operator-1',
      source: { kind: 'game_card', postId: input.sourcePostId },
      asset: { width: 2160, height: 2700 },
    });
    expect(created.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(created.asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.idempotencyKey).toBeTruthy();
    expect(result.asset.url).toContain('res.cloudinary.com');
    expect(JSON.stringify(result)).not.toContain('publicId');
    expect(JSON.stringify(result)).not.toContain('sha256');
    expect(JSON.stringify(result)).not.toContain('idempotencyKey');
  });

  test('rejects a source that is not an available game card before uploading', async () => {
    mockFeedRepository.findPostById.mockResolvedValue({ _id: input.sourcePostId, type: 'image' });

    await expect(service.createDraft({ userId: 'operator-1', input, file })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockCloudinary.uploadImageBuffer).not.toHaveBeenCalled();
  });

  test('removes an uploaded asset when its aspect ratio is not 4:5', async () => {
    mockCloudinary.uploadImageBuffer.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/tsw/image/upload/wide.png',
      public_id: 'tsw/feed/wide',
      width: 1920,
      height: 1080,
    });

    await expect(service.createDraft({ userId: 'operator-1', input, file })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockCloudinary.destroyImage).toHaveBeenCalledWith('tsw/feed/wide');
    expect(mockRepository.createSocialPost).not.toHaveBeenCalled();
  });

  test('approves only the content digest that was ready for review', async () => {
    const ready = storedPost({ status: 'ready_for_review', contentDigest: 'b'.repeat(64) });
    mockRepository.findSocialPostById.mockResolvedValue(ready);
    mockRepository.approveSocialPost.mockResolvedValue(
      storedPost({
        status: 'approved',
        contentDigest: ready.contentDigest,
        approvedContentDigest: ready.contentDigest,
      })
    );

    await service.approveSocialPost({ postId: String(ready._id), userId: 'operator-1' });

    expect(mockRepository.approveSocialPost).toHaveBeenCalledWith({
      postId: String(ready._id),
      userId: 'operator-1',
      contentDigest: ready.contentDigest,
    });
  });

  test('queues only an approved post when delivery is explicitly enabled', async () => {
    const approved = storedPost({
      status: 'approved',
      approvedContentDigest: 'a'.repeat(64),
    });
    mockEnv.INSTAGRAM_PUBLISHING_ENABLED = true;
    mockRepository.queueSocialPost.mockResolvedValue({ ...approved, status: 'queued' });

    const result = await service.queueSocialPost({
      postId: String(approved._id),
      userId: 'operator-1',
    });

    expect(mockRepository.queueSocialPost).toHaveBeenCalledWith({
      postId: String(approved._id),
      userId: 'operator-1',
    });
    expect(result.status).toBe('queued');
  });

  test('does not queue a post while delivery is disabled', async () => {
    await expect(
      service.queueSocialPost({ postId: '507f1f77bcf86cd799439099', userId: 'operator-1' })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(mockRepository.queueSocialPost).not.toHaveBeenCalled();
  });

  describe('cancellation and the stored asset', () => {
    function cancellable(status) {
      mockRepository.findSocialPostById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439099',
        status,
        asset: { publicId: 'tsw/feed/dev/social/instagram/game' },
      });
      mockRepository.cancelSocialPost.mockResolvedValue(
        storedPost({ _id: '507f1f77bcf86cd799439099', status: 'cancelled' })
      );
    }

    test.each(['draft', 'ready_for_review', 'approved'])(
      'destroys the asset when cancelling from %s',
      async (status) => {
        cancellable(status);

        await service.cancelSocialPost({ postId: '507f1f77bcf86cd799439099', userId: 'op-1' });

        expect(mockCloudinary.destroyImage).toHaveBeenCalledWith(
          'tsw/feed/dev/social/instagram/game'
        );
      }
    );

    test.each(['queued', 'failed'])(
      'keeps the asset when cancelling from %s, which may still be referenced',
      async (status) => {
        cancellable(status);

        await service.cancelSocialPost({ postId: '507f1f77bcf86cd799439099', userId: 'op-1' });

        // A container at Meta can already point at this URL, and reconciliation
        // needs it to resolve the outcome.
        expect(mockCloudinary.destroyImage).not.toHaveBeenCalled();
      }
    );

    test('still reports the cancellation when deleting the asset fails', async () => {
      cancellable('draft');
      mockCloudinary.destroyImage.mockRejectedValue(new Error('cloudinary down'));

      const result = await service.cancelSocialPost({
        postId: '507f1f77bcf86cd799439099',
        userId: 'op-1',
      });

      expect(result.status).toBe('cancelled');
    });
  });

  describe('naming the stored asset', () => {
    async function uploadOptionsFor(cardSnapshot) {
      mockFeedRepository.findPostById.mockResolvedValue({
        _id: input.sourcePostId,
        type: 'game_card',
        gameCard: { cardSnapshot },
      });
      await service.createDraft({ userId: 'operator-1', input, file });
      return mockCloudinary.uploadImageBuffer.mock.calls.at(-1)[1];
    }

    test('names a one-off game after both sides and the date it was played', async () => {
      const { publicId } = await uploadOptionsFor({
        gameId: '507f1f77bcf86cd799439aaa',
        teamName: 'Portland Trailblazers',
        opponent: 'Wildcats',
        recap: { playedAt: '2026-09-05T18:30:00.000Z' },
      });

      expect(publicId).toMatch(/^portland-trailblazers-vs-wildcats-2026-09-05-[a-z0-9]+$/);
    });

    test('reads both sides from participants on a dual-team card', async () => {
      // teamName is already "Home vs Away" on these, so using it would produce
      // a doubled-up name.
      const { publicId } = await uploadOptionsFor({
        gameId: '507f1f77bcf86cd799439aaa',
        teamName: 'Lions vs Bears',
        opponent: null,
        participants: { home: { displayName: 'Lions' }, away: { displayName: 'Bears' } },
        recap: { playedAt: '2026-09-05T18:30:00.000Z' },
      });

      expect(publicId).toMatch(/^lions-vs-bears-2026-09-05-/);
    });

    test('keeps a club name with punctuation and accents URL-safe', async () => {
      const { publicId } = await uploadOptionsFor({
        gameId: '507f1f77bcf86cd799439aaa',
        teamName: "Málaga B.C. (U18's)",
        opponent: 'Wildcats',
        recap: { playedAt: '2026-09-05T18:30:00.000Z' },
      });

      expect(publicId).toMatch(/^malaga-b-c-u18-s-vs-wildcats-/);
      expect(publicId).not.toMatch(/[^a-z0-9-]/);
    });

    test('falls back rather than producing a nameless asset', async () => {
      const { publicId } = await uploadOptionsFor({ gameId: null, teamName: null, opponent: null });

      expect(publicId).toMatch(/^team-vs-opponent-\d{4}-\d{2}-\d{2}-/);
    });

    test('tags each asset with its game so one fixture can be withdrawn alone', async () => {
      const { tags } = await uploadOptionsFor({
        gameId: '507f1f77bcf86cd799439aaa',
        teamName: 'Lions',
        opponent: 'Bears',
        recap: { playedAt: '2026-09-05T18:30:00.000Z' },
      });

      expect(tags).toEqual([
        'tsw-social',
        'tsw-social-instagram',
        'tsw-game-507f1f77bcf86cd799439aaa',
      ]);
    });

    test('does not put a player name in the public asset address', async () => {
      const { publicId } = await uploadOptionsFor({
        gameId: '507f1f77bcf86cd799439aaa',
        teamName: 'Lions',
        opponent: 'Bears',
        recap: {
          playedAt: '2026-09-05T18:30:00.000Z',
          topPerformers: [{ displayName: 'Jordan Miles', points: 24 }],
        },
      });

      expect(publicId).not.toMatch(/jordan|miles/i);
    });
  });
});
