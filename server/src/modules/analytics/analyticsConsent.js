const ANALYTICS_CONSENT_VERSION = 2;
const ACCEPTED_HEADER = `accepted;version=${ANALYTICS_CONSENT_VERSION}`;

function readAnalyticsConsent(req) {
  return {
    accepted: req?.headers?.['x-analytics-consent'] === ACCEPTED_HEADER,
    version: ANALYTICS_CONSENT_VERSION,
  };
}

module.exports = {
  ANALYTICS_CONSENT_VERSION,
  ACCEPTED_HEADER,
  readAnalyticsConsent,
};
