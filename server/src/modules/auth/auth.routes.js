const { Router } = require('express');
const passport = require('passport');
const multer = require('multer');
const { asyncHandler } = require('../../utils/asyncHandler');
const controller = require('./auth.controller');
const { authMiddleware } = require('../../middleware/auth.middleware');
const {
  authRecoveryLimiter,
  authCredentialLimiter,
} = require('../../middleware/rateLimit.middleware');
const { env } = require('../../config/env');
const { isGoogleOAuthConfigured } = require('./oauth.google');

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.TEAM_LOGO_MAX_BYTES, files: 1 },
});

const authRouter = Router();
const primaryClientOrigin = env.CLIENT_ORIGIN.split(',')[0].trim();
const googleAuthEnabled = isGoogleOAuthConfigured();

authRouter.post('/register', authCredentialLimiter, asyncHandler(controller.register));
authRouter.post('/login', authCredentialLimiter, asyncHandler(controller.login));
authRouter.post('/refresh', authCredentialLimiter, asyncHandler(controller.refresh));
authRouter.post('/logout', asyncHandler(controller.logout));
authRouter.get('/me', authMiddleware, asyncHandler(controller.me));
authRouter.post(
  '/avatar',
  authMiddleware,
  avatarUpload.single('avatar'),
  asyncHandler(controller.uploadAvatar)
);
authRouter.post(
  '/request-verification',
  authRecoveryLimiter,
  asyncHandler(controller.requestVerification)
);
authRouter.post('/verify-email', authRecoveryLimiter, asyncHandler(controller.verifyEmail));
authRouter.post('/forgot-password', authRecoveryLimiter, asyncHandler(controller.forgotPassword));
authRouter.post('/reset-password', authRecoveryLimiter, asyncHandler(controller.resetPassword));

if (googleAuthEnabled) {
  authRouter.post('/google/exchange', asyncHandler(controller.googleExchange));

  authRouter.get(
    '/google/start',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      prompt: 'select_account',
    })
  );

  authRouter.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: `${primaryClientOrigin}/login`,
      session: false,
    }),
    asyncHandler(controller.googleCallback)
  );
} else {
  authRouter.get('/google/start', (req, res) => {
    void req;
    res.redirect(`${primaryClientOrigin}/login?oauthError=google_unavailable`);
  });

  authRouter.get('/google/callback', (req, res) => {
    void req;
    res.redirect(`${primaryClientOrigin}/login?oauthError=google_unavailable`);
  });
}

module.exports = {
  authRouter,
};
