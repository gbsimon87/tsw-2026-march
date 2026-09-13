const { corsOptions } = require('../../config/cors');

describe('CORS configuration', () => {
  // Regression: the browser sends `x-analytics-consent` on every request once a
  // visitor accepts analytics. It was added to the API client without being
  // added here, so the preflight rejected it and EVERY authenticated API call
  // failed for consenting users — analytics consent broke the whole product.
  test('allows every custom request header the client actually sends', () => {
    for (const header of ['Content-Type', 'Authorization', 'x-csrf-token', 'x-analytics-consent']) {
      expect(corsOptions.allowedHeaders).toContain(header);
    }
  });

  test('still exposes the CSRF token back to the browser', () => {
    expect(corsOptions.exposedHeaders).toContain('x-csrf-token');
  });
});
