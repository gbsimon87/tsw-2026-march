// ─── Plan catalog ──────────────────────────────────────────────────────────────
//
// The SINGLE SOURCE OF TRUTH for plans, prices, and entitlements. Pure config —
// no DB, no Stripe client (only `env` for price-ID lookup). "Add or change a plan
// = edit this file." Features must never branch on `plan === 'x'`; they read
// entitlements resolved from this catalog (see entitlements.service.js).
//
// Setup and lifecycle guide: docs/stripe.md. Every paid plan is monthly. Display
// strings are copy only — Stripe Price amounts are the authoritative charge.

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

// Every currently-built team feature is free. Billing controls how many
// standalone teams an owner may actively manage, not which features they see.
const TEAM_ENTITLEMENTS = [
  F.CAN_TRACK_STATS,
  F.CAN_VIEW_BOX_SCORE,
  F.CAN_VIEW_REPLAY,
  F.CAN_VIEW_SHOT_MAPS,
  F.CAN_VIEW_HIGHLIGHT_CLIPS,
  F.CAN_VIEW_FULL_HISTORY,
  F.CAN_EXPORT_CSV,
];

const PLANS = Object.freeze({
  starter: {
    id: 'starter',
    scope: 'team',
    stripe: null,
    display: {
      name: 'Your First Team',
      tagline: 'Track one team, free forever.',
      price: 'Free',
      features: [
        'Every available team feature',
        'Live tracking, box scores & full history',
        'Replay, shot maps & highlights',
        'CSV exports and public pages',
      ],
    },
    entitlements: TEAM_ENTITLEMENTS,
    limits: { maxStandaloneTeams: 1 },
  },
  team_extra: {
    id: 'team_extra',
    scope: 'team',
    display: {
      name: 'Additional Team',
      tagline: 'Add another independent team to your account.',
      features: [
        'All team features included',
        'The team can belong to any real-life league',
        'Cancel any time; your data stays safe',
      ],
    },
    intervals: {
      monthly: {
        priceIdEnv: 'STRIPE_PRICE_ID_ADDITIONAL_TEAM',
        display: '$5/mo per additional team',
        trialDays: 0,
      },
    },
    entitlements: TEAM_ENTITLEMENTS,
    limits: { paidStandaloneTeamSlots: 1 },
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
        'Up to 10 teams',
        'All team features included',
        'Priority support',
      ],
    },
    intervals: {
      monthly: {
        priceIdEnv: 'STRIPE_PRICE_ID_LEAGUE',
        display: '$29/mo',
        trialDays: 14,
      },
    },
    entitlements: [F.CAN_MANAGE_LEAGUE, F.CAN_EXPORT_CSV],
    bundles: ['starter'],
    limits: { maxLeagueTeams: 10 },
  },
  league_plus: {
    id: 'league_plus',
    scope: 'league',
    display: {
      name: 'League Plus',
      tagline: 'For larger competitions.',
      features: [
        'Everything in League',
        '11 to 24 teams',
        'All team features included',
        'Priority support',
      ],
    },
    intervals: {
      monthly: {
        priceIdEnv: 'STRIPE_PRICE_ID_LEAGUE_PLUS',
        display: '$49/mo',
        trialDays: 14,
      },
    },
    entitlements: [F.CAN_MANAGE_LEAGUE, F.CAN_EXPORT_CSV],
    bundles: ['starter'],
    limits: { maxLeagueTeams: 24 },
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
    if (value === 'team_extra' || value === 'team_pro' || value === 'team' || value === 'pro') {
      return 'team_extra';
    }
    return 'starter';
  }
  if (scope === 'league') {
    if (value === 'league_plus') return 'league_plus';
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
