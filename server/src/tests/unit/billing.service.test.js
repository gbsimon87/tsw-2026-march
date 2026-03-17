jest.mock('../../modules/teams/teams.repository', () => ({
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
  listTeamsByOwner: jest.fn(),
  saveTeam: jest.fn(),
}));

jest.mock('../../modules/auth/auth.repository', () => ({
  updateUserPlan: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_123',
    STRIPE_PRICE_ID_PRO_MONTHLY: 'price_123',
    STRIPE_SUCCESS_URL: 'http://localhost:5173/billing/success',
    STRIPE_CANCEL_URL: 'http://localhost:5173/billing/cancel',
  },
}));

const mockConstructEvent = jest.fn();
const mockCheckoutCreate = jest.fn();
const mockBillingPortalCreate = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    checkout: {
      sessions: {
        create: mockCheckoutCreate,
      },
    },
    billingPortal: {
      sessions: {
        create: mockBillingPortalCreate,
      },
    },
  }))
);

const {
  findTeamById,
  listTeamsByOwner,
  saveTeam,
} = require('../../modules/teams/teams.repository');
const { updateUserPlan } = require('../../modules/auth/auth.repository');
const {
  createCheckoutSession,
  createCustomerPortalSession,
  handleWebhookEvent,
  getBillingSummary,
  getTeamEntitlements,
} = require('../../modules/billing/billing.service');
const { findTeamByIdAndOwner } = require('../../modules/teams/teams.repository');

function buildTeam(overrides = {}) {
  return {
    _id: 'team-1',
    ownerUserId: 'user-1',
    plan: 'free',
    subscriptionStatus: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingEmail: null,
    lastWebhookEventId: null,
    processedWebhookEventIds: [],
    ...overrides,
  };
}

describe('billing service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listTeamsByOwner.mockResolvedValue([]);
  });

  test('applies subscription updates once and ignores replayed webhook events', async () => {
    const team = buildTeam();
    findTeamById.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);

    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          customer: 'cus_123',
          items: { data: [{ price: { id: 'price_123' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          metadata: {
            teamId: 'team-1',
          },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.plan).toBe('pro');
    expect(team.subscriptionStatus).toBe('active');
    expect(team.lastWebhookEventId).toBe('evt_sub_updated');
    expect(team.processedWebhookEventIds).toContain('evt_sub_updated');
    expect(saveTeam).toHaveBeenCalledTimes(1);
    expect(updateUserPlan).toHaveBeenCalledWith('user-1', 'pro');

    saveTeam.mockClear();
    updateUserPlan.mockClear();

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.plan).toBe('pro');
    expect(team.subscriptionStatus).toBe('active');
    expect(team.lastWebhookEventId).toBe('evt_sub_updated');
    expect(saveTeam).not.toHaveBeenCalled();
    expect(updateUserPlan).not.toHaveBeenCalled();
  });

  test('marks invoice failures once and keeps replay from re-saving', async () => {
    const team = buildTeam({
      plan: 'pro',
      subscriptionStatus: 'active',
      stripeSubscriptionId: 'sub_123',
    });
    findTeamById.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);

    mockConstructEvent.mockReturnValue({
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_123',
          parent: {
            subscription_details: {
              metadata: {
                teamId: 'team-1',
              },
            },
          },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(team.subscriptionStatus).toBe('past_due');
    expect(team.lastWebhookEventId).toBe('evt_invoice_failed');
    expect(team.processedWebhookEventIds).toContain('evt_invoice_failed');

    saveTeam.mockClear();
    updateUserPlan.mockClear();

    await handleWebhookEvent('sig', Buffer.from('payload'));
    expect(team.subscriptionStatus).toBe('past_due');
    expect(team.lastWebhookEventId).toBe('evt_invoice_failed');
    expect(saveTeam).not.toHaveBeenCalled();
    expect(updateUserPlan).not.toHaveBeenCalled();
  });

  test('stores only a bounded list of processed webhook ids', async () => {
    const existingIds = Array.from({ length: 25 }, (_, index) => `evt_old_${index + 1}`);
    const team = buildTeam({
      processedWebhookEventIds: existingIds,
      lastWebhookEventId: existingIds[24],
    });
    findTeamById.mockResolvedValue(team);
    listTeamsByOwner.mockResolvedValue([team]);

    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_new',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          customer: 'cus_123',
          items: { data: [{ price: { id: 'price_123' } }] },
          current_period_end: 1770000000,
          cancel_at_period_end: false,
          metadata: {
            teamId: 'team-1',
          },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('payload'));

    expect(team.processedWebhookEventIds).toHaveLength(25);
    expect(team.processedWebhookEventIds).not.toContain('evt_old_1');
    expect(team.processedWebhookEventIds).toContain('evt_sub_new');
  });

  test('billing summary and entitlements reflect active and canceled states', () => {
    const activeTeam = buildTeam({ plan: 'pro', subscriptionStatus: 'active' });
    const canceledTeam = buildTeam({ plan: 'free', subscriptionStatus: 'canceled' });

    expect(getBillingSummary(activeTeam)).toEqual({
      plan: 'pro',
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    expect(getTeamEntitlements(activeTeam)).toEqual({
      canViewReplay: true,
      canViewShotMaps: true,
    });
    expect(getTeamEntitlements(canceledTeam)).toEqual({
      canViewReplay: false,
      canViewShotMaps: false,
    });
  });

  test('checkout session includes team-aware return urls', async () => {
    findTeamByIdAndOwner.mockResolvedValue(buildTeam({ _id: 'team-99' }));
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.test/session' });

    const result = await createCheckoutSession('user-1', 'team-99');

    expect(result).toEqual({ url: 'https://checkout.test/session' });
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'http://localhost:5173/billing/success?teamId=team-99&checkout=success',
        cancel_url: 'http://localhost:5173/billing/cancel?teamId=team-99&checkout=canceled',
      })
    );
  });

  test('customer portal session uses the existing stripe customer id', async () => {
    findTeamByIdAndOwner.mockResolvedValue(
      buildTeam({ _id: 'team-99', stripeCustomerId: 'cus_123', subscriptionStatus: 'active' })
    );
    mockBillingPortalCreate.mockResolvedValue({ url: 'https://portal.test/session' });

    const result = await createCustomerPortalSession('user-1', 'team-99');

    expect(result).toEqual({ url: 'https://portal.test/session' });
    expect(mockBillingPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        return_url: 'http://localhost:5173/billing/success',
      })
    );
  });
});
