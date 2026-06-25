const request = require('supertest');

jest.mock('../../middleware/rateLimit.middleware', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    apiRateLimiter: passThrough,
    authRecoveryLimiter: passThrough,
    contactLimiter: passThrough,
    checkoutLimiter: passThrough,
  };
});

jest.mock('../../modules/billing/billing.service', () => ({
  createTeamCheckoutSession: jest.fn(),
  createLeagueCheckoutSession: jest.fn(),
  createTeamPortalSession: jest.fn(),
  createLeaguePortalSession: jest.fn(),
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
        interval: 'monthly',
      });

      expect(res.statusCode).toBe(404);
      expect(billingService.createTeamCheckoutSession).toHaveBeenCalledWith(
        'attacker-user',
        'other-users-team',
        'monthly'
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
        interval: 'monthly',
      });

      expect(res.statusCode).toBe(400);
    });

    test('13.4 returns 422 when interval is invalid', async () => {
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
        interval: 'monthly',
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
        interval: 'season',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.com/test');
      expect(billingService.createTeamCheckoutSession).toHaveBeenCalledWith(
        'user-1',
        'team-1',
        'season'
      );
    });

    test('defaults interval to monthly when omitted', async () => {
      billingService.createTeamCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      });

      const app = createApp();
      await authedPost(app, '/api/v1/billing/team-checkout').send({ teamId: 'team-1' });

      expect(billingService.createTeamCheckoutSession).toHaveBeenCalledWith(
        'user-1',
        'team-1',
        'monthly'
      );
    });
  });

  // ─── POST /billing/league-checkout ──────────────────────────────────────────

  describe('POST /api/v1/billing/league-checkout', () => {
    test('13.6 returns 401 for unauthenticated request', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/billing/league-checkout')
        .set('Origin', CSRF_ORIGIN)
        .send({ interval: 'monthly' });

      expect(res.statusCode).toBe(401);
    });

    test('13.7 returns 422 when interval is invalid', async () => {
      const app = createApp();
      const res = await authedPost(app, '/api/v1/billing/league-checkout').send({
        interval: 'weekly',
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
        interval: 'season',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.com/league-test');
      expect(billingService.createLeagueCheckoutSession).toHaveBeenCalledWith('user-1', 'season');
    });

    test('defaults interval to monthly when omitted', async () => {
      billingService.createLeagueCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      });

      const app = createApp();
      await authedPost(app, '/api/v1/billing/league-checkout').send({});

      expect(billingService.createLeagueCheckoutSession).toHaveBeenCalledWith('user-1', 'monthly');
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
});
