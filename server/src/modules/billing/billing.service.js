const Stripe = require('stripe');
const { createHash } = require('crypto');
const { ApiError } = require('../../utils/apiError');
const {
  Team,
  findTeamByIdAndOwner,
  listTeamsByOwner,
  saveTeam,
  makeOwnedTeamFree,
  claimTeamWebhookEvent,
  releaseTeamWebhookEvent,
} = require('../teams/teams.repository');
const {
  League,
  LeagueManager,
  LeagueTeamMember,
  findLeagueByIdAndOwner,
  findLeaguesByOwner,
  listLeagueTeams,
  saveLeague,
  claimLeagueWebhookEvent,
  releaseLeagueWebhookEvent,
} = require('../leagues/leagues.repository');
const { updateUserPlan } = require('../auth/auth.repository');
const { resolveForTeam, resolveForLeague, resolveForUser } = require('./entitlements.service');
const { resolvePriceId, trialDaysFor, planForPriceId } = require('./plan-catalog');
const { assertSafeStripeUrl } = require('../../utils/stripeUrl');
const { sendPaymentFailedEmail, sendTrialEndingEmail } = require('../../services/email.service');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const OPEN_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);
// Audit H4: Stripe doesn't guarantee webhook delivery order — a subscription's
// final invoice.payment_failed can arrive after its customer.subscription.deleted.
// Once a doc is canceled, a late payment-failure notice must not resurrect it to
// past_due.
const TERMINAL_STATUSES = new Set(['canceled']);

// ─── Stripe client ────────────────────────────────────────────────────────────

let stripeClient = null;

function getStripe() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new ApiError(503, 'Billing is not configured');
  }
  if (!stripeClient) {
    // Pin account behavior so dependency upgrades cannot silently alter API shapes.
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });
  }
  return stripeClient;
}

function getPortalConfigurationId() {
  if (!env.STRIPE_PORTAL_CONFIGURATION_ID) {
    throw new ApiError(503, 'Billing management is not configured');
  }
  return env.STRIPE_PORTAL_CONFIGURATION_ID;
}

// Audit M3: run a Stripe SDK call, masking any SDK error as a generic 502. The
// error middleware only masks >=500, so an unwrapped StripeInvalidRequestError
// (statusCode 400, e.g. "No such price: price_1ABC…") would be returned verbatim,
// leaking live price IDs that getDisplayCatalog deliberately hides.
async function callStripe(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const isStripeError = typeof error?.type === 'string' && error.type.startsWith('Stripe');
    if (isStripeError) {
      // Stripe errors can include request bodies, customer details, and internal
      // identifiers. Keep the useful diagnostic fields without serializing the
      // complete SDK error into application logs.
      logger.error(
        {
          stripeErrorType: error.type,
          stripeErrorCode: error.code,
          stripeRequestId: error.requestId,
          stripeStatusCode: error.statusCode,
        },
        'Stripe API error'
      );
      throw new ApiError(502, 'Billing provider error');
    }
    throw error;
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function appendQueryParam(urlString, key, value) {
  if (!urlString || value === undefined || value === null || value === '') {
    return urlString;
  }
  const nextUrl = new URL(urlString);
  nextUrl.searchParams.set(key, String(value));
  return nextUrl.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
}

function buildPortalReturnUrl(resourceType, resourceId) {
  const url = new URL('/pricing', env.STRIPE_SUCCESS_URL);
  url.searchParams.set('resourceType', resourceType);
  if (resourceId) url.searchParams.set(resourceType === 'team' ? 'teamId' : 'leagueId', resourceId);
  return url.toString();
}

function stableSuffix(seed) {
  const digest = createHash('sha256').update(seed).digest();
  return Array.from(digest.subarray(0, 8), (byte) => String.fromCharCode(97 + (byte % 26))).join(
    ''
  );
}

function checkoutRequestOptions(scope, ownerUserId, resourceId, interval) {
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const seed = `${scope}:${ownerUserId}:${resourceId || 'new'}:${interval}:${bucket}`;
  return {
    idempotencyKey: `tsw_checkout_${createHash('sha256').update(seed).digest('hex')}`,
    integrationIdentifier: `tsw_checkout_${stableSuffix(seed)}`,
  };
}

// ─── Status normalisation ─────────────────────────────────────────────────────

function normalizeSubscriptionStatus(value) {
  if (!value) return 'inactive';
  if (
    [
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused',
    ].includes(value)
  ) {
    return value;
  }
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

function canManageStandaloneTeam(team) {
  if (!team) return false;
  if (team.capacityType === 'free') return true;
  if (!isStripeManaged(team)) return true;
  return isTeamActive(team);
}

function assertTeamManagementAllowed(team) {
  if (!canManageStandaloneTeam(team)) {
    throw new ApiError(
      402,
      'This additional team needs an active $5/month subscription before it can be changed.'
    );
  }
  return team;
}

function isLeagueActive(league) {
  const r = resolveForLeague(league);
  return r.active && r.planId !== 'starter';
}

// Audit M11: the legacy getTeam/LeagueEntitlements maps (and the unrouted
// getTeam/LeagueBillingForOwner reads that consumed them) were deleted — they
// returned `canTrackStats: active`, contradicting T-12's free tracking, and omitted
// canExportCsv/canViewFullHistory. All entitlement resolution now goes through the
// central resolver (entitlements.service.js). Do not reintroduce plan→boolean maps
// outside the resolver.

// ─── Billing summaries ────────────────────────────────────────────────────────

function getTeamBillingSummary(team) {
  const capacityType = team.capacityType || 'paid';
  return {
    plan: team.plan || 'starter',
    capacityType,
    canManage: canManageStandaloneTeam(team),
    managedByStripe: isStripeManaged(team),
    subscriptionStatus: normalizeSubscriptionStatus(team.subscriptionStatus),
    cancelAtPeriodEnd: Boolean(team.cancelAtPeriodEnd),
    currentPeriodEnd: team.currentPeriodEnd ?? null,
    trialEnd: team.trialEnd ?? null,
    billingInterval: team.billingInterval ?? null,
  };
}

function getLeagueBillingSummary(league) {
  const resolved = resolveForLeague(league);
  return {
    plan: league.plan || 'starter',
    canManage: resolved.entitlements.canManageLeague,
    managedByStripe: isStripeManaged(league),
    subscriptionStatus: normalizeSubscriptionStatus(league.subscriptionStatus),
    cancelAtPeriodEnd: Boolean(league.cancelAtPeriodEnd),
    currentPeriodEnd: league.currentPeriodEnd ?? null,
    trialEnd: league.trialEnd ?? null,
    billingInterval: league.billingInterval ?? null,
    scheduledPlan: league.scheduledPlan ?? null,
    scheduledPlanAt: league.scheduledPlanAt ?? null,
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

// User.plan is retained as a legacy analytics cache. Resource-level billing is
// authoritative, so it remains 'starter' under the capacity pricing model.
async function syncOwnerPlan(ownerUserId) {
  const { plan } = await resolveForUser(ownerUserId);
  await updateUserPlan(ownerUserId, plan);
}

// ─── Price ID resolution ──────────────────────────────────────────────────────
// Prices, intervals, and trial lengths come from the plan catalog — the single
// source of truth. No env-var names or hard-coded trial days live here (T-06).

function resolveTeamPriceId(interval) {
  return resolvePriceId('team_extra', interval);
}

function resolveLeaguePriceId(planId) {
  return resolvePriceId(planId, 'monthly');
}

// ─── Checkout sessions ────────────────────────────────────────────────────────

async function createTeamCheckoutSession(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) throw new ApiError(404, 'Team not found');
  if (team.capacityType === 'free') {
    throw new ApiError(400, 'This is already your free team');
  }

  if (isTeamActive(team) || OPEN_SUBSCRIPTION_STATUSES.has(team.subscriptionStatus)) {
    throw new ApiError(400, 'Team already has a subscription. Use billing management instead.');
  }

  const priceId = resolveTeamPriceId('monthly');
  if (!priceId) throw new ApiError(503, 'Billing is not configured');

  const stripe = getStripe();
  const request = checkoutRequestOptions('team', userId, String(team._id), 'monthly');
  const session = await callStripe(() =>
    stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        integration_identifier: request.integrationIdentifier,
        payment_method_collection: 'always',
        success_url: appendQueryParam(
          appendQueryParam(
            appendQueryParam(
              appendQueryParam(env.STRIPE_SUCCESS_URL, 'resourceType', 'team'),
              'teamId',
              team._id
            ),
            'checkout',
            'success'
          ),
          'session_id',
          '{CHECKOUT_SESSION_ID}'
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
        // Audit H2/H1: reuse this team's existing Stripe customer on re-checkout so
        // a second purchase attaches to the same customer (the portal can then cancel
        // it, and Stripe also suppresses a repeat trial for a known customer). Only
        // one of customer / customer_email may be sent.
        customer: team.stripeCustomerId || undefined,
        customer_email: team.stripeCustomerId ? undefined : team.billingEmail || undefined,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          metadata: {
            resourceType: 'team',
            teamId: String(team._id),
            ownerUserId: String(userId),
            plan: 'team_extra',
            billingInterval: 'monthly',
          },
        },
        metadata: {
          resourceType: 'team',
          teamId: String(team._id),
          ownerUserId: String(userId),
          plan: 'team_extra',
          billingInterval: 'monthly',
        },
      },
      { idempotencyKey: request.idempotencyKey }
    )
  );

  return { url: assertSafeStripeUrl(session.url) };
}

async function createLeagueCheckoutSession(userId, planId = 'league', leagueId = null) {
  if (!['league', 'league_plus'].includes(planId)) {
    throw new ApiError(400, 'Invalid League plan');
  }
  const targetLeague = leagueId ? await findLeagueByIdAndOwner(leagueId, userId) : null;
  if (leagueId && !targetLeague) throw new ApiError(404, 'League not found');

  // Development-only Stripe bypass. It mirrors the document that the Stripe
  // checkout webhook provisions, but grants it as a local comp so developers
  // can configure multiple leagues without Stripe credentials or webhooks.
  if (env.NODE_ENV === 'development' && !env.STRIPE_SECRET_KEY) {
    if (targetLeague) {
      targetLeague.plan = planId;
      targetLeague.subscriptionStatus = 'active';
      targetLeague.billingSource = 'comp';
      targetLeague.billingInterval = 'monthly';
      await saveLeague(targetLeague);
      return {
        devRedirectPath: `/pricing?leagueId=${encodeURIComponent(String(targetLeague._id))}`,
      };
    }
    const placeholderSlug = `league-dev-${String(userId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await League.create({
      ownerUserId: userId,
      name: 'My League',
      slug: placeholderSlug,
      plan: planId,
      subscriptionStatus: 'active',
      billingSource: 'comp',
      billingInterval: 'monthly',
    });
    return { devRedirectPath: '/admin/leagues/new' };
  }

  const existingLeagues = await findLeaguesByOwner(userId);
  if (
    targetLeague &&
    (isLeagueActive(targetLeague) ||
      OPEN_SUBSCRIPTION_STATUSES.has(targetLeague.subscriptionStatus))
  ) {
    throw new ApiError(
      400,
      'This League already has a subscription. Use billing management instead.'
    );
  }

  const priceId = resolveLeaguePriceId(planId);
  if (!priceId) throw new ApiError(503, 'Billing is not configured');

  // Audit H1: league docs are created post-checkout, so there's no per-resource
  // doc to carry hasTrialed at this point — gate on whether ANY league this owner
  // already has has consumed a trial (a cancelled prior league still carries it).
  const ownerHasTrialed = existingLeagues.some((l) => l.hasTrialed);

  const stripe = getStripe();
  const request = checkoutRequestOptions(
    'league',
    userId,
    targetLeague ? String(targetLeague._id) : null,
    planId
  );
  const session = await callStripe(() =>
    stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        integration_identifier: request.integrationIdentifier,
        payment_method_collection: 'always',
        success_url: appendQueryParam(
          appendQueryParam(
            appendQueryParam(
              appendQueryParam(env.STRIPE_SUCCESS_URL, 'resourceType', 'league'),
              'leagueId',
              targetLeague?._id
            ),
            'checkout',
            'success'
          ),
          'session_id',
          '{CHECKOUT_SESSION_ID}'
        ),
        cancel_url: appendQueryParam(
          appendQueryParam(
            appendQueryParam(env.STRIPE_CANCEL_URL, 'resourceType', 'league'),
            'leagueId',
            targetLeague?._id
          ),
          'checkout',
          'canceled'
        ),
        customer: targetLeague?.stripeCustomerId || undefined,
        customer_email: targetLeague?.stripeCustomerId
          ? undefined
          : targetLeague?.billingEmail || undefined,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: ownerHasTrialed ? undefined : trialDaysFor(planId, 'monthly'),
          metadata: {
            resourceType: 'league',
            ownerUserId: String(userId),
            leagueId: targetLeague ? String(targetLeague._id) : undefined,
            plan: planId,
            billingInterval: 'monthly',
          },
        },
        metadata: {
          resourceType: 'league',
          ownerUserId: String(userId),
          leagueId: targetLeague ? String(targetLeague._id) : undefined,
          plan: planId,
          billingInterval: 'monthly',
        },
      },
      { idempotencyKey: request.idempotencyKey }
    )
  );

  return { url: assertSafeStripeUrl(session.url) };
}

// Keep old name as alias so existing routes don't break until migrated
async function createCheckoutSession(userId, teamId) {
  return createTeamCheckoutSession(userId, teamId);
}

// ─── Customer portal ──────────────────────────────────────────────────────────

async function createTeamPortalSession(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) throw new ApiError(404, 'Team not found');
  if (!team.stripeCustomerId) throw new ApiError(400, 'No billing customer exists for this team');

  const stripe = getStripe();
  const session = await callStripe(() =>
    stripe.billingPortal.sessions.create({
      configuration: getPortalConfigurationId(),
      customer: team.stripeCustomerId,
      return_url: buildPortalReturnUrl('team', String(team._id)),
    })
  );
  return { url: assertSafeStripeUrl(session.url) };
}

async function createLeaguePortalSession(userId, leagueId) {
  const league = await findLeagueByIdAndOwner(leagueId, userId);
  if (!league) throw new ApiError(404, 'League not found');
  if (!league.stripeCustomerId) {
    throw new ApiError(400, 'No billing customer exists for this league');
  }

  const stripe = getStripe();
  const session = await callStripe(() =>
    stripe.billingPortal.sessions.create({
      configuration: getPortalConfigurationId(),
      customer: league.stripeCustomerId,
      return_url: buildPortalReturnUrl('league', String(league._id)),
    })
  );
  return { url: assertSafeStripeUrl(session.url) };
}

async function changeLeaguePlan(userId, leagueId, targetPlanId) {
  if (!['league', 'league_plus'].includes(targetPlanId)) {
    throw new ApiError(400, 'Invalid League plan');
  }
  const league = await findLeagueByIdAndOwner(leagueId, userId);
  if (!league) throw new ApiError(404, 'League not found');
  if (!isStripeManaged(league) || !league.stripeSubscriptionId || !league.stripeCustomerId) {
    throw new ApiError(400, 'This League is not managed by Stripe');
  }
  if (!ACTIVE_STATUSES.has(league.subscriptionStatus)) {
    throw new ApiError(400, 'The League subscription must be active before changing plans');
  }
  if (league.plan === targetPlanId && !league.scheduledPlan) {
    throw new ApiError(400, 'This League is already on that plan');
  }

  const stripe = getStripe();
  const subscription = await callStripe(() =>
    stripe.subscriptions.retrieve(league.stripeSubscriptionId)
  );
  const item = subscription.items?.data?.[0];
  if (!item?.id || subscription.items.data.length !== 1) {
    throw new ApiError(500, 'League subscription has an unsupported item configuration');
  }
  if (league.plan === targetPlanId && league.scheduledPlan) {
    const scheduleId =
      typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule?.id;
    if (!scheduleId) {
      throw new ApiError(500, 'The scheduled League change could not be found in Stripe');
    }
    await callStripe(() => stripe.subscriptionSchedules.release(scheduleId));
    league.scheduledPlan = null;
    league.scheduledPlanAt = null;
    await saveLeague(league);
    return { change: 'downgrade_canceled', scheduled: false };
  }
  const targetPriceId = resolveLeaguePriceId(targetPlanId);
  if (!targetPriceId) throw new ApiError(503, 'Billing is not configured');

  if (targetPlanId === 'league_plus') {
    const returnUrl = buildPortalReturnUrl('league', String(league._id));
    const portal = await callStripe(() =>
      stripe.billingPortal.sessions.create({
        configuration: getPortalConfigurationId(),
        customer: league.stripeCustomerId,
        return_url: returnUrl,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: subscription.id,
            items: [{ id: item.id, price: targetPriceId, quantity: 1 }],
          },
          after_completion: {
            type: 'redirect',
            redirect: { return_url: returnUrl },
          },
        },
      })
    );
    return { url: assertSafeStripeUrl(portal.url), change: 'upgrade' };
  }

  const activeTeams = (await listLeagueTeams(league._id)).filter(
    (team) => team.status !== 'archived'
  ).length;
  if (activeTeams > 10) {
    throw new ApiError(400, 'Archive teams until this League has 10 or fewer before downgrading');
  }
  if (subscription.schedule) {
    throw new ApiError(400, 'This subscription already has a scheduled change');
  }

  const schedule = await callStripe(() =>
    stripe.subscriptionSchedules.create({ from_subscription: subscription.id })
  );
  const currentPhase = schedule.phases?.[0];
  if (!currentPhase?.start_date || !currentPhase?.end_date) {
    throw new ApiError(500, 'Stripe did not return the current billing phase');
  }
  await callStripe(() =>
    stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
          items: currentPhase.items.map((phaseItem) => ({
            price: typeof phaseItem.price === 'string' ? phaseItem.price : phaseItem.price?.id,
            quantity: phaseItem.quantity || 1,
          })),
          proration_behavior: 'none',
        },
        {
          start_date: currentPhase.end_date,
          duration: { interval: 'month', interval_count: 1 },
          items: [{ price: targetPriceId, quantity: 1 }],
          proration_behavior: 'none',
        },
      ],
    })
  );

  league.scheduledPlan = targetPlanId;
  league.scheduledPlanAt = new Date(currentPhase.end_date * 1000);
  await saveLeague(league);
  return {
    change: 'downgrade',
    scheduled: true,
    effectiveAt: league.scheduledPlanAt,
  };
}

// Keep old name as alias
async function createCustomerPortalSession(userId, teamId) {
  return createTeamPortalSession(userId, teamId);
}

async function getCheckoutStatus(userId, sessionId) {
  const stripe = getStripe();
  const session = await callStripe(() => stripe.checkout.sessions.retrieve(sessionId));
  if (String(session.metadata?.ownerUserId || '') !== String(userId)) {
    throw new ApiError(404, 'Checkout session not found');
  }

  const resourceType = session.metadata?.resourceType;
  let resource = null;
  if (resourceType === 'team' && session.metadata?.teamId) {
    const team = await findTeamByIdAndOwner(session.metadata.teamId, userId);
    if (team) {
      resource = { id: String(team._id), name: team.name, billing: getTeamBillingSummary(team) };
    }
  } else if (resourceType === 'league') {
    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
    if (customerId) {
      const league = await League.findOne({ stripeCustomerId: customerId, ownerUserId: userId });
      if (league) {
        resource = {
          id: String(league._id),
          name: league.name,
          billing: getLeagueBillingSummary(league),
        };
      }
    }
  }

  return {
    resourceType: resourceType || null,
    checkoutStatus: session.status || null,
    paymentStatus: session.payment_status || null,
    resource,
  };
}

// ─── Apply subscription state ─────────────────────────────────────────────────

// Derive { planId, interval } from the subscription's real price id (T-16) — the
// authoritative source, not client-supplied metadata. Unknown and wrong-scope
// prices fail closed rather than granting access to an unconfigured product.
function derivePlanFromSubscription(subscription, allowedPlanIds, { required = true } = {}) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const derived = planForPriceId(priceId);
  if (!derived || !allowedPlanIds.includes(derived.planId)) {
    logger.error(
      { subscriptionId: subscription.id, priceId, allowedPlanIds },
      'Stripe subscription used an unknown or wrong-scope price'
    );
    if (required) throw new ApiError(500, 'Stripe subscription price is not configured');
    return null;
  }
  return {
    planId: derived.planId,
    interval: derived.interval,
  };
}

function subscriptionCurrentPeriodEnd(subscription) {
  // Dahlia exposes billing periods on Subscription Items. Keep the old field as
  // a fallback for events created under an older Stripe API version.
  return subscription.items?.data?.[0]?.current_period_end || subscription.current_period_end;
}

function derivePlanFromInvoice(invoice, doc, allowedPlanIds) {
  const line = invoice.lines?.data?.[0];
  const priceId = line?.pricing?.price_details?.price || line?.price?.id || doc.stripePriceId;
  const derived = planForPriceId(priceId);
  if (!derived || !allowedPlanIds.includes(derived.planId)) {
    logger.error(
      { invoiceId: invoice.id, priceId, allowedPlanIds },
      'Stripe invoice used an unknown or wrong-scope price'
    );
    throw new ApiError(500, 'Stripe invoice price is not configured');
  }
  return { ...derived, priceId };
}

function applyTeamSubscriptionState(team, subscription) {
  const status = normalizeSubscriptionStatus(subscription.status);
  const derived = derivePlanFromSubscription(subscription, ['team_extra'], {
    required: ACTIVE_STATUSES.has(status),
  });
  // The paid plan represents an additional writable-team slot. Features remain
  // the same as Starter; only active/trialing subscription state makes this
  // capacityType:'paid' team writable.
  team.plan = ACTIVE_STATUSES.has(status) ? derived.planId : 'starter';
  team.subscriptionStatus = status;
  team.stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id || team.stripeCustomerId || null;
  team.stripeSubscriptionId = subscription.id || null;
  team.stripePriceId = subscription.items?.data?.[0]?.price?.id || team.stripePriceId || null;
  team.billingInterval = derived?.interval || team.billingInterval || null;
  const currentPeriodEnd = subscriptionCurrentPeriodEnd(subscription);
  team.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
  team.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  team.trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  // Audit H1: latch once a trial has ever been granted (sticky — never cleared).
  if (status === 'trialing' || subscription.trial_end) team.hasTrialed = true;
}

function applyLeagueSubscriptionState(league, subscription) {
  const status = normalizeSubscriptionStatus(subscription.status);
  const derived = derivePlanFromSubscription(subscription, ['league', 'league_plus'], {
    required: ACTIVE_STATUSES.has(status),
  });
  league.plan = ACTIVE_STATUSES.has(status) ? derived.planId : 'starter';
  league.subscriptionStatus = status;
  league.stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id || league.stripeCustomerId || null;
  league.stripeSubscriptionId = subscription.id || null;
  league.stripePriceId = subscription.items?.data?.[0]?.price?.id || league.stripePriceId || null;
  league.billingInterval = derived?.interval || league.billingInterval || null;
  const currentPeriodEnd = subscriptionCurrentPeriodEnd(subscription);
  league.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
  league.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  league.trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  if (ACTIVE_STATUSES.has(status) && league.scheduledPlan === derived?.planId) {
    league.scheduledPlan = null;
    league.scheduledPlanAt = null;
  }
  // Audit H1: latch once a trial has ever been granted (sticky — never cleared).
  if (status === 'trialing' || subscription.trial_end) league.hasTrialed = true;
}

// Comp/manual grants are owned outside Stripe (T-10/T-16): a webhook must never
// mutate them, so a stray Stripe event can't reset a comp grant.
function isStripeManaged(doc) {
  return !doc.billingSource || doc.billingSource === 'stripe';
}

// ─── Webhook handlers: teams ──────────────────────────────────────────────────

// Audit H3: run a claimed handler's apply step, releasing the claim if it throws
// so Stripe's retry can re-apply. `release` is a thunk (releaseTeamWebhookEvent /
// releaseLeagueWebhookEvent bound to this resource + event id).
async function applyClaimedOrRelease(release, applyFn) {
  try {
    await applyFn();
  } catch (err) {
    // Best-effort release; if it also fails, the original error still wins.
    await Promise.resolve()
      .then(release)
      .catch(() => {});
    throw err;
  }
}

async function markTeamFromCheckoutSession(session, eventId) {
  const teamId = session.metadata?.teamId;
  if (!teamId) return;

  // OPT-020: atomic claim — null means duplicate event or missing team.
  const team = await claimTeamWebhookEvent(teamId, eventId);
  if (!team) return;
  // Audit M1: don't let a checkout event convert a comp/manual grant into a
  // Stripe-managed doc (every other handler already guards this).
  if (!isStripeManaged(team)) return;

  await applyClaimedOrRelease(
    () => releaseTeamWebhookEvent(teamId, eventId),
    async () => {
      team.stripeCustomerId =
        typeof session.customer === 'string' ? session.customer : team.stripeCustomerId || null;
      team.billingEmail = session.customer_details?.email || team.billingEmail || null;
      team.billingSource = 'stripe'; // provisioned via Stripe (T-16)
      await saveTeam(team);
      await syncOwnerPlan(team.ownerUserId);
    }
  );
}

async function updateTeamFromSubscription(subscription, eventId) {
  const teamId = subscription.metadata?.teamId;
  if (!teamId) return;

  const team = await claimTeamWebhookEvent(teamId, eventId);
  if (!team) return;
  if (!isStripeManaged(team)) return; // comp/manual grant — immune to Stripe events

  await applyClaimedOrRelease(
    () => releaseTeamWebhookEvent(teamId, eventId),
    async () => {
      if (
        team.subscriptionStatus === 'canceled' &&
        team.stripeSubscriptionId === subscription.id &&
        subscription.status !== 'canceled'
      ) {
        return;
      }
      applyTeamSubscriptionState(team, subscription);
      await saveTeam(team);
      await syncOwnerPlan(team.ownerUserId);
    }
  );
}

async function markTeamInvoiceFailure(invoice, eventId) {
  const teamId =
    invoice.parent?.subscription_details?.metadata?.teamId ||
    invoice.lines?.data?.[0]?.metadata?.teamId;
  if (!teamId) return;

  const team = await claimTeamWebhookEvent(teamId, eventId);
  if (!team) return;
  if (!isStripeManaged(team)) return;
  if (TERMINAL_STATUSES.has(team.subscriptionStatus)) return; // Audit H4

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (
    periodEnd &&
    team.subscriptionStatus === 'active' &&
    team.currentPeriodEnd &&
    periodEnd * 1000 <= new Date(team.currentPeriodEnd).getTime()
  ) {
    return;
  }

  await applyClaimedOrRelease(
    () => releaseTeamWebhookEvent(teamId, eventId),
    async () => {
      team.subscriptionStatus = 'past_due';
      await saveTeam(team);
      await syncOwnerPlan(team.ownerUserId);
    }
  );
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
  if (TERMINAL_STATUSES.has(team.subscriptionStatus)) return;

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (
    periodEnd &&
    team.currentPeriodEnd &&
    periodEnd * 1000 < new Date(team.currentPeriodEnd).getTime()
  ) {
    return;
  }

  await applyClaimedOrRelease(
    () => releaseTeamWebhookEvent(teamId, eventId),
    async () => {
      const paidPlan = derivePlanFromInvoice(invoice, team, ['team_extra']);
      team.plan = paidPlan.planId;
      team.billingInterval = paidPlan.interval;
      team.stripePriceId = paidPlan.priceId;
      team.subscriptionStatus = 'active';
      if (periodEnd) team.currentPeriodEnd = new Date(periodEnd * 1000);
      await saveTeam(team);
      await syncOwnerPlan(team.ownerUserId);
    }
  );
}

// ─── Webhook handlers: leagues ────────────────────────────────────────────────

async function ensureLeagueFromStripe({
  ownerUserId,
  customerId,
  billingInterval = 'monthly',
  leagueId = null,
}) {
  if (!ownerUserId || !customerId) return null;
  if (leagueId) {
    const targetedLeague = await League.findOne({ _id: leagueId, ownerUserId });
    if (!targetedLeague) throw new ApiError(404, 'League not found');
    if (
      targetedLeague.stripeCustomerId &&
      String(targetedLeague.stripeCustomerId) !== String(customerId)
    ) {
      throw new ApiError(500, 'League billing customer does not match');
    }
    if (!targetedLeague.stripeCustomerId) {
      return League.findOneAndUpdate(
        { _id: leagueId, ownerUserId },
        { $set: { stripeCustomerId: customerId, billingInterval } },
        { new: true }
      );
    }
    return targetedLeague;
  }
  const placeholderSlug = `league-${String(ownerUserId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    return await League.findOneAndUpdate(
      { stripeCustomerId: customerId },
      {
        $setOnInsert: {
          ownerUserId,
          name: 'My League',
          slug: placeholderSlug,
          plan: 'starter',
          subscriptionStatus: 'inactive',
          billingSource: 'stripe',
          stripeCustomerId: customerId,
          billingInterval,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // A simultaneous webhook may win the unique-customer insert. Re-read the
    // winner so either Stripe delivery order reaches the same resource.
    if (error?.code === 11000) return League.findOne({ stripeCustomerId: customerId });
    throw error;
  }
}

async function createLeagueFromCheckoutSession(session, eventId) {
  const ownerUserId = session.metadata?.ownerUserId;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!ownerUserId || !customerId) return;

  await ensureLeagueFromStripe({
    ownerUserId,
    customerId,
    billingInterval: session.metadata?.billingInterval || 'monthly',
    leagueId: session.metadata?.leagueId || null,
  });

  const league = await claimLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId);
  if (!league || !isStripeManaged(league)) return;
  await applyClaimedOrRelease(
    () => releaseLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId),
    async () => {
      league.billingEmail = session.customer_details?.email || league.billingEmail || null;
      league.billingSource = 'stripe';
      await saveLeague(league);
    }
  );
}

async function updateLeagueFromSubscription(subscription, eventId) {
  const ownerUserId = subscription.metadata?.ownerUserId;
  if (!ownerUserId) return;

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  // Audit M4: without this guard an undefined customerId becomes filter {} and
  // could claim an arbitrary league (defensive — events are signature-verified).
  if (!customerId) return;

  // Stripe does not promise event order. Provision the inactive shell here too,
  // so subscription.created can safely arrive before checkout.session.completed.
  await ensureLeagueFromStripe({
    ownerUserId,
    customerId,
    billingInterval: subscription.metadata?.billingInterval || 'monthly',
    leagueId: subscription.metadata?.leagueId || null,
  });

  const league = await claimLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId);
  if (!league) return;
  if (!isStripeManaged(league)) return; // comp/manual grant — immune to Stripe events

  await applyClaimedOrRelease(
    () => releaseLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId),
    async () => {
      if (
        league.subscriptionStatus === 'canceled' &&
        league.stripeSubscriptionId === subscription.id &&
        subscription.status !== 'canceled'
      ) {
        return;
      }
      applyLeagueSubscriptionState(league, subscription);
      await saveLeague(league);
    }
  );
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

  await ensureLeagueFromStripe({
    ownerUserId:
      invoice.parent?.subscription_details?.metadata?.ownerUserId ||
      invoice.lines?.data?.[0]?.metadata?.ownerUserId,
    customerId,
    billingInterval:
      planForPriceId(
        invoice.lines?.data?.[0]?.pricing?.price_details?.price ||
          invoice.lines?.data?.[0]?.price?.id
      )?.interval || 'monthly',
    leagueId:
      invoice.parent?.subscription_details?.metadata?.leagueId ||
      invoice.lines?.data?.[0]?.metadata?.leagueId ||
      null,
  });

  const league = await claimLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId);
  if (!league) return;
  if (!isStripeManaged(league)) return;
  if (TERMINAL_STATUSES.has(league.subscriptionStatus)) return; // Audit H4

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (
    periodEnd &&
    league.subscriptionStatus === 'active' &&
    league.currentPeriodEnd &&
    periodEnd * 1000 <= new Date(league.currentPeriodEnd).getTime()
  ) {
    return;
  }

  await applyClaimedOrRelease(
    () => releaseLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId),
    async () => {
      league.subscriptionStatus = 'past_due';
      await saveLeague(league);
    }
  );
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

  await ensureLeagueFromStripe({
    ownerUserId:
      invoice.parent?.subscription_details?.metadata?.ownerUserId ||
      invoice.lines?.data?.[0]?.metadata?.ownerUserId,
    customerId,
    billingInterval:
      planForPriceId(
        invoice.lines?.data?.[0]?.pricing?.price_details?.price ||
          invoice.lines?.data?.[0]?.price?.id
      )?.interval || 'monthly',
    leagueId:
      invoice.parent?.subscription_details?.metadata?.leagueId ||
      invoice.lines?.data?.[0]?.metadata?.leagueId ||
      null,
  });

  const league = await claimLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId);
  if (!league) return;
  if (!isStripeManaged(league)) return;
  if (TERMINAL_STATUSES.has(league.subscriptionStatus)) return;

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (
    periodEnd &&
    league.currentPeriodEnd &&
    periodEnd * 1000 < new Date(league.currentPeriodEnd).getTime()
  ) {
    return;
  }

  await applyClaimedOrRelease(
    () => releaseLeagueWebhookEvent({ stripeCustomerId: customerId }, eventId),
    async () => {
      const paidPlan = derivePlanFromInvoice(invoice, league, ['league', 'league_plus']);
      league.plan = paidPlan.planId;
      league.billingInterval = paidPlan.interval;
      league.stripePriceId = paidPlan.priceId;
      league.subscriptionStatus = 'active';
      if (league.scheduledPlan === paidPlan.planId) {
        league.scheduledPlan = null;
        league.scheduledPlanAt = null;
      }
      if (periodEnd) league.currentPeriodEnd = new Date(periodEnd * 1000);
      await saveLeague(league);
    }
  );
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
    case 'checkout.session.async_payment_succeeded':
      if (resourceType === 'league') {
        await createLeagueFromCheckoutSession(obj, event.id);
      } else {
        await markTeamFromCheckoutSession(obj, event.id);
      }
      break;

    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
    case 'invoice.finalization_failed':
      // These events never grant access. Stripe retries/dunning and the
      // subscription-status events remain the authority for entitlements.
      logger.warn(
        { stripeEventId: event.id, stripeEventType: event.type },
        'Stripe billing event needs attention'
      );
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      // Webhook delivery order is not guaranteed. Re-read the subscription so
      // an older event cannot overwrite the state Stripe has now.
      const currentSubscription = await callStripe(() => stripe.subscriptions.retrieve(obj.id));
      const currentResourceType = currentSubscription.metadata?.resourceType;
      if (currentResourceType === 'league') {
        await updateLeagueFromSubscription(currentSubscription, event.id);
      } else {
        await updateTeamFromSubscription(currentSubscription, event.id);
      }
      break;
    }

    case 'customer.subscription.deleted':
      if (resourceType === 'league') {
        await updateLeagueFromSubscription(obj, event.id);
      } else {
        await updateTeamFromSubscription(obj, event.id);
      }
      break;

    case 'invoice.payment_failed':
      if (
        (resourceType ||
          obj.parent?.subscription_details?.metadata?.resourceType ||
          obj.lines?.data?.[0]?.metadata?.resourceType) === 'league'
      ) {
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

async function assertTeamCreationAllowed(userId) {
  const teams = await listTeamsByOwner(userId);
  return { capacityType: teams.length === 0 ? 'free' : 'paid' };
}

async function chooseFreeTeam(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) throw new ApiError(404, 'Team not found');
  if (team.capacityType === 'free') return { team: getTeamBillingSummary(team) };
  if (OPEN_SUBSCRIPTION_STATUSES.has(team.subscriptionStatus)) {
    throw new ApiError(400, 'Cancel this team subscription before making it your free team');
  }

  const updated = await makeOwnedTeamFree(userId, teamId);
  if (!updated) throw new ApiError(404, 'Team not found');
  return { team: getTeamBillingSummary(updated) };
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
  canManageStandaloneTeam,
  assertTeamManagementAllowed,
  isLeagueActive,
  // Billing summaries
  getBillingSummary,
  getTeamBillingSummary,
  getLeagueBillingSummary,
  // Checkout
  createCheckoutSession,
  createTeamCheckoutSession,
  createLeagueCheckoutSession,
  // Portal
  createCustomerPortalSession,
  createTeamPortalSession,
  createLeaguePortalSession,
  changeLeaguePlan,
  getCheckoutStatus,
  // Webhook
  handleWebhookEvent,
  // Guards
  assertTeamCreationAllowed,
  chooseFreeTeam,
  assertFeedPostingAllowed,
};
