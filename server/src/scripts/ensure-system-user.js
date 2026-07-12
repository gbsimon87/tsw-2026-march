// Idempotently creates the reserved system User that authors auto-generated
// feed content (see docs/auto-feed-generation/000-TRACKER.md). Safe to re-run:
// looks up by authProvider:'system' before creating.
//
// Usage:
//   node src/scripts/ensure-system-user.js
//   node src/scripts/ensure-system-user.js --dry-run

const mongoose = require('mongoose');
const { connectDb } = require('../config/db');

require('../modules/auth/auth.repository');

const User = mongoose.model('User');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDb();

  const existing = await User.findOne({ authProvider: 'system' });
  if (existing) {
    console.log(`System user already exists: ${existing._id} (${existing.email})`);
  } else if (dryRun) {
    console.log('[dry-run] would create system user (email=system@tsw.internal)');
  } else {
    const created = await User.create({
      email: 'system@tsw.internal',
      name: 'TSW',
      authProvider: 'system',
      emailVerified: false,
      roles: ['system'],
    });
    console.log(`Created system user: ${created._id}`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('ensure-system-user failed');
  console.error(error);
  process.exitCode = 1;
});
