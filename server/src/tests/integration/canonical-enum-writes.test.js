// Audit fix H9 (docs/stripe.md) — regression net for
// the canonical-enum write paths that shipped broken through a green suite (C1/C2).
//
// The existing tests mock the repositories, so a service writing a legacy plan
// value ('free'/'pro'/'team') into a schema tightened to canonical ids (T-26)
// never fails in CI. There is no in-memory Mongo in this repo's test infra, so
// this file runs the REAL Mongoose schemas' full document validation (which
// needs no DB connection) against the exact payloads the services write:
//   - auth.service register()            → User.create   (C1)
//   - billing createLeagueFromCheckout   → League.findOneAndUpdate upsert (C2)
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
    // register() issues a session on success; there is no DB here, so stub the
    // write. The schema assertion below is unaffected.
    upsertSession: jest.fn(),
    // register() also issues an email_verification token before sending the
    // welcome email. This file runs real schema validation with no DB
    // connection, and the token writes are not what it asserts on — stub them
    // so the User enum-validation path stays the only thing under test.
    createAuthToken: jest.fn(),
    invalidateTokensForUserByType: jest.fn(),
  };
});

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
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    // Needed since register() signs tokens; jwt.sign rejects an undefined expiresIn.
    ACCESS_TOKEN_TTL: '15m',
    REFRESH_TOKEN_TTL: '7d',
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

    const result = await authService.register(
      {
        email: 'new.user@example.com',
        name: 'New User',
        password: 'correct horse battery staple',
      },
      { userAgent: 'jest', ip: '127.0.0.1' }
    );

    expect(result.user.email).toBe('new.user@example.com');
    expect(result.user.plan).toBe('starter');
  });

  test('league checkout.session.completed provisions a League that passes the tightened schema (C2)', async () => {
    const created = [];
    jest.spyOn(League, 'findOneAndUpdate').mockImplementation(async (_filter, update) => {
      if (update.$setOnInsert) {
        const doc = new League(update.$setOnInsert);
        await doc.validate();
        created.push(doc);
      }
      return created[0] || null;
    });
    jest.spyOn(League.prototype, 'save').mockImplementation(async function save() {
      return this;
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
