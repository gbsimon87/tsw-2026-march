const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { env } = require('../../config/env');

function isGoogleOAuthConfigured() {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_CALLBACK_URL &&
    env.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com') &&
    !env.GOOGLE_CLIENT_ID.includes('://')
  );
}

function configureGoogleOAuth(passport) {
  if (!isGoogleOAuthConfigured()) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('Google account did not return an email'));
        }

        return done(null, {
          id: profile.id,
          email,
          name: profile.displayName || email.split('@')[0],
        });
      }
    )
  );
}

module.exports = {
  configureGoogleOAuth,
  isGoogleOAuthConfigured,
};
