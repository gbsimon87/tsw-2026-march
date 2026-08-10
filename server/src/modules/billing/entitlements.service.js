// ─── Entitlement resolver ────────────────────────────────────────────────────
//
// The ONE place that turns a resource (team / league / league-team / user) into
// its current entitlement set. Features consume this — they must NEVER branch on
// `plan === 'x'`. Derives everything from the plan catalog + subscription status +
// billingSource, mirroring the compute-cheaply-with-a-request-cache convention of
// the league-aggregate materialization path.
//
// Design: docs/pricing-overhaul/05-architecture.md §2, 08-entitlements-and-gating.md.

const { entitlementsForPlan, normalizePlanId, getPlan } = require('./plan-catalog');

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// A resource is entitled if it's a non-Stripe grant (comp/manual), or its Stripe
// subscription is active/trialing. An inactive resource falls back to 'starter'
// (the free core), so premium entitlements drop but free features remain.
function resolveEntitlements({ scope, plan, subscriptionStatus, billingSource } = {}) {
  const planId = normalizePlanId(scope, plan);
  const source = billingSource || 'stripe';
  const active = source !== 'stripe' ? true : ACTIVE_STATUSES.has(subscriptionStatus);

  const effectivePlanId = active ? planId : 'starter';
  return {
    planId,
    active,
    entitlements: entitlementsForPlan(effectivePlanId),
    limits: getPlan(effectivePlanId)?.limits || {},
  };
}

function resolveForTeam(team) {
  if (!team) return resolveEntitlements({ scope: 'team' });
  return resolveEntitlements({
    scope: 'team',
    plan: team.plan,
    subscriptionStatus: team.subscriptionStatus,
    billingSource: team.billingSource,
  });
}

function resolveForLeague(league) {
  if (!league) return resolveEntitlements({ scope: 'league' });
  return resolveEntitlements({
    scope: 'league',
    plan: league.plan,
    subscriptionStatus: league.subscriptionStatus,
    billingSource: league.billingSource,
  });
}

// A per-request memo for the League/Team lookups that the async resolvers trigger.
// Optional — resolvers work without it, just without memoization.
function createRequestCache() {
  return new Map();
}

async function loadLeagueCached(leagueId, cache) {
  const key = `league:${leagueId}`;
  if (cache && cache.has(key)) return cache.get(key);
  // Lazy require avoids a load-time cycle (leagues.repository ← ... ← billing).
  const { findLeagueById } = require('../leagues/leagues.repository');
  const league = await findLeagueById(leagueId);
  if (cache) cache.set(key, league);
  return league;
}

// League team → parent league entitlements (the league→member-team cascade).
async function resolveForLeagueTeam(leagueTeam, { cache } = {}) {
  if (!leagueTeam) return resolveForLeague(null);
  const league = await loadLeagueCached(leagueTeam.leagueId, cache);
  return resolveForLeague(league);
}

// Aggregate user-level state from the resources the user actually owns — replaces
// the dead User.league* mirror fields and feeds syncOwnerPlan / sanitizeUser.
async function resolveForUser(userId, { cache } = {}) {
  const { listTeamsByOwner } = require('../teams/teams.repository');
  const { findLeaguesByOwner } = require('../leagues/leagues.repository');

  const [teams, leagues] = await Promise.all([
    listTeamsByOwner(userId),
    findLeaguesByOwner(userId),
  ]);

  const hasActiveTeam = (teams || []).some((t) => resolveForTeam(t).active);
  const hasActiveLeague = (leagues || []).some((l) => resolveForLeague(l).active);

  void cache; // reserved for symmetry; user aggregate does its own batched reads

  return {
    plan: hasActiveTeam ? 'team_pro' : 'starter',
    hasActiveTeam,
    hasActiveLeague,
  };
}

module.exports = {
  resolveEntitlements,
  resolveForTeam,
  resolveForLeague,
  resolveForLeagueTeam,
  resolveForUser,
  createRequestCache,
};
