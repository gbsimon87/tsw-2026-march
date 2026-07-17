// Phase 6 / T-24 — unify Team.plan / League.plan / User.plan to canonical ids
// (starter | team_pro | league) and set billingSource.
//
// - Value map: free→starter; team pro|team→team_pro; league pro|league→league;
//   user pro→team_pro. Stripe-backed docs re-derive plan from planForPriceId
//   (self-healing). We-ball Saturday (matched by slug/name) → plan:'league',
//   subscriptionStatus:'active', billingSource:'comp'.
// - Idempotent: deterministic map; re-running once canonical is a no-op.
// - Reversible: --rollback applies a best-effort inverse map (lossy — team_pro
//   could have been 'pro' or 'team'). Rollback requires the pre-tightening (loose)
//   enum to be deployed first (schema tightening is a code revert).
// - --dry-run: prints per-doc before→after + counts; no writes.
//
// RUN ORDER: always --dry-run first, on a snapshot. Tighten the schema enums only
// AFTER this reports zero non-canonical values. See docs/pricing-overhaul/13-migration-plan.md.
//
// Usage:
//   node src/scripts/migrate-unify-plan-enums.js --dry-run
//   node src/scripts/migrate-unify-plan-enums.js
//   node src/scripts/migrate-unify-plan-enums.js --rollback --dry-run
//   node src/scripts/migrate-unify-plan-enums.js --rollback

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');
const {
  resolveTargetPlan,
  resolveBillingSource,
  mapUserPlan,
  rollbackPlan,
} = require('./lib/planMigration');

require('../modules/teams/teams.repository');
require('../modules/leagues/leagues.repository');
require('../modules/auth/auth.repository');

const Team = mongoose.model('Team');
const League = mongoose.model('League');
const User = mongoose.model('User');

const DRY_RUN = process.argv.includes('--dry-run');
const ROLLBACK = process.argv.includes('--rollback');

// Migrate one Team/League collection. Returns { scanned, changed }.
async function migrateResource(Model, scope) {
  const cursor = Model.find({}).cursor();
  let scanned = 0;
  let changed = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    scanned += 1;
    const beforePlan = doc.plan;
    const beforeSource = doc.billingSource;

    let nextPlan;
    let nextSource;
    if (ROLLBACK) {
      nextPlan = rollbackPlan(scope, doc.plan);
      nextSource = beforeSource; // billingSource is additive; rollback leaves it
    } else {
      nextPlan = resolveTargetPlan(scope, doc);
      nextSource = resolveBillingSource(scope, doc);
    }

    // We-ball comp grant: ensure it resolves active on the forward migration.
    const weballActivate = !ROLLBACK && scope === 'league' && nextSource === 'comp';
    const nextStatus = weballActivate ? 'active' : doc.subscriptionStatus;

    if (
      nextPlan === beforePlan &&
      nextSource === beforeSource &&
      nextStatus === doc.subscriptionStatus
    ) {
      continue;
    }

    changed += 1;
    if (DRY_RUN) {
      console.log(
        `[dry-run] ${scope} ${doc._id}: plan ${beforePlan}→${nextPlan}` +
          `, billingSource ${beforeSource}→${nextSource}` +
          (nextStatus !== doc.subscriptionStatus
            ? `, status ${doc.subscriptionStatus}→${nextStatus}`
            : '')
      );
      continue;
    }

    doc.plan = nextPlan;
    doc.billingSource = nextSource;
    doc.subscriptionStatus = nextStatus;
    await doc.save();
  }

  console.log(`${scope}: scanned ${scanned}, ${DRY_RUN ? 'would change' : 'changed'} ${changed}`);
  return { scanned, changed };
}

async function migrateUsers() {
  const cursor = User.find({}).cursor();
  let scanned = 0;
  let changed = 0;

  for (let user = await cursor.next(); user != null; user = await cursor.next()) {
    scanned += 1;
    const before = user.plan;
    const next = ROLLBACK ? rollbackPlan('team', user.plan) : mapUserPlan(user.plan);
    if (next === before) continue;

    changed += 1;
    if (DRY_RUN) {
      console.log(`[dry-run] user ${user._id}: plan ${before}→${next}`);
      continue;
    }
    user.plan = next;
    await user.save();
  }

  console.log(`user: scanned ${scanned}, ${DRY_RUN ? 'would change' : 'changed'} ${changed}`);
  return { scanned, changed };
}

async function main() {
  await connectDb();
  console.log(`Plan-enum ${ROLLBACK ? 'ROLLBACK' : 'unification'}${DRY_RUN ? ' (dry-run)' : ''}…`);

  await migrateResource(Team, 'team');
  await migrateResource(League, 'league');
  await migrateUsers();

  await disconnectDb();
}

main().catch((error) => {
  console.error('Plan-enum migration failed');
  console.error(error);
  process.exitCode = 1;
});
