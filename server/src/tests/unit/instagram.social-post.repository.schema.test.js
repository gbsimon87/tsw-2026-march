const {
  InstagramSocialPost,
  claimNextDelivery,
  queueSocialPost,
} = require('../../modules/social/instagram/instagram.social-post.repository');

describe('Instagram social-post persistence schema', () => {
  test('keeps delivery identity and Cloudinary management metadata out of normal reads', () => {
    expect(InstagramSocialPost.schema.path('idempotencyKey').options.select).toBe(false);
    expect(InstagramSocialPost.schema.path('asset.publicId').options.select).toBe(false);
    expect(InstagramSocialPost.schema.path('asset.sha256').options.select).toBe(false);
    expect(InstagramSocialPost.schema.path('deliveryLeaseId').options.select).toBe(false);
    expect(InstagramSocialPost.schema.path('deliveryAttempts').options.select).toBe(false);
  });

  test('requires an immutable approval digest and audited lifecycle fields', () => {
    expect(InstagramSocialPost.schema.path('contentDigest').options.required).toBe(true);
    expect(InstagramSocialPost.schema.path('approvedContentDigest')).toBeTruthy();
    expect(InstagramSocialPost.schema.path('readyForReviewAt')).toBeTruthy();
    expect(InstagramSocialPost.schema.path('approvedAt')).toBeTruthy();
    expect(InstagramSocialPost.schema.path('cancelledAt')).toBeTruthy();
    expect(InstagramSocialPost.schema.path('containerId')).toBeTruthy();
    expect(InstagramSocialPost.schema.path('mediaId')).toBeTruthy();
    expect(InstagramSocialPost.schema.path('publishedAt')).toBeTruthy();
  });

  test('creates a unique idempotency-key index', () => {
    const index = InstagramSocialPost.schema
      .indexes()
      .find(([fields]) => fields.idempotencyKey === 1);
    expect(index?.[1]?.unique).toBe(true);
  });

  test('indexes due deliveries for worker claims', () => {
    const index = InstagramSocialPost.schema
      .indexes()
      .find(
        ([fields]) => fields.platform === 1 && fields.status === 1 && fields.nextAttemptAt === 1
      );
    expect(index).toBeTruthy();
  });

  test('queues only approved content whose digest still matches', async () => {
    const update = jest
      .spyOn(InstagramSocialPost, 'findOneAndUpdate')
      .mockResolvedValue({ status: 'queued' });

    await queueSocialPost({ postId: 'post-1', userId: 'operator-1', now: new Date(0) });

    expect(update.mock.calls[0][0]).toMatchObject({
      _id: 'post-1',
      status: 'approved',
      $expr: { $eq: ['$contentDigest', '$approvedContentDigest'] },
    });
    update.mockRestore();
  });

  test('claims only queued or retryable due delivery work', async () => {
    const select = jest.fn().mockResolvedValue(null);
    const update = jest.spyOn(InstagramSocialPost, 'findOneAndUpdate').mockReturnValue({ select });
    const now = new Date('2026-09-05T00:00:00.000Z');

    await claimNextDelivery({
      leaseId: 'lease-1',
      leaseUntil: new Date('2026-09-05T00:02:00.000Z'),
      attemptId: 'attempt-1',
      now,
    });

    const filter = update.mock.calls[0][0];
    expect(filter.nextAttemptAt).toEqual({ $lte: now });
    expect(filter.attemptCount).toEqual({ $lt: 5 });
    expect(filter.$and[0].$or).toContainEqual({ status: 'queued' });
    expect(filter.$and[0].$or).toContainEqual({
      status: 'failed',
      'lastDeliveryError.retryable': true,
    });
    update.mockRestore();
  });
});
