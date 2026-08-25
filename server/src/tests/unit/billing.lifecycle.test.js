jest.mock('../../modules/teams/teams.repository', () => ({
  Team: { exists: jest.fn() },
  findTeamByIdAndOwner: jest.fn(),
  listTeamsByOwner: jest.fn(),
  saveTeam: jest.fn(),
  claimTeamWebhookEvent: jest.fn(),
  releaseTeamWebhookEvent: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  League: { findOne: jest.fn(), create: jest.fn(), exists: jest.fn() },
  LeagueManager: { exists: jest.fn() },
  LeagueTeamMember: { exists: jest.fn() },
  findLeagueByIdAndOwner: jest.fn(),
  findLeaguesByOwner: jest.fn(),
  listLeagueTeams: jest.fn(),
  saveLeague: jest.fn(),
  claimLeagueWebhookEvent: jest.fn(),
  releaseLeagueWebhookEvent: jest.fn(),
}));

jest.mock('../../modules/auth/auth.repository', () => ({ updateUserPlan: jest.fn() }));
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
const mockSubscriptionRetrieve = jest.fn();
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionRetrieve },
  }))
);

const repository = require('../../modules/teams/teams.repository');
const { sendPaymentFailedEmail } = require('../../services/email.service');
const {
  handleWebhookEvent,
  canManageStandaloneTeam,
} = require('../../modules/billing/billing.service');
const { resolveForTeam } = require('../../modules/billing/entitlements.service');

function team(overrides = {}) {
  return {
    _id: 'team-1',
    ownerUserId: 'user-1',
    name: 'Second Team',
    capacityType: 'paid',
    plan: 'starter',
    subscriptionStatus: 'inactive',
    billingSource: 'stripe',
    billingEmail: 'owner@example.com',
    ...overrides,
  };
}

function subscriptionEvent(id, status, type = 'customer.subscription.updated') {
  return {
    id,
    type,
    data: {
      object: {
        id: 'sub_1',
        status,
        customer: 'cus_1',
        items: {
          data: [
            {
              price: { id: 'price_additional_team' },
              current_period_end: 1780000000,
            },
          ],
        },
        cancel_at_period_end: false,
        metadata: { resourceType: 'team', teamId: 'team-1' },
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
        parent: {
          subscription_details: {
            metadata: { resourceType: 'team', teamId: 'team-1' },
          },
        },
        lines: {
          data: [
            {
              pricing: { price_details: { price: 'price_additional_team' } },
              period: { end: 1790000000 },
            },
          ],
        },
      },
    },
  };
}

async function deliver(doc, event) {
  repository.claimTeamWebhookEvent.mockResolvedValue(doc);
  repository.listTeamsByOwner.mockResolvedValue([doc]);
  mockConstructEvent.mockReturnValue(event);
  mockSubscriptionRetrieve.mockResolvedValue(event.data.object);
  await handleWebhookEvent('sig', Buffer.from('payload'));
}

beforeEach(() => jest.clearAllMocks());

describe('additional-team subscription lifecycle', () => {
  it('all team features are available even while paid capacity is locked', () => {
    const doc = team();
    expect(resolveForTeam(doc).entitlements.canViewReplay).toBe(true);
    expect(resolveForTeam(doc).entitlements.canExportCsv).toBe(true);
    expect(canManageStandaloneTeam(doc)).toBe(false);
  });

  it('an active subscription makes an additional team writable', async () => {
    const doc = team();
    await deliver(doc, subscriptionEvent('evt_active', 'active'));
    expect(doc.plan).toBe('team_extra');
    expect(doc.subscriptionStatus).toBe('active');
    expect(canManageStandaloneTeam(doc)).toBe(true);
  });

  it('a failed renewal makes the team read-only and sends an email', async () => {
    const doc = team({ plan: 'team_extra', subscriptionStatus: 'active' });
    await deliver(doc, invoiceEvent('evt_failed', 'invoice.payment_failed'));
    expect(doc.subscriptionStatus).toBe('past_due');
    expect(canManageStandaloneTeam(doc)).toBe(false);
    expect(sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
  });

  it('payment recovery restores write access', async () => {
    const doc = team({ plan: 'team_extra', subscriptionStatus: 'past_due' });
    await deliver(doc, invoiceEvent('evt_paid', 'invoice.paid'));
    expect(doc.subscriptionStatus).toBe('active');
    expect(canManageStandaloneTeam(doc)).toBe(true);
  });

  it('cancellation keeps data/features but removes write access', async () => {
    const doc = team({ plan: 'team_extra', subscriptionStatus: 'active' });
    await deliver(
      doc,
      subscriptionEvent('evt_deleted', 'canceled', 'customer.subscription.deleted')
    );
    expect(doc.plan).toBe('starter');
    expect(canManageStandaloneTeam(doc)).toBe(false);
    expect(resolveForTeam(doc).entitlements.canViewReplay).toBe(true);
  });

  it('the designated free team is always writable without Stripe', () => {
    expect(canManageStandaloneTeam(team({ capacityType: 'free' }))).toBe(true);
  });
});
