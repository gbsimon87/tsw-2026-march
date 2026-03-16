describe('google oauth config', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('treats malformed client ids as unavailable', () => {
    jest.doMock('../../config/env', () => ({
      env: {
        GOOGLE_CLIENT_ID: 'http://broken-client-id.apps.googleusercontent.com/',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:4000/api/v1/auth/google/callback',
      },
    }));

    const { isGoogleOAuthConfigured } = require('../../modules/auth/oauth.google');

    expect(isGoogleOAuthConfigured()).toBe(false);
  });

  test('accepts valid google oauth config', () => {
    jest.doMock('../../config/env', () => ({
      env: {
        GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:4000/api/v1/auth/google/callback',
      },
    }));

    const { isGoogleOAuthConfigured } = require('../../modules/auth/oauth.google');

    expect(isGoogleOAuthConfigured()).toBe(true);
  });
});
