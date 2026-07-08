// DEV-ONLY: drops every collection in the connected database (one at a time,
// not a single dropDatabase call — Atlas users are commonly scoped without
// dropDatabase privileges). Intended to give a clean slate before reseeding
// demo data (pnpm seed / pnpm seed:demo) without leaving behind unrelated
// manual-testing users/teams/leagues from prior runs.
//
// Hard-refuses to run against a database whose name doesn't look like a dev
// database, and refuses outright if NODE_ENV is production, regardless of
// ALLOW_DEMO_SEED or any other override — there is no production use case for
// this script, unlike seed-demo-account.js.
//
// Usage:
//   node src/scripts/reset-dev-database.js            # drop the connected database
//   node src/scripts/reset-dev-database.js --dry-run  # list collections that would be dropped

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const { env } = require('../config/env');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to run reset-dev-database.js: NODE_ENV is production.');
    process.exitCode = 1;
    return;
  }

  if (!/dev|test|local/i.test(env.MONGO_DB_NAME || '')) {
    console.error(
      `Refusing to run: MONGO_DB_NAME "${env.MONGO_DB_NAME}" doesn't look like a dev/test database ` +
        '(expected it to contain "dev", "test", or "local"). Aborting to avoid an accidental prod wipe.'
    );
    process.exitCode = 1;
    return;
  }

  await connectDb();

  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const names = collections.map((collection) => collection.name);

    console.log(`Database: ${env.MONGO_DB_NAME}`);
    console.log(`Collections (${names.length}):`, names.join(', ') || '(none)');

    if (DRY_RUN) {
      console.log('[dry-run] would drop every collection above — no changes made.');
      return;
    }

    // Atlas users are commonly scoped without dropDatabase privileges (only
    // per-collection write access), so drop each collection individually
    // rather than requiring a dropDatabase-capable role.
    for (const name of names) {
      await mongoose.connection.db.collection(name).drop();
      console.log(`Dropped collection ${name}.`);
    }
    console.log(`Cleared database ${env.MONGO_DB_NAME}.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('reset-dev-database failed');
    console.error(error);
    process.exitCode = 1;
  });
}
