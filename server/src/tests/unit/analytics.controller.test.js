// OPT-024: distinctId must come from the authenticated session, never from
// client-supplied body data — this is what stops an authenticated user's
// events from fragmenting under an arbitrary/spoofed distinctId.
jest.mock('../../modules/analytics/analytics.service', () => ({
  captureEvent: jest.fn().mockResolvedValue({ captured: true }),
}));

const analyticsService = require('../../modules/analytics/analytics.service');
const { capture } = require('../../modules/analytics/analytics.controller');

function buildRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('analytics controller capture (OPT-024)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('binds distinctId to the authenticated user, ignoring any client-supplied value', async () => {
    const req = {
      auth: { userId: 'user-real-123' },
      body: {
        event: 'clicked_button',
        distinctId: 'someone-elses-id',
        properties: { page: '/feed' },
      },
    };
    const res = buildRes();

    await capture(req, res);

    expect(analyticsService.captureEvent).toHaveBeenCalledWith({
      event: 'clicked_button',
      distinctId: 'user-real-123',
      properties: { page: '/feed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ captured: true });
  });

  test('works even when the client omits distinctId entirely', async () => {
    const req = {
      auth: { userId: 'user-real-456' },
      body: { event: 'viewed_page' },
    };
    const res = buildRes();

    await capture(req, res);

    expect(analyticsService.captureEvent).toHaveBeenCalledWith({
      event: 'viewed_page',
      distinctId: 'user-real-456',
    });
  });
});
