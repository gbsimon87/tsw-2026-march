// Pure value-mapping for the plan-enum unification migration (Phase 6 / T-24).
// No DB, no side effects — unit-tested directly. The migration script imports these
// and applies them over live docs.
//
// Canonical targets: Team → starter|team_extra, League → starter|league|league_plus,
// User → starter. Legacy values ('free'/'pro'/'team') collapse per
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
    // Audit M6: a Stripe-backed doc whose price id the loaded env doesn't know
    // almost certainly means the wrong ENV_FILE — a silent fallback to the legacy
    // map could downgrade a paying customer. Abort instead.
    throw new Error(
      `resolveTargetPlan: ${scope} ${doc?._id || '(no id)'} has stripePriceId ` +
        `"${doc.stripePriceId}" which matches no configured STRIPE_PRICE_ID_* — ` +
        `check ENV_FILE before migrating.`
    );
  }
  return normalizePlanId(scope, doc?.plan);
}

// billingSource: 'comp' for We-ball Saturday; otherwise preserve an already-set
// value or default to 'stripe'.
function resolveBillingSource(scope, doc) {
  if (scope === 'league' && isWeballLeague(doc)) return 'comp';
  return doc?.billingSource || 'stripe';
}

// User.plan no longer carries billing access. Resource-level Team and League
// state is authoritative, so all legacy user values collapse to starter.
function mapUserPlan() {
  return 'starter';
}

// Best-effort inverse for --rollback (lossy: team_extra could have been 'pro' or
// 'team'). Requires the pre-tightening (loose) enum to be deployed first — see
// the migration header. team_pro remains for rollback compatibility.
function rollbackPlan(scope, plan) {
  if (plan === 'starter') return 'free';
  if (plan === 'team_extra') return scope === 'team' ? 'team' : 'pro';
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
