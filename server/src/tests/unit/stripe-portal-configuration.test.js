const { matchesUpgradeConfiguration } = require('../../scripts/create-stripe-portal-configuration');

function configuration(overrides = {}) {
  return {
    active: true,
    default_return_url: 'https://thesportyway.com/pricing',
    features: {
      payment_method_update: { enabled: true },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        trial_update_behavior: 'continue_trial',
        products: [
          { product: 'prod_league', prices: ['price_league'] },
          { product: 'prod_league_plus', prices: ['price_league_plus'] },
        ],
      },
    },
    ...overrides,
  };
}

const expected = {
  returnUrl: 'https://thesportyway.com/pricing',
  leagueProducts: [
    { product: 'prod_league', prices: ['price_league'] },
    { product: 'prod_league_plus', prices: ['price_league_plus'] },
  ],
};

describe('Stripe upgrade Portal configuration', () => {
  test('accepts only the two League products and preserves an existing trial', () => {
    expect(matchesUpgradeConfiguration(configuration(), expected)).toBe(true);
  });

  test('rejects Stripe default behavior that ends a trial during an upgrade', () => {
    const candidate = configuration();
    candidate.features.subscription_update.trial_update_behavior = 'end_trial';

    expect(matchesUpgradeConfiguration(candidate, expected)).toBe(false);
  });

  test('rejects a broader Portal configuration with an extra product', () => {
    const candidate = configuration();
    candidate.features.subscription_update.products.push({
      product: 'prod_unrelated',
      prices: ['price_unrelated'],
    });

    expect(matchesUpgradeConfiguration(candidate, expected)).toBe(false);
  });
});
