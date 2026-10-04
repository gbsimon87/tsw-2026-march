// Creates the Mux game-video persistence indexes. Production disables Mongoose
// autoIndex (config/db.js, OPT-007), and these unique indexes are what make
// upload-attempt ownership, cleanup-job enqueue, webhook idempotency and the
// quota counters atomic — run this once in each deployed database before
// enabling uploads. createIndexes is additive and does not drop other indexes.
//
// Usage: pnpm --filter server video:ensure-indexes

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const {
  VideoUploadAttempt,
  VideoCleanupJob,
  VideoWebhookEvent,
  VideoQuotaCounter,
} = require('../modules/video/video.repository');

async function main() {
  await connectDb();
  await VideoUploadAttempt.createIndexes();
  await VideoCleanupJob.createIndexes();
  await VideoWebhookEvent.createIndexes();
  await VideoQuotaCounter.createIndexes();
  console.log('Video upload-attempt, cleanup-job, webhook-event and quota indexes are present.');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Video index setup failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
