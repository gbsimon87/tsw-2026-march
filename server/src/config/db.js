const mongoose = require('mongoose');
const { env } = require('./env');
const { logger } = require('./logger');

async function connectDb(attempt = 1) {
  try {
    await mongoose.connect(env.MONGO_URI);
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

module.exports = {
  connectDb,
};
