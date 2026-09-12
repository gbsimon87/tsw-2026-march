const {
  ANALYTICS_CONSENT_VERSION,
  ACCEPTED_HEADER,
  readAnalyticsConsent,
} = require('../../modules/analytics/analyticsConsent');

describe('analytics consent request context', () => {
  test('accepts only the exact current positive signal', () => {
    expect(readAnalyticsConsent({ headers: { 'x-analytics-consent': ACCEPTED_HEADER } })).toEqual({
      accepted: true,
      version: ANALYTICS_CONSENT_VERSION,
    });
  });

  test.each([
    undefined,
    'declined;version=2',
    'accepted;version=1',
    'accepted;version=2;extra=true',
  ])('fails closed for %p', (value) => {
    expect(readAnalyticsConsent({ headers: { 'x-analytics-consent': value } })).toEqual({
      accepted: false,
      version: ANALYTICS_CONSENT_VERSION,
    });
  });
});
