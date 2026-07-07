const mongoose = require('mongoose');
const { env } = require('./env');
const { logger } = require('./logger');

async function connectDb(attempt = 1) {
  try {
    await mongoose.connect(env.MONGO_URI, {
      dbName: env.MONGO_DB_NAME,
      // OPT-023: bound the connection pool and fail fast when the primary is
      // unreachable rather than hanging on the driver's 30s default — the retry
      // loop below then surfaces the problem in seconds, not half a minute.
      maxPoolSize: env.MONGO_MAX_POOL_SIZE,
      serverSelectionTimeoutMS: 5000,
      // OPT-007: in production, index changes go through the explicit
      // scripts/migrate-drop-dead-indexes.js migration, not an implicit
      // createIndex on every connect — avoids surprise index builds on deploy
      // and makes index drops (which Mongoose's autoIndex never does) a
      // deliberate, auditable step. Dev/test keep autoIndex on for convenience.
      autoIndex: env.NODE_ENV !== 'production',
    });
    logger.info('Connected to MongoDB');
  } catch (error) {
    const retries = 5;
    if (attempt >= retries) {
      throw error;
    }

    const delayMs = attempt * 2000;
    logger.warn({ err: error, attempt, delayMs }, 'Mongo connection failed; retrying');
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return connectDb(attempt + 1);
  }
}

// OPT-023: called from the graceful-shutdown path so in-flight queries can
// drain and the pool closes cleanly before the process exits.
async function disconnectDb() {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}

module.exports = {
  connectDb,
  disconnectDb,
};
