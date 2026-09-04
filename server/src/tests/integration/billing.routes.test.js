const request = require('supertest');

jest.mock('../../middleware/rateLimit.middleware', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    apiRateLimiter: passThrough,
    authRecoveryLimiter: passThrough,
    authCredentialLimiter: passThrough,
    contactLimiter: passThrough,
    checkoutLimiter: passThrough,
  };
});

jest.mock('../../modules/billing/billing.service', () => ({
  createTeamCheckoutSession: jest.fn(),
  createLeagueCheckoutSession: jest.fn(),
  createTeamPortalSession: jest.fn(),
  createLeaguePortalSession: jest.fn(),
  changeLeaguePlan: jest.fn(),
  chooseFreeTeam: jest.fn(),
  getCheckoutStatus: jest.fn(),
  handleWebhookEvent: jest.fn(),
  // legacy aliases
  createCheckoutSession: jest.fn(),
  createCustomerPortalSession: jest.fn(),
}));

const billingService = require('../../modules/billing/billing.service');
const { createApp } = require('../../app');
const { signAccessToken } = require('../../services/token.service');

const CSRF_ORIGIN = 'http://localhost:5173';

function authHeader(userId = 'user-1') {
  const token = signAccessToken({ sub: userId, sid: 'session-1' });
  return `Bearer ${token}`;
}

function authedPost(app, path, userId = 'user-1') {
  return request(app)
    .post(path)
    .set('Authorization', authHeader(userId))
    .set('Origin', CSRF_ORIGIN);
}

describe('billing routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/billing/checkout-status', () => {
    test('requires authentication and validates the Checkout Session ID', async () => {
      const app = createApp();
      const unauthenticated = await request(app).get(
        '/api/v1/billing/checkout-status?sessionId=cs_test_abc123'
      );
      expect(unauthenticated.statusCode).toBe(401);

      const invalid = await request(app)
        .get('/api/v1/billing/checkout-status?sessionId=not-a-session')
        .set('Authorization', authHeader());
      expect(invalid.statusCode).toBe(400);
      expect(billingService.getCheckoutStatus).not.toHaveBeenCalled();
    });

    test('returns only the authenticated owner checkout status', async () => {
      billingService.getCheckoutStatus.mockResolvedValue({
        resourceType: 'team',
        checkoutStatus: 'complete',
        paymentStatus: 'paid',
        resource: { id: 'team-1' },
      });
      const app = createApp();
      const res = await request(app)
        .get('/api/v1/billing/checkout-status?sessionId=cs_test_abc123')
        .set('Authorization', authHeader('user-1'));

      expect(res.statusCode).toBe(200);
      expect(billingService.getCheckoutStatus).toHaveBeenCalledWith('user-1', 'cs_test_abc123');
    });
  });

  // ─── POST /billing/team-checkout ────────────────────────────────────────────

  describe('POST /api/v1/billing/team-checkout', () => {
    test('13.1 returns 401 for unauthenticated request', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/billing/team-checkout')
        .set('Origin', CSRF_ORIGIN)
        .send({ teamId: 'team-1', interval: 'monthly' });

      expect(res.statusCode).toBe(401);
    });

    test('13.2 returns 404 when teamId belongs to another user (IDOR)', async () => {
      const { ApiError } = require('../../utils/apiError');
      billingService.createTeamCheckoutSession.mockRejectedValue(
        new ApiError(404, 'Team not found')
      );

      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/team-checkout', 'attacker-user').send({
        teamId: 'other-users-team',
      });

      expect(res.statusCode).toBe(404);
      expect(billingService.createTeamCheckoutSession).toHaveBeenCalledWith(
        'attacker-user',
        'other-users-team'
      );
    });

    test('13.3 returns 400 when team already has active subscription', async () => {
      const { ApiError } = require('../../utils/apiError');
      billingService.createTeamCheckoutSession.mockRejectedValue(
        new ApiError(400, 'Team already has an active subscription')
      );

      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/team-checkout').send({
        teamId: 'team-1',
      });

      expect(res.statusCode).toBe(400);
    });

    test('13.4 rejects retired interval fields', async () => {
      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/team-checkout').send({
        teamId: 'team-1',
        interval: 'quarterly',
      });

      expect(res.statusCode).toBe(400);
      expect(billingService.createTeamCheckoutSession).not.toHaveBeenCalled();
    });

    test('13.5 returns 503 when Stripe not configured', async () => {
      const { ApiError } = require('../../utils/apiError');
      billingService.createTeamCheckoutSession.mockRejectedValue(
        new ApiError(503, 'Billing is not configured')
      );

      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/team-checkout').send({
        teamId: 'team-1',
      });

      expect(res.statusCode).toBe(503);
    });

    test('returns 200 with checkout url on success', async () => {
      billingService.createTeamCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      });

      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/team-checkout').send({
        teamId: 'team-1',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.com/test');
      expect(billingService.createTeamCheckoutSession).toHaveBeenCalledWith('user-1', 'team-1');
    });

    test('additional-team checkout needs only the team ID', async () => {
      billingService.createTeamCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      });

      const app = createApp();
      await authedPost(app, '/api/v1/billing/team-checkout').send({ teamId: 'team-1' });

      expect(billingService.createTeamCheckoutSession).toHaveBeenCalledWith('user-1', 'team-1');
    });
  });

  // ─── POST /billing/league-checkout ──────────────────────────────────────────

  describe('POST /api/v1/billing/league-checkout', () => {
    test('13.6 returns 401 for unauthenticated request', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/billing/league-checkout')
        .set('Origin', CSRF_ORIGIN)
        .send({ planId: 'league' });

      expect(res.statusCode).toBe(401);
    });

    test('13.7 rejects an unknown League plan', async () => {
      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/league-checkout').send({
        planId: 'weekly',
      });

      expect(res.statusCode).toBe(400);
      expect(billingService.createLeagueCheckoutSession).not.toHaveBeenCalled();
    });

    test('returns 200 with checkout url on success', async () => {
      billingService.createLeagueCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/league-test',
      });

      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/league-checkout').send({
        planId: 'league_plus',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.com/league-test');
      expect(billingService.createLeagueCheckoutSession).toHaveBeenCalledWith(
        'user-1',
        'league_plus',
        undefined
      );
    });

    test('defaults to the League plan when omitted', async () => {
      billingService.createLeagueCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      });

      const app = createApp();
      await authedPost(app, '/api/v1/billing/league-checkout').send({});

      expect(billingService.createLeagueCheckoutSession).toHaveBeenCalledWith(
        'user-1',
        'league',
        undefined
      );
    });

    test('passes an existing canceled League ID for re-subscription', async () => {
      billingService.createLeagueCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/league-test',
      });
      const app = createApp();
      await authedPost(app, '/api/v1/billing/league-checkout').send({
        planId: 'league',
        leagueId: 'league-canceled',
      });

      expect(billingService.createLeagueCheckoutSession).toHaveBeenCalledWith(
        'user-1',
        'league',
        'league-canceled'
      );
    });
  });

  describe('capacity and League plan changes', () => {
    test('switches the one free standalone team', async () => {
      billingService.chooseFreeTeam.mockResolvedValue({
        team: { capacityType: 'free', canManage: true },
      });
      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/free-team').send({ teamId: 'team-2' });

      expect(res.statusCode).toBe(200);
      expect(billingService.chooseFreeTeam).toHaveBeenCalledWith('user-1', 'team-2');
    });

    test('passes a League tier change to the owned-resource service', async () => {
      billingService.changeLeaguePlan.mockResolvedValue({
        change: 'upgrade',
        url: 'https://billing.stripe.com/test',
      });
      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/league-plan-change').send({
        leagueId: 'league-1',
        planId: 'league_plus',
      });

      expect(res.statusCode).toBe(200);
      expect(billingService.changeLeaguePlan).toHaveBeenCalledWith(
        'user-1',
        'league-1',
        'league_plus'
      );
    });
  });

  // ─── POST /billing/webhooks ──────────────────────────────────────────────────

  describe('POST /api/v1/billing/webhooks', () => {
    test('13.8 returns 400 for invalid webhook signature', async () => {
      const { ApiError } = require('../../utils/apiError');
      billingService.handleWebhookEvent.mockRejectedValue(
        new ApiError(400, 'Invalid webhook signature')
      );

      const app = createApp();
      const res = await request(app)
        .post('/api/v1/billing/webhooks')
        .set('stripe-signature', 'bad-sig')
        .send('raw-body');

      expect(res.statusCode).toBe(400);
    });

    test('13.9 returns 200 for valid webhook event', async () => {
      billingService.handleWebhookEvent.mockResolvedValue({ received: true });

      const app = createApp();
      const res = await request(app)
        .post('/api/v1/billing/webhooks')
        .set('stripe-signature', 'valid-sig')
        .send('raw-body');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    test('13.10 is idempotent — same event replayed returns 200 each time', async () => {
      billingService.handleWebhookEvent.mockResolvedValue({ received: true });

      const app = createApp();
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/api/v1/billing/webhooks')
          .set('stripe-signature', 'valid-sig')
          .send('raw-body');
        expect(res.statusCode).toBe(200);
      }
      expect(billingService.handleWebhookEvent).toHaveBeenCalledTimes(10);
    });

    test('13.11 returns 200 for unknown event type without mutating state', async () => {
      billingService.handleWebhookEvent.mockResolvedValue({ received: true });

      const app = createApp();
      const res = await request(app)
        .post('/api/v1/billing/webhooks')
        .set('stripe-signature', 'valid-sig')
        .send('unknown-event-body');

      expect(res.statusCode).toBe(200);
    });

    test('13.12 returns 200 for league subscription webhook', async () => {
      billingService.handleWebhookEvent.mockResolvedValue({ received: true });

      const app = createApp();
      const res = await request(app)
        .post('/api/v1/billing/webhooks')
        .set('stripe-signature', 'valid-sig')
        .send(
          JSON.stringify({
            type: 'customer.subscription.created',
            metadata: { resourceType: 'league' },
          })
        );

      expect(res.statusCode).toBe(200);
      expect(billingService.handleWebhookEvent).toHaveBeenCalled();
    });
  });

  // ─── POST /billing/customer-portal ──────────────────────────────────────────

  describe('POST /api/v1/billing/customer-portal', () => {
    test('returns 401 for unauthenticated request', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/billing/customer-portal')
        .set('Origin', CSRF_ORIGIN)
        .send({ teamId: 'team-1' });

      expect(res.statusCode).toBe(401);
    });

    test('returns 422 when neither teamId nor leagueId provided', async () => {
      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/customer-portal').send({});

      expect(res.statusCode).toBe(400);
    });

    test('routes to team portal when teamId provided', async () => {
      billingService.createTeamPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/team-portal',
      });

      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/customer-portal').send({
        teamId: 'team-1',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.url).toBe('https://billing.stripe.com/team-portal');
      expect(billingService.createTeamPortalSession).toHaveBeenCalledWith('user-1', 'team-1');
    });

    test('routes to league portal when leagueId provided', async () => {
      billingService.createLeaguePortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/league-portal',
      });

      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/customer-portal').send({
        leagueId: 'league-1',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.url).toBe('https://billing.stripe.com/league-portal');
      expect(billingService.createLeaguePortalSession).toHaveBeenCalledWith('user-1', 'league-1');
    });
  });

  // ─── Legacy /billing/checkout-session ───────────────────────────────────────

  describe('POST /api/v1/billing/checkout-session (legacy)', () => {
    test('still works for backward compatibility', async () => {
      // legacy route calls createTeamCheckoutSession internally
      billingService.createTeamCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/legacy',
      });

      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/checkout-session').send({
        teamId: 'team-1',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.com/legacy');
    });
  });

  // ─── GET /billing/catalog (public served catalog) ───────────────────────────

  describe('GET /api/v1/billing/catalog', () => {
    test('returns the display catalog without auth', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/billing/catalog');

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.plans)).toBe(true);
      const ids = res.body.plans.map((p) => p.id).sort();
      expect(ids).toEqual(['league', 'league_plus', 'starter', 'team_extra']);
    });

    test('never leaks Stripe price IDs to the client', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/billing/catalog');

      expect(JSON.stringify(res.body)).not.toContain('price_');
      expect(JSON.stringify(res.body)).not.toContain('STRIPE_PRICE_ID');
    });
  });
});
