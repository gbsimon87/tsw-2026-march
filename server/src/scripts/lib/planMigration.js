// Pure value-mapping for the plan-enum unification migration (Phase 6 / T-24).
// No DB, no side effects — unit-tested directly. The migration script imports these
// and applies them over live docs.
//
// Canonical targets: Team → starter|team_pro, League → starter|league,
// User → starter|team_pro. Legacy values ('free'/'pro'/'team') collapse per
// normalizePlanId (the same tolerance layer the resolver uses).

const { normalizePlanId, planForPriceId } = require('../../modules/billing/plan-catalog');

// We-ball Saturday is the one manually-provisioned (non-Stripe) grant. Matched by
// slug/name so the migration can flip it to a first-class billingSource:'comp' doc.
const WEBALL_SLUGS = new Set(['we-ball-saturday']);
const WEBALL_NAMES = new Set(['we-ball saturday']);

function isWeballLeague(doc) {
  const slug = String(doc?.slug || '').toLowerCase();
  const name = String(doc?.name || '').toLowerCase();
  return WEBALL_SLUGS.has(slug) || WEBALL_NAMES.has(name);
}

// Canonical plan for a Team/League doc. Stripe-backed docs re-derive from the real
// price id (self-healing — corrects a mislabeled legacy 'pro'); otherwise the
// deterministic legacy→canonical map applies.
function resolveTargetPlan(scope, doc) {
  if (doc?.stripePriceId) {
    const derived = planForPriceId(doc.stripePriceId);
    if (derived?.planId) return derived.planId;
  }
  return normalizePlanId(scope, doc?.plan);
}

// billingSource: 'comp' for We-ball Saturday; otherwise preserve an already-set
// value or default to 'stripe'.
function resolveBillingSource(scope, doc) {
  if (scope === 'league' && isWeballLeague(doc)) return 'comp';
  return doc?.billingSource || 'stripe';
}

// User.plan is a derived cache — deterministic map now; syncOwnerPlan refines it on
// the next billing event.
function mapUserPlan(plan) {
  return normalizePlanId('team', plan); // free→starter, pro→team_pro
}

// Best-effort inverse for --rollback (lossy: team_pro could have been 'pro' or
// 'team'). Requires the pre-tightening (loose) enum to be deployed first — see the
// migration header.
function rollbackPlan(scope, plan) {
  if (plan === 'starter') return 'free';
  if (plan === 'team_pro') return scope === 'team' ? 'team' : 'pro';
  if (plan === 'league') return 'league';
  return plan;
}

module.exports = {
  isWeballLeague,
  resolveTargetPlan,
  resolveBillingSource,
  mapUserPlan,
  rollbackPlan,
};
