// One-time migration for the capacity-based pricing launch.
//
// - The oldest standalone Team for each owner becomes their free writable Team.
// - Other standalone Teams become paid-capacity Teams. They keep all data and
//   reads, but require an active £5 subscription for writes.
// - Every pre-launch League becomes complimentary/grandfathered so the three
//   production Leagues continue without a Stripe subscription.
// - Existing Stripe-backed Team/League subscriptions abort the migration. They
//   must be reviewed in Stripe first so this script never silently stops billing.
//
// Always run --dry-run first, after a database backup.
//
// Usage:
//   node src/scripts/migrate-capacity-pricing.js --dry-run
//   MIGRATION_CONFIRM_DB=<exact-db-name> node src/scripts/migrate-capacity-pricing.js --apply

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');
const { env } = require('../config/env');

function parseMigrationMode(argv) {
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  const unknown = argv.filter((arg) => !['--dry-run', '--apply'].includes(arg));

  if (unknown.length > 0 || dryRun === apply) {
    throw new Error(
      'Choose exactly one mode: --dry-run, or --apply with MIGRATION_CONFIRM_DB set to the exact database name.'
    );
  }
  return dryRun ? 'dry-run' : 'apply';
}

function assertApplyTarget({ mode, dbName, confirmedDbName }) {
  if (mode !== 'apply') return;
  if (!dbName) throw new Error('MONGO_DB_NAME is required for an applied migration.');
  if (!confirmedDbName) {
    throw new Error('MIGRATION_CONFIRM_DB is required for an applied migration.');
  }
  if (confirmedDbName !== dbName) {
    throw new Error(
      `MIGRATION_CONFIRM_DB "${confirmedDbName}" does not match MONGO_DB_NAME "${dbName}".`
    );
  }
}

async function main() {
  const mode = parseMigrationMode(process.argv.slice(2));
  const dryRun = mode === 'dry-run';
  assertApplyTarget({
    mode,
    dbName: env.MONGO_DB_NAME,
    confirmedDbName: process.env.MIGRATION_CONFIRM_DB,
  });

  await connectDb();
  const teams = mongoose.connection.collection('teams');
  const leagues = mongoose.connection.collection('leagues');
  const users = mongoose.connection.collection('users');

  const activeStripeTeams = await teams
    .find({
      stripeSubscriptionId: { $type: 'string' },
      subscriptionStatus: { $in: ['active', 'trialing', 'past_due', 'unpaid', 'paused'] },
    })
    .project({ _id: 1, name: 1, stripeSubscriptionId: 1, subscriptionStatus: 1 })
    .toArray();
  const activeStripeLeagues = await leagues
    .find({
      stripeSubscriptionId: { $type: 'string' },
      subscriptionStatus: { $in: ['active', 'trialing', 'past_due', 'unpaid', 'paused'] },
    })
    .project({ _id: 1, name: 1, stripeSubscriptionId: 1, subscriptionStatus: 1 })
    .toArray();

  if (activeStripeTeams.length || activeStripeLeagues.length) {
    console.error('[abort] Active Stripe subscriptions need manual review before migration.');
    for (const row of [...activeStripeTeams, ...activeStripeLeagues]) {
      console.error(
        `  ${row._id} ${row.name || '(unnamed)'}: ${row.subscriptionStatus} ${row.stripeSubscriptionId}`
      );
    }
    process.exitCode = 1;
    return;
  }

  const ownerGroups = await teams
    .aggregate([
      { $sort: { createdAt: 1, _id: 1 } },
      {
        $group: {
          _id: '$ownerUserId',
          teamIds: { $push: '$_id' },
          teamNames: { $push: '$name' },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  const teamCount = ownerGroups.reduce((sum, group) => sum + group.teamIds.length, 0);
  const leagueRows = await leagues
    .find({})
    .project({ _id: 1, name: 1, plan: 1, billingSource: 1, subscriptionStatus: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  const leagueCount = leagueRows.length;

  console.log(
    `${dryRun ? '[dry-run] would assign' : '[apply] assigning'} ${ownerGroups.length} free Teams across ${teamCount} standalone Teams.`
  );
  console.log(
    `${dryRun ? '[dry-run] would grandfather' : '[apply] grandfathering'} ${leagueCount} existing Leagues.`
  );
  for (const group of ownerGroups) {
    console.log(`  owner ${group._id}:`);
    group.teamIds.forEach((teamId, index) => {
      console.log(
        `    ${index === 0 ? 'FREE' : 'PAID'} ${teamId} ${group.teamNames[index] || '(unnamed)'}`
      );
    });
  }
  for (const league of leagueRows) {
    console.log(
      `  COMP LEAGUE ${league._id} ${league.name || '(unnamed)'} ` +
        `(currently ${league.billingSource || 'stripe'}/${league.plan || 'starter'}/${league.subscriptionStatus || 'inactive'})`
    );
  }
  if (dryRun) return;

  await teams.updateMany(
    {},
    {
      $set: {
        capacityType: 'paid',
        plan: 'starter',
        subscriptionStatus: 'inactive',
        billingInterval: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        currentPeriodEnd: null,
        trialEnd: null,
        cancelAtPeriodEnd: false,
      },
    }
  );
  for (const group of ownerGroups) {
    await teams.updateOne(
      { _id: group.teamIds[0] },
      { $set: { capacityType: 'free', plan: 'starter' } }
    );
  }

  await leagues.updateMany(
    {},
    {
      $set: {
        plan: 'league_plus',
        billingSource: 'comp',
        subscriptionStatus: 'active',
        billingInterval: null,
        scheduledPlan: null,
        scheduledPlanAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        currentPeriodEnd: null,
        trialEnd: null,
        cancelAtPeriodEnd: false,
      },
    }
  );
  await users.updateMany({}, { $set: { plan: 'starter' } });

  const indexes = await teams.listIndexes().toArray();
  const hasFreeTeamIndex = indexes.some(
    (index) =>
      index.unique &&
      index.key?.ownerUserId === 1 &&
      index.key?.capacityType === 1 &&
      index.partialFilterExpression?.capacityType === 'free'
  );
  if (!hasFreeTeamIndex) {
    await teams.createIndex(
      { ownerUserId: 1, capacityType: 1 },
      { unique: true, partialFilterExpression: { capacityType: 'free' } }
    );
  }

  console.log('[ok] Capacity pricing migration completed.');
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Capacity pricing migration failed');
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => disconnectDb().catch(() => {}));
}

module.exports = {
  assertApplyTarget,
  parseMigrationMode,
};
