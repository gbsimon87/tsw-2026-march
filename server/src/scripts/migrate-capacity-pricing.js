// One-time migration for the capacity-based pricing launch.
//
// - The oldest standalone Team for each owner becomes their free writable Team.
// - Other standalone Teams become paid-capacity Teams. They keep all data and
//   reads, but require an active $5 subscription for writes.
// - Every pre-launch League becomes complimentary/grandfathered so the three
//   production Leagues continue without a Stripe subscription.
// - Existing Stripe-backed Team/League subscriptions abort the migration. They
//   must be reviewed in Stripe first so this script never silently stops billing.
//
// Always run --dry-run first, after a database backup.
//
// Usage:
//   node src/scripts/migrate-capacity-pricing.js --dry-run
//   node src/scripts/migrate-capacity-pricing.js

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
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
      { $group: { _id: '$ownerUserId', teamIds: { $push: '$_id' } } },
    ])
    .toArray();
  const teamCount = ownerGroups.reduce((sum, group) => sum + group.teamIds.length, 0);
  const leagueCount = await leagues.countDocuments({});

  console.log(
    `${DRY_RUN ? '[dry-run] would assign' : '[apply] assigning'} ${ownerGroups.length} free Teams across ${teamCount} standalone Teams.`
  );
  console.log(
    `${DRY_RUN ? '[dry-run] would grandfather' : '[apply] grandfathering'} ${leagueCount} existing Leagues.`
  );
  if (DRY_RUN) return;

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

main()
  .catch((error) => {
    console.error('Capacity pricing migration failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb().catch(() => {}));
