const mockEnv = { INSTAGRAM_PUBLISHING_ENABLED: true };
const mockOauthService = { createStoredInstagramClient: jest.fn() };
const mockRepository = {
  claimNextDelivery: jest.fn(),
  completePublished: jest.fn(),
  failDelivery: jest.fn(),
  markPublishing: jest.fn(),
  markStalePublishingForReconciliation: jest.fn(),
  recordContainer: jest.fn(),
  recordPermalink: jest.fn(),
  requireReconciliation: jest.fn(),
  resumeContainer: jest.fn(),
};

jest.mock('../../config/env', () => ({ env: mockEnv }));
jest.mock('../../modules/social/instagram/instagram.oauth.service', () => mockOauthService);
jest.mock('../../modules/social/instagram/instagram.social-post.repository', () => mockRepository);

const service = require('../../modules/social/instagram/instagram.delivery.service');

const NOW = new Date('2026-09-05T00:00:00.000Z');

function post(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    platform: 'instagram',
    connectionId: '507f1f77bcf86cd799439012',
    source: {
      kind: 'game_card',
      postId: '507f1f77bcf86cd799439011',
      snapshot: { teamName: 'Demo Lions' },
    },
    asset: {
      type: 'image',
      url: 'https://res.cloudinary.com/tsw/image/upload/game.png',
      mimeType: 'image/png',
      width: 2160,
      height: 2700,
    },
    caption: 'Demo final score.',
    attributionUrl: null,
    contentDeclaration: 'demo',
    contentDigest: 'a'.repeat(64),
    approvedContentDigest: 'a'.repeat(64),
    status: 'creating_container',
    attemptCount: 1,
    rightsConfirmedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('Instagram delivery service', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.INSTAGRAM_PUBLISHING_ENABLED = true;
    client = {
      createImageContainer: jest.fn().mockResolvedValue('container-1'),
      getPublishedMedia: jest
        .fn()
        .mockResolvedValue({ id: 'media-1', permalink: 'https://www.instagram.com/p/demo/' }),
      publishContainer: jest.fn().mockResolvedValue('media-1'),
      waitForContainer: jest.fn().mockResolvedValue({ statusCode: 'FINISHED' }),
    };
    mockOauthService.createStoredInstagramClient.mockResolvedValue({
      connection: { _id: '507f1f77bcf86cd799439012' },
      client,
    });
    mockRepository.markStalePublishingForReconciliation.mockResolvedValue({ modifiedCount: 0 });
    mockRepository.claimNextDelivery.mockResolvedValue(post());
    mockRepository.recordContainer.mockResolvedValue(
      post({ status: 'processing', containerId: 'container-1' })
    );
    mockRepository.markPublishing.mockResolvedValue(
      post({ status: 'publishing', containerId: 'container-1' })
    );
    mockRepository.completePublished.mockResolvedValue(
      post({ status: 'published', containerId: 'container-1', mediaId: 'media-1' })
    );
    mockRepository.recordPermalink.mockResolvedValue(
      post({
        status: 'published',
        containerId: 'container-1',
        mediaId: 'media-1',
        permalink: 'https://www.instagram.com/p/demo/',
      })
    );
  });

  test('creates, publishes, and durably records an approved image', async () => {
    const result = await service.processNextDelivery({ now: () => NOW, random: () => 0.5 });

    expect(client.createImageContainer).toHaveBeenCalledWith({
      imageUrl: 'https://res.cloudinary.com/tsw/image/upload/game.png',
      caption: 'Demo final score.',
    });
    expect(mockRepository.recordContainer).toHaveBeenCalledWith(
      expect.objectContaining({ containerId: 'container-1' })
    );
    expect(client.publishContainer).toHaveBeenCalledWith('container-1');
    expect(mockRepository.completePublished).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: 'media-1' })
    );
    expect(result.status).toBe('published');
    expect(result.permalink).toBe('https://www.instagram.com/p/demo/');
  });

  test('reuses a stored container and schedules a retry before publication', async () => {
    mockRepository.claimNextDelivery.mockResolvedValue(
      post({ containerId: 'container-1', attemptCount: 2 })
    );
    mockRepository.resumeContainer.mockResolvedValue(
      post({ status: 'processing', containerId: 'container-1', attemptCount: 2 })
    );
    client.waitForContainer.mockRejectedValue(
      Object.assign(new Error('not ready'), {
        code: 'INSTAGRAM_CONTAINER_TIMEOUT',
        retryable: true,
      })
    );
    mockRepository.failDelivery.mockImplementation(async ({ error, nextAttemptAt }) =>
      post({
        status: 'failed',
        containerId: 'container-1',
        lastDeliveryError: error,
        nextAttemptAt,
      })
    );

    const result = await service.processNextDelivery({ now: () => NOW, random: () => 0.5 });

    expect(client.createImageContainer).not.toHaveBeenCalled();
    expect(mockRepository.resumeContainer).toHaveBeenCalled();
    expect(mockRepository.failDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INSTAGRAM_CONTAINER_TIMEOUT', retryable: true }),
        nextAttemptAt: new Date('2026-09-05T00:01:00.000Z'),
      })
    );
    expect(result.status).toBe('failed');
  });

  test('never retries an uncertain publish outcome', async () => {
    client.publishContainer.mockRejectedValue(
      Object.assign(new Error('network lost'), {
        code: 'INSTAGRAM_NETWORK_ERROR',
        retryable: true,
      })
    );
    mockRepository.requireReconciliation.mockImplementation(async ({ error }) =>
      post({
        status: 'reconciliation_required',
        containerId: 'container-1',
        lastDeliveryError: error,
      })
    );

    const result = await service.processNextDelivery({ now: () => NOW, random: () => 0.5 });

    expect(mockRepository.requireReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INSTAGRAM_NETWORK_ERROR',
          stage: 'publishing',
          retryable: false,
        }),
      })
    );
    expect(mockRepository.failDelivery).not.toHaveBeenCalled();
    expect(result.status).toBe('reconciliation_required');
  });

  test('does nothing when no delivery is due', async () => {
    mockRepository.claimNextDelivery.mockResolvedValue(null);

    await expect(
      service.processNextDelivery({ now: () => NOW, random: () => 0.5 })
    ).resolves.toBeNull();
    expect(mockOauthService.createStoredInstagramClient).not.toHaveBeenCalled();
  });
});
