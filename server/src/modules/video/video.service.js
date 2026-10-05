// Mux game video — upload creation, cancellation and removal (plan Task 4,
// R1–R4, R8; rulings P1/P2/P6, E1–E6; controller addendum).
//
// Upload creation order (R2/R4): origin allowlist → writable game access →
// P1 allowance → replaceable-status check → atomic quota reservation → attempt
// (fresh generation) → Mux direct upload → record uploadId → [enqueue cleanup
// of the replaced generation] → conditional attach → retire the replaced
// attempt. Every rejection happens before the Mux call; every failure after it
// is compensated (attempt retired, slot released exactly once, the undisclosed
// upload cancelled through a durable job).
//
// Removal order (ruling, R3) — cancel, remove, replace and game deletion:
// enqueue cleanup for what the attempt owns FIRST (a failed enqueue aborts
// with 5xx, nothing detached) → detach the generation (tokens denied at once)
// → retire the attempt and release its slot or stored minutes exactly once →
// kickCleanup(). The worker defers any job whose generation is still attached
// (video.cleanup.js), so enqueueing before the detach can never delete media
// the game still shows.
//
// Exactly-once quota (T3b): a slot or stored minutes are released only by the
// caller whose transitionUploadAttempt OUT of the holding status returned
// non-null. The upload URL is a bearer credential: it is returned once and
// never logged or attached to an error.
const { logger } = require('../../config/logger');
const { isAllowedClientOrigin } = require('../../config/cors');
const { ApiError } = require('../../utils/apiError');
const {
  sanitizeGameVideo,
  getCurrentVideoTimelineId,
  getCurrentTimelineIds,
} = require('../shared/gameVideo');
const gamesService = require('../games/games.service');
const muxClient = require('./mux.client');
const repository = require('./video.repository');
const { kickCleanup } = require('./video.cleanup');
const { resolveUploadAllowance, resolveVideoManagerAccess } = require('./video.policy');

// Ruling: an upload reserves a fixed upper bound of stored minutes at create
// time (duration is unknown before ingest); T5 converts it to the verified
// minutes when the asset is ready (commitStoredMinutes) or releases it.
const UPLOAD_RESERVATION_MINUTES = 180;

// GC/V22: one video per game; cancel or remove it before another upload.
// Attempt statuses that hold no slot but may hold stored minutes.
const SETTLED_ATTEMPT_STATUSES = ['ready', 'errored'];
const TERMINAL_ATTEMPT_STATUSES = ['cancelled', 'superseded', 'rejected'];
// A ready video is removed only through DELETE /video (explicit removal).
const CANCELLABLE_ATTEMPT_STATUSES = [...repository.UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES, 'errored'];

// Stable machine values in ApiError details.reason (alongside the P1
// allowance reasons, which are passed through on a 403).
const VIDEO_ERROR_REASONS = Object.freeze({
  ORIGIN_NOT_ALLOWED: 'origin_not_allowed',
  VIDEO_EXISTS: 'video_exists',
  QUOTA_EXCEEDED: 'quota_exceeded',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  UPLOAD_CANCELLED: 'upload_cancelled',
  UPLOAD_CONFLICT: 'upload_conflict',
  ATTEMPT_NOT_FOUND: 'attempt_not_found',
  VIDEO_READY: 'video_ready',
  NO_VIDEO: 'no_video',
  VIDEO_CHANGED: 'video_changed',
});
const R = VIDEO_ERROR_REASONS;

function videoError(statusCode, message, reason) {
  return new ApiError(statusCode, message, { reason });
}

function attemptLogFields(attempt) {
  return {
    attemptId: String(attempt._id),
    gameId: String(attempt.gameId),
    generationId: attempt.generationId,
  };
}

// ─── Attempt bookkeeping ─────────────────────────────────────────────────────

async function releaseQuota(release, logFields) {
  try {
    await release();
  } catch (error) {
    // The transition already succeeded, so this cannot be retried from here:
    // the counter over-counts (fails closed) until an operator corrects it.
    logger.error(
      { ...logFields, err: repository.summarizeCleanupError(error) },
      'Video quota release failed after the upload attempt was retired'
    );
  }
}

// Move an attempt to a terminal status and hand back what it holds, exactly
// once. In-flight → the upload slot; ready/errored → stored minutes (via the
// atomic take). Trying in-flight first and settled second stays correct if T5
// moves the attempt between the two (e.g. processing → ready commits minutes,
// which the second transition then hands back). Never throws: a failure leaves
// an in-flight attempt to reconciliation, and a ready attempt's minutes to the
// worker's take after the asset is deleted.
// → the retired attempt | null (someone else retired it first, or failure)
async function retireAttempt(attempt, toStatus, set = {}) {
  try {
    const fromInFlight = await repository.transitionUploadAttempt({
      attemptId: attempt._id,
      fromStatuses: repository.UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES,
      toStatus,
      set,
    });
    if (fromInFlight) {
      await releaseQuota(
        () =>
          repository.releaseUploadSlot({
            resource: attempt.billingResource,
            reservedMinutes: attempt.reservedMinutes,
          }),
        { ...attemptLogFields(attempt), toStatus }
      );
      return fromInFlight;
    }

    // V14: settled media keeps its stored minutes counted here. Every caller
    // queues the asset's delete_asset job first, and that job hands the
    // minutes back once Mux confirms deletion.
    const fromSettled = await repository.transitionUploadAttempt({
      attemptId: attempt._id,
      fromStatuses: SETTLED_ATTEMPT_STATUSES,
      toStatus,
      set,
    });
    return fromSettled;
  } catch (error) {
    logger.error(
      { ...attemptLogFields(attempt), toStatus, err: repository.summarizeCleanupError(error) },
      'Video upload attempt could not be retired; reconciliation will release it'
    );
    return null;
  }
}

// What the attempt owns at Mux, as one cleanup job: its asset when known
// (the upload is then done), else its upload — a cancel that finds the upload
// completed resolves to the asset in the worker. A `reserved` attempt never
// reached Mux and owns nothing.
function cleanupTargetFor(attempt) {
  if (attempt.assetId) return { kind: 'delete_asset', targetId: attempt.assetId };
  if (attempt.uploadId) return { kind: 'cancel_upload', targetId: attempt.uploadId };
  return null;
}

// Durable, idempotent; THROWS on a database error (R3: no success reported).
async function enqueueAttemptCleanup(attempt, reason) {
  const target = cleanupTargetFor(attempt);
  if (!target) return null;
  return repository.enqueueCleanupJob({
    ...target,
    attemptId: attempt._id,
    gameId: attempt.gameId,
    reason,
  });
}

function warnUnownedGeneration(gameId, generationId) {
  // E3: without an owning attempt TSW cannot prove the media is its own, so it
  // is never deleted. Detaching still denies new tokens.
  logger.warn(
    { gameId: String(gameId), generationId },
    'Hosted video has no owning upload attempt; provider media cannot be cleaned (E3)'
  );
}

// A freshly created upload that will not be attached. Its URL was never
// disclosed, so if the cancel cannot even be queued nobody can upload to it
// and Mux times it out with no asset — retire the attempt regardless so the
// league's slot is not held until reconciliation.
async function abandonNewUpload(attempt, uploadId, toStatus, reason) {
  try {
    await repository.enqueueCleanupJob({
      kind: 'cancel_upload',
      targetId: uploadId,
      attemptId: attempt._id,
      gameId: attempt.gameId,
      reason,
    });
  } catch (error) {
    logger.warn(
      { ...attemptLogFields(attempt), err: repository.summarizeCleanupError(error) },
      'Video upload cancel could not be queued; the undisclosed upload will expire'
    );
  }
  await retireAttempt(attempt, toStatus);
  kickCleanup();
}

async function detachFreshGenerationQuietly(attempt) {
  try {
    await repository.detachGameVideo({
      gameId: attempt.gameId,
      generationId: attempt.generationId,
    });
  } catch (error) {
    // Reconcile/removal recovers: the Game would show an 'uploading' video
    // whose cancel job defers until it is removed.
    logger.warn(
      { ...attemptLogFields(attempt), err: repository.summarizeCleanupError(error) },
      'Video attach failed and the fresh generation could not be detached'
    );
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

async function reserveAttempt({ userId, game, allowance, sameRecording }) {
  const resource = allowance.billingResource;
  const slot = await repository.reserveUploadSlot({
    resource,
    limits: allowance.limits,
    reservedMinutes: UPLOAD_RESERVATION_MINUTES,
  });
  if (!slot) {
    throw videoError(429, 'This league has used its video upload allowance', R.QUOTA_EXCEEDED);
  }

  try {
    // P6: the timeline in effect now; "same recording" only means something
    // when there is one.
    // V8: plus every timeline it already plays, so the chain carries forward.
    const previousTimelineId = getCurrentVideoTimelineId(game);
    return await repository.createUploadAttempt({
      gameId: game._id,
      billingResource: resource,
      createdBy: userId,
      sameRecording: Boolean(sameRecording && previousTimelineId),
      previousTimelineId,
      previousTimelineIds: getCurrentTimelineIds(game),
      reservedMinutes: UPLOAD_RESERVATION_MINUTES,
    });
  } catch (error) {
    // No attempt holds the slot, so this caller releases it.
    await releaseQuota(
      () => repository.releaseUploadSlot({ resource, reservedMinutes: UPLOAD_RESERVATION_MINUTES }),
      { gameId: String(game._id), attemptId: null }
    );
    throw error;
  }
}

async function createMuxUpload(attempt, game, origin) {
  let upload;
  try {
    upload = await muxClient.createDirectUpload({ gameId: String(game._id), corsOrigin: origin });
  } catch (error) {
    logger.error(
      { ...attemptLogFields(attempt), err: repository.summarizeCleanupError(error) },
      'Mux direct upload creation failed'
    );
  }
  if (!upload?.id || !upload?.url) {
    await retireAttempt(attempt, 'rejected', { errorMessage: 'provider_create_failed' });
    throw videoError(502, 'Could not start the upload. Please try again.', R.PROVIDER_UNAVAILABLE);
  }
  return upload;
}

async function recordUploadId(attempt, uploadId) {
  let recorded;
  try {
    recorded = await repository.setUploadAttemptUploadId({ attemptId: attempt._id, uploadId });
  } catch (error) {
    // Unrecorded, the upload is not provably ours (E3) and cannot be queued
    // for cancellation; its URL is never disclosed, so it expires unused.
    await retireAttempt(attempt, 'rejected', { errorMessage: 'upload_id_not_recorded' });
    throw error;
  }
  if (!recorded) {
    // Cancelled (or reconciled) while Mux was creating the upload; whoever
    // did that released the slot.
    logger.info(attemptLogFields(attempt), 'Video upload attempt was cancelled during creation');
    throw videoError(409, 'This upload was cancelled.', R.UPLOAD_CANCELLED);
  }
}

/**
 * POST /games/:gameId/video/uploads. `sizeBytes`/`mimeType` are validated by
 * the controller for usability only (R2) and are not trusted here.
 * @returns {Promise<{uploadUrl: string, attemptId: string, video: object}>}
 */
async function createGameVideoUpload({ userId, gameId, origin, sameRecording = false }) {
  // E6: the browser Origin becomes Mux's cors_origin; never `*`, never absent.
  if (!isAllowedClientOrigin(origin)) {
    throw videoError(403, 'Uploads must start from the TSW app.', R.ORIGIN_NOT_ALLOWED);
  }
  const game = await gamesService.assertGameAccess(userId, gameId, { requireWritable: true });
  const allowance = await resolveUploadAllowance({ userId, game });
  if (!allowance.allowed) {
    throw videoError(403, 'Video upload is not available for this game.', allowance.reason);
  }

  // V22: one video at a time. Replacing an unfinished upload needed a second
  // concurrent slot (a misleading 429 at the default limit of 1) and failures
  // detach rather than store `errored`, so cancel or remove first.
  if (game.video) {
    throw videoError(
      409,
      game.video.status === 'ready'
        ? 'This game already has a video. Remove it before uploading another.'
        : 'This game has an upload in progress. Cancel it before uploading another.',
      R.VIDEO_EXISTS
    );
  }

  const attempt = await reserveAttempt({ userId, game, allowance, sameRecording });
  const upload = await createMuxUpload(attempt, game, origin);
  await recordUploadId(attempt, upload.id);

  let attached;
  try {
    attached = await repository.attachGameVideo({
      gameId: game._id,
      expectedGenerationId: null,
      allowReplaceStatuses: [],
      previousVersion: null,
      video: {
        status: 'uploading',
        generationId: attempt.generationId,
        uploadId: upload.id,
        uploadedByUserId: userId,
        uploadStartedAt: new Date(),
        equivalentTimelines: [],
      },
    });
  } catch (error) {
    // The write may have applied before the error (e.g. a lost reply). Undo
    // it conditionally on our own fresh generation — safe: nothing else can
    // carry it, its URL was never disclosed, and it is never re-attached
    // (OPT-028) — so the abandoned cancel is not deferred as "referenced".
    await detachFreshGenerationQuietly(attempt);
    await abandonNewUpload(attempt, upload.id, 'rejected', 'create_failed');
    throw error;
  }

  if (!attached) {
    // Another create (or a webhook/removal) changed the game first.
    await abandonNewUpload(attempt, upload.id, 'superseded', 'attach_lost');
    throw videoError(
      409,
      'Another change to this game’s video happened at the same time. Reload and try again.',
      R.UPLOAD_CONFLICT
    );
  }

  return {
    uploadUrl: upload.url,
    attemptId: String(attempt._id),
    video: sanitizeGameVideo(attached.video),
  };
}

// ─── Cancel / remove ─────────────────────────────────────────────────────────

// Takedown authorization (controller ruling): authenticated + game access +
// league owner/active league manager. Deliberately NOT writable billing and
// NOT the hosting allowance — a lapsed League or a disabled grant must still
// be able to take media down and stop Mux storage. assertGameAccess without
// requireWritable applies exactly canAccessGame's rules (owner, standalone
// dual-team side owner, canManageLeagueGame) and 404s an unrelated user; the
// explicit userId guard matters because its null-user path returns any game.
async function assertVideoManager(userId, gameId) {
  if (!userId) throw new ApiError(401, 'Unauthorized');
  const game = await gamesService.assertGameAccess(userId, gameId);
  const access = await resolveVideoManagerAccess({ userId, game });
  if (!access.allowed) {
    throw videoError(403, 'Only league owners and managers can change game video.', access.reason);
  }
  return game;
}

/**
 * DELETE /games/:gameId/video/uploads/:attemptId (R8). Idempotent: an attempt
 * that already ended resolves `{ cancelled: false, status }`.
 * @returns {Promise<{cancelled: boolean, status?: string}>}
 */
async function cancelGameVideoUpload({ userId, gameId, attemptId }) {
  const game = await assertVideoManager(userId, gameId);
  const attempt = await repository.findUploadAttemptById(attemptId);
  if (!attempt || String(attempt.gameId) !== String(game._id)) {
    throw videoError(404, 'Upload not found.', R.ATTEMPT_NOT_FOUND);
  }
  if (TERMINAL_ATTEMPT_STATUSES.includes(attempt.status)) {
    return { cancelled: false, status: attempt.status };
  }
  if (!CANCELLABLE_ATTEMPT_STATUSES.includes(attempt.status)) {
    throw videoError(
      409,
      'This video has finished processing. Remove it from the game instead.',
      R.VIDEO_READY
    );
  }

  await enqueueAttemptCleanup(attempt, 'upload_cancelled');
  // Conditional on the attempt's own generation: null when the game never
  // carried it (crash before attach) or has moved on — both fine here.
  await repository.detachGameVideo({ gameId: game._id, generationId: attempt.generationId });
  await retireAttempt(attempt, 'cancelled');
  kickCleanup();
  return { cancelled: true };
}

/**
 * DELETE /games/:gameId/video — remove hosted media in any status.
 * @returns {Promise<{video: null}>}
 */
async function removeGameVideo({ userId, gameId }) {
  const game = await assertVideoManager(userId, gameId);
  const current = game.video || null;
  if (!current) throw videoError(404, 'This game has no hosted video.', R.NO_VIDEO);

  const attempt = await repository.findUploadAttemptByGenerationId(current.generationId);
  if (attempt) await enqueueAttemptCleanup(attempt, 'video_removed');
  else warnUnownedGeneration(game._id, current.generationId);

  const removed = await repository.detachGameVideo({
    gameId: game._id,
    generationId: current.generationId,
  });
  if (!removed) {
    // Replaced or removed concurrently; that writer owns the old attempt.
    kickCleanup();
    throw videoError(409, 'This game’s video changed. Reload and try again.', R.VIDEO_CHANGED);
  }

  if (attempt) await retireAttempt(attempt, 'cancelled');
  kickCleanup();
  return { video: null };
}

// ─── Game deletion (games.service.deleteGameForUser) ─────────────────────────

/**
 * Before the Game is deleted: persist cleanup for its current video's attempt.
 * Throws on a failed read or enqueue — the caller must abort the delete (R3).
 * @returns {Promise<object|null>} the owning attempt, for finishGameVideoCleanupAfterDeletion
 */
async function queueGameVideoCleanupForDeletion(game) {
  const generationId = game?.video?.generationId;
  if (!generationId) return null;
  const attempt = await repository.findUploadAttemptByGenerationId(generationId);
  if (!attempt) {
    warnUnownedGeneration(game._id, generationId);
    return null;
  }
  await enqueueAttemptCleanup(attempt, 'game_deleted');
  return attempt;
}

/** After the Game is deleted: retire the attempt and start the worker. Never throws. */
async function finishGameVideoCleanupAfterDeletion(attempt) {
  if (!attempt) return;
  await retireAttempt(attempt, 'cancelled');
  kickCleanup();
}

module.exports = {
  UPLOAD_RESERVATION_MINUTES,
  VIDEO_ERROR_REASONS,
  handleMuxWebhook: (input) => require('./video.lifecycle').handleMuxWebhook(input),
  handleMuxWebhookEvent: (input) => require('./video.lifecycle').handleMuxWebhookEvent(input),
  getGameVideoPlayback: (input) => require('./video.playback').getGameVideoPlayback(input),
  createGameVideoUpload,
  cancelGameVideoUpload,
  removeGameVideo,
  queueGameVideoCleanupForDeletion,
  finishGameVideoCleanupAfterDeletion,
};
