// Mux game video — durable provider cleanup (plan R3, Task 3d; rulings E3/E4).
//
// VideoCleanupJob rows (video.repository) are processed with the Instagram
// delivery lease/backoff pattern (social/instagram/instagram.delivery.service.js):
//   (a) kickCleanup()            setImmediate, right after a caller enqueues
//   (b) startVideoCleanupSweep() bounded, lease-claimed, unref'd interval
//                                (server.js, only when Mux is configured)
//   (c) pnpm --filter server video:reconcile   manual run, supports --dry-run
// Leases make concurrent runs (kick + sweep, several instances) safe.
//
// E3 ownership: a job is only executed when its upload attempt — of this
// deployment — owns the target (uploadId for cancel_upload, assetId for
// delete_asset). Callers must record an asset id on the attempt before
// enqueueing its delete_asset. Nothing without an owning attempt is touched.
//
// Reference recheck (T4 removal order): callers persist a job BEFORE they
// detach/replace Game.video (R3), so a job can exist while its generation is
// still attached. Before any Mux call the worker rechecks the Game; while it
// still carries the attempt's generation the job is deferred — referenced
// media is never deleted. A deferral is not a try: it does not spend the Mux
// retry budget (deferCleanupJob refunds the claim) but has its own window
// (CLEANUP_MAX_DEFERRAL_MS from the first deferral), after which a job whose
// media is STILL attached ends terminal-failed with a distinct log. A game
// that no longer exists is not referencing anything.
const crypto = require('crypto');
const { logger } = require('../../config/logger');
const muxClient = require('./mux.client');
const repository = require('./video.repository');

const CLEANUP_LEASE_MS = 2 * 60 * 1000; // a job is ≤ 2 Mux calls of ≤ 15 s each
const CLEANUP_MAX_ATTEMPTS = 10; // ≈ 4 h of backoff before a terminal failure
const CLEANUP_BASE_RETRY_DELAY_MS = 60 * 1000;
const CLEANUP_MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const CLEANUP_BATCH_LIMIT = 10;
const CLEANUP_MAX_BATCH_LIMIT = 50;
// Well past Mux's 6 h direct-upload timeout, so an abandoned upload can no
// longer be in progress; attempts still referenced by their Game are never
// touched whatever their age.
const RECONCILE_GRACE_MS = 24 * 60 * 60 * 1000;
const RECONCILE_LIMIT = 25;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const RECONCILED_ERROR_MESSAGE = 'Reconciled: stale upload no longer referenced by its game';
// The caller that enqueued normally detaches within milliseconds, so the first
// deferral is short; it doubles per deferral up to the cap. A job still
// referenced a day after its first deferral (a detach that never happened —
// the media is in use) is left terminal-failed, never deleted; re-enqueueing
// (a later removal) resets it.
const CLEANUP_REFERENCED_DEFER_MS = 30 * 1000;
const CLEANUP_MAX_DEFER_DELAY_MS = 15 * 60 * 1000;
const CLEANUP_MAX_DEFERRAL_MS = 24 * 60 * 60 * 1000;

const OWNERSHIP_NOT_PROVEN = 'ownership_not_proven';
const STILL_REFERENCED_EXPIRED = 'still_referenced_expired';

// A failure the job must not retry (ownership not proven, unexpected outcome).
function nonRetryable(code) {
  return Object.assign(new Error(code), { name: 'VideoCleanupError', code, retryable: false });
}

// Mux client errors carry `retryable`; anything else (database, network) is
// treated as transient and retried within the attempt budget.
function isRetryable(error) {
  return error?.retryable !== false;
}

function lastErrorOf(error) {
  return error?.name === 'VideoCleanupError' ? error.code : error;
}

function cleanupRetryAt(attempts, now, random = Math.random) {
  const baseDelay = Math.min(
    CLEANUP_MAX_RETRY_DELAY_MS,
    CLEANUP_BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1)
  );
  const jitteredDelay = Math.round(baseDelay * (0.8 + random() * 0.4));
  return new Date(now.getTime() + Math.min(CLEANUP_MAX_RETRY_DELAY_MS, jitteredDelay));
}

function cleanupDeferAt(deferrals, now) {
  const delay = Math.min(
    CLEANUP_MAX_DEFER_DELAY_MS,
    CLEANUP_REFERENCED_DEFER_MS * 2 ** Math.max(0, Math.min(deferrals || 0, 30))
  );
  return new Date(now.getTime() + delay);
}

function newLeaseOwner() {
  return `video-cleanup:${process.pid}:${crypto.randomUUID()}`;
}

function jobLogFields(job) {
  return {
    jobId: String(job._id),
    kind: job.kind,
    gameId: String(job.gameId),
    attemptId: String(job.attemptId),
    targetId: job.targetId,
  };
}

// E3: the attempt named by the job, of this deployment, owns the target.
async function findOwningAttempt(job) {
  const attempt = await repository.findUploadAttemptById(job.attemptId);
  const ownedId = job.kind === 'delete_asset' ? attempt?.assetId : attempt?.uploadId;
  if (
    !attempt ||
    attempt.deployment !== repository.getVideoDeployment() ||
    !ownedId ||
    ownedId !== job.targetId
  ) {
    throw nonRetryable(OWNERSHIP_NOT_PROVEN);
  }
  return attempt;
}

// A read failure propagates (a retryable try) — never "not referenced".
async function isStillReferenced(attempt) {
  return repository.isGameVideoGenerationReferenced({
    gameId: attempt.gameId,
    generationId: attempt.generationId,
  });
}

// The job's media is still attached: defer without spending the retry budget,
// or — past the deferral window — fail it terminally (the media is in use, so
// this is not an orphan alert like 'failed permanently').
async function deferReferencedJob(job, now) {
  const deferrals = job.deferrals || 0;
  const firstDeferredAt = job.firstDeferredAt ? new Date(job.firstDeferredAt) : null;
  try {
    if (firstDeferredAt && now.getTime() - firstDeferredAt.getTime() >= CLEANUP_MAX_DEFERRAL_MS) {
      const failed = await repository.failCleanupJobAttempt({
        jobId: job._id,
        leaseOwner: job.leaseOwner,
        retryable: false,
        nextAttemptAt: null,
        error: STILL_REFERENCED_EXPIRED,
      });
      if (!failed) return { status: 'lost_lease' };
      logger.warn(
        { ...jobLogFields(job), deferrals, firstDeferredAt },
        'Video cleanup abandoned: media still referenced after the deferral window'
      );
      return { status: 'failed' };
    }

    const deferred = await repository.deferCleanupJob({
      jobId: job._id,
      leaseOwner: job.leaseOwner,
      nextAttemptAt: cleanupDeferAt(deferrals, now),
      now,
    });
    if (!deferred) return { status: 'lost_lease' };
    logger.info(
      { ...jobLogFields(job), deferrals: deferrals + 1 },
      'Video cleanup deferred: media still referenced by its game'
    );
    return { status: 'retry' };
  } catch (error) {
    // The lease expires and the job is claimed again.
    logger.error(
      { ...jobLogFields(job), err: repository.summarizeCleanupError(error) },
      'Video cleanup could not record a deferral'
    );
    return { status: 'error' };
  }
}

async function complete(job, outcome, now) {
  const completed = await repository.completeCleanupJob({
    jobId: job._id,
    leaseOwner: job.leaseOwner,
    outcome,
    now,
  });
  return { status: completed ? 'done' : 'lost_lease', outcome };
}

async function processCancelUpload(job, attempt, now) {
  const result = await muxClient.cancelDirectUpload(job.targetId);
  if (['cancelled', 'expired', 'gone'].includes(result?.outcome)) {
    return complete(job, result.outcome, now);
  }
  if (result?.outcome !== 'completed' || !result.assetId) {
    throw nonRetryable('unexpected_cancel_outcome');
  }

  // The upload already produced an asset. It is ours only through this
  // attempt's upload: record it on the attempt (identity-checked), then queue
  // its deletion as its own durable job. Never delete inline.
  const { assetId } = result;
  if (attempt.assetId && attempt.assetId !== assetId) throw nonRetryable(OWNERSHIP_NOT_PROVEN);
  if (!attempt.assetId) {
    const recorded = await repository.transitionUploadAttempt({
      attemptId: attempt._id,
      fromStatuses: [attempt.status],
      toStatus: attempt.status,
      expectedUploadId: job.targetId,
      expectedAssetId: null,
      set: { assetId },
    });
    // The attempt changed (or vanished) since we read it: retry, and the next
    // run re-proves ownership from scratch.
    if (!recorded) throw new Error('upload attempt changed concurrently');
  }
  await repository.enqueueCleanupJob({
    kind: 'delete_asset',
    targetId: assetId,
    attemptId: attempt._id,
    gameId: job.gameId,
    reason: 'cancel_completed',
    now,
  });
  return complete(job, 'completed', now);
}

async function releaseStoredMinutesOnce(job, attempt) {
  try {
    const minutes = await repository.takeUploadAttemptStoredMinutes(attempt._id);
    if (minutes > 0) {
      await repository.releaseStoredMinutes({ resource: attempt.billingResource, minutes });
    }
  } catch (error) {
    // The asset is confirmed gone; the counter over-counts (fails closed).
    logger.error(
      { ...jobLogFields(job), err: repository.summarizeCleanupError(error) },
      'Video cleanup could not release stored minutes'
    );
  }
}

async function processDeleteAsset(job, attempt, now) {
  const result = await muxClient.deleteAsset(job.targetId);
  if (!['deleted', 'gone'].includes(result?.outcome)) {
    throw nonRetryable('unexpected_delete_outcome');
  }
  const completed = await complete(job, result.outcome, now);
  // takeUploadAttemptStoredMinutes hands the minutes out exactly once, so this
  // is safe even when another worker re-ran the job after a lost lease.
  await releaseStoredMinutesOnce(job, attempt);
  return completed;
}

async function recordFailure(job, error, now, random) {
  const retryable = isRetryable(error);
  const exhausted = retryable && job.attempts >= CLEANUP_MAX_ATTEMPTS;
  const nextAttemptAt = retryable && !exhausted ? cleanupRetryAt(job.attempts, now, random) : null;
  try {
    const updated = await repository.failCleanupJobAttempt({
      jobId: job._id,
      leaseOwner: job.leaseOwner,
      retryable,
      nextAttemptAt,
      error: lastErrorOf(error),
    });
    if (!updated) return { status: 'lost_lease' };
  } catch (failure) {
    // The lease expires and the job is claimed again.
    logger.error(
      { ...jobLogFields(job), err: repository.summarizeCleanupError(failure) },
      'Video cleanup could not record a job failure'
    );
    return { status: 'error' };
  }
  if (nextAttemptAt) return { status: 'retry' };

  // L8: a terminal failure leaves provider media behind — ops alert on this.
  logger.warn(
    {
      ...jobLogFields(job),
      attempts: job.attempts,
      exhausted,
      lastError: repository.summarizeCleanupError(lastErrorOf(error)),
    },
    'Video cleanup job failed permanently'
  );
  return { status: 'failed' };
}

/**
 * Execute one leased job (from claimDueCleanupJobs). Never throws.
 * @returns {Promise<{status:'done'|'lost_lease'|'retry'|'failed'|'error', outcome?:string}>}
 */
async function processCleanupJob(job, { now = new Date(), random = Math.random } = {}) {
  try {
    if (!['cancel_upload', 'delete_asset'].includes(job.kind)) {
      throw nonRetryable('unknown_job_kind');
    }
    const attempt = await findOwningAttempt(job);
    if (await isStillReferenced(attempt)) return await deferReferencedJob(job, now);
    return job.kind === 'cancel_upload'
      ? await processCancelUpload(job, attempt, now)
      : await processDeleteAsset(job, attempt, now);
  } catch (error) {
    return recordFailure(job, error, now, random);
  }
}

const SUMMARY_KEYS = {
  done: 'done',
  retry: 'retry',
  failed: 'failed',
  lost_lease: 'lostLease',
  error: 'error',
};

/**
 * Claim and process up to `limit` due jobs of this deployment, one claim (and
 * so one fresh lease) at a time. Throws only if claiming itself fails.
 * `now` fixes the clock (tests); omitted, each claim uses the current time so
 * a follow-up delete_asset queued during the batch is picked up in it.
 */
async function runCleanupBatch({
  now,
  limit = CLEANUP_BATCH_LIMIT,
  leaseOwner = newLeaseOwner(),
  random = Math.random,
  shouldStop = () => false,
} = {}) {
  const summary = {
    skipped: null,
    claimed: 0,
    done: 0,
    retry: 0,
    failed: 0,
    lostLease: 0,
    error: 0,
  };
  if (!muxClient.isMuxConfigured()) return { ...summary, skipped: 'mux_not_configured' };

  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit) || 1), CLEANUP_MAX_BATCH_LIMIT);
  while (summary.claimed < boundedLimit && !shouldStop()) {
    const claimNow = now ?? new Date();
    const [job] = await repository.claimDueCleanupJobs({
      now: claimNow,
      limit: 1,
      leaseOwner,
      leaseMs: CLEANUP_LEASE_MS,
    });
    if (!job) break;
    summary.claimed += 1;
    const result = await processCleanupJob(job, { now: claimNow, random });
    summary[SUMMARY_KEYS[result.status]] += 1;
  }
  return summary;
}

/** Dry-run view of runCleanupBatch: the jobs it would claim. Read-only, no Mux calls. */
async function previewCleanupBatch({ now = new Date(), limit = CLEANUP_BATCH_LIMIT } = {}) {
  const jobs = await repository.listDueCleanupJobs({ now, limit });
  return jobs.map((job) => ({
    jobId: String(job._id),
    kind: job.kind,
    targetId: job.targetId,
    attemptId: String(job.attemptId),
    gameId: String(job.gameId),
    status: job.status,
    attempts: job.attempts,
  }));
}

// What provider cleanup an abandoned attempt needs: its asset if it has one
// (a cancel would only resolve to it), else its upload, else nothing (it never
// reached Mux — only the quota slot is held).
function cleanupTargetFor(attempt) {
  if (attempt.assetId) return { kind: 'delete_asset', targetId: attempt.assetId };
  if (attempt.uploadId) return { kind: 'cancel_upload', targetId: attempt.uploadId };
  return null;
}

async function reconcileAttempt(attempt, { now, dryRun, summary }) {
  // Fresh reference recheck right before the conditional transition. A
  // generation is attached to a Game once, before Mux is called, and ids are
  // never reused — so a stale generation the Game no longer carries (or a
  // game that is gone) cannot become referenced again. A failed read throws.
  const referenced = await repository.isGameVideoGenerationReferenced({
    gameId: attempt.gameId,
    generationId: attempt.generationId,
  });
  if (referenced) {
    summary.referenced += 1;
    return;
  }

  const cleanup = cleanupTargetFor(attempt);
  if (dryRun) {
    summary.planned.push({
      attemptId: String(attempt._id),
      gameId: String(attempt.gameId),
      status: attempt.status,
      cleanup,
    });
    return;
  }

  const identity = {
    expectedUploadId: attempt.uploadId ?? null,
    expectedAssetId: attempt.assetId ?? null,
  };
  // The transition out of an in-flight status is the claim: only the caller
  // whose transition returned non-null enqueues and releases (exactly once).
  const transitioned = await repository.transitionUploadAttempt({
    attemptId: attempt._id,
    fromStatuses: [attempt.status],
    toStatus: 'cancelled',
    ...identity,
    set: { errorMessage: RECONCILED_ERROR_MESSAGE },
  });
  if (!transitioned) {
    summary.raced += 1;
    return;
  }

  if (cleanup) {
    try {
      await repository.enqueueCleanupJob({
        ...cleanup,
        attemptId: attempt._id,
        gameId: attempt.gameId,
        reason: 'reconcile_stale',
        now,
      });
    } catch (error) {
      // R3: never give up the only record of the provider resource. Put the
      // attempt back in flight (it still holds its slot) so a later sweep
      // retries it.
      await repository
        .transitionUploadAttempt({
          attemptId: attempt._id,
          fromStatuses: ['cancelled'],
          toStatus: attempt.status,
          ...identity,
          set: { errorMessage: attempt.errorMessage ?? null },
        })
        .catch((restoreError) => {
          logger.error(
            {
              attemptId: String(attempt._id),
              gameId: String(attempt.gameId),
              err: repository.summarizeCleanupError(restoreError),
            },
            'Video reconcile could not restore an attempt after an enqueue failure; needs manual cleanup'
          );
        });
      throw error;
    }
    summary.enqueued += 1;
  }

  await repository.releaseUploadSlot({
    resource: attempt.billingResource,
    reservedMinutes: attempt.reservedMinutes,
  });
  summary.reconciled += 1;
}

/**
 * R3 reconciliation: this deployment's in-flight attempts untouched for
 * `graceMs` whose Game no longer references their generation are cancelled,
 * their provider cleanup is enqueued and their quota slot released. Attempts
 * still referenced are left alone; nothing without an attempt is touched.
 * Bounded by `limit`. With `dryRun`, reads only and returns `planned`.
 */
async function reconcileStaleAttempts({
  now = new Date(),
  graceMs = RECONCILE_GRACE_MS,
  limit = RECONCILE_LIMIT,
  dryRun = false,
} = {}) {
  const summary = {
    dryRun,
    scanned: 0,
    referenced: 0,
    reconciled: 0,
    enqueued: 0,
    raced: 0,
    errors: 0,
    planned: [],
  };
  const attempts = await repository.listStaleUploadAttempts({
    olderThan: new Date(now.getTime() - graceMs),
    limit,
    statuses: repository.UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES,
  });

  for (const attempt of attempts) {
    summary.scanned += 1;
    try {
      await reconcileAttempt(attempt, { now, dryRun, summary });
    } catch (error) {
      summary.errors += 1;
      logger.error(
        {
          attemptId: String(attempt._id),
          gameId: String(attempt.gameId),
          err: repository.summarizeCleanupError(error),
        },
        'Video reconcile failed for an upload attempt'
      );
    }
  }
  return summary;
}

/**
 * Best-effort immediate run after an enqueue (T4/T5 call this right after
 * enqueueCleanupJob). Returns immediately; errors are logged, never thrown.
 */
function kickCleanup() {
  try {
    if (!muxClient.isMuxConfigured()) return;
    setImmediate(() => {
      runCleanupBatch().catch((error) => {
        logger.error({ err: error }, 'Video cleanup kick failed');
      });
    });
  } catch (error) {
    logger.error({ err: error }, 'Video cleanup kick failed');
  }
}

const sweep = { timer: null, running: null, stopping: false };

function runSweepTick() {
  if (sweep.running) {
    logger.debug('Video cleanup sweep still running; skipping this tick');
    return sweep.running;
  }
  const shouldStop = () => sweep.stopping;
  sweep.running = (async () => {
    try {
      const cleanup = await runCleanupBatch({ shouldStop });
      if (shouldStop()) return;
      const reconcile = await reconcileStaleAttempts();
      if (cleanup.claimed > 0 || reconcile.reconciled > 0 || reconcile.errors > 0) {
        logger.info({ cleanup, reconcile }, 'Video cleanup sweep ran');
      }
    } catch (error) {
      logger.error({ err: error }, 'Video cleanup sweep failed');
    } finally {
      sweep.running = null;
    }
  })();
  return sweep.running;
}

/**
 * Start the in-process sweep (cleanup batch, then reconcile) on an unref'd
 * interval; a tick is skipped while the previous run is in flight.
 * @returns {boolean} true when started; false if already running or Mux is not configured.
 */
function startVideoCleanupSweep({ intervalMs = SWEEP_INTERVAL_MS } = {}) {
  if (sweep.timer || !muxClient.isMuxConfigured()) return false;
  sweep.stopping = false;
  sweep.timer = setInterval(runSweepTick, intervalMs);
  sweep.timer.unref?.();
  return true;
}

/**
 * Stop the sweep. The in-flight run (if any) claims no further jobs; the
 * returned promise settles (never rejects) once it has finished.
 */
function stopVideoCleanupSweep() {
  if (sweep.timer) {
    clearInterval(sweep.timer);
    sweep.timer = null;
  }
  sweep.stopping = true;
  return sweep.running ?? Promise.resolve();
}

module.exports = {
  CLEANUP_LEASE_MS,
  CLEANUP_MAX_ATTEMPTS,
  CLEANUP_BASE_RETRY_DELAY_MS,
  CLEANUP_MAX_RETRY_DELAY_MS,
  CLEANUP_BATCH_LIMIT,
  CLEANUP_MAX_BATCH_LIMIT,
  RECONCILE_GRACE_MS,
  RECONCILE_LIMIT,
  SWEEP_INTERVAL_MS,
  RECONCILED_ERROR_MESSAGE,
  CLEANUP_REFERENCED_DEFER_MS,
  CLEANUP_MAX_DEFER_DELAY_MS,
  CLEANUP_MAX_DEFERRAL_MS,
  cleanupRetryAt,
  cleanupDeferAt,
  processCleanupJob,
  runCleanupBatch,
  previewCleanupBatch,
  reconcileStaleAttempts,
  kickCleanup,
  startVideoCleanupSweep,
  stopVideoCleanupSweep,
};
