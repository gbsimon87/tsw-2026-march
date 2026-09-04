jest.mock('../../modules/teams/teams.repository', () => ({
  Team: { exists: jest.fn() },
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
  listTeamsByOwner: jest.fn(),
  makeOwnedTeamFree: jest.fn(),
  saveTeam: jest.fn(),
  claimTeamWebhookEvent: jest.fn(),
  releaseTeamWebhookEvent: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  League: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
    exists: jest.fn(),
  },
  LeagueManager: { exists: jest.fn() },
  LeagueTeamMember: { exists: jest.fn() },
  findLeagueById: jest.fn(),
  findLeagueByIdAndOwner: jest.fn(),
  findLeaguesByOwner: jest.fn(),
  listLeagueTeams: jest.fn(),
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
    STRIPE_PRICE_ID_ADDITIONAL_TEAM: 'price_additional_team',
    STRIPE_PRICE_ID_LEAGUE: 'price_league',
    STRIPE_PRICE_ID_LEAGUE_PLUS: 'price_league_plus',
    STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_tsw_locked_down',
    STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID: 'bpc_tsw_upgrade_only',
    STRIPE_SUCCESS_URL: 'http://localhost:5173/billing/success',
    STRIPE_CANCEL_URL: 'http://localhost:5173/billing/cancel',
  },
}));

const mockConstructEvent = jest.fn();
const mockCheckoutCreate = jest.fn();
const mockCheckoutRetrieve = jest.fn();
const mockBillingPortalCreate = jest.fn();
const mockSubscriptionRetrieve = jest.fn();
const mockScheduleCreate = jest.fn();
const mockScheduleUpdate = jest.fn();
const mockScheduleRelease = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    checkout: { sessions: { create: mockCheckoutCreate, retrieve: mockCheckoutRetrieve } },
    subscriptions: { retrieve: mockSubscriptionRetrieve },
    subscriptionSchedules: {
      create: mockScheduleCreate,
      update: mockScheduleUpdate,
      release: mockScheduleRelease,
    },
    billingPortal: { sessions: { create: mockBillingPortalCreate } },
  }))
);

const {
  Team,
  findTeamByIdAndOwner,
  listTeamsByOwner,
  makeOwnedTeamFree,
  saveTeam,
  claimTeamWebhookEvent,
  releaseTeamWebhookEvent,
} = require('../../modules/teams/teams.repository');
const {
  League,
  LeagueManager,
  LeagueTeamMember,
  findLeagueByIdAndOwner,
  findLeaguesByOwner,
  listLeagueTeams,
  saveLeague,
  claimLeagueWebhookEvent,
} = require('../../modules/leagues/leagues.repository');
const { updateUserPlan } = require('../../modules/auth/auth.repository');
const { sendPaymentFailedEmail, sendTrialEndingEmail } = require('../../services/email.service');
const { env } = require('../../config/env');
const {
  isTeamActive,
  isLeagueActive,
  getBillingSummary,
  getLeagueBillingSummary,
  createCheckoutSession,
  createTeamCheckoutSession,
  createLeagueCheckoutSession,
  createCustomerPortalSession,
  changeLeaguePlan,
  getCheckoutStatus,
  handleWebhookEvent,
  assertFeedPostingAllowed,
  chooseFreeTeam,
} = require('../../modules/billing/billing.service');

function buildTeam(overrides = {}) {
  return {
    _id: 'team-1',
    ownerUserId: 'user-1',
    plan: 'starter',
    capacityType: 'paid',
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
    plan: 'starter',
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

beforeEach(() => {
  mockSubscriptionRetrieve.mockImplementation(
    async () => mockConstructEvent.mock.results.at(-1).value.data.object
  );
});

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
          items: { data: [{ price: { id: 'price_additional_team' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { resourceType: 'team', teamId: 'team-1', billingInterval: 'monthly' },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(claimTeamWebhookEvent).toHaveBeenCalledWith('team-1', 'evt_sub_updated');
    expect(team.plan).toBe('team_extra');
    expect(team.subscriptionStatus).toBe('active');
    expect(saveTeam).toHaveBeenCalledTimes(1);
    expect(updateUserPlan).toHaveBeenCalledWith('user-1', 'starter');

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
          items: { data: [{ price: { id: 'price_additional_team' } }] },
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
          items: { data: [{ price: { id: 'price_additional_team' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { resourceType: 'team', teamId: 'team-1' },
          ...overrides,
        },
      },
    };
  }

  test('derives the additional-team plan and monthly interval from the price id', async () => {
    const team = buildTeam();
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(subEvent());

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.plan).toBe('team_extra');
    expect(team.billingInterval).toBe('monthly');
    expect(saveTeam).toHaveBeenCalledTimes(1);
  });

  test('reads the current period from the Dahlia Subscription Item shape', async () => {
    const team = buildTeam();
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(
      subEvent({
        current_period_end: undefined,
        items: {
          data: [{ price: { id: 'price_additional_team' }, current_period_end: 1780000000 }],
        },
      })
    );

    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(team.currentPeriodEnd).toEqual(new Date(1780000000 * 1000));
  });

  test('re-reads current Stripe state before applying an out-of-order update', async () => {
    const team = buildTeam({ plan: 'starter', subscriptionStatus: 'past_due' });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(subEvent({ status: 'past_due' }));
    mockSubscriptionRetrieve.mockResolvedValue(subEvent({ status: 'active' }).data.object);

    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(team.subscriptionStatus).toBe('active');
    expect(team.plan).toBe('team_extra');
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
    const team = buildTeam({ plan: 'team_extra', subscriptionStatus: 'active' });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(subEvent({ status: 'canceled' }));

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.plan).toBe('starter');
    expect(team.subscriptionStatus).toBe('canceled');
  });

  test('fails closed when a subscription uses an unknown price ID', async () => {
    const team = buildTeam();
    claimTeamWebhookEvent.mockResolvedValue(team);
    mockConstructEvent.mockReturnValue(
      subEvent({ items: { data: [{ price: { id: 'price_not_configured' } }] } })
    );

    await expect(handleWebhookEvent('sig', Buffer.from('payload'))).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(team.plan).toBe('starter');
    expect(releaseTeamWebhookEvent).toHaveBeenCalledWith('team-1', 'evt_sub');
  });

  test('an unknown price still revokes access on cancellation', async () => {
    const team = buildTeam({ plan: 'team_extra', subscriptionStatus: 'active' });
    claimTeamWebhookEvent.mockResolvedValue(team);
    mockConstructEvent.mockReturnValue(
      subEvent({
        status: 'canceled',
        items: { data: [{ price: { id: 'price_legacy_unknown' } }] },
      })
    );

    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(team.plan).toBe('starter');
    expect(team.subscriptionStatus).toBe('canceled');
  });

  test('skips a non-stripe (comp) team so a stray Stripe event cannot clobber the grant', async () => {
    const team = buildTeam({
      plan: 'team_extra',
      subscriptionStatus: 'active',
      billingSource: 'comp',
    });
    claimTeamWebhookEvent.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);
    mockConstructEvent.mockReturnValue(subEvent({ status: 'canceled' }));

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.plan).toBe('team_extra'); // unchanged
    expect(team.subscriptionStatus).toBe('active'); // unchanged
    expect(saveTeam).not.toHaveBeenCalled();
  });

  test('invoice.paid marks the team active and extends the current period', async () => {
    const team = buildTeam({
      plan: 'starter',
      subscriptionStatus: 'past_due',
      stripePriceId: 'price_additional_team',
    });
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
    expect(team.plan).toBe('team_extra');
    expect(team.currentPeriodEnd).toEqual(new Date(1780000000 * 1000));
    expect(saveTeam).toHaveBeenCalledTimes(1);
  });

  test('a late invoice.paid cannot restore a canceled subscription', async () => {
    const team = buildTeam({ plan: 'starter', subscriptionStatus: 'canceled' });
    claimTeamWebhookEvent.mockResolvedValue(team);
    mockConstructEvent.mockReturnValue({
      id: 'evt_late_paid',
      type: 'invoice.paid',
      data: {
        object: {
          parent: { subscription_details: { metadata: { teamId: 'team-1' } } },
          lines: { data: [{ period: { end: 1780000000 } }] },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(team.subscriptionStatus).toBe('canceled');
    expect(saveTeam).not.toHaveBeenCalled();
  });

  test('derives the canonical league plan from the price id', async () => {
    const league = buildLeague();
    League.findOneAndUpdate.mockResolvedValue(league);
    claimLeagueWebhookEvent.mockResolvedValue(league);
    mockConstructEvent.mockReturnValue({
      id: 'evt_league_sub',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_l',
          status: 'active',
          customer: 'cus_l',
          items: { data: [{ price: { id: 'price_league' } }] },
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
    expect(League.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      claimLeagueWebhookEvent.mock.invocationCallOrder[0]
    );
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
      plan: 'team_extra',
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
      plan: 'team_extra',
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
      plan: 'team_extra',
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

  test('includes resource metadata and always collects a payment method', async () => {
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
          metadata: expect.objectContaining({ resourceType: 'team', plan: 'team_extra' }),
        }),
        success_url: expect.stringContaining('resourceType=team'),
      }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^tsw_checkout_/) })
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

  test('blocks a second Checkout Session while payment recovery is open', async () => {
    findTeamByIdAndOwner.mockResolvedValue(
      buildTeam({ plan: 'starter', subscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_1' })
    );
    await expect(createTeamCheckoutSession('user-1', 'team-1', 'monthly')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
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

  test('does not give additional teams a trial', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99', hasTrialed: true }));
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createTeamCheckoutSession('user-1', 'team-99', 'monthly');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_period_days).toBeUndefined();
  });

  test('does not give a first-time additional team a trial either', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99', hasTrialed: false }));
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createTeamCheckoutSession('user-1', 'team-99', 'monthly');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_period_days).toBeUndefined();
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

describe('getCheckoutStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the exact owned team linked to the Checkout Session', async () => {
    mockCheckoutRetrieve.mockResolvedValue({
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_1',
      metadata: { ownerUserId: 'user-1', resourceType: 'team', teamId: 'team-1' },
    });
    findTeamByIdAndOwner.mockResolvedValue(
      buildTeam({ _id: 'team-1', name: 'TSW A', plan: 'team_extra', subscriptionStatus: 'active' })
    );

    await expect(getCheckoutStatus('user-1', 'cs_test_abc123')).resolves.toMatchObject({
      resourceType: 'team',
      checkoutStatus: 'complete',
      paymentStatus: 'paid',
      resource: { id: 'team-1', name: 'TSW A' },
    });
  });

  test('does not reveal a Checkout Session owned by another user', async () => {
    mockCheckoutRetrieve.mockResolvedValue({
      metadata: { ownerUserId: 'another-user', resourceType: 'team', teamId: 'team-1' },
    });
    await expect(getCheckoutStatus('user-1', 'cs_test_abc123')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('createLeagueCheckoutSession trial farming (audit H1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('omits the trial when the owner already has a league that trialed', async () => {
    findLeaguesByOwner.mockResolvedValue([
      buildLeague({ subscriptionStatus: 'canceled', plan: 'starter', hasTrialed: true }),
    ]);
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createLeagueCheckoutSession('user-1', 'league');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_period_days).toBeUndefined();
  });

  test('grants the trial for an owner with no prior trialed league', async () => {
    findLeaguesByOwner.mockResolvedValue([]);
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createLeagueCheckoutSession('user-1', 'league');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.subscription_data.trial_period_days).toBe(14);
  });

  test('re-subscribes the same canceled League and reuses its Stripe customer', async () => {
    const league = buildLeague({
      _id: 'league-canceled',
      plan: 'starter',
      subscriptionStatus: 'canceled',
      stripeCustomerId: 'cus_existing',
      hasTrialed: true,
    });
    findLeagueByIdAndOwner.mockResolvedValue(league);
    findLeaguesByOwner.mockResolvedValue([league]);
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs' });

    await createLeagueCheckoutSession('user-1', 'league', 'league-canceled');

    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.customer).toBe('cus_existing');
    expect(arg.metadata.leagueId).toBe('league-canceled');
    expect(arg.subscription_data.metadata.leagueId).toBe('league-canceled');
    expect(arg.subscription_data.trial_period_days).toBeUndefined();
  });
});

describe('createLeagueCheckoutSession development bypass', () => {
  test('provisions an active comped league only when local Stripe is disabled', async () => {
    jest.clearAllMocks();
    env.NODE_ENV = 'development';
    const secretKey = env.STRIPE_SECRET_KEY;
    delete env.STRIPE_SECRET_KEY;
    League.create.mockResolvedValue({ _id: 'league-dev' });

    try {
      await expect(createLeagueCheckoutSession('user-1', 'league_plus')).resolves.toEqual({
        devRedirectPath: '/admin/leagues/new',
      });
      expect(League.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerUserId: 'user-1',
          plan: 'league_plus',
          subscriptionStatus: 'active',
          billingSource: 'comp',
          billingInterval: 'monthly',
        })
      );
      expect(mockCheckoutCreate).not.toHaveBeenCalled();
    } finally {
      delete env.NODE_ENV;
      env.STRIPE_SECRET_KEY = secretKey;
    }
  });

  test('uses Stripe test mode locally when Stripe credentials are present', async () => {
    jest.clearAllMocks();
    env.NODE_ENV = 'development';
    findLeaguesByOwner.mockResolvedValue([]);
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_local',
    });

    try {
      await expect(createLeagueCheckoutSession('user-1', 'league')).resolves.toEqual({
        url: 'https://checkout.stripe.com/c/pay/cs_test_local',
      });
      expect(mockCheckoutCreate).toHaveBeenCalledTimes(1);
      expect(League.create).not.toHaveBeenCalled();
    } finally {
      delete env.NODE_ENV;
    }
  });
});

// ─── Phase 3 (T-06): price/interval/trial resolved from the plan catalog ────────
// These lock the resolution behavior so the catalog refactor is behavior-preserving:
// price IDs come from resolvePriceId(planId, interval) and trial from trialDaysFor.
describe('catalog-driven price + trial resolution', () => {
  beforeEach(() => jest.clearAllMocks());

  test('additional teams use the £5 monthly price without a trial', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    await createTeamCheckoutSession('user-1', 'team-99', 'monthly');

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_additional_team', quantity: 1 }],
        subscription_data: expect.not.objectContaining({ trial_period_days: expect.anything() }),
      }),
      expect.any(Object)
    );
  });

  test('additional teams stay monthly even if a stale caller supplies season', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    await createTeamCheckoutSession('user-1', 'team-99', 'season');

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_additional_team', quantity: 1 }],
      }),
      expect.any(Object)
    );
  });

  test('league monthly uses the league monthly price', async () => {
    findLeaguesByOwner.mockResolvedValue([]);
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    await createLeagueCheckoutSession('user-1', 'league');

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_league', quantity: 1 }],
        subscription_data: expect.objectContaining({ trial_period_days: 14 }),
      }),
      expect.any(Object)
    );
  });

  test('League Plus uses its own monthly price', async () => {
    findLeaguesByOwner.mockResolvedValue([]);
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });

    await createLeagueCheckoutSession('user-1', 'league_plus');

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_league_plus', quantity: 1 }],
        subscription_data: expect.objectContaining({ trial_period_days: 14 }),
      }),
      expect.any(Object)
    );
  });
});

describe('capacity pricing changes', () => {
  beforeEach(() => jest.clearAllMocks());

  test('opens Stripe confirmation for an immediate prorated League Plus upgrade', async () => {
    findLeagueByIdAndOwner.mockResolvedValue(
      buildLeague({
        plan: 'league',
        subscriptionStatus: 'active',
        stripeCustomerId: 'cus_league',
        stripeSubscriptionId: 'sub_league',
      })
    );
    mockSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_league',
      items: { data: [{ id: 'si_league', price: { id: 'price_league' } }] },
      schedule: null,
    });
    mockBillingPortalCreate.mockResolvedValue({
      url: 'https://billing.stripe.com/p/session/upgrade',
    });

    await expect(changeLeaguePlan('user-1', 'league-1', 'league_plus')).resolves.toEqual({
      url: 'https://billing.stripe.com/p/session/upgrade',
      change: 'upgrade',
    });
    expect(mockBillingPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: 'bpc_tsw_upgrade_only',
        customer: 'cus_league',
        flow_data: expect.objectContaining({
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: 'sub_league',
            items: [{ id: 'si_league', price: 'price_league_plus', quantity: 1 }],
          },
        }),
      })
    );
  });

  test('blocks a League Plus downgrade while more than 10 teams are active', async () => {
    findLeagueByIdAndOwner.mockResolvedValue(
      buildLeague({
        plan: 'league_plus',
        subscriptionStatus: 'active',
        stripeCustomerId: 'cus_league',
        stripeSubscriptionId: 'sub_league',
      })
    );
    mockSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_league',
      items: { data: [{ id: 'si_league', price: { id: 'price_league_plus' } }] },
      schedule: null,
    });
    listLeagueTeams.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({ _id: `team-${index}`, status: 'active' }))
    );

    await expect(changeLeaguePlan('user-1', 'league-1', 'league')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Archive teams until this League has 10 or fewer before downgrading',
    });
    expect(mockScheduleCreate).not.toHaveBeenCalled();
  });

  test('schedules an eligible League Plus downgrade for the next billing period', async () => {
    const league = buildLeague({
      plan: 'league_plus',
      subscriptionStatus: 'active',
      stripeCustomerId: 'cus_league',
      stripeSubscriptionId: 'sub_league',
    });
    findLeagueByIdAndOwner.mockResolvedValue(league);
    mockSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_league',
      items: { data: [{ id: 'si_league', price: { id: 'price_league_plus' } }] },
      schedule: null,
    });
    listLeagueTeams.mockResolvedValue([{ _id: 'team-1', status: 'active' }]);
    mockScheduleCreate.mockResolvedValue({
      id: 'sub_sched_1',
      phases: [
        {
          start_date: 1_780_000_000,
          end_date: 1_782_678_400,
          items: [{ price: 'price_league_plus', quantity: 1 }],
        },
      ],
    });
    mockScheduleUpdate.mockResolvedValue({ id: 'sub_sched_1' });

    await expect(changeLeaguePlan('user-1', 'league-1', 'league')).resolves.toMatchObject({
      change: 'downgrade',
      scheduled: true,
    });
    expect(mockScheduleUpdate).toHaveBeenCalledWith(
      'sub_sched_1',
      expect.objectContaining({
        end_behavior: 'release',
        phases: expect.arrayContaining([
          expect.objectContaining({ items: [{ price: 'price_league', quantity: 1 }] }),
        ]),
      })
    );
    expect(league.scheduledPlan).toBe('league');
    expect(saveLeague).toHaveBeenCalledWith(league);
  });

  test('cancels a scheduled downgrade when the owner keeps League Plus', async () => {
    const league = buildLeague({
      plan: 'league_plus',
      scheduledPlan: 'league',
      scheduledPlanAt: new Date('2026-10-01T00:00:00.000Z'),
      subscriptionStatus: 'active',
      stripeCustomerId: 'cus_league',
      stripeSubscriptionId: 'sub_league',
    });
    findLeagueByIdAndOwner.mockResolvedValue(league);
    mockSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_league',
      items: { data: [{ id: 'si_league', price: { id: 'price_league_plus' } }] },
      schedule: 'sub_sched_1',
    });

    await expect(changeLeaguePlan('user-1', 'league-1', 'league_plus')).resolves.toEqual({
      change: 'downgrade_canceled',
      scheduled: false,
    });
    expect(mockScheduleRelease).toHaveBeenCalledWith('sub_sched_1');
    expect(league.scheduledPlan).toBeNull();
    expect(league.scheduledPlanAt).toBeNull();
    expect(saveLeague).toHaveBeenCalledWith(league);
  });

  test('moves the one free-team slot only after the paid subscription is closed', async () => {
    const paidTeam = buildTeam({
      _id: 'team-2',
      capacityType: 'paid',
      subscriptionStatus: 'canceled',
    });
    findTeamByIdAndOwner.mockResolvedValue(paidTeam);
    makeOwnedTeamFree.mockResolvedValue({ ...paidTeam, capacityType: 'free' });

    await expect(chooseFreeTeam('user-1', 'team-2')).resolves.toMatchObject({
      team: { capacityType: 'free', canManage: true },
    });
    expect(makeOwnedTeamFree).toHaveBeenCalledWith('user-1', 'team-2');
  });

  test('reports comped grandfathered leagues as manageable', () => {
    expect(
      getLeagueBillingSummary(
        buildLeague({ plan: 'league_plus', subscriptionStatus: 'active', billingSource: 'comp' })
      )
    ).toMatchObject({ plan: 'league_plus', canManage: true });
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
      expect.objectContaining({
        configuration: 'bpc_tsw_locked_down',
        customer: 'cus_123',
      })
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
          items: { data: [{ price: { id: 'price_additional_team' } }] },
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
          items: { data: [{ price: { id: 'price_additional_team' } }] },
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
