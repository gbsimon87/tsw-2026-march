// V23: hosted uploads depend on two things nothing else checks at runtime —
// a transaction-capable MongoDB (settlement commits game, attempt and quota
// together) and the video unique indexes (production disables autoIndex, and
// without them racing quota upserts can split a counter). server.js runs this
// at boot when MUX_UPLOADS_ENABLED is on and turns uploads off if it fails.

const NAMESPACE_NOT_FOUND = 26;

function sameKey(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function existingIndexKeys(model) {
  try {
    return (await model.collection.indexes()).map((index) => index.key);
  } catch (error) {
    if (error?.code === NAMESPACE_NOT_FOUND) return [];
    throw error;
  }
}

/**
 * @param {object} input
 * @param {object} input.db native Db (mongoose.connection.db)
 * @param {object[]} input.models Mongoose models whose declared indexes must exist
 * @returns {Promise<{ok: boolean, problems: string[]}>}
 */
async function checkVideoUploadPrerequisites({ db, models }) {
  const problems = [];
  const hello = await db.admin().command({ hello: 1 });
  if (!hello?.setName && hello?.msg !== 'isdbgrid') {
    problems.push('MongoDB is not a replica set (transactions unavailable)');
  }
  for (const model of models) {
    const existing = await existingIndexKeys(model);
    for (const [key] of model.schema.indexes()) {
      if (!existing.some((candidate) => sameKey(candidate, key))) {
        problems.push(`${model.modelName} index ${JSON.stringify(key)} is missing`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

function defaultCheck() {
  const mongoose = require('mongoose');
  const repository = require('./video.repository');
  return checkVideoUploadPrerequisites({
    db: mongoose.connection.db,
    models: [
      repository.VideoUploadAttempt,
      repository.VideoCleanupJob,
      repository.VideoWebhookEvent,
      repository.VideoQuotaCounter,
    ],
  });
}

/**
 * Fail closed: when uploads are enabled but a prerequisite is missing (or the
 * check itself fails), turn uploads off for this process and log why.
 * Playback, cleanup and takedown are unaffected.
 */
async function enforceVideoUploadPrerequisites({
  env = require('../../config/env').env,
  logger = require('../../config/logger').logger,
  check = defaultCheck,
} = {}) {
  if (!env.MUX_UPLOADS_ENABLED) return;
  let problems;
  try {
    ({ problems } = await check());
  } catch (error) {
    problems = [`prerequisite check failed: ${error?.message || 'unknown error'}`];
  }
  if (!problems?.length) return;
  env.MUX_UPLOADS_ENABLED = false;
  logger.error(
    { problems },
    'Hosted video uploads disabled: run video:ensure-indexes and use a replica set (docs/mux.md)'
  );
}

module.exports = { checkVideoUploadPrerequisites, enforceVideoUploadPrerequisites };
