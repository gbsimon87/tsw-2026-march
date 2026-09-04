const { env } = require('../../../config/env');
const { ApiError } = require('../../../utils/apiError');
const { randomToken, sha256 } = require('../../../utils/crypto');
const {
  destroyImage,
  isCloudinaryConfigured,
  uploadImageBuffer,
} = require('../../feed/cloudinary.client');
const feedRepository = require('../../feed/feed.repository');
const connectionRepository = require('./instagram.repository');
const repository = require('./instagram.social-post.repository');
const { createInstagramSocialPostSchema } = require('./instagram.social-post.validation');

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);
const TARGET_ASPECT_RATIO = 4 / 5;
const ASPECT_RATIO_TOLERANCE = 0.02;

function serializeSocialPost(post) {
  if (!post) return null;
  return {
    id: String(post._id),
    platform: post.platform,
    connectionId: String(post.connectionId),
    source: {
      kind: post.source.kind,
      postId: String(post.source.postId),
      snapshot: post.source.snapshot,
    },
    asset: {
      type: post.asset.type,
      url: post.asset.url,
      mimeType: post.asset.mimeType,
      width: post.asset.width,
      height: post.asset.height,
    },
    caption: post.caption,
    attributionUrl: post.attributionUrl || null,
    contentDeclaration: post.contentDeclaration,
    status: post.status,
    rightsConfirmedAt: post.rightsConfirmedAt,
    readyForReviewAt: post.readyForReviewAt || null,
    approvedAt: post.approvedAt || null,
    deliveryRequestedAt: post.deliveryRequestedAt || null,
    attemptCount: post.attemptCount || 0,
    nextAttemptAt: post.nextAttemptAt || null,
    containerId: post.containerId || null,
    mediaId: post.mediaId || null,
    permalink: post.permalink || null,
    lastDeliveryError: post.lastDeliveryError
      ? {
          code: post.lastDeliveryError.code,
          stage: post.lastDeliveryError.stage,
          retryable: post.lastDeliveryError.retryable,
          occurredAt: post.lastDeliveryError.occurredAt,
        }
      : null,
    publishedAt: post.publishedAt || null,
    cancelledAt: post.cancelledAt || null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function assertImageFile(file) {
  if (!file) throw new ApiError(400, 'Exported game-card image is required');
  if (file.size > env.FEED_IMAGE_MAX_BYTES) {
    throw new ApiError(400, 'Image exceeds upload size limit');
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    throw new ApiError(400, 'Game-card image must be a PNG or JPEG');
  }
}

function assertFourByFiveImage(upload) {
  let assetUrl;
  try {
    assetUrl = new URL(upload.secure_url);
  } catch {
    throw new ApiError(502, 'Image storage did not return a valid public URL');
  }
  if (assetUrl.protocol !== 'https:' || !upload.public_id) {
    throw new ApiError(502, 'Image storage did not return a valid public HTTPS asset');
  }
  const width = Number(upload.width);
  const height = Number(upload.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ApiError(502, 'Image storage did not return valid dimensions');
  }
  if (Math.abs(width / height - TARGET_ASPECT_RATIO) > ASPECT_RATIO_TOLERANCE) {
    throw new ApiError(400, 'Game-card image must use a 4:5 portrait aspect ratio');
  }
}

function contentDigest({
  connectionId,
  sourcePostId,
  assetUrl,
  assetSha256,
  caption,
  attributionUrl,
}) {
  return sha256(
    JSON.stringify({
      connectionId: String(connectionId),
      sourcePostId: String(sourcePostId),
      assetUrl,
      assetSha256,
      caption,
      attributionUrl: attributionUrl || null,
      contentDeclaration: 'demo',
    })
  );
}

async function createDraft({ userId, input, file }) {
  const payload = createInstagramSocialPostSchema.parse(input);
  assertImageFile(file);
  if (!isCloudinaryConfigured()) throw new ApiError(503, 'Image storage is not configured');

  const [connection, sourcePost] = await Promise.all([
    connectionRepository.findConnection(),
    feedRepository.findPostById(payload.sourcePostId),
  ]);
  if (!connection || connection.status !== 'connected') {
    throw new ApiError(409, 'Connect an Instagram account before creating a social post');
  }
  if (!sourcePost || sourcePost.type !== 'game_card' || !sourcePost.gameCard?.cardSnapshot) {
    throw new ApiError(400, 'Select an available game-card post as the source');
  }

  let upload;
  let socialPost;
  try {
    upload = await uploadImageBuffer(file);
  } catch {
    throw new ApiError(502, 'Could not store the Instagram image');
  }

  try {
    assertFourByFiveImage(upload);
    const now = new Date();
    const assetSha256 = sha256(file.buffer);
    const digest = contentDigest({
      connectionId: connection._id,
      sourcePostId: sourcePost._id,
      assetUrl: upload.secure_url,
      assetSha256,
      caption: payload.caption,
      attributionUrl: payload.attributionUrl,
    });
    socialPost = await repository.createSocialPost({
      platform: 'instagram',
      connectionId: connection._id,
      source: {
        kind: 'game_card',
        postId: sourcePost._id,
        snapshot: sourcePost.gameCard.cardSnapshot,
      },
      asset: {
        type: 'image',
        url: upload.secure_url,
        publicId: upload.public_id,
        sha256: assetSha256,
        mimeType: file.mimetype,
        width: upload.width,
        height: upload.height,
      },
      caption: payload.caption,
      attributionUrl: payload.attributionUrl || null,
      contentDeclaration: payload.contentDeclaration,
      rightsConfirmedByUserId: userId,
      rightsConfirmedAt: now,
      contentDigest: digest,
      status: 'draft',
      idempotencyKey: randomToken(),
      createdByUserId: userId,
    });
  } catch (error) {
    await destroyImage(upload.public_id).catch(() => null);
    throw error;
  }
  return serializeSocialPost(socialPost);
}

async function listSocialPosts() {
  const posts = await repository.listSocialPosts();
  return posts.map(serializeSocialPost);
}

async function transitionFailure(postId, requiredStatus) {
  const existing = await repository.findSocialPostById(postId);
  if (!existing) throw new ApiError(404, 'Instagram social post not found');
  throw new ApiError(
    409,
    `Instagram social post must be ${requiredStatus.replaceAll('_', ' ')} for this action`
  );
}

async function markReadyForReview({ postId, userId }) {
  const updated = await repository.markReadyForReview({ postId, userId });
  if (!updated) return transitionFailure(postId, 'draft');
  return serializeSocialPost(updated);
}

async function approveSocialPost({ postId, userId }) {
  const current = await repository.findSocialPostById(postId);
  if (!current) throw new ApiError(404, 'Instagram social post not found');
  if (current.status !== 'ready_for_review') return transitionFailure(postId, 'ready_for_review');
  const updated = await repository.approveSocialPost({
    postId,
    userId,
    contentDigest: current.contentDigest,
  });
  if (!updated) return transitionFailure(postId, 'ready_for_review');
  return serializeSocialPost(updated);
}

async function cancelSocialPost({ postId, userId }) {
  const updated = await repository.cancelSocialPost({ postId, userId });
  if (!updated) {
    const existing = await repository.findSocialPostById(postId);
    if (!existing) throw new ApiError(404, 'Instagram social post not found');
    throw new ApiError(409, 'Instagram social post is already cancelled');
  }
  return serializeSocialPost(updated);
}

async function queueSocialPost({ postId, userId }) {
  if (!env.INSTAGRAM_PUBLISHING_ENABLED) {
    throw new ApiError(503, 'Instagram publishing is disabled');
  }
  const updated = await repository.queueSocialPost({ postId, userId });
  if (!updated) return transitionFailure(postId, 'approved');
  return serializeSocialPost(updated);
}

module.exports = {
  approveSocialPost,
  cancelSocialPost,
  createDraft,
  listSocialPosts,
  markReadyForReview,
  queueSocialPost,
  serializeSocialPost,
};
