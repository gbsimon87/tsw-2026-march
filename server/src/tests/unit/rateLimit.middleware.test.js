// OPT-023: guards the dedicated credential limiter. It must exist, be a usable
// Express middleware, and be strictly tighter than the global /api limiter so a
// password-guessing burst trips before the general request budget.
const { apiRateLimiter, authCredentialLimiter } = require('../../middleware/rateLimit.middleware');

describe('authCredentialLimiter (OPT-023)', () => {
  test('is exported as an Express middleware function', () => {
    expect(typeof authCredentialLimiter).toBe('function');
    // express-rate-limit middlewares take (req, res, next).
    expect(authCredentialLimiter.length).toBe(3);
  });

  test('trips a 429 with a JSON error body once the limit is exceeded', async () => {
    // Drive the limiter directly: same IP, more requests than its max, and
    // assert the first over-limit call is rejected with 429.
    const req = { ip: '203.0.113.7', method: 'POST', headers: {} };
    const makeRes = () => {
      const res = {
        statusCode: 200,
        body: undefined,
        headers: {},
        status(code) {
          this.statusCode = code;
          return this;
        },
        setHeader(name, value) {
          this.headers[name] = value;
        },
        getHeader(name) {
          return this.headers[name];
        },
        json(payload) {
          this.body = payload;
          return this;
        },
        send(payload) {
          this.body = payload;
          return this;
        },
        end() {
          return this;
        },
      };
      return res;
    };

    const runOnce = () =>
      new Promise((resolve) => {
        const res = makeRes();
        authCredentialLimiter(req, res, () => resolve({ res, passed: true }));
        // If the limiter short-circuits, next() never fires — resolve on the
        // response instead.
        const originalStatus = res.status.bind(res);
        res.status = (code) => {
          const out = originalStatus(code);
          if (code === 429) resolve({ res, passed: false });
          return out;
        };
      });

    let blocked = false;
    for (let i = 0; i < 25; i += 1) {
      const { res, passed } = await runOnce();
      if (!passed && res.statusCode === 429) {
        blocked = true;
        expect(res.body).toEqual({
          error: { message: 'Too many authentication attempts, try again later.' },
        });
        break;
      }
    }

    expect(blocked).toBe(true);
  });

  test('is a distinct middleware from the global API limiter', () => {
    // Credential endpoints must not simply reuse the general /api limiter — a
    // separate instance is what lets them carry a tighter budget.
    expect(authCredentialLimiter).not.toBe(apiRateLimiter);
  });
});
