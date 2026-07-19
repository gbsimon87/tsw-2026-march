jest.mock('../../modules/teams/teams.repository', () => ({
  Team: { exists: jest.fn() },
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
  listTeamsByOwner: jest.fn(),
  saveTeam: jest.fn(),
  claimTeamWebhookEvent: jest.fn(),
  releaseTeamWebhookEvent: jest.fn(),
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
  releaseLeagueWebhookEvent: jest.fn(),
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
const mockCheckoutCreate = jest.fn();
const mockBillingPortalCreate = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockBillingPortalCreate } },
  }))
);

const {
  Team,
  findTeamByIdAndOwner,
  listTeamsByOwner,
  saveTeam,
  claimTeamWebhookEvent,
  releaseTeamWebhookEvent,
} = require('../../modules/teams/teams.repository');
const {
  League,
  LeagueManager,
  LeagueTeamMember,
  findLeaguesByOwner,
  claimLeagueWebhookEvent,
} = require('../../modules/leagues/leagues.repository');
const { updateUserPlan } = require('../../modules/auth/auth.repository');
const { sendPaymentFailedEmail, sendTrialEndingEmail } = require('../../services/email.service');
const {
  isTeamActive,
  isLeagueActive,
  getBillingSummary,
  createCheckoutSession,
  createTeamCheckoutSession,
  createLeagueCheckoutSession,
  createCustomerPortalSession,
  handleWebhookEvent,
  assertFeedPostingAllowed,
} = require('../../modules/billing/billing.service');

function buildTeam(overrides = {}) {
  return {
    _id: 'team-1',
    ownerUserId: 'user-1',
    plan: 'free',
    subscriptionStatus: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    trialEnd: null,
    billingInterval: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingEmail: null,
    lastWebhookEventId: null,
    processedWebhookEventIds: [],
    ...overrides,
  };
}

function buildLeague(overrides = {}) {
  return {
    _id: 'league-1',
    ownerUserId: 'user-1',
    plan: 'free',
    subscriptionStatus: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    trialEnd: null,
    billingInterval: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingEmail: null,
    lastWebhookEventId: null,
    processedWebhookEventIds: [],
    ...overrides,
  };
}

// ─── isTeamActive ─────────────────────────────────────────────────────────────

describe('isTeamActive', () => {
  test('7.1 returns true for plan: team, status: active', () => {
    expect(isTeamActive(buildTeam({ plan: 'team', subscriptionStatus: 'active' }))).toBe(true);
  });

  test('7.2 returns true for plan: pro, status: active (legacy)', () => {
    expect(isTeamActive(buildTeam({ plan: 'pro', subscriptionStatus: 'active' }))).toBe(true);
  });

  test('7.3 returns true for plan: team, status: trialing', () => {
    expect(isTeamActive(buildTeam({ plan: 'team', subscriptionStatus: 'trialing' }))).toBe(true);
  });

  test('7.4 returns false for plan: free', () => {
    expect(isTeamActive(buildTeam({ plan: 'free', subscriptionStatus: 'active' }))).toBe(false);
  });

  test('7.5 returns false for plan: team, status: canceled', () => {
    expect(isTeamActive(buildTeam({ plan: 'team', subscriptionStatus: 'canceled' }))).toBe(false);
  });

  test('7.6 returns false for plan: team, status: past_due', () => {
    expect(isTeamActive(buildTeam({ plan: 'team', subscriptionStatus: 'past_due' }))).toBe(false);
  });

  test('7.7 returns false for null plan', () => {
    expect(isTeamActive(buildTeam({ plan: null, subscriptionStatus: 'active' }))).toBe(false);
  });

  test('7.7 returns false for undefined plan', () => {
    const team = buildTeam();
    delete team.plan;
    expect(isTeamActive(team)).toBe(false);
  });
});

// ─── isLeagueActive ───────────────────────────────────────────────────────────

describe('isLeagueActive', () => {
  test('7.8 returns true for plan: league, status: active', () => {
    expect(isLeagueActive(buildLeague({ plan: 'league', subscriptionStatus: 'active' }))).toBe(
      true
    );
  });

  test('7.9 returns true for plan: pro, status: active (We-ball Saturday)', () => {
    expect(isLeagueActive(buildLeague({ plan: 'pro', subscriptionStatus: 'active' }))).toBe(true);
  });

  test('7.10 returns true for plan: league, status: trialing', () => {
    expect(isLeagueActive(buildLeague({ plan: 'league', subscriptionStatus: 'trialing' }))).toBe(
      true
    );
  });

  test('7.11 returns false for plan: free', () => {
    expect(isLeagueActive(buildLeague({ plan: 'free', subscriptionStatus: 'active' }))).toBe(false);
  });

  test('7.12 returns false for plan: pro, status: inactive', () => {
    expect(isLeagueActive(buildLeague({ plan: 'pro', subscriptionStatus: 'inactive' }))).toBe(
      false
    );
  });
});

// Audit M11: the legacy getTeam/LeagueEntitlements plan→boolean maps were deleted
// (dead + contradicted T-12). Entitlement resolution is covered directly against
// the resolver in entitlements.service.test.js; isTeamActive/isLeagueActive above
// still guard the paid-active predicate those consumers use.

// ─── getBillingSummary (backward-compat alias) ────────────────────────────────

describe('getBillingSummary', () => {
  test('returns correct shape for active team', () => {
    const team = buildTeam({ plan: 'team', subscriptionStatus: 'active' });
    const summary = getBillingSummary(team);
    expect(summary.plan).toBe('team');
    expect(summary.subscriptionStatus).toBe('active');
    expect(summary.cancelAtPeriodEnd).toBe(false);
    expect(summary.currentPeriodEnd).toBeNull();
  });
});

// ─── Webhook: team subscription ───────────────────────────────────────────────

describe('handleWebhookEvent — team subscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listTeamsByOwner.mockResolvedValue([]);
  });

  test('applies subscription updates once and ignores replayed webhook events', async () => {
    const team = buildTeam();
    // OPT-020: idempotency is enforced by the atomic claim — it returns the
    // team the first time and null on replay (event id already in the set).
    claimTeamWebhookEvent.mockResolvedValueOnce(team).mockResolvedValueOnce(null);
    listTeamsByOwner.mockResolvedValue([team]);

    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          customer: 'cus_123',
          items: { data: [{ price: { id: 'price_team_monthly' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { resourceType: 'team', teamId: 'team-1', billingInterval: 'monthly' },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(claimTeamWebhookEvent).toHaveBeenCalledWith('team-1', 'evt_sub_updated');
    expect(team.plan).toBe('team_pro'); // canonical (T-16), derived from price id
    expect(team.subscriptionStatus).toBe('active');
    expect(saveTeam).toHaveBeenCalledTimes(1);
    expect(updateUserPlan).toHaveBeenCalledWith('user-1', 'team_pro'); // canonical (T-17)

    saveTeam.mockClear();
    updateUserPlan.mockClear();

    await handleWebhookEvent('sig', Buffer.from('payload'));

    // Second delivery: claim returns null (already processed) → no re-apply.
    expect(saveTeam).not.toHaveBeenCalled();
    expect(updateUserPlan).not.toHaveBeenCalled();
  });

  test('marks invoice failures and keeps replay from re-saving', async () => {
    const team = buildTeam({ plan: 'team', subscriptionStatus: 'active' });
    claimTeamWebhookEvent.mockResolvedValueOnce(team).mockResolvedValueOnce(null);
    listTeamsByOwner.mockResolvedValue([team]);

    mockConstructEvent.mockReturnValue({
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_123',
          metadata: { resourceType: 'team' },
          parent: {
            subscription_details: {
              metadata: { resourceType: 'team', teamId: 'team-1' },
            },
          },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(team.subscriptionStatus).toBe('past_due');

    saveTeam.mockClear();
    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(saveTeam).not.toHaveBeenCalled();
  });

  test('delegates idempotency to the atomic claim (bounding now enforced in the DB)', async () => {
    // OPT-020: the processed-id list is appended + bounded atomically in the DB
    // via $push/$slice inside claimWebhookEvent — the service no longer mutates
    // an in-memory array. This test asserts the service delegates the claim
    // (with the correct team id + event id); the $slice bounding itself is
    // covered by webhookIdempotency.test.js.
    const team = buildTeam();
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);

    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_new',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          customer: 'cus_123',
          items: { data: [{ price: { id: 'price_team_monthly' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { resourceType: 'team', teamId: 'team-1' },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(claimTeamWebhookEvent).toHaveBeenCalledWith('team-1', 'evt_sub_new');
    expect(saveTeam).toHaveBeenCalledTimes(1);
  });
});

// ─── Webhook: T-16 (canonical plan, comp-skip, invoice.paid) ──────────────────

describe('handleWebhookEvent — T-16 plan derivation, comp-safety, renewal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listTeamsByOwner.mockResolvedValue([]);
  });

  function subEvent(overrides = {}) {
    return {
      id: 'evt_sub',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          customer: 'cus_123',
          items: { data: [{ price: { id: 'price_team_season' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { resourceType: 'team', teamId: 'team-1' },
          ...overrides,
        },
      },
    };
  }

  test('derives the canonical team_pro plan + interval from the price id', async () => {
    const team = buildTeam();
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(subEvent());

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.plan).toBe('team_pro');
    expect(team.billingInterval).toBe('season'); // from price_team_season, not metadata
    expect(saveTeam).toHaveBeenCalledTimes(1);
  });

  test('latches hasTrialed when a trialing subscription is observed (audit H1)', async () => {
    const team = buildTeam({ hasTrialed: false });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(subEvent({ status: 'trialing', trial_end: 1770000000 }));

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.hasTrialed).toBe(true);
  });

  test('sets an inactive team back to the starter plan', async () => {
    const team = buildTeam({ plan: 'team_pro', subscriptionStatus: 'active' });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(subEvent({ status: 'canceled' }));

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.plan).toBe('starter');
    expect(team.subscriptionStatus).toBe('canceled');
  });

  test('skips a non-stripe (comp) team so a stray Stripe event cannot clobber the grant', async () => {
    const team = buildTeam({
      plan: 'team_pro',
      subscriptionStatus: 'active',
      billingSource: 'comp',
    });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(subEvent({ status: 'canceled' }));

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.plan).toBe('team_pro'); // unchanged
    expect(team.subscriptionStatus).toBe('active'); // unchanged
    expect(saveTeam).not.toHaveBeenCalled();
  });

  test('invoice.paid marks the team active and extends the current period', async () => {
    const team = buildTeam({ plan: 'team_pro', subscriptionStatus: 'past_due' });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_123',
          metadata: { resourceType: 'team' },
          parent: {
            subscription_details: { metadata: { resourceType: 'team', teamId: 'team-1' } },
          },
          lines: { data: [{ period: { end: 1780000000 } }] },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.subscriptionStatus).toBe('active');
    expect(team.currentPeriodEnd).toEqual(new Date(1780000000 * 1000));
    expect(saveTeam).toHaveBeenCalledTimes(1);
  });

  test('derives the canonical league plan from the price id', async () => {
    const league = buildLeague();
    claimLeagueWebhookEvent.mockResolvedValue(league);
    mockConstructEvent.mockReturnValue({
      id: 'evt_league_sub',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_l',
          status: 'active',
          customer: 'cus_l',
          items: { data: [{ price: { id: 'price_league_monthly' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { resourceType: 'league', ownerUserId: 'user-1' },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(league.plan).toBe('league');
    expect(league.billingInterval).toBe('monthly');
  });
});

// ─── Webhook: T-18 billing emails ─────────────────────────────────────────────

describe('handleWebhookEvent — T-18 billing emails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listTeamsByOwner.mockResolvedValue([]);
  });

  test('invoice.payment_failed sends a payment-failed email to the team billing address', async () => {
    const team = buildTeam({
      plan: 'team_pro',
      subscriptionStatus: 'active',
      billingEmail: 'coach@x.com',
    });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue({
      id: 'evt_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_1',
          metadata: { resourceType: 'team' },
          parent: {
            subscription_details: { metadata: { resourceType: 'team', teamId: 'team-1' } },
          },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(sendPaymentFailedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'coach@x.com' })
    );
  });

  test('trial_will_end sends a trial-ending email to the team billing address', async () => {
    const team = buildTeam({
      plan: 'team_pro',
      subscriptionStatus: 'trialing',
      billingEmail: 'coach@x.com',
    });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue({
      id: 'evt_trial',
      type: 'customer.subscription.trial_will_end',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          trial_end: 1780000000,
          metadata: { resourceType: 'team', teamId: 'team-1' },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(sendTrialEndingEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'coach@x.com' })
    );
  });

  test('trial_will_end without a billing email does not throw or email', async () => {
    const team = buildTeam({
      plan: 'team_pro',
      subscriptionStatus: 'trialing',
      billingEmail: null,
    });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue({
      id: 'evt_trial2',
      type: 'customer.subscription.trial_will_end',
      data: {
        object: { id: 'sub_1', metadata: { resourceType: 'team', teamId: 'team-1' } },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(sendTrialEndingEmail).not.toHaveBeenCalled();
  });
});

// ─── Checkout session ─────────────────────────────────────────────────────────

describe('createTeamCheckoutSession', () => {
  beforeEach(() => jest.clearAllMocks());

  test('includes resourceType, trial, and payment_method_collection in session', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    const result = await createTeamCheckoutSession('user-1', 'team-99', 'monthly');

    expect(result).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_session' });
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_collection: 'always',
        subscription_data: expect.objectContaining({
          trial_period_days: 14,
          metadata: expect.objectContaining({ resourceType: 'team', plan: 'team_pro' }),
        }),
        success_url: expect.stringContaining('resourceType=team'),
      })
    );
  });

  test('backward-compat createCheckoutSession routes to monthly team checkout', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    const result = await createCheckoutSession('user-1', 'team-99');
    expect(result).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_session' });
  });

  test('throws 400 if team is already active', async () => {
    findTeamByIdAndOwner.mockResolvedValue(
      buildTeam({ plan: 'team', subscriptionStatus: 'active' })
    );
    await expect(createTeamCheckoutSession('user-1', 'team-1', 'monthly')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('throws 404 if team not found', async () => {
    findTeamByIdAndOwner.mockResolvedValue(null);
    await expect(createTeamCheckoutSession('user-1', 'bad-id', 'monthly')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('rejects an unsafe Stripe redirect URL with 502 (T-09)', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    mockCheckoutCreate.mockResolvedValue({ url: 'https://evil.example.com/phish' });
    await expect(createTeamCheckoutSession('user-1', 'team-99', 'monthly')).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  test('masks a Stripe SDK error as a generic 502 (audit M3 — no price-ID leak)', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    const stripeErr = Object.assign(new Error('No such price: price_1ABCsecret'), {
      type: 'StripeInvalidRequestError',
      statusCode: 400,
    });
    mockCheckoutCreate.mockRejectedValue(stripeErr);

    await expect(createTeamCheckoutSession('user-1', 'team-99', 'monthly')).rejects.toMatchObject({
      statusCode: 502,
      message: 'Billing provider error',
    });
  });

  test('omits the trial for a team that has already trialed (audit H1)', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99', hasTrialed: true }));
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createTeamCheckoutSession('user-1', 'team-99', 'monthly');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_period_days).toBeUndefined();
  });

  test('grants the trial for a first-time team (audit H1)', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99', hasTrialed: false }));
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createTeamCheckoutSession('user-1', 'team-99', 'monthly');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_period_days).toBe(14);
  });

  test('reuses an existing Stripe customer on re-checkout (audit H2)', async () => {
    findTeamByIdAndOwner.mockResolvedValue(
      buildTeam({ _id: 'team-99', stripeCustomerId: 'cus_existing', billingEmail: 'o@e.com' })
    );
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createTeamCheckoutSession('user-1', 'team-99', 'monthly');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.customer).toBe('cus_existing');
    expect(arg.customer_email).toBeUndefined();
  });
});

describe('createLeagueCheckoutSession trial farming (audit H1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('omits the trial when the owner already has a league that trialed', async () => {
    findLeaguesByOwner.mockResolvedValue([
      buildLeague({ subscriptionStatus: 'canceled', plan: 'starter', hasTrialed: true }),
    ]);
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createLeagueCheckoutSession('user-1', 'monthly');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_period_days).toBeUndefined();
  });

  test('grants the trial for an owner with no prior trialed league', async () => {
    findLeaguesByOwner.mockResolvedValue([]);
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createLeagueCheckoutSession('user-1', 'monthly');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_period_days).toBe(14);
  });
});

// ─── Phase 3 (T-06): price/interval/trial resolved from the plan catalog ────────
// These lock the resolution behavior so the catalog refactor is behavior-preserving:
// price IDs come from resolvePriceId(planId, interval) and trial from trialDaysFor.
describe('catalog-driven price + trial resolution', () => {
  beforeEach(() => jest.clearAllMocks());

  test('team monthly uses the team monthly price with the configured trial', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    await createTeamCheckoutSession('user-1', 'team-99', 'monthly');

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_team_monthly', quantity: 1 }],
        subscription_data: expect.objectContaining({ trial_period_days: 14 }),
      })
    );
  });

  test('team season uses the team season price', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    await createTeamCheckoutSession('user-1', 'team-99', 'season');

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_team_season', quantity: 1 }],
        subscription_data: expect.objectContaining({ trial_period_days: 14 }),
      })
    );
  });

  test('league monthly uses the league monthly price', async () => {
    findLeaguesByOwner.mockResolvedValue([]);
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    await createLeagueCheckoutSession('user-1', 'monthly');

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_league_monthly', quantity: 1 }],
        subscription_data: expect.objectContaining({ trial_period_days: 14 }),
      })
    );
  });

  test('league season uses the league season price', async () => {
    findLeaguesByOwner.mockResolvedValue([]);
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    await createLeagueCheckoutSession('user-1', 'season');

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_league_season', quantity: 1 }],
        subscription_data: expect.objectContaining({ trial_period_days: 14 }),
      })
    );
  });
});

// ─── Customer portal ──────────────────────────────────────────────────────────

describe('createCustomerPortalSession', () => {
  beforeEach(() => jest.clearAllMocks());

  test('uses existing stripe customer id', async () => {
    findTeamByIdAndOwner.mockResolvedValue(
      buildTeam({ _id: 'team-99', stripeCustomerId: 'cus_123', subscriptionStatus: 'active' })
    );
    mockBillingPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/test' });

    const result = await createCustomerPortalSession('user-1', 'team-99');
    expect(result).toEqual({ url: 'https://billing.stripe.com/p/session/test' });
    expect(mockBillingPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_123' })
    );
  });

  test('throws 400 if no stripe customer exists', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ stripeCustomerId: null }));
    await expect(createCustomerPortalSession('user-1', 'team-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ─── Feed affiliation gate (TSW-001) ───────────────────────────────────────────

describe('assertFeedPostingAllowed', () => {
  beforeEach(() => jest.clearAllMocks());

  test('allows a user who owns a team', async () => {
    Team.exists.mockResolvedValue(true);
    League.exists.mockResolvedValue(false);
    LeagueManager.exists.mockResolvedValue(false);
    LeagueTeamMember.exists.mockResolvedValue(false);
    await expect(assertFeedPostingAllowed('user-1')).resolves.toBeUndefined();
  });

  test('allows a league owner with no team and no LeagueManager row', async () => {
    Team.exists.mockResolvedValue(false);
    League.exists.mockResolvedValue(true);
    LeagueManager.exists.mockResolvedValue(false);
    LeagueTeamMember.exists.mockResolvedValue(false);
    await expect(assertFeedPostingAllowed('user-1')).resolves.toBeUndefined();
  });

  test('allows an active league manager', async () => {
    Team.exists.mockResolvedValue(false);
    League.exists.mockResolvedValue(false);
    LeagueManager.exists.mockResolvedValue(true);
    LeagueTeamMember.exists.mockResolvedValue(false);
    await expect(assertFeedPostingAllowed('user-1')).resolves.toBeUndefined();
  });

  test('allows an active league team member', async () => {
    Team.exists.mockResolvedValue(false);
    League.exists.mockResolvedValue(false);
    LeagueManager.exists.mockResolvedValue(false);
    LeagueTeamMember.exists.mockResolvedValue(true);
    await expect(assertFeedPostingAllowed('user-1')).resolves.toBeUndefined();
  });

  test('throws 403 for a user with no team or league affiliation', async () => {
    Team.exists.mockResolvedValue(false);
    League.exists.mockResolvedValue(false);
    LeagueManager.exists.mockResolvedValue(false);
    LeagueTeamMember.exists.mockResolvedValue(false);
    await expect(assertFeedPostingAllowed('user-1')).rejects.toMatchObject({
      statusCode: 403,
      message: 'You must be part of a team or league to post',
    });
  });
});

describe('handleWebhookEvent — audit H3 release-on-failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listTeamsByOwner.mockResolvedValue([]);
  });

  test('releases the claim when the apply step throws, so a retry can re-apply', async () => {
    const team = buildTeam({ billingSource: 'stripe' });
    claimTeamWebhookEvent.mockResolvedValue(team);
    // Apply step fails (transient DB error). Without release-on-failure the event
    // stays claimed and Stripe's retry would no-op — the sub never activates.
    saveTeam.mockRejectedValueOnce(new Error('transient write failure'));

    mockConstructEvent.mockReturnValue({
      id: 'evt_flaky_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          customer: 'cus_1',
          items: { data: [{ price: { id: 'price_team_monthly' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { resourceType: 'team', teamId: 'team-1', billingInterval: 'monthly' },
        },
      },
    });

    await expect(handleWebhookEvent('sig', Buffer.from('payload'))).rejects.toThrow(
      'transient write failure'
    );
    expect(releaseTeamWebhookEvent).toHaveBeenCalledWith('team-1', 'evt_flaky_1');
  });

  test('does not release on a clean apply', async () => {
    const team = buildTeam({ billingSource: 'stripe' });
    claimTeamWebhookEvent.mockResolvedValue(team);

    mockConstructEvent.mockReturnValue({
      id: 'evt_ok_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          customer: 'cus_1',
          items: { data: [{ price: { id: 'price_team_monthly' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { resourceType: 'team', teamId: 'team-1', billingInterval: 'monthly' },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(releaseTeamWebhookEvent).not.toHaveBeenCalled();
  });
});
