const Stripe = require('stripe');
const { ApiError } = require('../../utils/apiError');
const {
  Team,
  findTeamByIdAndOwner,
  saveTeam,
  claimTeamWebhookEvent,
} = require('../teams/teams.repository');
const {
  League,
  LeagueManager,
  LeagueTeamMember,
  findLeagueByIdAndOwner,
  findLeaguesByOwner,
  saveLeague,
  claimLeagueWebhookEvent,
} = require('../leagues/leagues.repository');
const { updateUserPlan } = require('../auth/auth.repository');
const { resolveForTeam, resolveForLeague, resolveForUser } = require('./entitlements.service');
const { resolvePriceId, trialDaysFor, planForPriceId } = require('./plan-catalog');
const { assertSafeStripeUrl } = require('../../utils/stripeUrl');
const { sendPaymentFailedEmail, sendTrialEndingEmail } = require('../../services/email.service');
const { env } = require('../../config/env');

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// ─── Stripe client ────────────────────────────────────────────────────────────

let stripeClient = null;

function getStripe() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new ApiError(503, 'Billing is not configured');
  }
  if (!stripeClient) {
    // OPT-023: pin the Stripe API version so a server-side SDK bump can't
    // silently change request/response shapes under us. Matches the SDK's
    // built-in LatestApiVersion for stripe@16; bump deliberately on upgrade.
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return stripeClient;
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function appendQueryParam(urlString, key, value) {
  if (!urlString || value === undefined || value === null || value === '') {
    return urlString;
  }
  const nextUrl = new URL(urlString);
  nextUrl.searchParams.set(key, String(value));
  return nextUrl.toString();
}

// ─── Status normalisation ─────────────────────────────────────────────────────

function normalizeSubscriptionStatus(value) {
  if (!value) return 'inactive';
  if (['trialing', 'active', 'past_due', 'canceled'].includes(value)) return value;
  return 'inactive';
}

// ─── Entitlement checks ───────────────────────────────────────────────────────

// Adapters (T-03): "is this a paid, active resource?" now delegates to the central
// entitlement resolver (the single source of truth for plan normalization + active
// state), so legacy 'pro'/'team'/'league' values and the comp/manual billingSource
// are all handled in one place. A resource is paid-active when its resolved plan is
// non-starter and active. These adapters keep their legacy signature/behavior so the
// ~10 call sites can migrate to the resolver incrementally (Phase 4).
function isTeamActive(team) {
  const r = resolveForTeam(team);
  return r.active && r.planId !== 'starter';
}

function isLeagueActive(league) {
  const r = resolveForLeague(league);
  return r.active && r.planId !== 'starter';
}

function getTeamEntitlements(team) {
  const active = isTeamActive(team);
  return {
    canTrackStats: active,
    canViewReplay: active,
    canViewShotMaps: active,
    canViewHighlightClips: active,
  };
}

function getLeagueEntitlements(league) {
  const active = isLeagueActive(league);
  return {
    canManageLeague: active,
    canTrackStats: active,
    canViewReplay: active,
    canViewShotMaps: active,
    canViewHighlightClips: active,
  };
}

// ─── Billing summaries ────────────────────────────────────────────────────────

function getTeamBillingSummary(team) {
  return {
    plan: team.plan || 'free',
    subscriptionStatus: normalizeSubscriptionStatus(team.subscriptionStatus),
    cancelAtPeriodEnd: Boolean(team.cancelAtPeriodEnd),
    currentPeriodEnd: team.currentPeriodEnd ?? null,
    trialEnd: team.trialEnd ?? null,
    billingInterval: team.billingInterval ?? null,
  };
}

function getLeagueBillingSummary(league) {
  return {
    plan: league.plan || 'free',
    subscriptionStatus: normalizeSubscriptionStatus(league.subscriptionStatus),
    cancelAtPeriodEnd: Boolean(league.cancelAtPeriodEnd),
    currentPeriodEnd: league.currentPeriodEnd ?? null,
    trialEnd: league.trialEnd ?? null,
    billingInterval: league.billingInterval ?? null,
  };
}

// Keep getBillingSummary as alias for backward compatibility
function getBillingSummary(team) {
  return getTeamBillingSummary(team);
}

// ─── Webhook idempotency ──────────────────────────────────────────────────────
//
// OPT-020: idempotency is now enforced atomically at the DB layer via
// `claimTeamWebhookEvent` / `claimLeagueWebhookEvent` (see
// utils/webhookIdempotency.js). Each handler claims the event first; a null
// result means the event was already processed (a Stripe duplicate) or the
// resource wasn't found, so the handler returns without re-applying its effect.
// This replaces the previous load→check-in-memory→save sequence, which had a
// read-check-write race between concurrent deliveries of the same event.

// ─── Sync owner plan ──────────────────────────────────────────────────────────

// User.plan is a resolver-derived cache of the owner's aggregate state (T-17):
// canonical 'team_pro' when they own any active team, else 'starter'. sanitizeUser
// and analytics read it as a canonical value.
async function syncOwnerPlan(ownerUserId) {
  const { plan } = await resolveForUser(ownerUserId);
  await updateUserPlan(ownerUserId, plan);
}

// ─── Team billing reads ───────────────────────────────────────────────────────

async function getTeamBillingForOwner(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) throw new ApiError(404, 'Team not found');
  return {
    billing: getTeamBillingSummary(team),
    entitlements: getTeamEntitlements(team),
  };
}

async function getLeagueBillingForOwner(userId, leagueId) {
  const league = await findLeagueByIdAndOwner(leagueId, userId);
  if (!league) throw new ApiError(404, 'League not found');
  return {
    billing: getLeagueBillingSummary(league),
    entitlements: getLeagueEntitlements(league),
  };
}

// ─── Price ID resolution ──────────────────────────────────────────────────────
// Prices, intervals, and trial lengths come from the plan catalog — the single
// source of truth. No env-var names or hard-coded trial days live here (T-06).

function resolveTeamPriceId(interval) {
  return resolvePriceId('team_pro', interval);
}

function resolveLeaguePriceId(interval) {
  return resolvePriceId('league', interval);
}

// ─── Checkout sessions ────────────────────────────────────────────────────────

async function createTeamCheckoutSession(userId, teamId, interval = 'monthly') {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) throw new ApiError(404, 'Team not found');

  if (isTeamActive(team)) {
    throw new ApiError(400, 'Team already has an active subscription');
  }

  const priceId = resolveTeamPriceId(interval);
  if (!priceId) throw new ApiError(503, 'Billing is not configured');

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_collection: 'always',
    success_url: appendQueryParam(
      appendQueryParam(
        appendQueryParam(env.STRIPE_SUCCESS_URL, 'resourceType', 'team'),
        'teamId',
        team._id
      ),
      'checkout',
      'success'
    ),
    cancel_url: appendQueryParam(
      appendQueryParam(
        appendQueryParam(env.STRIPE_CANCEL_URL, 'resourceType', 'team'),
        'teamId',
        team._id
      ),
      'checkout',
      'canceled'
    ),
    customer_email: team.billingEmail || undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDaysFor('team_pro', interval),
      metadata: {
        resourceType: 'team',
        teamId: String(team._id),
        ownerUserId: String(userId),
        plan: 'team',
        billingInterval: interval,
      },
    },
    metadata: {
      resourceType: 'team',
      teamId: String(team._id),
      ownerUserId: String(userId),
      plan: 'team',
      billingInterval: interval,
    },
  });

  return { url: assertSafeStripeUrl(session.url) };
}

async function createLeagueCheckoutSession(userId, interval = 'monthly') {
  const existingLeagues = await findLeaguesByOwner(userId);
  if (existingLeagues.some(isLeagueActive)) {
    throw new ApiError(400, 'You already have an active League subscription');
  }

  const priceId = resolveLeaguePriceId(interval);
  if (!priceId) throw new ApiError(503, 'Billing is not configured');

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_collection: 'always',
    success_url: appendQueryParam(
      appendQueryParam(env.STRIPE_SUCCESS_URL, 'resourceType', 'league'),
      'checkout',
      'success'
    ),
    cancel_url: appendQueryParam(
      appendQueryParam(env.STRIPE_CANCEL_URL, 'resourceType', 'league'),
      'checkout',
      'canceled'
    ),
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDaysFor('league', interval),
      metadata: {
        resourceType: 'league',
        ownerUserId: String(userId),
        plan: 'league',
        billingInterval: interval,
      },
    },
    metadata: {
      resourceType: 'league',
      ownerUserId: String(userId),
      plan: 'league',
      billingInterval: interval,
    },
  });

  return { url: assertSafeStripeUrl(session.url) };
}

// Keep old name as alias so existing routes don't break until migrated
async function createCheckoutSession(userId, teamId) {
  return createTeamCheckoutSession(userId, teamId, 'monthly');
}

// ─── Customer portal ──────────────────────────────────────────────────────────

async function createTeamPortalSession(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) throw new ApiError(404, 'Team not found');
  if (!team.stripeCustomerId) throw new ApiError(400, 'No billing customer exists for this team');

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: team.stripeCustomerId,
    return_url: env.STRIPE_SUCCESS_URL,
  });
  return { url: assertSafeStripeUrl(session.url) };
}

async function createLeaguePortalSession(userId, leagueId) {
  const league = await findLeagueByIdAndOwner(leagueId, userId);
  if (!league) throw new ApiError(404, 'League not found');
  if (!league.stripeCustomerId) {
    throw new ApiError(400, 'No billing customer exists for this league');
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: league.stripeCustomerId,
    return_url: env.STRIPE_SUCCESS_URL,
  });
  return { url: assertSafeStripeUrl(session.url) };
}

// Keep old name as alias
async function createCustomerPortalSession(userId, teamId) {
  return createTeamPortalSession(userId, teamId);
}

// ─── Apply subscription state ─────────────────────────────────────────────────

// Derive { planId, interval } from the subscription's real price id (T-16) — the
// authoritative source, not client-supplied metadata. Falls back to the scope's
// canonical paid plan if the price isn't in the catalog (e.g. a legacy price).
function derivePlanFromSubscription(subscription, fallbackPlanId) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const derived = planForPriceId(priceId);
  return {
    planId: derived?.planId || fallbackPlanId,
    interval: derived?.interval || subscription.metadata?.billingInterval || null,
  };
}

function applyTeamSubscriptionState(team, subscription) {
  const status = normalizeSubscriptionStatus(subscription.status);
  const { planId, interval } = derivePlanFromSubscription(subscription, 'team_pro');
  // Canonical plan ids (T-16): 'team_pro' when active, else 'starter'.
  team.plan = ACTIVE_STATUSES.has(status) ? planId : 'starter';
  team.subscriptionStatus = status;
  team.stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id || team.stripeCustomerId || null;
  team.stripeSubscriptionId = subscription.id || null;
  team.stripePriceId = subscription.items?.data?.[0]?.price?.id || team.stripePriceId || null;
  team.billingInterval = interval || team.billingInterval || null;
  team.currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  team.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  team.trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
}

function applyLeagueSubscriptionState(league, subscription) {
  const status = normalizeSubscriptionStatus(subscription.status);
  const { planId, interval } = derivePlanFromSubscription(subscription, 'league');
  league.plan = ACTIVE_STATUSES.has(status) ? planId : 'starter';
  league.subscriptionStatus = status;
  league.stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id || league.stripeCustomerId || null;
  league.stripeSubscriptionId = subscription.id || null;
  league.stripePriceId = subscription.items?.data?.[0]?.price?.id || league.stripePriceId || null;
  league.billingInterval = interval || league.billingInterval || null;
  league.currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  league.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  league.trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
}

// Comp/manual grants are owned outside Stripe (T-10/T-16): a webhook must never
// mutate them, so a stray Stripe event can't reset a comp grant.
function isStripeManaged(doc) {
  return !doc.billingSource || doc.billingSource === 'stripe';
}

// ─── Webhook handlers: teams ──────────────────────────────────────────────────

async function markTeamFromCheckoutSession(session, eventId) {
  const teamId = session.metadata?.teamId;
  if (!teamId) return;

  // OPT-020: atomic claim — null means duplicate event or missing team.
  const team = await claimTeamWebhookEvent(teamId, eventId);
  if (!team) return;

  team.stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : team.stripeCustomerId || null;
  team.billingEmail = session.customer_details?.email || team.billingEmail || null;
  team.billingSource = 'stripe'; // provisioned via Stripe (T-16)
  await saveTeam(team);
  await syncOwnerPlan(team.ownerUserId);
}

async function updateTeamFromSubscription(subscription, eventId) {
  const teamId = subscription.metadata?.teamId;
  if (!teamId) return;

  const team = await claimTeamWebhookEvent(teamId, eventId);
  if (!team) return;
  if (!isStripeManaged(team)) return; // comp/manual grant — immune to Stripe events

  applyTeamSubscriptionState(team, subscription);
  await saveTeam(team);
  await syncOwnerPlan(team.ownerUserId);
}

async function markTeamInvoiceFailure(invoice, eventId) {
  const teamId =
    invoice.parent?.subscription_details?.metadata?.teamId ||
    invoice.lines?.data?.[0]?.metadata?.teamId;
  if (!teamId) return;

  const team = await claimTeamWebhookEvent(teamId, eventId);
  if (!team) return;
  if (!isStripeManaged(team)) return;

  team.subscriptionStatus = 'past_due';
  await saveTeam(team);
  await syncOwnerPlan(team.ownerUserId);
  sendPaymentFailedEmail({ to: team.billingEmail, resourceLabel: team.name }); // T-18
}

// customer.subscription.trial_will_end (T-18): remind the owner before the trial ends.
async function handleTeamTrialWillEnd(subscription, eventId) {
  const teamId = subscription.metadata?.teamId;
  if (!teamId) return;

  const team = await claimTeamWebhookEvent(teamId, eventId);
  if (!team) return;
  if (!isStripeManaged(team)) return;
  if (!team.billingEmail) return;

  sendTrialEndingEmail({
    to: team.billingEmail,
    resourceLabel: team.name,
    trialEndsAt: subscription.trial_end ? subscription.trial_end * 1000 : null,
  });
}

// invoice.paid (T-16): a successful renewal — confirm active + extend the period.
async function markTeamInvoicePaid(invoice, eventId) {
  const teamId =
    invoice.parent?.subscription_details?.metadata?.teamId ||
    invoice.lines?.data?.[0]?.metadata?.teamId;
  if (!teamId) return;

  const team = await claimTeamWebhookEvent(teamId, eventId);
  if (!team) return;
  if (!isStripeManaged(team)) return;

  team.subscriptionStatus = 'active';
  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (periodEnd) team.currentPeriodEnd = new Date(periodEnd * 1000);
  await saveTeam(team);
  await syncOwnerPlan(team.ownerUserId);
}

// ─── Webhook handlers: leagues ────────────────────────────────────────────────

async function createLeagueFromCheckoutSession(session, eventId) {
  const ownerUserId = session.metadata?.ownerUserId;
  const billingInterval = session.metadata?.billingInterval || 'monthly';
  if (!ownerUserId) return;

  // League is created here (post-checkout) to avoid chicken-and-egg problem.
  // OPT-020 note: idempotency for this *create* path is by-customer, not by
  // event id — a duplicate checkout.session.completed for an already-created
  // league is caught by this lookup. (The atomic claim-by-event-id used by the
  // update handlers needs an existing doc; there is none here yet. A unique
  // index on stripeCustomerId would fully close the concurrent-create race but
  // is a prod-data-gated migration — deferred, same class as OPT-007.)
  const existingByCustomer = await League.findOne({
    stripeCustomerId: session.customer,
  });
  if (existingByCustomer) return; // already handled

  const placeholderSlug = `league-${String(ownerUserId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const league = await League.create({
    ownerUserId,
    name: 'My League',
    slug: placeholderSlug,
    plan: 'free',
    subscriptionStatus: 'inactive',
    billingSource: 'stripe', // provisioned via Stripe (T-16)
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
    billingEmail: session.customer_details?.email || null,
    billingInterval,
    processedWebhookEventIds: [eventId].filter(Boolean),
    lastWebhookEventId: eventId || null,
  });

  return league;
}

async function updateLeagueFromSubscription(subscription, eventId) {
  const ownerUserId = subscription.metadata?.ownerUserId;
  if (!ownerUserId) return;

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

  const league = await claimLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId);
  if (!league) return;
  if (!isStripeManaged(league)) return; // comp/manual grant — immune to Stripe events

  applyLeagueSubscriptionState(league, subscription);
  await saveLeague(league);
}

async function markLeagueInvoiceFailure(invoice, eventId) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!customerId) return;

  // resourceType comes from the invoice metadata, so it can be checked before
  // touching the DB — only league invoices are handled here.
  const resourceType =
    invoice.parent?.subscription_details?.metadata?.resourceType ||
    invoice.lines?.data?.[0]?.metadata?.resourceType;
  if (resourceType !== 'league') return;

  const league = await claimLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId);
  if (!league) return;
  if (!isStripeManaged(league)) return;

  league.subscriptionStatus = 'past_due';
  await saveLeague(league);
  sendPaymentFailedEmail({ to: league.billingEmail, resourceLabel: league.name }); // T-18
}

async function handleLeagueTrialWillEnd(subscription, eventId) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;

  const league = await claimLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId);
  if (!league) return;
  if (!isStripeManaged(league)) return;
  if (!league.billingEmail) return;

  sendTrialEndingEmail({
    to: league.billingEmail,
    resourceLabel: league.name,
    trialEndsAt: subscription.trial_end ? subscription.trial_end * 1000 : null,
  });
}

// invoice.paid (T-16): league renewal — confirm active + extend the period.
async function markLeagueInvoicePaid(invoice, eventId) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const resourceType =
    invoice.parent?.subscription_details?.metadata?.resourceType ||
    invoice.lines?.data?.[0]?.metadata?.resourceType;
  if (resourceType !== 'league') return;

  const league = await claimLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId);
  if (!league) return;
  if (!isStripeManaged(league)) return;

  league.subscriptionStatus = 'active';
  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (periodEnd) league.currentPeriodEnd = new Date(periodEnd * 1000);
  await saveLeague(league);
}

// ─── Main webhook dispatcher ──────────────────────────────────────────────────

async function handleWebhookEvent(signature, rawBody) {
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  const obj = event.data.object;
  const resourceType = obj.metadata?.resourceType;

  switch (event.type) {
    case 'checkout.session.completed':
      if (resourceType === 'league') {
        await createLeagueFromCheckoutSession(obj, event.id);
      } else {
        await markTeamFromCheckoutSession(obj, event.id);
      }
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      if (resourceType === 'league') {
        await updateLeagueFromSubscription(obj, event.id);
      } else {
        await updateTeamFromSubscription(obj, event.id);
      }
      break;

    case 'invoice.payment_failed':
      if (resourceType === 'league') {
        await markLeagueInvoiceFailure(obj, event.id);
      } else {
        await markTeamInvoiceFailure(obj, event.id);
      }
      break;

    case 'invoice.paid': {
      // Invoices rarely carry a top-level resourceType — fall back to the
      // subscription/line metadata so league renewals route correctly (T-16).
      const invoiceResourceType =
        resourceType ||
        obj.parent?.subscription_details?.metadata?.resourceType ||
        obj.lines?.data?.[0]?.metadata?.resourceType;
      if (invoiceResourceType === 'league') {
        await markLeagueInvoicePaid(obj, event.id);
      } else {
        await markTeamInvoicePaid(obj, event.id);
      }
      break;
    }

    case 'customer.subscription.trial_will_end':
      // Trial-ending reminder email (T-18); no state change.
      if (resourceType === 'league') {
        await handleLeagueTrialWillEnd(obj, event.id);
      } else {
        await handleTeamTrialWillEnd(obj, event.id);
      }
      break;

    default:
      break;
  }

  return { received: true };
}

// ─── Team creation guard ──────────────────────────────────────────────────────

// Tracking is free (T-12): creating a team no longer requires an active
// subscription on any existing team. The Starter plan's maxTeams limit
// (plan-catalog limits) is a config-driven fast-follow (F-02); until it is
// enforced here, team creation is unrestricted. Kept as the single hook where
// that limit will live so call sites don't change again.
// eslint-disable-next-line no-unused-vars
async function assertTeamCreationAllowed(userId) {
  // no-op for now (see F-02)
}

// ─── Feed affiliation gate ────────────────────────────────────────────────────

async function assertFeedPostingAllowed(userId) {
  // TSW-001: league owners never get an explicit LeagueManager row (that's
  // reserved for managers the owner adds via addLeagueManagerByEmail, which
  // even rejects adding the owner themself). Every other authorization
  // helper in leagues.service.js ORs in League.exists({ ownerUserId }) for
  // this reason — this check was missing it, so a league owner with no team
  // and no explicit manager row was wrongly rejected here.
  const [ownsTeam, ownsLeague, isLeagueManager, isLeagueMember] = await Promise.all([
    Team.exists({ ownerUserId: userId }),
    League.exists({ ownerUserId: userId }),
    LeagueManager.exists({ userId, status: 'active' }),
    LeagueTeamMember.exists({ userId, status: 'active' }),
  ]);

  if (!ownsTeam && !ownsLeague && !isLeagueManager && !isLeagueMember) {
    throw new ApiError(403, 'You must be part of a team or league to post');
  }
}

module.exports = {
  // Entitlement checks
  isTeamActive,
  isLeagueActive,
  getTeamEntitlements,
  getLeagueEntitlements,
  // Billing summaries
  getBillingSummary,
  getTeamBillingSummary,
  getLeagueBillingSummary,
  // Billing reads
  getTeamBillingForOwner,
  getLeagueBillingForOwner,
  // Checkout
  createCheckoutSession,
  createTeamCheckoutSession,
  createLeagueCheckoutSession,
  // Portal
  createCustomerPortalSession,
  createTeamPortalSession,
  createLeaguePortalSession,
  // Webhook
  handleWebhookEvent,
  // Guards
  assertTeamCreationAllowed,
  assertFeedPostingAllowed,
};
