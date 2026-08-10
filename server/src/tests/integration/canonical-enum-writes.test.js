// Audit fix H9 (docs/pricing-overhaul/18-audit-findings.md) — regression net for
// the canonical-enum write paths that shipped broken through a green suite (C1/C2).
//
// The existing tests mock the repositories, so a service writing a legacy plan
// value ('free'/'pro'/'team') into a schema tightened to canonical ids (T-26)
// never fails in CI. There is no in-memory Mongo in this repo's test infra, so
// this file runs the REAL Mongoose schemas' full document validation (which
// needs no DB connection) against the exact payloads the services write:
//   - auth.service register()            → User.create   (C1)
//   - billing createLeagueFromCheckout   → League.create (C2)
// A service writing an out-of-enum value fails here exactly as it would in prod.

jest.mock('../../modules/auth/auth.repository', () => {
  const actual = jest.requireActual('../../modules/auth/auth.repository');
  const mongoose = require('mongoose');
  return {
    ...actual,
    findUserByEmail: jest.fn(),
    // Real-schema validation in place of the DB write: full document validation,
    // same code path Mongoose runs inside User.create().
    createUser: jest.fn(async (input) => {
      const doc = new mongoose.models.User(input);
      await doc.validate();
      return doc;
    }),
  };
});

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
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:5173',
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

const { findUserByEmail } = require('../../modules/auth/auth.repository');
const authService = require('../../modules/auth/auth.service');
// Real leagues.repository — the League model billing.service holds a live
// reference to, so spies on it are seen by the service.
const { League } = require('../../modules/leagues/leagues.repository');
const { handleWebhookEvent } = require('../../modules/billing/billing.service');

const OWNER_ID = '64b7f0f0f0f0f0f0f0f0f0f0';

describe('canonical enum write paths (C1/C2 regression net)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('register() creates a user that passes the tightened User schema (C1)', async () => {
    findUserByEmail.mockResolvedValue(null);

    const result = await authService.register({
      email: 'new.user@example.com',
      name: 'New User',
      password: 'correct horse battery staple',
    });

    expect(result.user.email).toBe('new.user@example.com');
    expect(['starter', 'team_pro']).toContain(result.user.plan);
  });

  test('league checkout.session.completed provisions a League that passes the tightened schema (C2)', async () => {
    jest.spyOn(League, 'findOne').mockResolvedValue(null);
    const created = [];
    jest.spyOn(League, 'create').mockImplementation(async (payload) => {
      const doc = new League(payload);
      await doc.validate(); // real-schema full validation, as League.create runs
      created.push(doc);
      return doc;
    });

    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout_league_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          customer: 'cus_league_1',
          customer_details: { email: 'buyer@example.com' },
          metadata: {
            resourceType: 'league',
            ownerUserId: OWNER_ID,
            billingInterval: 'monthly',
          },
        },
      },
    });

    await handleWebhookEvent('sig', Buffer.from('{}'));

    expect(created).toHaveLength(1);
    expect(['starter', 'league']).toContain(created[0].plan);
    expect(created[0].billingSource).toBe('stripe');
  });
});
