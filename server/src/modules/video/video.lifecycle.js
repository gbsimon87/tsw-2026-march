// Provider events and recovery share one identity-checked lifecycle. A Mux
// passthrough is descriptive, never proof of ownership: only persisted upload
// and asset mappings from this deployment permit mutation or deletion.
const { z } = require('zod');
const { env } = require('../../config/env');
const { ApiError } = require('../../utils/apiError');
const { logger } = require('../../config/logger');
const repository = require('./video.repository');
const mux = require('./mux.client');
const { MuxSignatureError, verifyMuxSignature } = require('./mux.webhook');
const { findGameById } = require('../games/games.repository');
const { kickCleanup, verifyMuxEnvironment } = require('./video.cleanup');

const EVENT_TYPES = new Set([
  'video.upload.asset_created',
  'video.upload.errored',
  'video.upload.cancelled',
  'video.upload.timed_out',
  'video.asset.ready',
  'video.asset.errored',
  'video.asset.deleted',
]);
const id = z.string().min(1).max(255);
const eventSchema = z.object({
  id,
  type: id,
  data: z
    .object({
      id,
      upload_id: id.optional(),
      asset_id: id.optional(),
    })
    .passthrough(),
});
const TERMINAL = ['cancelled', 'superseded', 'rejected', 'errored'];

async function owningAttempt(event) {
  const uploadEvent = event.type.startsWith('video.upload.');
  const uploadId = uploadEvent ? event.data.id : event.data.upload_id;
  const assetId = uploadEvent ? event.data.asset_id : event.data.id;
  const attempt = uploadId
    ? await repository.findUploadAttemptByUploadId(uploadId)
    : await repository.findUploadAttemptByAssetId(assetId);
  if (!attempt || attempt.deployment !== repository.getVideoDeployment()) return null;
  if (uploadId && attempt.uploadId !== uploadId) return null;
  if (assetId && attempt.assetId && attempt.assetId !== assetId) return null;
  if (event.data.passthrough && event.data.passthrough !== String(attempt.gameId)) return null;
  return attempt;
}

async function recordAsset(attempt, assetId) {
  if (!assetId || attempt.assetId === assetId) return attempt;
  const updated = await repository.transitionUploadAttempt({
    attemptId: attempt._id,
    fromStatuses: [attempt.status],
    toStatus: attempt.status,
    expectedUploadId: attempt.uploadId,
    expectedAssetId: null,
    set: { assetId },
  });
  if (updated) return updated;
  const fresh = await repository.findUploadAttemptById(attempt._id);
  if (!fresh || fresh.assetId !== assetId) throw new Error('Video ownership changed concurrently');
  return fresh;
}

async function queueCleanup(attempt, reason) {
  const targetId = attempt.assetId || attempt.uploadId;
  if (!targetId) return;
  await repository.enqueueCleanupJob({
    kind: attempt.assetId ? 'delete_asset' : 'cancel_upload',
    targetId,
    attemptId: attempt._id,
    gameId: attempt.gameId,
    reason,
  });
}

// Persist cleanup first. The detach denies playback immediately; the worker
// retries Mux independently of any subsequent webhook delivery.
async function discard(attempt, reason, status = 'rejected', allowReady = false) {
  await queueCleanup(attempt, reason);
  const settled = await repository.settleFailedGameVideo({ attempt, status, reason, allowReady });
  kickCleanup();
  return { handled: Boolean(settled), reason: settled ? reason : 'stale_event' };
}

function assetRejectionReason(asset, attempt) {
  if (!Number.isFinite(asset.duration) || asset.duration <= 0) return 'invalid_duration';
  if (Math.ceil(asset.duration / 60) > attempt.reservedMinutes) return 'duration_limit';
  if (
    !Array.isArray(asset.playback_ids) ||
    !asset.playback_ids.some((p) => p.policy === 'signed' && typeof p.id === 'string' && p.id)
  ) {
    return 'missing_signed_playback';
  }
  // Never retain an accidentally public playback id alongside the signed one.
  if (asset.playback_ids.some((p) => p.policy !== 'signed')) return 'public_playback';
  const tiers = {
    'audio-only': 0,
    '480p': 480,
    '540p': 540,
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,
    '2160p': 2160,
  };
  const resolution = tiers[asset.resolution_tier];
  if (resolution === undefined || resolution === 0) return 'unverified_resolution';
  if (resolution > tiers[env.MUX_MAX_RESOLUTION_TIER]) return 'resolution_limit';
  return null;
}

async function publishReady(attempt, asset) {
  const reason = assetRejectionReason(asset, attempt);
  if (reason) return discard(attempt, reason);
  const equivalentTimelines =
    attempt.sameRecording && attempt.previousTimelineId ? [attempt.previousTimelineId] : [];
  const ready = await repository.settleReadyGameVideo({ attempt, asset, equivalentTimelines });
  if (!ready) {
    const fresh = await repository.findUploadAttemptById(attempt._id);
    const game = await findGameById(attempt.gameId);
    if (
      fresh?.status !== 'ready' ||
      game?.video?.generationId !== attempt.generationId ||
      game.video.assetId !== asset.id ||
      game.video.status !== 'ready'
    ) {
      return discard(fresh || attempt, 'ready_no_longer_referenced', 'rejected', true);
    }
  }
  // Await publication before recording webhook completion. A failed publish
  // can retry against the already-ready state; feed deduplication prevents
  // duplicate posts. The feed service applies the live footage policy.
  if (env.AUTO_FEED_ENABLED) {
    await require('../feed/feed.service').autoPublishForFinalizedGame(attempt.gameId);
  }
  return { handled: true, reason: 'ready' };
}

async function applyEvent(event) {
  let attempt = await owningAttempt(event);
  if (!attempt) return { handled: false, reason: 'ownership_not_proven' };
  const isAssetEvent = event.type.startsWith('video.asset.');
  const assetId = isAssetEvent ? event.data.id : event.data.asset_id;
  if (event.type === 'video.upload.asset_created' && !assetId) {
    throw new ApiError(400, 'Invalid Mux event');
  }
  attempt = await recordAsset(attempt, assetId);
  if (event.type === 'video.asset.deleted') {
    return discard(attempt, 'asset_deleted', 'cancelled', true);
  }
  // Late errors and upload-created deliveries must not regress ready media.
  if (attempt.status === 'ready' && event.type !== 'video.asset.ready') {
    return { handled: false, reason: 'stale_event' };
  }
  if (TERMINAL.includes(attempt.status)) {
    await queueCleanup(attempt, 'late_asset');
    kickCleanup();
    return { handled: true, reason: 'late_asset' };
  }
  if (event.type === 'video.asset.ready') {
    return publishReady(attempt, event.data);
  }
  if (event.type !== 'video.upload.asset_created') {
    return discard(attempt, 'provider_upload_failed', 'errored');
  }
  const transitioned = await repository.transitionUploadAttempt({
    attemptId: attempt._id,
    fromStatuses: ['uploading'],
    toStatus: 'processing',
    expectedUploadId: attempt.uploadId,
    expectedAssetId: assetId,
  });
  if (!transitioned && attempt.status !== 'processing')
    return { handled: false, reason: 'stale_event' };
  const game = await repository.updateGameVideo({
    gameId: attempt.gameId,
    generationId: attempt.generationId,
    expectedStatuses: ['uploading'],
    expectedUploadId: attempt.uploadId,
    expectedAssetId: null,
    set: { status: 'processing', assetId },
  });
  if (
    !game &&
    !(await repository.isGameVideoGenerationReferenced({
      gameId: attempt.gameId,
      generationId: attempt.generationId,
    }))
  )
    return discard(attempt, 'processing_no_longer_referenced');
  return { handled: true, reason: 'processing' };
}

async function handleMuxWebhookEvent(input) {
  if (!input || typeof input.type !== 'string') throw new ApiError(400, 'Invalid Mux event');
  if (!EVENT_TYPES.has(input.type)) return { handled: false, reason: 'unsupported_event' };
  const event = eventSchema.parse(input);
  if (await repository.hasProcessedWebhookEvent(event.id))
    return { handled: false, reason: 'duplicate' };
  const result = await applyEvent(event);
  await repository.recordWebhookEventOnce(event.id, event.type);
  return result;
}

async function handleMuxWebhook({ rawBody, signatureHeader }) {
  if (!mux.isMuxConfigured()) throw new ApiError(503, 'Video hosting unavailable');
  try {
    verifyMuxSignature(rawBody, signatureHeader, env.MUX_WEBHOOK_SECRET);
  } catch (error) {
    if (error instanceof MuxSignatureError) throw new ApiError(400, 'Invalid Mux signature');
    throw error;
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new ApiError(400, 'Invalid Mux event');
  }
  return handleMuxWebhookEvent(event);
}

// Bounded recovery for attached attempts too: previously the orphan sweep
// skipped these forever, so a missed ready/error webhook stranded the game.
// Dry-run performs database reads only. Every provider read proves identity.
async function reconcileVideoLifecycle({ now = new Date(), dryRun = false, limit = 25 } = {}) {
  const attempts = await repository.listStaleUploadAttempts({
    olderThan: new Date(now.getTime() - 10 * 60 * 1000),
    limit,
    statuses: ['uploading', 'processing'],
  });
  const summary = { scanned: attempts.length, recovered: 0, errors: 0, planned: [] };
  // V6: recovery reads a 404 as "media gone" and discards the attempt; never
  // do that with credentials that cannot see this deployment's media.
  if (!dryRun && attempts.length > 0 && !(await verifyMuxEnvironment()).verified) {
    return { ...summary, skipped: 'mux_environment_unverified' };
  }
  for (const attempt of attempts) {
    try {
      if (dryRun) {
        summary.planned.push({ attemptId: String(attempt._id), gameId: String(attempt.gameId) });
        continue;
      }
      if (attempt.deployment !== repository.getVideoDeployment()) continue;
      let assetId = attempt.assetId;
      if (!assetId) {
        const upload = await mux.getDirectUpload(attempt.uploadId);
        if (upload.id !== attempt.uploadId) throw new Error('Mux returned an unrelated upload');
        assetId = upload.asset_id;
        if (!assetId) {
          if (['errored', 'timed_out', 'cancelled'].includes(upload.status)) {
            await discard(attempt, 'recovered_upload_failure', 'errored');
            summary.recovered += 1;
          }
          continue;
        }
      }
      const asset = await mux.getAsset(assetId);
      if (asset.id !== assetId || (asset.upload_id && asset.upload_id !== attempt.uploadId)) {
        throw new Error('Mux returned an unrelated asset');
      }
      const type =
        asset.status === 'ready'
          ? 'video.asset.ready'
          : asset.status === 'errored'
            ? 'video.asset.errored'
            : 'video.upload.asset_created';
      await applyEvent({
        type,
        data: type.startsWith('video.upload.')
          ? { id: attempt.uploadId, asset_id: assetId }
          : { ...asset, upload_id: attempt.uploadId },
      });
      summary.recovered += 1;
    } catch (error) {
      // A proven target returning 404 is gone; transient provider/database
      // failures remain in-flight and are retried by the next sweep.
      if (error instanceof mux.MuxApiError && error.status === 404) {
        try {
          await discard(attempt, 'provider_media_gone', 'errored');
          summary.recovered += 1;
        } catch {
          summary.errors += 1;
        }
      } else {
        summary.errors += 1;
        logger.error(
          { attemptId: String(attempt._id), err: repository.summarizeCleanupError(error) },
          'Video lifecycle recovery failed'
        );
      }
    }
  }
  return summary;
}

module.exports = {
  handleMuxWebhook,
  handleMuxWebhookEvent,
  reconcileVideoLifecycle,
  assetRejectionReason,
};
