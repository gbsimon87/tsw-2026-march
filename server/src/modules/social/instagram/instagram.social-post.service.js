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

// Social exports live under their own prefix rather than in the shared feed
// folder, so they can be listed, retained and deleted as a set. Derived from
// CLOUDINARY_FOLDER so it stays environment-scoped with no extra configuration
// to set per deployment. Changing this does not move assets already uploaded.
const SOCIAL_ASSET_FOLDER = `${env.CLOUDINARY_FOLDER}/social/instagram`;
// Cancelling before delivery removes the asset with the record: nothing at Meta
// references the URL yet, so leaving it behind would accumulate orphaned images
// that no retention rule ever reaches. A queued or failed post is different —
// a container may already point at the URL and reconciliation still needs it —
// so those keep their asset until a person resolves them.
const CANCEL_DESTROYS_ASSET = new Set(['draft', 'ready_for_review', 'approved']);

// Cloudinary's generated ids are random, so a folder of social exports is
// unbrowsable and a deletion request means opening images one by one to find
// the right game. Naming the asset after the fixture makes the folder legible.
//
// Only team names and the date go in — never a player name. A public asset URL
// is the last place personal data should end up, and the top scorer's name is
// already on the card without also being in its address.
const SLUG_MAX_LENGTH = 40;

function slugSegment(value, fallback) {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || fallback;
}

function gameCardSides(snapshot) {
  if (snapshot?.participants) {
    return [
      snapshot.recap?.home?.name || snapshot.participants.home?.displayName,
      snapshot.recap?.away?.name || snapshot.participants.away?.displayName,
    ];
  }
  return [snapshot?.teamName, snapshot?.recap?.opponent?.name || snapshot?.opponent];
}

function assetDate(snapshot) {
  const played = new Date(snapshot?.recap?.playedAt ?? NaN);
  const date = Number.isNaN(played.getTime()) ? new Date() : played;
  return date.toISOString().slice(0, 10);
}

function buildAssetPublicId(snapshot) {
  const [home, away] = gameCardSides(snapshot);
  // The random tail keeps two exports of the same fixture from colliding, which
  // matters because a collision would otherwise be refused by overwrite:false.
  return [
    slugSegment(home, 'team'),
    'vs',
    slugSegment(away, 'opponent'),
    assetDate(snapshot),
    randomToken(6)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ''),
  ].join('-');
}

// Tags are how a set gets deleted: Cloudinary can remove every asset carrying
// one in a single call, without needing the ids. The per-game tag lets a single
// fixture be withdrawn without touching the rest.
function buildAssetTags(snapshot) {
  const tags = ['tsw-social', 'tsw-social-instagram'];
  if (snapshot?.gameId) tags.push(`tsw-game-${slugSegment(snapshot.gameId, 'unknown')}`);
  return tags;
}

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
    upload = await uploadImageBuffer(file, {
      folder: SOCIAL_ASSET_FOLDER,
      publicId: buildAssetPublicId(sourcePost.gameCard.cardSnapshot),
      tags: buildAssetTags(sourcePost.gameCard.cardSnapshot),
    });
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
  const before = await repository.findSocialPostById(postId);
  const updated = await repository.cancelSocialPost({ postId, userId });
  if (!updated) {
    if (!before) throw new ApiError(404, 'Instagram social post not found');
    throw new ApiError(409, 'Instagram social post is already cancelled');
  }

  if (before && CANCEL_DESTROYS_ASSET.has(before.status) && before.asset?.publicId) {
    // Best effort: the cancellation itself is already durable, and a storage
    // failure must not turn a successful cancel into an error.
    await destroyImage(before.asset.publicId).catch(() => null);
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
