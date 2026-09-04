const { env } = require('../../../config/env');
const { ApiError } = require('../../../utils/apiError');
const { randomToken } = require('../../../utils/crypto');
const oauthService = require('./instagram.oauth.service');
const repository = require('./instagram.social-post.repository');
const { serializeSocialPost } = require('./instagram.social-post.service');

const DELIVERY_LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 30 * 1000;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

function classifiedError(error, stage, { forceRetryable } = {}) {
  const retryable =
    forceRetryable === undefined
      ? error?.retryable === true || Number(error?.statusCode) >= 500
      : forceRetryable;
  return {
    code: error?.code || error?.details?.reason || 'INSTAGRAM_DELIVERY_FAILED',
    stage,
    retryable,
  };
}

function retryAt(attemptCount, now, random) {
  const baseDelay = Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1)
  );
  const jitteredDelay = Math.round(baseDelay * (0.8 + random() * 0.4));
  return new Date(now.getTime() + jitteredDelay);
}

async function processNextDelivery({
  fetchImpl = global.fetch,
  now = () => new Date(),
  random = Math.random,
} = {}) {
  if (!env.INSTAGRAM_PUBLISHING_ENABLED) {
    throw new ApiError(503, 'Instagram publishing is disabled');
  }

  const claimTime = now();
  await repository.markStalePublishingForReconciliation({ now: claimTime });
  const leaseId = randomToken();
  const attemptId = randomToken();
  let post = await repository.claimNextDelivery({
    leaseId,
    attemptId,
    now: claimTime,
    leaseUntil: new Date(claimTime.getTime() + DELIVERY_LEASE_MS),
  });
  if (!post) return null;

  let stage = 'configuration';
  try {
    const { connection, client } = await oauthService.createStoredInstagramClient({
      fetchImpl,
      now: claimTime,
    });
    if (String(connection._id) !== String(post.connectionId)) {
      throw new ApiError(409, 'Approved post targets a different Instagram connection');
    }
    if (post.contentDigest !== post.approvedContentDigest) {
      throw new ApiError(409, 'Approved Instagram content has changed');
    }

    stage = 'creating_container';
    if (post.containerId) {
      post = await repository.resumeContainer({
        postId: post._id,
        leaseId,
        attemptId,
      });
    } else {
      const containerId = await client.createImageContainer({
        imageUrl: post.asset.url,
        caption: post.caption,
      });
      post = await repository.recordContainer({
        postId: post._id,
        leaseId,
        attemptId,
        containerId,
      });
    }
    if (!post) throw new ApiError(409, 'Instagram delivery claim was lost');

    stage = 'processing';
    await client.waitForContainer(post.containerId);
    post = await repository.markPublishing({
      postId: post._id,
      leaseId,
      attemptId,
    });
    if (!post) throw new ApiError(409, 'Instagram delivery claim was lost');

    stage = 'publishing';
    let mediaId;
    try {
      mediaId = await client.publishContainer(post.containerId);
    } catch (error) {
      const reconciled = await repository.requireReconciliation({
        postId: post._id,
        leaseId,
        attemptId,
        error: classifiedError(error, stage, { forceRetryable: false }),
        now: now(),
      });
      if (!reconciled) {
        throw new ApiError(409, 'Instagram publish outcome could not be recorded');
      }
      return serializeSocialPost(reconciled);
    }

    post = await repository.completePublished({
      postId: post._id,
      leaseId,
      attemptId,
      mediaId,
      now: now(),
    });
    if (!post) throw new ApiError(409, 'Instagram publish result could not be recorded');

    stage = 'metadata';
    try {
      const media = await client.getPublishedMedia(mediaId);
      if (media.permalink) {
        post =
          (await repository.recordPermalink({
            postId: post._id,
            mediaId,
            permalink: media.permalink,
          })) || post;
      }
    } catch {
      // Publication is already durably recorded; permalink lookup is optional metadata.
    }
    return serializeSocialPost(post);
  } catch (error) {
    if (stage === 'publishing') throw error;
    const failureTime = now();
    const classified = classifiedError(error, stage);
    if (post.attemptCount >= MAX_ATTEMPTS) classified.retryable = false;
    const failed = await repository.failDelivery({
      postId: post._id,
      leaseId,
      attemptId,
      error: classified,
      nextAttemptAt: classified.retryable ? retryAt(post.attemptCount, failureTime, random) : null,
      now: failureTime,
    });
    if (!failed) throw error;
    return serializeSocialPost(failed);
  }
}

module.exports = {
  BASE_RETRY_DELAY_MS,
  DELIVERY_LEASE_MS,
  MAX_ATTEMPTS,
  processNextDelivery,
};
