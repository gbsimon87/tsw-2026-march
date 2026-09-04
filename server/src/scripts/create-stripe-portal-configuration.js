// Creates the two Stripe Customer Portal configurations used by the app.
// The ordinary portal can update payment methods, show invoices, and schedule
// cancellation, but cannot switch plans. A separate configuration is used only
// for the app's explicit League Plus upgrade confirmation flow.
//
// Safe to rerun: an exact existing configuration is reused.

const path = require('path');
const { createHash } = require('crypto');
const dotenv = require('dotenv');
const Stripe = require('stripe');

dotenv.config({
  path: process.env.ENV_FILE || path.resolve(process.cwd(), '../env/server/.env.development'),
});

const EXPECTED_PRICES = [
  { envName: 'STRIPE_PRICE_ID_ADDITIONAL_TEAM', amount: 500 },
  { envName: 'STRIPE_PRICE_ID_LEAGUE', amount: 2900 },
  { envName: 'STRIPE_PRICE_ID_LEAGUE_PLUS', amount: 4900 },
];

function required(name, pattern) {
  const value = process.env[name];
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} is missing or has the wrong format`);
  }
  return value;
}

function productId(price) {
  return typeof price.product === 'string' ? price.product : price.product?.id;
}

function sameStringSet(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function matchesBaseConfiguration(configuration, returnUrl) {
  const update = configuration.features?.subscription_update;
  return (
    configuration.active !== false &&
    configuration.default_return_url === returnUrl &&
    configuration.features?.invoice_history?.enabled === true &&
    configuration.features?.payment_method_update?.enabled === true &&
    configuration.features?.subscription_cancel?.enabled === true &&
    configuration.features?.subscription_cancel?.mode === 'at_period_end' &&
    update?.enabled === false
  );
}

function matchesUpgradeConfiguration(configuration, { returnUrl, leagueProducts }) {
  const update = configuration.features?.subscription_update;
  const configuredProducts = (update?.products || []).map((entry) => ({
    product: typeof entry.product === 'string' ? entry.product : entry.product?.id,
    prices: (entry.prices || []).map((price) => (typeof price === 'string' ? price : price.id)),
  }));

  return (
    configuration.active !== false &&
    configuration.default_return_url === returnUrl &&
    configuration.features?.payment_method_update?.enabled === true &&
    update?.enabled === true &&
    sameStringSet(update.default_allowed_updates || [], ['price']) &&
    leagueProducts.every((expected) =>
      configuredProducts.some(
        (actual) =>
          actual.product === expected.product && sameStringSet(actual.prices, expected.prices)
      )
    )
  );
}

async function main() {
  const secretKey = required('STRIPE_SECRET_KEY', /^(sk|rk)_(test|live)_/);
  const successUrl = required('STRIPE_SUCCESS_URL', /^https?:\/\//);
  const keyMode = secretKey.match(/^(?:sk|rk)_(test|live)_/)?.[1];
  const appEnv = process.env.APP_ENV || 'development';
  if (appEnv === 'development' && keyMode !== 'test') {
    throw new Error('Development portal setup must use a Stripe test key');
  }
  if (appEnv === 'production' && keyMode !== 'live') {
    throw new Error('Production portal setup must use a Stripe live key');
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2026-06-24.dahlia' });
  const prices = new Map();
  for (const expected of EXPECTED_PRICES) {
    const priceId = required(expected.envName, /^price_/);
    const price = await stripe.prices.retrieve(priceId);
    if (
      price.active !== true ||
      price.type !== 'recurring' ||
      price.recurring?.interval !== 'month' ||
      price.recurring?.interval_count !== 1 ||
      price.currency !== 'gbp' ||
      price.unit_amount !== expected.amount
    ) {
      throw new Error(
        `${expected.envName} must be the active £${expected.amount / 100} GBP monthly Price`
      );
    }
    if (!productId(price)) throw new Error(`${expected.envName} has no Stripe Product`);
    prices.set(expected.envName, price);
  }

  const productIds = EXPECTED_PRICES.map((entry) => productId(prices.get(entry.envName)));
  if (new Set(productIds).size !== productIds.length) {
    throw new Error('Additional Team, League, and League Plus must use separate Stripe Products');
  }

  const returnUrl = new URL('/pricing', successUrl).toString();
  const leagueProducts = ['STRIPE_PRICE_ID_LEAGUE', 'STRIPE_PRICE_ID_LEAGUE_PLUS'].map(
    (envName) => ({
      product: productId(prices.get(envName)),
      prices: [prices.get(envName).id],
    })
  );

  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  let baseConfiguration = existing.data.find((configuration) =>
    matchesBaseConfiguration(configuration, returnUrl)
  );
  if (!baseConfiguration) {
    baseConfiguration = await stripe.billingPortal.configurations.create(
      {
        name: 'TSW billing management',
        default_return_url: returnUrl,
        business_profile: { headline: 'Manage your TSW billing' },
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: 'at_period_end' },
        },
      },
      {
        idempotencyKey: `tsw_portal_base_${createHash('sha256')
          .update(`${keyMode}:${returnUrl}`)
          .digest('hex')}`,
      }
    );
  }

  let upgradeConfiguration = existing.data.find((configuration) =>
    matchesUpgradeConfiguration(configuration, { returnUrl, leagueProducts })
  );
  if (!upgradeConfiguration) {
    upgradeConfiguration = await stripe.billingPortal.configurations.create(
      {
        name: 'TSW League Plus upgrade',
        default_return_url: returnUrl,
        business_profile: { headline: 'Confirm your TSW League Plus upgrade' },
        features: {
          payment_method_update: { enabled: true },
          subscription_update: {
            enabled: true,
            default_allowed_updates: ['price'],
            proration_behavior: 'always_invoice',
            products: leagueProducts.map((entry) => ({
              ...entry,
              adjustable_quantity: { enabled: false },
            })),
          },
        },
      },
      {
        idempotencyKey: `tsw_portal_upgrade_v2_${createHash('sha256')
          .update(
            `${keyMode}:${returnUrl}:${leagueProducts.map((entry) => entry.prices[0]).join(':')}`
          )
          .digest('hex')}`,
      }
    );
  }

  console.log(`STRIPE_PORTAL_CONFIGURATION_ID=${baseConfiguration.id}`);
  console.log(`STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=${upgradeConfiguration.id}`);
}

main().catch((error) => {
  console.error(`Customer Portal setup failed: ${error.message}`);
  process.exitCode = 1;
});
