// T-09: server-side redirect safety. Mirrors the client check
// (PricingPage.jsx isSafeStripeUrl) so a tampered/misconfigured Stripe response can't
// bounce a user to an arbitrary host. assertSafeStripeUrl throws ApiError(502).
const { isSafeStripeUrl, assertSafeStripeUrl } = require('../../utils/stripeUrl');

describe('isSafeStripeUrl', () => {
  it('accepts https Stripe Checkout and Billing Portal hosts', () => {
    expect(isSafeStripeUrl('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(true);
    expect(isSafeStripeUrl('https://billing.stripe.com/p/session/abc')).toBe(true);
  });

  it('rejects non-https schemes', () => {
    expect(isSafeStripeUrl('http://checkout.stripe.com/c/pay/cs')).toBe(false);
  });

  it('rejects non-Stripe hosts', () => {
    expect(isSafeStripeUrl('https://evil.com/phish')).toBe(false);
    expect(isSafeStripeUrl('https://checkout.stripe.com.evil.com/c')).toBe(false);
  });

  it('rejects missing or malformed input', () => {
    expect(isSafeStripeUrl(undefined)).toBe(false);
    expect(isSafeStripeUrl('')).toBe(false);
    expect(isSafeStripeUrl('not a url')).toBe(false);
  });
});

describe('assertSafeStripeUrl', () => {
  it('returns the url when safe', () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_test_123';
    expect(assertSafeStripeUrl(url)).toBe(url);
  });

  it('throws ApiError(502) when unsafe', () => {
    expect(() => assertSafeStripeUrl('https://evil.com')).toThrow(
      expect.objectContaining({ statusCode: 502 })
    );
  });
});
