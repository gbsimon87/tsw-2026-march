// Mux game video — persistence (plan docs/superpowers/plans/2026-10-04-mux-game-video.md
// R2–R4, Task 3b; rulings E1–E4, P1/P2/P6). Four collections plus the only
// writers of Game.video:
//
//   VideoUploadAttempt  one per upload; proves TSW owns a Mux upload/asset (E3)
//   VideoCleanupJob     durable, leased, retried provider cancellation/deletion
//   VideoWebhookEvent   Mux event-id idempotency (TTL ~30 days)
//   VideoQuotaCounter   per billing resource: concurrent uploads, minutes, creates/day
//
// Every conditional write returns the updated record, or null when its
// condition no longer holds (lost a race, stale event, wrong status). Callers
// treat null as "someone else got there first" — never as an error to retry
// blindly. Programmer errors (bad arguments) throw.
//
// Production runs with autoIndex off (config/db.js, OPT-007): the unique
// indexes below are what make enqueue/idempotency/quota atomic, so run
// `pnpm --filter server video:ensure-indexes` in each deployed database.
const mongoose = require('mongoose');
const { env } = require('../../config/env');
const { Game } = require('../games/games.repository');
const {
  GAME_VIDEO_STATUSES,
  createGameVideoGenerationId,
  nextGameVideoVersion,
} = require('../shared/gameVideo');

const { ObjectId } = mongoose.Schema.Types;

const UPLOAD_ATTEMPT_STATUSES = [
  'reserved', // quota reserved, Game.video attached, Mux not yet called
  'uploading', // Mux direct upload created (uploadId known)
  'processing', // Mux asset created (assetId known)
  'ready',
  'errored',
  'cancelled',
  'superseded', // a newer generation replaced this one
  'rejected', // lost the attach race, failed verification or exceeded limits
];
// An attempt holds its quota slot (activeUploads + reservedMinutes) exactly
// while it is in one of these statuses. The status transition out of them is
// conditional, so the caller whose transition returned non-null releases (or
// commits) the slot exactly once.
const UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES = ['reserved', 'uploading', 'processing'];
const BILLING_RESOURCE_TYPES = ['league'];

const CLEANUP_JOB_KINDS = ['cancel_upload', 'delete_asset'];
const CLEANUP_JOB_STATUSES = ['pending', 'leased', 'done', 'failed'];
// Mirrors the mux.client outcomes: cancelDirectUpload → cancelled | completed
// (an asset now exists — enqueue delete_asset for it) | expired | gone;
// deleteAsset → deleted | gone.
const CLEANUP_JOB_OUTCOMES = ['cancelled', 'completed', 'expired', 'gone', 'deleted'];

const WEBHOOK_EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_STALE_ATTEMPTS_PER_SWEEP = 100;
const MAX_CLEANUP_CLAIMS_PER_SWEEP = 50;
const MAX_LAST_ERROR_LENGTH = 300;

function nonNegativeInteger(field, extra = {}) {
  return {
    type: Number,
    min: 0,
    validate: { validator: Number.isInteger, message: `${field} must be an integer` },
    ...extra,
  };
}

// E3: which database deployment created a record. Separate Mux environments
// per database are mandatory; this label additionally keeps a restored or
// copied database from acting on another deployment's attempts and jobs.
// Built from existing env only — never from the connection string's
// credentials or host.
function databaseNameFromUri(uri) {
  try {
    return new URL(uri).pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

function getVideoDeployment() {
  const environment = env.APP_ENV || env.NODE_ENV || 'unknown';
  const database = env.MONGO_DB_NAME || databaseNameFromUri(env.MONGO_URI) || 'default';
  return `${environment}:${database}`;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const billingResourceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: BILLING_RESOURCE_TYPES, required: true },
    id: { type: ObjectId, required: true },
  },
  { _id: false }
);

const videoUploadAttemptSchema = new mongoose.Schema(
  {
    gameId: { type: ObjectId, ref: 'Game', required: true },
    generationId: { type: String, required: true },
    // Left unset (never null) until known so the partial unique indexes below
    // only ever see real Mux ids.
    uploadId: { type: String },
    assetId: { type: String },
    billingResource: { type: billingResourceSchema, required: true },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    // P6: the uploader confirmed this is the same recording as the timeline
    // current when the attempt was created (previousTimelineId).
    sameRecording: { type: Boolean, default: false },
    previousTimelineId: { type: String, default: null },
    status: {
      type: String,
      enum: UPLOAD_ATTEMPT_STATUSES,
      default: 'reserved',
      required: true,
    },
    reservedMinutes: nonNegativeInteger('reservedMinutes', { required: true }),
    // Minutes committed to the billing resource's storedMinutes when the
    // asset became ready; handed back exactly once by takeUploadAttemptStoredMinutes.
    storedMinutes: nonNegativeInteger('storedMinutes', { default: 0 }),
    errorMessage: { type: String, default: null, maxlength: 500 },
    deployment: { type: String, required: true },
  },
  { timestamps: true }
);

videoUploadAttemptSchema.index({ generationId: 1 }, { unique: true });
videoUploadAttemptSchema.index(
  { uploadId: 1 },
  { unique: true, partialFilterExpression: { uploadId: { $type: 'string' } } }
);
videoUploadAttemptSchema.index(
  { assetId: 1 },
  { unique: true, partialFilterExpression: { assetId: { $type: 'string' } } }
);
// Reconciliation sweep: stale in-flight attempts of this deployment, oldest first.
videoUploadAttemptSchema.index({ deployment: 1, status: 1, updatedAt: 1 });

const videoCleanupJobSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: CLEANUP_JOB_KINDS, required: true },
    // Mux uploadId (cancel_upload) or assetId (delete_asset).
    targetId: { type: String, required: true },
    // E3: every job is owned by an upload attempt; nothing ownerless is deleted.
    attemptId: { type: ObjectId, ref: 'VideoUploadAttempt', required: true },
    gameId: { type: ObjectId, ref: 'Game', required: true },
    reason: { type: String, required: true, maxlength: 64 },
    deployment: { type: String, required: true },
    status: { type: String, enum: CLEANUP_JOB_STATUSES, default: 'pending', required: true },
    attempts: nonNegativeInteger('attempts', { default: 0 }),
    nextAttemptAt: { type: Date, default: null },
    leaseOwner: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    // Summarised by summarizeCleanupError — never a raw provider message.
    lastError: { type: String, default: null, maxlength: MAX_LAST_ERROR_LENGTH },
    outcome: { type: String, enum: [...CLEANUP_JOB_OUTCOMES, null], default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

videoCleanupJobSchema.index({ kind: 1, targetId: 1 }, { unique: true });
// claimDueCleanupJobs: one $or branch per index.
videoCleanupJobSchema.index({ deployment: 1, status: 1, nextAttemptAt: 1 });
videoCleanupJobSchema.index({ deployment: 1, status: 1, leaseExpiresAt: 1 });
// countPendingCleanupJobs({ gameId }): "media deletion pending" for a game.
videoCleanupJobSchema.index({ gameId: 1, status: 1 });

const videoWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true },
  type: { type: String, required: true },
  receivedAt: { type: Date, default: Date.now },
});

videoWebhookEventSchema.index({ eventId: 1 }, { unique: true });
// Mux retries a delivery for 24 hours; 30 days comfortably outlives that.
videoWebhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: WEBHOOK_EVENT_TTL_SECONDS });

const videoQuotaCounterSchema = new mongoose.Schema(
  {
    resourceType: { type: String, enum: BILLING_RESOURCE_TYPES, required: true },
    resourceId: { type: ObjectId, required: true },
    activeUploads: nonNegativeInteger('activeUploads', { default: 0 }),
    // Upper-bound minutes held by in-flight uploads (converted on ready).
    reservedMinutes: nonNegativeInteger('reservedMinutes', { default: 0 }),
    storedMinutes: nonNegativeInteger('storedMinutes', { default: 0 }),
    createsDay: { type: String, default: null }, // UTC 'YYYY-MM-DD'
    createsToday: nonNegativeInteger('createsToday', { default: 0 }),
  },
  { timestamps: true }
);

videoQuotaCounterSchema.index({ resourceType: 1, resourceId: 1 }, { unique: true });

const VideoUploadAttempt =
  mongoose.models.VideoUploadAttempt ||
  mongoose.model('VideoUploadAttempt', videoUploadAttemptSchema);
const VideoCleanupJob =
  mongoose.models.VideoCleanupJob || mongoose.model('VideoCleanupJob', videoCleanupJobSchema);
const VideoWebhookEvent =
  mongoose.models.VideoWebhookEvent || mongoose.model('VideoWebhookEvent', videoWebhookEventSchema);
const VideoQuotaCounter =
  mongoose.models.VideoQuotaCounter || mongoose.model('VideoQuotaCounter', videoQuotaCounterSchema);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const WRITE_OPTIONS = { new: true, runValidators: true, lean: true };

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertStatusList(statuses, allowed, name) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new TypeError(`${name} must be a non-empty array of statuses`);
  }
  for (const status of statuses) {
    if (!allowed.includes(status)) throw new TypeError(`${name} has unknown status ${status}`);
  }
}

function assertNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
}

// Identity filters are tri-state: undefined = don't care, null = must not be
// set yet, string = must equal.
function applyIdentityFilter(filter, path, expected) {
  if (expected !== undefined) filter[path] = expected;
}

// ---------------------------------------------------------------------------
// Upload attempts
// ---------------------------------------------------------------------------

// Reserve an attempt BEFORE calling Mux (R4). The generation id is minted here
// (createGameVideoGenerationId) and is what the caller attaches to Game.video.
// → plain attempt object
async function createUploadAttempt({
  gameId,
  billingResource,
  createdBy,
  sameRecording = false,
  previousTimelineId = null,
  reservedMinutes,
}) {
  const attempt = await VideoUploadAttempt.create({
    gameId,
    generationId: createGameVideoGenerationId(),
    billingResource,
    createdBy,
    sameRecording: Boolean(sameRecording),
    previousTimelineId,
    reservedMinutes,
    status: 'reserved',
    deployment: getVideoDeployment(),
  });
  return attempt.toObject();
}

// After Mux created the direct upload: record its id and move to 'uploading'.
// → attempt | null (attempt no longer reserved, or already has an upload)
async function setUploadAttemptUploadId({ attemptId, uploadId }) {
  assertNonEmptyString(uploadId, 'uploadId');
  return VideoUploadAttempt.findOneAndUpdate(
    { _id: attemptId, status: 'reserved', uploadId: null },
    { $set: { uploadId, status: 'uploading' } },
    WRITE_OPTIONS
  );
}

function findUploadAttemptBy(field, value) {
  if (!value) return Promise.resolve(null);
  return VideoUploadAttempt.findOne({ [field]: value }, null, { lean: true });
}

// → attempt | null
async function findUploadAttemptById(attemptId) {
  return findUploadAttemptBy('_id', attemptId);
}

async function findUploadAttemptByUploadId(uploadId) {
  return findUploadAttemptBy('uploadId', uploadId);
}

async function findUploadAttemptByAssetId(assetId) {
  return findUploadAttemptBy('assetId', assetId);
}

async function findUploadAttemptByGenerationId(generationId) {
  return findUploadAttemptBy('generationId', generationId);
}

const ATTEMPT_SETTABLE_FIELDS = ['uploadId', 'assetId', 'storedMinutes', 'errorMessage'];

// Conditional status transition. `fromStatuses` is the allowed prior status
// set ("never regress ready on a stale error" is expressed by the caller not
// listing 'ready'); expectedUploadId/expectedAssetId are tri-state identity
// checks. `set` may only touch ATTEMPT_SETTABLE_FIELDS.
// → attempt | null
async function transitionUploadAttempt({
  attemptId,
  fromStatuses,
  toStatus,
  expectedUploadId,
  expectedAssetId,
  set = {},
}) {
  assertStatusList(fromStatuses, UPLOAD_ATTEMPT_STATUSES, 'fromStatuses');
  if (!UPLOAD_ATTEMPT_STATUSES.includes(toStatus)) {
    throw new TypeError(`toStatus has unknown status ${toStatus}`);
  }
  for (const key of Object.keys(set)) {
    if (!ATTEMPT_SETTABLE_FIELDS.includes(key)) {
      throw new TypeError(`Upload attempt field ${key} is not writable by a transition`);
    }
  }

  const filter = { _id: attemptId, status: { $in: fromStatuses } };
  applyIdentityFilter(filter, 'uploadId', expectedUploadId);
  applyIdentityFilter(filter, 'assetId', expectedAssetId);

  return VideoUploadAttempt.findOneAndUpdate(
    filter,
    { $set: { ...set, status: toStatus } },
    WRITE_OPTIONS
  );
}

// Exactly-once hand-back of the minutes this attempt committed to its billing
// resource (for releaseStoredMinutes after the asset is deleted).
// → number of minutes to release (0 when none or already taken)
async function takeUploadAttemptStoredMinutes(attemptId) {
  const before = await VideoUploadAttempt.findOneAndUpdate(
    { _id: attemptId, storedMinutes: { $gt: 0 } },
    { $set: { storedMinutes: 0 } },
    { new: false, lean: true }
  );
  return before?.storedMinutes ?? 0;
}

// Reconciliation (R3): this deployment's attempts that have not moved since
// `olderThan`, oldest first, bounded.
// → attempt[]
async function listStaleUploadAttempts({
  olderThan,
  limit = MAX_STALE_ATTEMPTS_PER_SWEEP,
  statuses = UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES,
}) {
  assertStatusList(statuses, UPLOAD_ATTEMPT_STATUSES, 'statuses');
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit) || 1), MAX_STALE_ATTEMPTS_PER_SWEEP);
  return VideoUploadAttempt.find(
    {
      deployment: getVideoDeployment(),
      status: { $in: statuses },
      updatedAt: { $lt: olderThan },
    },
    null,
    { sort: { updatedAt: 1 }, limit: boundedLimit, lean: true }
  );
}

// ---------------------------------------------------------------------------
// Cleanup jobs (E4 — the Instagram delivery lease/backoff pattern)
// ---------------------------------------------------------------------------

function resetFailedCleanupJob({ kind, targetId, now }) {
  return VideoCleanupJob.findOneAndUpdate(
    { kind, targetId, status: 'failed' },
    {
      $set: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    },
    WRITE_OPTIONS
  );
}

// Idempotent on {kind, targetId}: a new job is inserted pending; a pending,
// leased or done job is left as it is (done = already confirmed by Mux); a
// failed job is reset to pending with a fresh retry budget. Throws on a
// database error — R3: if enqueueing fails, the caller must not report
// deletion success.
// → job
async function enqueueCleanupJob({ kind, targetId, attemptId, gameId, reason, now = new Date() }) {
  if (!CLEANUP_JOB_KINDS.includes(kind)) throw new TypeError(`Unknown cleanup job kind ${kind}`);
  assertNonEmptyString(targetId, 'targetId');
  if (!attemptId) throw new TypeError('attemptId is required: cleanup is attempt-owned (E3)');
  if (!gameId) throw new TypeError('gameId is required');
  // Update validators skip `required` on $setOnInsert paths, so check here.
  assertNonEmptyString(reason, 'reason');

  const reset = await resetFailedCleanupJob({ kind, targetId, now });
  if (reset) return reset;

  let job;
  try {
    job = await VideoCleanupJob.findOneAndUpdate(
      { kind, targetId },
      {
        $setOnInsert: {
          kind,
          targetId,
          attemptId,
          gameId,
          reason,
          deployment: getVideoDeployment(),
          status: 'pending',
          attempts: 0,
          nextAttemptAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          outcome: null,
          completedAt: null,
        },
      },
      { ...WRITE_OPTIONS, upsert: true }
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    // A concurrent enqueue inserted it first; theirs is ours.
    job = await VideoCleanupJob.findOne({ kind, targetId }, null, { lean: true });
  }

  // It failed between our two steps: one bounded re-check.
  if (job?.status === 'failed') {
    return (await resetFailedCleanupJob({ kind, targetId, now })) || job;
  }
  return job;
}

// Lease up to `limit` due jobs of this deployment, one atomic claim each:
// pending ones whose time has come, and leased ones whose lease expired (a
// worker died). `attempts` counts claims, so a job that crashes its worker
// still exhausts its budget. The worker decides the budget and backoff.
// → job[] (each now status 'leased', leaseOwner = this worker)
async function claimDueCleanupJobs({
  now = new Date(),
  limit = MAX_CLEANUP_CLAIMS_PER_SWEEP,
  leaseOwner,
  leaseMs,
}) {
  assertNonEmptyString(leaseOwner, 'leaseOwner');
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new TypeError('leaseMs must be a positive number');
  }
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit) || 1), MAX_CLEANUP_CLAIMS_PER_SWEEP);
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  const claimed = [];
  while (claimed.length < boundedLimit) {
    const job = await VideoCleanupJob.findOneAndUpdate(
      {
        deployment: getVideoDeployment(),
        $or: [
          { status: 'pending', nextAttemptAt: { $lte: now } },
          { status: 'leased', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: { status: 'leased', leaseOwner, leaseExpiresAt },
        $inc: { attempts: 1 },
      },
      { ...WRITE_OPTIONS, sort: { nextAttemptAt: 1 } }
    );
    if (!job) break;
    claimed.push(job);
  }
  return claimed;
}

const leasedBy = (jobId, leaseOwner) => ({ _id: jobId, status: 'leased', leaseOwner });

// Mux confirmed the target is gone (or, for cancel 'completed', the follow-up
// delete_asset job is already enqueued).
// → job | null (this worker no longer holds the lease)
async function completeCleanupJob({ jobId, leaseOwner, outcome, now = new Date() }) {
  if (!CLEANUP_JOB_OUTCOMES.includes(outcome)) {
    throw new TypeError(`Unknown cleanup outcome ${outcome}`);
  }
  return VideoCleanupJob.findOneAndUpdate(
    leasedBy(jobId, leaseOwner),
    {
      $set: {
        status: 'done',
        outcome,
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
      },
    },
    WRITE_OPTIONS
  );
}

// Bounded, non-secret error label. MuxApiError messages are built by
// mux.client without credentials or URLs; any other error keeps its name only.
function summarizeCleanupError(error) {
  if (typeof error === 'string' && error) return error.slice(0, MAX_LAST_ERROR_LENGTH);
  if (!error) return 'unknown';
  const name = error.name || 'Error';
  if (name !== 'MuxApiError') return name.slice(0, MAX_LAST_ERROR_LENGTH);
  const status = error.status ? ` ${error.status}` : '';
  return `${name}${status}: ${error.message || ''}`.slice(0, MAX_LAST_ERROR_LENGTH);
}

// A failed attempt: back to pending at `nextAttemptAt` when retryable, else
// (or with no next time — budget exhausted) terminally failed. A failed job
// stays visible to countPendingCleanupJobs({ includeFailed }) and is reset by
// a later enqueue of the same target.
// → job | null (this worker no longer holds the lease)
async function failCleanupJobAttempt({ jobId, leaseOwner, retryable, nextAttemptAt, error }) {
  const retry = Boolean(retryable) && nextAttemptAt instanceof Date;
  return VideoCleanupJob.findOneAndUpdate(
    leasedBy(jobId, leaseOwner),
    {
      $set: {
        status: retry ? 'pending' : 'failed',
        nextAttemptAt: retry ? nextAttemptAt : null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: summarizeCleanupError(error),
      },
    },
    WRITE_OPTIONS
  );
}

// Outstanding provider cancellation/deletion (pending + leased; optionally
// failed too), across the deployment or for one game.
// → number
async function countPendingCleanupJobs({ gameId, includeFailed = false } = {}) {
  const statuses = includeFailed ? ['pending', 'leased', 'failed'] : ['pending', 'leased'];
  return VideoCleanupJob.countDocuments({
    status: { $in: statuses },
    ...(gameId ? { gameId } : {}),
  });
}

// ---------------------------------------------------------------------------
// Webhook event idempotency (R4)
// ---------------------------------------------------------------------------

// → true the first time this Mux event id is seen, false for a duplicate.
// Any other database error is thrown (the webhook then 5xxs and Mux retries).
async function recordWebhookEventOnce(eventId, type) {
  assertNonEmptyString(eventId, 'eventId');
  try {
    await VideoWebhookEvent.create({ eventId, type });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

// Processing failed before any durable effect: forget the event so Mux's
// retry is processed instead of being dropped as a duplicate.
// → true when a record was removed
async function releaseWebhookEvent(eventId) {
  if (!eventId) return false;
  const result = await VideoWebhookEvent.deleteOne({ eventId });
  return (result?.deletedCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Quota counters (R2, P1/P2)
// ---------------------------------------------------------------------------

function resourceFilter(resource) {
  if (!resource || !BILLING_RESOURCE_TYPES.includes(resource.type) || !resource.id) {
    throw new TypeError('resource must be { type: "league", id }');
  }
  return { resourceType: resource.type, resourceId: resource.id };
}

const decrementFloor = (field, amount) => ({
  $max: [0, { $subtract: [`$${field}`, amount] }],
});

function utcDay(now) {
  return now.toISOString().slice(0, 10);
}

// OPT-027: the upload allowance is reserved by ONE conditional pipeline
// findOneAndUpdate on the resource's counter. The filter carries every limit
// (concurrent uploads, stored + in-flight minutes, creates today — where a
// stored day other than today counts as zero), and the pipeline decides the
// day rollover from the same stored value, so the check and the increment
// are a single atomic document update: two creates racing for the last slot
// leave exactly one winner. The preceding $setOnInsert upsert only makes the
// counter exist (E11000 from a racing upsert is harmless). Limits come from
// League.videoHosting and are read by the caller at reservation time.
// → counter | null (a limit would be exceeded)
async function reserveUploadSlot({ resource, limits, reservedMinutes, now = new Date() }) {
  const filter = resourceFilter(resource);
  assertNonNegativeInteger(reservedMinutes, 'reservedMinutes');
  const { maxConcurrentUploads, maxStoredMinutes, maxCreatesPerDay } = limits || {};
  assertNonNegativeInteger(maxConcurrentUploads, 'maxConcurrentUploads');
  assertNonNegativeInteger(maxStoredMinutes, 'maxStoredMinutes');
  assertNonNegativeInteger(maxCreatesPerDay, 'maxCreatesPerDay');

  if (maxConcurrentUploads < 1 || maxCreatesPerDay < 1 || reservedMinutes > maxStoredMinutes) {
    return null;
  }

  try {
    await VideoQuotaCounter.updateOne(
      filter,
      {
        $setOnInsert: {
          activeUploads: 0,
          reservedMinutes: 0,
          storedMinutes: 0,
          createsDay: null,
          createsToday: 0,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const today = utcDay(now);
  return VideoQuotaCounter.findOneAndUpdate(
    {
      ...filter,
      activeUploads: { $lt: maxConcurrentUploads },
      $or: [{ createsDay: { $ne: today } }, { createsToday: { $lt: maxCreatesPerDay } }],
      $expr: {
        $lte: [{ $add: ['$storedMinutes', '$reservedMinutes', reservedMinutes] }, maxStoredMinutes],
      },
    },
    [
      {
        $set: {
          activeUploads: { $add: ['$activeUploads', 1] },
          reservedMinutes: { $add: ['$reservedMinutes', reservedMinutes] },
          createsToday: {
            $cond: [{ $eq: ['$createsDay', today] }, { $add: ['$createsToday', 1] }, 1],
          },
          createsDay: { $literal: today },
        },
      },
    ],
    { new: true, lean: true }
  );
}

// The upload ended without a stored asset (cancelled / errored / rejected):
// give back the slot and its reserved minutes. Never below zero. Call once
// per attempt — after the transition out of an in-flight status succeeded.
// The creates-per-day count is NOT refunded (it limits Mux create calls).
// → counter | null (no counter)
async function releaseUploadSlot({ resource, reservedMinutes }) {
  assertNonNegativeInteger(reservedMinutes, 'reservedMinutes');
  return VideoQuotaCounter.findOneAndUpdate(
    resourceFilter(resource),
    [
      {
        $set: {
          activeUploads: decrementFloor('activeUploads', 1),
          reservedMinutes: decrementFloor('reservedMinutes', reservedMinutes),
        },
      },
    ],
    { new: true, lean: true }
  );
}

// The asset is ready: in one update, free the slot, drop its reservation and
// add the verified minutes to storedMinutes. Verified minutes above the
// reservation mean the asset exceeds what was allowed — the caller rejects it
// (and releases the slot) instead, so that is a programmer error here.
// → counter | null (no counter)
async function commitStoredMinutes({ resource, minutes, reservedMinutes }) {
  assertNonNegativeInteger(minutes, 'minutes');
  assertNonNegativeInteger(reservedMinutes, 'reservedMinutes');
  if (minutes > reservedMinutes) {
    throw new RangeError('minutes exceed reservedMinutes; reject the asset instead');
  }
  return VideoQuotaCounter.findOneAndUpdate(
    resourceFilter(resource),
    [
      {
        $set: {
          activeUploads: decrementFloor('activeUploads', 1),
          reservedMinutes: decrementFloor('reservedMinutes', reservedMinutes),
          storedMinutes: { $add: ['$storedMinutes', minutes] },
        },
      },
    ],
    { new: true, lean: true }
  );
}

// A stored asset was deleted (use takeUploadAttemptStoredMinutes for the
// exactly-once amount). Never below zero.
// → counter | null (no counter)
async function releaseStoredMinutes({ resource, minutes }) {
  assertNonNegativeInteger(minutes, 'minutes');
  return VideoQuotaCounter.findOneAndUpdate(
    resourceFilter(resource),
    [{ $set: { storedMinutes: decrementFloor('storedMinutes', minutes) } }],
    { new: true, lean: true }
  );
}

// ---------------------------------------------------------------------------
// Conditional Game.video writes (E1, OPT-026 in games.repository.js)
// ---------------------------------------------------------------------------

const GAME_VIDEO_WRITE_OPTIONS = { new: true, runValidators: true };
const GAME_VIDEO_SETTABLE_FIELDS = [
  'status',
  'uploadId',
  'assetId',
  'playbackId',
  'durationSeconds',
  'errorMessage',
  'readyAt',
  'equivalentTimelines',
];

function normalizeTimelines(timelines = []) {
  return [...new Set(timelines.filter((id) => typeof id === 'string' && id))];
}

// Set a whole new `video` (a new generation). With expectedGenerationId null
// the game must have no video; otherwise the current video must be that
// generation in one of allowReplaceStatuses. The version is minted from
// previousVersion (the replaced video's, if any) via nextGameVideoVersion.
// The full subdoc — equivalentTimelines included — is written explicitly.
// → game document | null (condition failed: someone else attached/replaced)
async function attachGameVideo({
  gameId,
  expectedGenerationId = null,
  allowReplaceStatuses = [],
  previousVersion = null,
  video,
  now = Date.now(),
}) {
  assertNonEmptyString(video?.generationId, 'video.generationId');
  const filter = { _id: gameId };
  if (expectedGenerationId === null) {
    filter.video = null;
  } else {
    assertStatusList(allowReplaceStatuses, GAME_VIDEO_STATUSES, 'allowReplaceStatuses');
    if (expectedGenerationId === video.generationId) {
      throw new TypeError('A replacement video needs a new generation');
    }
    filter['video.generationId'] = expectedGenerationId;
    filter['video.status'] = { $in: allowReplaceStatuses };
  }

  const nextVideo = {
    provider: 'mux',
    status: video.status,
    generationId: video.generationId,
    version: nextGameVideoVersion(previousVersion, now),
    uploadId: video.uploadId ?? null,
    assetId: video.assetId ?? null,
    playbackId: video.playbackId ?? null,
    durationSeconds: video.durationSeconds ?? null,
    errorMessage: video.errorMessage ?? null,
    uploadedByUserId: video.uploadedByUserId ?? null,
    uploadStartedAt: video.uploadStartedAt ?? null,
    readyAt: video.readyAt ?? null,
    equivalentTimelines: normalizeTimelines(video.equivalentTimelines),
  };

  return Game.findOneAndUpdate(filter, { $set: { video: nextVideo } }, GAME_VIDEO_WRITE_OPTIONS);
}

// $set video.* paths within one generation, filtered by generation, prior
// status and tri-state uploadId/assetId identity. Bumps video.version (the
// client query key) — never the document's __v. equivalentTimelines is
// written by $set when given, otherwise ensured with a no-op $push so a
// stored video can never lack it (OPT-026).
// → game document | null (condition failed)
async function updateGameVideo({
  gameId,
  generationId,
  expectedStatuses,
  expectedUploadId,
  expectedAssetId,
  set,
}) {
  assertNonEmptyString(generationId, 'generationId');
  assertStatusList(expectedStatuses, GAME_VIDEO_STATUSES, 'expectedStatuses');
  const entries = Object.entries(set || {});
  if (entries.length === 0) throw new TypeError('updateGameVideo needs at least one field');
  for (const [key] of entries) {
    if (!GAME_VIDEO_SETTABLE_FIELDS.includes(key)) {
      throw new TypeError(`video.${key} is not writable by updateGameVideo`);
    }
  }

  const filter = {
    _id: gameId,
    'video.generationId': generationId,
    'video.status': { $in: expectedStatuses },
  };
  applyIdentityFilter(filter, 'video.uploadId', expectedUploadId);
  applyIdentityFilter(filter, 'video.assetId', expectedAssetId);

  const $set = {};
  for (const [key, value] of entries) {
    $set[`video.${key}`] = key === 'equivalentTimelines' ? normalizeTimelines(value) : value;
  }
  const update = { $set, $inc: { 'video.version': 1 } };
  if (!('equivalentTimelines' in set)) {
    update.$push = { 'video.equivalentTimelines': { $each: [] } };
  }

  return Game.findOneAndUpdate(filter, update, GAME_VIDEO_WRITE_OPTIONS);
}

// Remove the video, but only if it is still that generation. Returns what was
// removed so the caller can enqueue cleanup for its upload/asset — callers
// enqueue BEFORE detaching where the ids are already known (R3).
// → removed video (plain object) | null (condition failed)
async function detachGameVideo({ gameId, generationId }) {
  assertNonEmptyString(generationId, 'generationId');
  const before = await Game.findOneAndUpdate(
    { _id: gameId, 'video.generationId': generationId },
    { $set: { video: null } },
    { new: false, runValidators: true, projection: { video: 1 }, lean: true }
  );
  return before?.video ?? null;
}

module.exports = {
  VideoUploadAttempt,
  VideoCleanupJob,
  VideoWebhookEvent,
  VideoQuotaCounter,
  UPLOAD_ATTEMPT_STATUSES,
  UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES,
  CLEANUP_JOB_KINDS,
  CLEANUP_JOB_STATUSES,
  CLEANUP_JOB_OUTCOMES,
  getVideoDeployment,
  // upload attempts
  createUploadAttempt,
  setUploadAttemptUploadId,
  findUploadAttemptById,
  findUploadAttemptByUploadId,
  findUploadAttemptByAssetId,
  findUploadAttemptByGenerationId,
  transitionUploadAttempt,
  takeUploadAttemptStoredMinutes,
  listStaleUploadAttempts,
  // cleanup jobs
  enqueueCleanupJob,
  claimDueCleanupJobs,
  completeCleanupJob,
  failCleanupJobAttempt,
  summarizeCleanupError,
  countPendingCleanupJobs,
  // webhook idempotency
  recordWebhookEventOnce,
  releaseWebhookEvent,
  // quota
  reserveUploadSlot,
  releaseUploadSlot,
  commitStoredMinutes,
  releaseStoredMinutes,
  // Game.video
  attachGameVideo,
  updateGameVideo,
  detachGameVideo,
};
