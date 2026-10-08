const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const scrimmageModels = require('../modules/scrimmages/scrimmages.repository');
const { Game } = require('../modules/games/games.repository');

async function main() {
  await connectDb();
  for (const model of Object.values(scrimmageModels)) await model.createIndexes();
  // Add only this feature's Game indexes. Never drop or rebuild unrelated indexes.
  for (const [keys, options] of Game.schema.indexes()) {
    if (Object.keys(keys).some((key) => key.startsWith('scrimmage')))
      await Game.collection.createIndex(keys, options);
  }
  console.log('Scrimmage collection and game indexes are present.');
  await mongoose.disconnect();
}
main().catch(async (error) => {
  console.error('Scrimmage index setup failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
