const Stripe = require('stripe');
const { ApiError } = require('../../utils/apiError');
const {
  findTeamByIdAndOwner,
  findTeamById,
  listTeamsByOwner,
  saveTeam,
} = require('../teams/teams.repository');
const { updateUserPlan } = require('../auth/auth.repository');
const { env } = require('../../config/env');

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

let stripeClient = null;

function getStripe() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new ApiError(503, 'Billing is not configured');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

function normalizeSubscriptionStatus(value) {
  if (!value) {
    return 'inactive';
  }

  if (['trialing', 'active', 'past_due', 'canceled'].includes(value)) {
    return value;
  }

  return 'inactive';
}

function getTeamEntitlements(team) {
  const billing = getBillingSummary(team);
  const hasProAccess = billing.plan === 'pro' && ACTIVE_STATUSES.has(billing.subscriptionStatus);

  return {
    canViewReplay: hasProAccess,
    canViewShotMaps: hasProAccess,
  };
}

function getBillingSummary(team) {
  return {
    plan: team.plan || 'free',
    subscriptionStatus: normalizeSubscriptionStatus(team.subscriptionStatus),
    cancelAtPeriodEnd: Boolean(team.cancelAtPeriodEnd),
    currentPeriodEnd: team.currentPeriodEnd ?? null,
  };
}

async function syncOwnerPlan(ownerUserId) {
  const teams = await listTeamsByOwner(ownerUserId);
  const hasProTeam = teams.some((team) => {
    const billing = getBillingSummary(team);
    return billing.plan === 'pro' && ACTIVE_STATUSES.has(billing.subscriptionStatus);
  });

  await updateUserPlan(ownerUserId, hasProTeam ? 'pro' : 'free');
}

async function getTeamBillingForOwner(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  return {
    billing: getBillingSummary(team),
    entitlements: getTeamEntitlements(team),
  };
}

async function createCheckoutSession(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const billing = getBillingSummary(team);
  if (billing.plan === 'pro' && ACTIVE_STATUSES.has(billing.subscriptionStatus)) {
    throw new ApiError(400, 'Team is already on Team Pro');
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    success_url: env.STRIPE_SUCCESS_URL,
    cancel_url: env.STRIPE_CANCEL_URL,
    customer_email: team.billingEmail || undefined,
    line_items: [
      {
        price: env.STRIPE_PRICE_ID_PRO_MONTHLY,
        quantity: 1,
      },
    ],
    metadata: {
      teamId: String(team._id),
      ownerUserId: String(userId),
      plan: 'pro',
    },
    subscription_data: {
      metadata: {
        teamId: String(team._id),
        ownerUserId: String(userId),
        plan: 'pro',
      },
    },
  });

  return {
    url: session.url,
  };
}

async function createCustomerPortalSession(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  if (!team.stripeCustomerId) {
    throw new ApiError(400, 'No billing customer exists for this team');
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: team.stripeCustomerId,
    return_url: env.STRIPE_SUCCESS_URL,
  });

  return {
    url: session.url,
  };
}

function applySubscriptionState(team, subscription) {
  const status = normalizeSubscriptionStatus(subscription.status);
  team.plan = ACTIVE_STATUSES.has(status) ? 'pro' : 'free';
  team.subscriptionStatus = status;
  team.stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id || team.stripeCustomerId || null;
  team.stripeSubscriptionId = subscription.id || null;
  team.stripePriceId = subscription.items?.data?.[0]?.price?.id || team.stripePriceId || null;
  team.currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  team.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
}

async function markTeamFromCheckoutSession(session) {
  const teamId = session.metadata?.teamId;
  if (!teamId) {
    return;
  }

  const team = await findTeamById(teamId);
  if (!team) {
    return;
  }

  team.stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : team.stripeCustomerId || null;
  team.billingEmail = session.customer_details?.email || team.billingEmail || null;
  await saveTeam(team);
  await syncOwnerPlan(team.ownerUserId);
}

async function updateTeamFromSubscription(subscription) {
  const teamId = subscription.metadata?.teamId;
  if (!teamId) {
    return;
  }

  const team = await findTeamById(teamId);
  if (!team) {
    return;
  }

  applySubscriptionState(team, subscription);
  await saveTeam(team);
  await syncOwnerPlan(team.ownerUserId);
}

async function markInvoiceFailure(invoice) {
  const teamId =
    invoice.parent?.subscription_details?.metadata?.teamId ||
    invoice.lines?.data?.[0]?.metadata?.teamId;
  if (!teamId) {
    return;
  }

  const team = await findTeamById(teamId);
  if (!team) {
    return;
  }

  team.subscriptionStatus = 'past_due';
  await saveTeam(team);
  await syncOwnerPlan(team.ownerUserId);
}

async function handleWebhookEvent(signature, rawBody) {
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await markTeamFromCheckoutSession(event.data.object);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await updateTeamFromSubscription(event.data.object);
      break;
    case 'invoice.payment_failed':
      await markInvoiceFailure(event.data.object);
      break;
    case 'invoice.paid':
    default:
      break;
  }

  return { received: true };
}

module.exports = {
  getBillingSummary,
  getTeamEntitlements,
  getTeamBillingForOwner,
  createCheckoutSession,
  createCustomerPortalSession,
  handleWebhookEvent,
};
