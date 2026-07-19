// Server-side redirect safety for Stripe-hosted URLs. Stripe returns Checkout and
// Billing Portal URLs we redirect the user to; validate host + scheme before handing
// one back so a tampered or misconfigured response can't bounce users to an arbitrary
// origin. Mirrors the client guard in PricingPage.jsx (T-09).
const { ApiError } = require('./apiError');

const ALLOWED_HOSTS = new Set(['checkout.stripe.com', 'billing.stripe.com']);

function isSafeStripeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// Returns the url when safe; throws ApiError(502) otherwise (the failure is a
// server/Stripe misconfiguration, not client input).
function assertSafeStripeUrl(url) {
  if (!isSafeStripeUrl(url)) {
    throw new ApiError(502, 'Received an unexpected billing redirect URL');
  }
  return url;
}

module.exports = { isSafeStripeUrl, assertSafeStripeUrl };
