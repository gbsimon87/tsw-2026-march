// ─── Plan catalog ──────────────────────────────────────────────────────────────
//
// The SINGLE SOURCE OF TRUTH for plans, prices, and entitlements. Pure config —
// no DB, no Stripe client (only `env` for price-ID lookup). "Add or change a plan
// = edit this file." Features must never branch on `plan === 'x'`; they read
// entitlements resolved from this catalog (see entitlements.service.js).
//
// Design + rationale: docs/pricing-overhaul/05-architecture.md §1,
// 03-feature-packaging.md. Interval keys are 'monthly' | 'season' to match the
// checkout validation enum and the STRIPE_PRICE_ID_*_{MONTHLY,SEASON} env vars;
// display strings ('$79/yr') are copy only — Stripe price amounts are the
// authoritative charge.

const { env } = require('../../config/env');

// Every entitlement flag the resolver can return. Keys marked "future" resolve
// false everywhere until a plan claims them — reserved now so a feature, when
// built, only has to *check* the key rather than force a packaging refactor.
const FEATURES = Object.freeze({
  CAN_TRACK_STATS: 'canTrackStats',
  CAN_VIEW_BOX_SCORE: 'canViewBoxScore',
  CAN_VIEW_REPLAY: 'canViewReplay',
  CAN_VIEW_SHOT_MAPS: 'canViewShotMaps',
  CAN_VIEW_HIGHLIGHT_CLIPS: 'canViewHighlightClips',
  CAN_VIEW_FULL_HISTORY: 'canViewFullHistory',
  CAN_EXPORT_CSV: 'canExportCsv',
  CAN_RICH_PLAYER_PROFILES: 'canRichPlayerProfiles', // fast-follow (cascade)
  CAN_VIEW_COACH_REPORTS: 'canViewCoachReports', // future
  CAN_MANAGE_LEAGUE: 'canManageLeague',
  CAN_USE_SPONSOR_TOOLS: 'canUseSponsorTools', // future
});

const ALL_FEATURE_KEYS = Object.freeze(Object.values(FEATURES));

const F = FEATURES;

const STARTER_ENTITLEMENTS = [F.CAN_TRACK_STATS, F.CAN_VIEW_BOX_SCORE];

const TEAM_PRO_ENTITLEMENTS = [
  ...STARTER_ENTITLEMENTS,
  F.CAN_VIEW_REPLAY,
  F.CAN_VIEW_SHOT_MAPS,
  F.CAN_VIEW_HIGHLIGHT_CLIPS,
  F.CAN_VIEW_FULL_HISTORY,
  F.CAN_EXPORT_CSV,
  F.CAN_RICH_PLAYER_PROFILES,
  F.CAN_VIEW_COACH_REPORTS,
];

const PLANS = Object.freeze({
  starter: {
    id: 'starter',
    scope: 'team',
    stripe: null,
    display: {
      name: 'Starter',
      tagline: 'Track one team, free forever.',
      price: 'Free',
      features: [
        'Live stat tracking & box scores',
        'Public team & player pages',
        'Follow any public team or league',
        'Shareable cards on The Pulse',
      ],
    },
    entitlements: STARTER_ENTITLEMENTS,
    // Not enforced yet (fast-follow F-02) — declared so the limit is a config edit.
    limits: { maxTeams: 1, historyWindow: 'recent-season' },
  },
  team_pro: {
    id: 'team_pro',
    scope: 'team',
    display: {
      name: 'Team Pro',
      tagline: 'Depth for serious teams.',
      features: [
        'Everything in Starter',
        'Replay & public shot maps',
        'Highlight clips',
        'Full historical stats + CSV export',
        'Rich player profiles',
      ],
    },
    intervals: {
      monthly: {
        priceIdEnv: 'STRIPE_PRICE_ID_TEAM_MONTHLY',
        display: '$9/mo',
        trialDays: 14,
      },
      season: {
        priceIdEnv: 'STRIPE_PRICE_ID_TEAM_SEASON',
        display: '$79/yr',
        trialDays: 14,
      },
    },
    entitlements: TEAM_PRO_ENTITLEMENTS,
    // Fast-follow (F-01): a Team Pro team's players get rich profiles for free.
    cascade: { toPlayers: [F.CAN_RICH_PLAYER_PROFILES] },
  },
  league: {
    id: 'league',
    scope: 'league',
    display: {
      name: 'League',
      tagline: 'Run your whole league.',
      features: [
        'Standings, rosters & join requests',
        'Scheduling & dual-team tracking',
        'Public league homepage',
        'Team Pro included for every team',
        'Priority support',
      ],
    },
    intervals: {
      monthly: {
        priceIdEnv: 'STRIPE_PRICE_ID_LEAGUE_MONTHLY',
        display: '$29/mo',
        trialDays: 14,
      },
      season: {
        priceIdEnv: 'STRIPE_PRICE_ID_LEAGUE_SEASON',
        display: '$199/season',
        trialDays: 14,
      },
    },
    entitlements: [F.CAN_MANAGE_LEAGUE],
    // League grants every member team Team Pro's entitlement set.
    bundles: ['team_pro'],
  },
});

// ─── Lookups ─────────────────────────────────────────────────────────────────

function getPlan(planId) {
  return PLANS[planId] || null;
}

// Returns the full entitlement set for a plan as { <featureKey>: boolean } with
// every FEATURES key present (absent ⇒ false), expanding any bundled plans.
function entitlementsForPlan(planId) {
  const result = {};
  for (const key of ALL_FEATURE_KEYS) result[key] = false;

  const plan = PLANS[planId];
  if (!plan) return result;

  const grant = (ids) => {
    for (const id of ids || []) result[id] = true;
  };

  for (const bundledId of plan.bundles || []) {
    grant(PLANS[bundledId]?.entitlements);
  }
  grant(plan.entitlements);

  return result;
}

// Legacy tolerance: the ONLY place old plan values are mapped. Lets the resolver
// run correctly against un-migrated docs ('free'/'pro'/'team'/'league').
function normalizePlanId(scope, rawPlan) {
  const value = rawPlan || 'starter';
  if (value === 'starter' || value === 'free') return 'starter';

  if (scope === 'team') {
    if (value === 'team_pro' || value === 'team' || value === 'pro') return 'team_pro';
    return 'starter';
  }
  if (scope === 'league') {
    if (value === 'league' || value === 'pro') return 'league';
    return 'starter';
  }
  return 'starter';
}

// ─── Prices ──────────────────────────────────────────────────────────────────

// The only place env price IDs are dereferenced.
function resolvePriceId(planId, intervalKey) {
  const priceIdEnv = PLANS[planId]?.intervals?.[intervalKey]?.priceIdEnv;
  return priceIdEnv ? env[priceIdEnv] : undefined;
}

// Reverse lookup: derive { planId, interval } from a subscription's real price ID
// (webhooks use this instead of trusting client-supplied metadata).
function planForPriceId(priceId) {
  if (!priceId) return null;
  for (const [planId, plan] of Object.entries(PLANS)) {
    for (const interval of Object.keys(plan.intervals || {})) {
      if (resolvePriceId(planId, interval) === priceId) {
        return { planId, interval };
      }
    }
  }
  return null;
}

function trialDaysFor(planId, intervalKey) {
  return PLANS[planId]?.intervals?.[intervalKey]?.trialDays || 0;
}

// ─── Client projection ───────────────────────────────────────────────────────

// Price-ID-free view served to the client (GET /billing/catalog). Carries display
// copy only — never priceIdEnv or resolved Stripe price IDs.
function getDisplayCatalog() {
  return Object.values(PLANS).map((plan) => {
    const intervals = {};
    for (const [key, cfg] of Object.entries(plan.intervals || {})) {
      intervals[key] = { display: cfg.display, trialDays: cfg.trialDays };
    }
    return {
      id: plan.id,
      scope: plan.scope,
      name: plan.display.name,
      tagline: plan.display.tagline,
      price: plan.display.price, // e.g. 'Free' for starter; undefined otherwise
      features: plan.display.features,
      intervals,
    };
  });
}

module.exports = {
  FEATURES,
  ALL_FEATURE_KEYS,
  PLANS,
  getPlan,
  entitlementsForPlan,
  normalizePlanId,
  resolvePriceId,
  planForPriceId,
  trialDaysFor,
  getDisplayCatalog,
};
