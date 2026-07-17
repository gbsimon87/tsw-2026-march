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
} = require('../../modules/teams/teams.repository');
const {
  League,
  LeagueManager,
  LeagueTeamMember,
  findLeaguesByOwner,
  claimLeagueWebhookEvent,
} = require('../../modules/leagues/leagues.repository');
const { updateUserPlan } = require('../../modules/auth/auth.repository');
const {
  isTeamActive,
  isLeagueActive,
  getTeamEntitlements,
  getLeagueEntitlements,
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

// ─── getTeamEntitlements ──────────────────────────────────────────────────────

describe('getTeamEntitlements', () => {
  test('7.13 returns all true for active team', () => {
    const entitlements = getTeamEntitlements(
      buildTeam({ plan: 'team', subscriptionStatus: 'active' })
    );
    expect(entitlements.canTrackStats).toBe(true);
    expect(entitlements.canViewReplay).toBe(true);
    expect(entitlements.canViewShotMaps).toBe(true);
    expect(entitlements.canViewHighlightClips).toBe(true);
  });

  test('7.14 returns all false for free team', () => {
    const entitlements = getTeamEntitlements(buildTeam({ plan: 'free' }));
    expect(entitlements.canTrackStats).toBe(false);
    expect(entitlements.canViewReplay).toBe(false);
    expect(entitlements.canViewShotMaps).toBe(false);
    expect(entitlements.canViewHighlightClips).toBe(false);
  });
});

// ─── getLeagueEntitlements ────────────────────────────────────────────────────

describe('getLeagueEntitlements', () => {
  test('7.15 returns all true for active league', () => {
    const entitlements = getLeagueEntitlements(
      buildLeague({ plan: 'league', subscriptionStatus: 'active' })
    );
    expect(entitlements.canManageLeague).toBe(true);
    expect(entitlements.canTrackStats).toBe(true);
    expect(entitlements.canViewReplay).toBe(true);
    expect(entitlements.canViewShotMaps).toBe(true);
    expect(entitlements.canViewHighlightClips).toBe(true);
  });

  test('7.16 returns all false for plan: free, status: inactive', () => {
    const entitlements = getLeagueEntitlements(
      buildLeague({ plan: 'free', subscriptionStatus: 'inactive' })
    );
    expect(entitlements.canManageLeague).toBe(false);
    expect(entitlements.canTrackStats).toBe(false);
    expect(entitlements.canViewReplay).toBe(false);
    expect(entitlements.canViewShotMaps).toBe(false);
    expect(entitlements.canViewHighlightClips).toBe(false);
  });

  test('We-ball Saturday (plan: pro, status: active) returns all true', () => {
    const entitlements = getLeagueEntitlements(
      buildLeague({ plan: 'pro', subscriptionStatus: 'active' })
    );
    expect(entitlements.canManageLeague).toBe(true);
    expect(entitlements.canTrackStats).toBe(true);
  });
});

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
          metadata: expect.objectContaining({ resourceType: 'team', plan: 'team' }),
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
