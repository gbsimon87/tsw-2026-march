// Phase 6 / T-25 — drop the seven dead User.league* mirror fields.
//
// These were written only by seed.js and read only by the now-removed auth.service
// league path (audit §2). League billing lives on the League doc; user-level league
// state is not stored.
//
// - Idempotent: $unset on an absent field is a no-op.
// - DESTRUCTIVE: the fields are gone after this runs. The data is seed-only garbage,
//   so reversal is from backup only (no inverse map). Flagged deliberately.
// - --dry-run: counts docs that still carry any of the fields; no writes.
//
// Usage:
//   node src/scripts/migrate-drop-user-league-fields.js --dry-run
//   node src/scripts/migrate-drop-user-league-fields.js

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');

require('../modules/auth/auth.repository');

const User = mongoose.model('User');

const LEAGUE_FIELDS = [
  'leaguePlan',
  'leagueSubscriptionStatus',
  'leagueCurrentPeriodEnd',
  'leagueCancelAtPeriodEnd',
  'leagueStripeCustomerId',
  'leagueStripeSubscriptionId',
  'leagueStripePriceId',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDb();

  // Match any doc that still carries at least one of the fields.
  const filter = { $or: LEAGUE_FIELDS.map((f) => ({ [f]: { $exists: true } })) };
  const affected = await User.countDocuments(filter);

  if (dryRun) {
    console.log(`[dry-run] ${affected} user docs still carry one or more league* fields.`);
    await disconnectDb();
    return;
  }

  const unset = LEAGUE_FIELDS.reduce((acc, f) => ({ ...acc, [f]: '' }), {});
  const result = await User.updateMany(filter, { $unset: unset });
  console.log(
    `Dropped league* fields from ${result.modifiedCount} user docs (matched ${affected}).`
  );

  await disconnectDb();
}

main().catch((error) => {
  console.error('Drop User.league* migration failed');
  console.error(error);
  process.exitCode = 1;
});
