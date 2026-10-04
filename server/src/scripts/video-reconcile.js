// Mux game video — manual reconciliation and cleanup run (plan R3, ruling E4c).
// The API runs the same work on an in-process sweep when Mux is configured;
// use this when the API is asleep (Render free plan) or to inspect state.
//
// 1. Reconciles this deployment's stale in-flight upload attempts (older than
//    24 h) that their Game no longer references: cancels them, enqueues the
//    provider cleanup and releases their quota slot.
// 2. Processes one bounded batch of due cleanup jobs (Mux cancel/delete).
// 3. Prints a JSON summary, including outstanding and failed cleanup jobs.
//
// Idempotent: attempts are claimed by a conditional transition and jobs by a
// lease, so re-running (or running beside the API) never repeats work.
// --dry-run lists what would be reconciled and processed; no Mux calls, no writes.
//
// Usage:
//   pnpm --filter server video:reconcile
//   pnpm --filter server video:reconcile --dry-run   (a `--` before it is fine)

const mongoose = require('mongoose');

const RECONCILE_SCRIPT_LIMIT = 100;
const CLEANUP_SCRIPT_LIMIT = 50;

function parseVideoReconcileArgs(argv) {
  let dryRun = false;
  for (const argument of argv) {
    // pnpm 10 forwards the separator in `pnpm <script> -- --dry-run` verbatim.
    if (argument === '--') continue;
    if (argument === '--dry-run') dryRun = true;
    else throw new Error(`Unknown argument ${argument}`);
  }
  return { dryRun };
}

async function runVideoReconcile({ dryRun, now = new Date() }) {
  // Required lazily so the argument parser loads without env/DB config.
  const { isMuxConfigured } = require('../modules/video/mux.client');
  const cleanup = require('../modules/video/video.cleanup');
  const {
    countPendingCleanupJobs,
    getVideoDeployment,
  } = require('../modules/video/video.repository');

  if (!dryRun && !isMuxConfigured()) {
    throw new Error(
      'Mux is not configured for this environment; nothing was changed (use --dry-run to inspect)'
    );
  }

  const reconcile = await cleanup.reconcileStaleAttempts({
    now,
    limit: RECONCILE_SCRIPT_LIMIT,
    dryRun,
  });
  const cleanupResult = dryRun
    ? {
        dryRun: true,
        wouldProcess: await cleanup.previewCleanupBatch({ now, limit: CLEANUP_SCRIPT_LIMIT }),
      }
    : await cleanup.runCleanupBatch({ limit: CLEANUP_SCRIPT_LIMIT });

  const pending = await countPendingCleanupJobs();
  const pendingOrFailed = await countPendingCleanupJobs({ includeFailed: true });

  return {
    deployment: getVideoDeployment(),
    dryRun,
    reconcile,
    cleanup: cleanupResult,
    outstanding: { pending, failed: pendingOrFailed - pending },
  };
}

async function main() {
  const { dryRun } = parseVideoReconcileArgs(process.argv.slice(2));
  const { connectDb } = require('../config/db');

  await connectDb();
  const summary = await runVideoReconcile({ dryRun });
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('Video reconcile failed:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = {
  RECONCILE_SCRIPT_LIMIT,
  CLEANUP_SCRIPT_LIMIT,
  parseVideoReconcileArgs,
  runVideoReconcile,
};
