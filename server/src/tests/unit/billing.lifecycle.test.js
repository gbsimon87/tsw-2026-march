// Phase 7 / T-27 — subscription-lifecycle scenario coverage.
//
// The four Stripe test-clock scenarios (trial→active, dunning, cancel, reactivate)
// are exercised manually against a live Stripe + CLI webhook forwarding — see
// docs/pricing-overhaul/stripe-test-clock-runbook.md. This file is their
// CI-runnable equivalent: it drives one resource doc through the same webhook
// sequence via the real handleWebhookEvent and asserts the *resolved entitlements*
// (real entitlements.service + plan-catalog, no mocks) after every transition.
//
// The point is the STATE MACHINE, not any single handler: a regression that lets a
// past_due team keep replay, or fails to restore access on reactivation, breaks a
// test here even if every per-handler unit test still passes.

jest.mock('../../modules/teams/teams.repository', () => ({
  Team: { exists: jest.fn() },
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
  listTeamsByOwner: jest.fn(),
  saveTeam: jest.fn(),
  claimTeamWebhookEvent: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  League: { findOne: jest.fn(), create: jest.fn(), exists: jest.fn() },
  LeagueManager: { exists: jest.fn() },
  LeagueTeamMember: { exists: jest.fn() },
  findLeagueById: jest.fn(),
  findLeagueByIdAndOwner: jest.fn(),
  findLeaguesByOwner: jest.fn(),
  saveLeague: jest.fn(),
  claimLeagueWebhookEvent: jest.fn(),
}));

jest.mock('../../modules/auth/auth.repository', () => ({
  updateUserPlan: jest.fn(),
}));

jest.mock('../../services/email.service', () => ({
  sendPaymentFailedEmail: jest.fn(),
  sendTrialEndingEmail: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_123',
    STRIPE_PRICE_ID_TEAM_MONTHLY: 'price_team_monthly',
    STRIPE_PRICE_ID_TEAM_SEASON: 'price_team_season',
    STRIPE_PRICE_ID_LEAGUE_MONTHLY: 'price_league_monthly',
    STRIPE_PRICE_ID_LEAGUE_SEASON: 'price_league_season',
    STRIPE_SUCCESS_URL: 'http://localhost:5173/billing/success',
    STRIPE_CANCEL_URL: 'http://localhost:5173/billing/cancel',
  },
}));

const mockConstructEvent = jest.fn();
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  }))
);

const {
  listTeamsByOwner,
  saveTeam,
  claimTeamWebhookEvent,
} = require('../../modules/teams/teams.repository');
const { sendTrialEndingEmail, sendPaymentFailedEmail } = require('../../services/email.service');
const { handleWebhookEvent } = require('../../modules/billing/billing.service');
// Real resolver + catalog — these are pure and are the contract the app enforces.
const { resolveForTeam } = require('../../modules/billing/entitlements.service');

function buildTeam(overrides = {}) {
  return {
    _id: 'team-1',
    ownerUserId: 'user-1',
    plan: 'starter',
    subscriptionStatus: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    trialEnd: null,
    billingInterval: null,
    billingSource: 'stripe',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingEmail: 'owner@example.com',
    lastWebhookEventId: null,
    processedWebhookEventIds: [],
    ...overrides,
  };
}

// Build a customer.subscription.* event for team-1 with the given status/flags.
function subEvent(
  id,
  {
    status,
    type = 'customer.subscription.updated',
    cancelAtPeriodEnd = false,
    trialEnd = null,
  } = {}
) {
  return {
    id,
    type,
    data: {
      object: {
        id: 'sub_team_1',
        status,
        customer: 'cus_team_1',
        items: { data: [{ price: { id: 'price_team_monthly' } }] },
        current_period_end: 1770000000,
        cancel_at_period_end: cancelAtPeriodEnd,
        trial_end: trialEnd,
        metadata: { resourceType: 'team', teamId: 'team-1', billingInterval: 'monthly' },
      },
    },
  };
}

function invoiceEvent(id, type) {
  return {
    id,
    type,
    data: {
      object: {
        id: `in_${id}`,
        metadata: { resourceType: 'team' },
        parent: { subscription_details: { metadata: { resourceType: 'team', teamId: 'team-1' } } },
        lines: { data: [{ period: { end: 1780000000 } }] },
      },
    },
  };
}

// Drive one webhook through the handler against the shared team doc.
async function deliver(team, event) {
  jest.clearAllMocks();
  claimTeamWebhookEvent.mockResolvedValue(team); // claim succeeds (not a replay)
  listTeamsByOwner.mockResolvedValue([team]);
  mockConstructEvent.mockReturnValue(event);
  await handleWebhookEvent('sig', Buffer.from('payload'));
}

describe('subscription lifecycle (T-27 scenarios, resolver-asserted)', () => {
  test('trial → active: entitlements unlock on trial start and persist through renewal', async () => {
    const team = buildTeam();

    // Baseline: a brand-new starter team can track, but replay is locked.
    expect(resolveForTeam(team).active).toBe(false);
    expect(resolveForTeam(team).entitlements.canTrackStats).toBe(true);
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(false);

    // Checkout completes with a trial → subscription starts trialing.
    await deliver(team, subEvent('evt_trial_start', { status: 'trialing', trialEnd: 1770000000 }));
    expect(team.plan).toBe('team_pro');
    expect(resolveForTeam(team).active).toBe(true); // trialing counts as active
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(true);

    // trial_will_end fires the reminder email (no state change).
    await deliver(team, {
      id: 'evt_trial_ending',
      type: 'customer.subscription.trial_will_end',
      data: {
        object: { customer: 'cus_team_1', metadata: { resourceType: 'team', teamId: 'team-1' } },
      },
    });
    expect(sendTrialEndingEmail).toHaveBeenCalledTimes(1);

    // First real invoice paid after the trial → active + period extended.
    await deliver(team, invoiceEvent('evt_first_invoice', 'invoice.paid'));
    expect(team.subscriptionStatus).toBe('active');
    expect(team.currentPeriodEnd).toEqual(new Date(1780000000 * 1000));
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(true);
  });

  test('dunning: a failed renewal locks premium but keeps the plan/data; recovery re-unlocks', async () => {
    const team = buildTeam({
      plan: 'team_pro',
      subscriptionStatus: 'active',
      billingSource: 'stripe',
    });
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(true);

    // Renewal payment fails → past_due (grace) + dunning email.
    await deliver(team, invoiceEvent('evt_failed', 'invoice.payment_failed'));
    expect(team.subscriptionStatus).toBe('past_due');
    expect(sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
    // The doc still carries team_pro, but the resolver locks premium while past_due…
    expect(team.plan).toBe('team_pro');
    expect(resolveForTeam(team).active).toBe(false);
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(false);
    // …and data-tracking stays free the whole time.
    expect(resolveForTeam(team).entitlements.canTrackStats).toBe(true);

    // The customer pays → back to active, premium restored.
    await deliver(team, invoiceEvent('evt_recovered', 'invoice.paid'));
    expect(team.subscriptionStatus).toBe('active');
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(true);
  });

  test('cancel: access holds until the period ends, then downgrades to starter', async () => {
    const team = buildTeam({ plan: 'team_pro', subscriptionStatus: 'active' });

    // Cancel-at-period-end: still active, so access holds.
    await deliver(
      team,
      subEvent('evt_cancel_scheduled', { status: 'active', cancelAtPeriodEnd: true })
    );
    expect(team.cancelAtPeriodEnd).toBe(true);
    expect(resolveForTeam(team).active).toBe(true);
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(true);

    // Period ends → subscription deleted → plan drops to starter, premium locks.
    await deliver(
      team,
      subEvent('evt_deleted', { status: 'canceled', type: 'customer.subscription.deleted' })
    );
    expect(team.plan).toBe('starter');
    expect(resolveForTeam(team).active).toBe(false);
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(false);
    expect(resolveForTeam(team).entitlements.canTrackStats).toBe(true); // still free
  });

  test('Audit H4: a late invoice.payment_failed cannot resurrect a canceled team to past_due', async () => {
    const team = buildTeam({ plan: 'team_pro', subscriptionStatus: 'active' });

    // Subscription is deleted (e.g. retries exhausted) → team drops to starter/canceled.
    await deliver(
      team,
      subEvent('evt_deleted', { status: 'canceled', type: 'customer.subscription.deleted' })
    );
    expect(team.plan).toBe('starter');
    expect(team.subscriptionStatus).toBe('canceled');

    // Stripe doesn't guarantee delivery order — the final failed-retry invoice
    // event can arrive after the deletion event. It must not overwrite the
    // already-terminal 'canceled' status back to 'past_due'.
    await deliver(team, invoiceEvent('evt_late_failure', 'invoice.payment_failed'));
    expect(team.subscriptionStatus).toBe('canceled');
    expect(saveTeam).not.toHaveBeenCalled();
    expect(sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  test('reactivate: re-subscribing after a cancel restores the prior plan', async () => {
    const team = buildTeam({ plan: 'starter', subscriptionStatus: 'canceled' });
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(false);

    // Owner re-subscribes → subscription active again.
    await deliver(team, subEvent('evt_reactivate', { status: 'active' }));
    expect(team.plan).toBe('team_pro');
    expect(team.subscriptionStatus).toBe('active');
    expect(resolveForTeam(team).active).toBe(true);
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(true);
  });

  test('comp grant is immune to the lifecycle: a stray cancel event cannot lock it', async () => {
    const team = buildTeam({
      plan: 'team_pro',
      subscriptionStatus: 'active',
      billingSource: 'comp',
    });
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(true);

    // A cancel event that would downgrade a Stripe team is skipped for a comp doc.
    await deliver(team, subEvent('evt_stray_cancel', { status: 'canceled' }));
    expect(saveTeam).not.toHaveBeenCalled();
    expect(team.plan).toBe('team_pro');
    expect(resolveForTeam(team).active).toBe(true); // comp is always active
    expect(resolveForTeam(team).entitlements.canViewReplay).toBe(true);
  });
});
