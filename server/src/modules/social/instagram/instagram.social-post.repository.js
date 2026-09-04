const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['game_card'], required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const assetSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['image'], required: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true, select: false },
    sha256: { type: String, required: true, select: false },
    mimeType: { type: String, enum: ['image/png', 'image/jpeg'], required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false }
);

const deliveryErrorSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    stage: {
      type: String,
      enum: ['configuration', 'creating_container', 'processing', 'publishing', 'metadata'],
      required: true,
    },
    retryable: { type: Boolean, required: true },
    occurredAt: { type: Date, required: true },
  },
  { _id: false }
);

const deliveryAttemptSchema = new mongoose.Schema(
  {
    attemptId: { type: String, required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    outcome: {
      type: String,
      enum: ['running', 'retry_scheduled', 'failed', 'published', 'reconciliation_required'],
      default: 'running',
      required: true,
    },
    lastStage: {
      type: String,
      enum: ['creating_container', 'processing', 'publishing', 'metadata'],
      required: true,
    },
    errorCode: { type: String, default: null },
  },
  { _id: false }
);

const instagramSocialPostSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: ['instagram'], default: 'instagram', required: true },
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InstagramConnection',
      required: true,
      index: true,
    },
    source: { type: sourceSchema, required: true },
    asset: { type: assetSchema, required: true },
    caption: { type: String, trim: true, required: true, maxlength: 2200 },
    attributionUrl: { type: String, default: null },
    contentDeclaration: { type: String, enum: ['demo'], required: true },
    rightsConfirmedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rightsConfirmedAt: { type: Date, required: true },
    contentDigest: { type: String, required: true },
    status: {
      type: String,
      enum: [
        'draft',
        'ready_for_review',
        'approved',
        'queued',
        'creating_container',
        'processing',
        'publishing',
        'published',
        'failed',
        'reconciliation_required',
        'cancelled',
      ],
      default: 'draft',
      required: true,
      index: true,
    },
    idempotencyKey: { type: String, required: true, unique: true, select: false },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readyForReviewByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    readyForReviewAt: { type: Date, default: null },
    approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    approvedContentDigest: { type: String, default: null },
    deliveryRequestedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    deliveryRequestedAt: { type: Date, default: null },
    deliveryLeaseId: { type: String, default: null, select: false },
    deliveryLeaseUntil: { type: Date, default: null, select: false },
    containerId: { type: String, default: null },
    mediaId: { type: String, default: null },
    permalink: { type: String, default: null },
    attemptCount: { type: Number, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null },
    lastDeliveryError: { type: deliveryErrorSchema, default: null },
    deliveryAttempts: { type: [deliveryAttemptSchema], default: [], select: false },
    publishedAt: { type: Date, default: null },
    cancelledByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

instagramSocialPostSchema.index({ platform: 1, createdAt: -1 });
instagramSocialPostSchema.index({ platform: 1, status: 1, nextAttemptAt: 1 });

const InstagramSocialPost =
  mongoose.models.InstagramSocialPost ||
  mongoose.model('InstagramSocialPost', instagramSocialPostSchema);

async function createSocialPost(input) {
  return InstagramSocialPost.create(input);
}

async function listSocialPosts({ limit = 25 } = {}) {
  return InstagramSocialPost.find({ platform: 'instagram' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

async function findSocialPostById(postId) {
  return InstagramSocialPost.findOne({ _id: postId, platform: 'instagram' });
}

async function markReadyForReview({ postId, userId, now = new Date() }) {
  return InstagramSocialPost.findOneAndUpdate(
    { _id: postId, platform: 'instagram', status: 'draft' },
    {
      $set: {
        status: 'ready_for_review',
        readyForReviewByUserId: userId,
        readyForReviewAt: now,
      },
    },
    { new: true, runValidators: true }
  );
}

async function approveSocialPost({ postId, userId, contentDigest, now = new Date() }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: 'ready_for_review',
      contentDigest,
    },
    {
      $set: {
        status: 'approved',
        approvedByUserId: userId,
        approvedAt: now,
        approvedContentDigest: contentDigest,
      },
    },
    { new: true, runValidators: true }
  );
}

async function cancelSocialPost({ postId, userId, now = new Date() }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: { $in: ['draft', 'ready_for_review', 'approved', 'queued', 'failed'] },
    },
    {
      $set: {
        status: 'cancelled',
        cancelledByUserId: userId,
        cancelledAt: now,
      },
    },
    { new: true, runValidators: true }
  );
}

async function queueSocialPost({ postId, userId, now = new Date() }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: 'approved',
      $expr: { $eq: ['$contentDigest', '$approvedContentDigest'] },
    },
    {
      $set: {
        status: 'queued',
        deliveryRequestedByUserId: userId,
        deliveryRequestedAt: now,
        nextAttemptAt: now,
      },
      $unset: { lastDeliveryError: 1 },
    },
    { new: true, runValidators: true }
  );
}

async function claimNextDelivery({ leaseId, leaseUntil, attemptId, now = new Date() }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      platform: 'instagram',
      $and: [
        {
          $or: [{ status: 'queued' }, { status: 'failed', 'lastDeliveryError.retryable': true }],
        },
        {
          $or: [
            { deliveryLeaseUntil: null },
            { deliveryLeaseUntil: { $exists: false } },
            { deliveryLeaseUntil: { $lte: now } },
          ],
        },
      ],
      nextAttemptAt: { $lte: now },
      attemptCount: { $lt: 5 },
    },
    {
      $set: {
        status: 'creating_container',
        deliveryLeaseId: leaseId,
        deliveryLeaseUntil: leaseUntil,
        lastAttemptAt: now,
      },
      $inc: { attemptCount: 1 },
      $push: {
        deliveryAttempts: {
          $each: [
            {
              attemptId,
              startedAt: now,
              outcome: 'running',
              lastStage: 'creating_container',
            },
          ],
          $slice: -20,
        },
      },
    },
    { new: true, runValidators: true }
  ).select('+asset.publicId +asset.sha256 +deliveryLeaseId +deliveryAttempts');
}

async function recordContainer({ postId, leaseId, attemptId, containerId }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: 'creating_container',
      deliveryLeaseId: leaseId,
      'deliveryAttempts.attemptId': attemptId,
    },
    {
      $set: {
        status: 'processing',
        containerId,
        'deliveryAttempts.$.lastStage': 'processing',
      },
    },
    { new: true, runValidators: true }
  ).select('+asset.sha256 +deliveryLeaseId +deliveryAttempts');
}

async function resumeContainer({ postId, leaseId, attemptId }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: 'creating_container',
      deliveryLeaseId: leaseId,
      containerId: { $ne: null },
      'deliveryAttempts.attemptId': attemptId,
    },
    {
      $set: {
        status: 'processing',
        'deliveryAttempts.$.lastStage': 'processing',
      },
    },
    { new: true, runValidators: true }
  ).select('+asset.sha256 +deliveryLeaseId +deliveryAttempts');
}

async function markPublishing({ postId, leaseId, attemptId }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: 'processing',
      deliveryLeaseId: leaseId,
      'deliveryAttempts.attemptId': attemptId,
    },
    {
      $set: {
        status: 'publishing',
        'deliveryAttempts.$.lastStage': 'publishing',
      },
    },
    { new: true, runValidators: true }
  ).select('+deliveryLeaseId +deliveryAttempts');
}

async function completePublished({ postId, leaseId, attemptId, mediaId, now = new Date() }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: 'publishing',
      deliveryLeaseId: leaseId,
      'deliveryAttempts.attemptId': attemptId,
    },
    {
      $set: {
        status: 'published',
        mediaId,
        publishedAt: now,
        nextAttemptAt: null,
        lastDeliveryError: null,
        'deliveryAttempts.$.completedAt': now,
        'deliveryAttempts.$.outcome': 'published',
      },
      $unset: { deliveryLeaseId: 1, deliveryLeaseUntil: 1 },
    },
    { new: true, runValidators: true }
  );
}

async function recordPermalink({ postId, mediaId, permalink }) {
  return InstagramSocialPost.findOneAndUpdate(
    { _id: postId, platform: 'instagram', status: 'published', mediaId },
    { $set: { permalink } },
    { new: true, runValidators: true }
  );
}

async function failDelivery({
  postId,
  leaseId,
  attemptId,
  error,
  nextAttemptAt,
  now = new Date(),
}) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: { $in: ['creating_container', 'processing'] },
      deliveryLeaseId: leaseId,
      'deliveryAttempts.attemptId': attemptId,
    },
    {
      $set: {
        status: 'failed',
        nextAttemptAt,
        lastDeliveryError: { ...error, occurredAt: now },
        'deliveryAttempts.$.completedAt': now,
        'deliveryAttempts.$.outcome': error.retryable ? 'retry_scheduled' : 'failed',
        'deliveryAttempts.$.errorCode': error.code,
      },
      $unset: { deliveryLeaseId: 1, deliveryLeaseUntil: 1 },
    },
    { new: true, runValidators: true }
  );
}

async function requireReconciliation({ postId, leaseId, attemptId, error, now = new Date() }) {
  return InstagramSocialPost.findOneAndUpdate(
    {
      _id: postId,
      platform: 'instagram',
      status: 'publishing',
      deliveryLeaseId: leaseId,
      'deliveryAttempts.attemptId': attemptId,
    },
    {
      $set: {
        status: 'reconciliation_required',
        nextAttemptAt: null,
        lastDeliveryError: { ...error, occurredAt: now },
        'deliveryAttempts.$.completedAt': now,
        'deliveryAttempts.$.outcome': 'reconciliation_required',
        'deliveryAttempts.$.errorCode': error.code,
      },
      $unset: { deliveryLeaseId: 1, deliveryLeaseUntil: 1 },
    },
    { new: true, runValidators: true }
  );
}

async function markStalePublishingForReconciliation({ now = new Date() } = {}) {
  return InstagramSocialPost.updateMany(
    {
      platform: 'instagram',
      status: 'publishing',
      deliveryLeaseUntil: { $lte: now },
    },
    {
      $set: {
        status: 'reconciliation_required',
        nextAttemptAt: null,
        lastDeliveryError: {
          code: 'INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN',
          stage: 'publishing',
          retryable: false,
          occurredAt: now,
        },
        'deliveryAttempts.$[attempt].completedAt': now,
        'deliveryAttempts.$[attempt].outcome': 'reconciliation_required',
        'deliveryAttempts.$[attempt].errorCode': 'INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN',
      },
      $unset: { deliveryLeaseId: 1, deliveryLeaseUntil: 1 },
    },
    { arrayFilters: [{ 'attempt.outcome': 'running' }] }
  );
}

module.exports = {
  InstagramSocialPost,
  approveSocialPost,
  cancelSocialPost,
  createSocialPost,
  findSocialPostById,
  listSocialPosts,
  markReadyForReview,
  queueSocialPost,
  claimNextDelivery,
  completePublished,
  failDelivery,
  markPublishing,
  markStalePublishingForReconciliation,
  recordContainer,
  recordPermalink,
  requireReconciliation,
  resumeContainer,
};
