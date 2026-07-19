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
      // Audit C4: surface would-be validation failures in the dry run — otherwise a
      // dataset that dry-runs clean can still abort the real run mid-collection.
      doc.plan = nextPlan;
      doc.billingSource = nextSource;
      doc.subscriptionStatus = nextStatus;
      await doc.validate({ validateModifiedOnly: true });
      continue;
    }

    doc.plan = nextPlan;
    doc.billingSource = nextSource;
    doc.subscriptionStatus = nextStatus;
    // Audit C4: validate only the paths this script modifies. A full-document
    // save() validation would abort the whole migration on any unrelated
    // out-of-enum legacy field (e.g. a pre-overhaul subscriptionStatus).
    await doc.save({ validateModifiedOnly: true });
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
    // Audit H4: the user scope has its own inverse — the pre-tightening User enum
    // was ['free','pro'], so 'team' (the team-scope inverse) was never valid here.
    const next = ROLLBACK ? rollbackPlan('user', user.plan) : mapUserPlan(user.plan);
    if (next === before) continue;

    changed += 1;
    if (DRY_RUN) {
      console.log(`[dry-run] user ${user._id}: plan ${before}→${next}`);
      user.plan = next;
      await user.validate({ validateModifiedOnly: true });
      continue;
    }
    user.plan = next;
    await user.save({ validateModifiedOnly: true });
  }

  console.log(`user: scanned ${scanned}, ${DRY_RUN ? 'would change' : 'changed'} ${changed}`);
  return { scanned, changed };
}

// Audit H4: rollback writes legacy values ('free'/'pro'/'team'); with the
// tightened canonical-only enums loaded, every write would throw. The header says
// "deploy the pre-tightening enum first" — enforce it instead of trusting it.
function assertRollbackEnumsAreLoose() {
  const checks = [
    [Team, 'team', 'free'],
    [League, 'league', 'free'],
    [User, 'user', 'free'],
  ];
  for (const [Model, scope, legacy] of checks) {
    const allowed = Model.schema.path('plan')?.enumValues || [];
    if (!allowed.includes(legacy)) {
      throw new Error(
        `--rollback requires the pre-tightening ${scope} plan enum to be deployed ` +
          `(loaded enum [${allowed.join(', ')}] does not allow '${legacy}'). ` +
          `Revert the schema-tightening code first.`
      );
    }
  }
}

async function main() {
  await connectDb();
  console.log(`Plan-enum ${ROLLBACK ? 'ROLLBACK' : 'unification'}${DRY_RUN ? ' (dry-run)' : ''}…`);

  if (ROLLBACK) assertRollbackEnumsAreLoose();

  await migrateResource(Team, 'team');
  await migrateResource(League, 'league');
  await migrateUsers();
}

main()
  .catch((error) => {
    console.error('Plan-enum migration failed');
    console.error(error);
    process.exitCode = 1;
  })
  // Audit H5: always disconnect — an open connection keeps the event loop alive,
  // so a failed run would hang a deploy pipeline instead of exiting 1.
  .finally(() => disconnectDb().catch(() => {}));
