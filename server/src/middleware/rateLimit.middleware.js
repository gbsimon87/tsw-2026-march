const rateLimit = require('express-rate-limit');

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests, try again later.',
    },
  },
});

const authRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many auth recovery attempts, try again later.',
    },
  },
});

// OPT-023: dedicated limiter for credential endpoints (login/register/refresh).
// Tighter than the global /api limiter (300/15min) so password guessing and
// token-refresh abuse trip a bound well before the general budget. Keyed by IP
// (single-instance; a shared store is future work — see OPT-023 notes).
const authCredentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many authentication attempts, try again later.',
    },
  },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many messages sent. Please try again in an hour.',
    },
  },
});

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many checkout attempts, try again later.',
    },
  },
});

module.exports = {
  apiRateLimiter,
  authRecoveryLimiter,
  authCredentialLimiter,
  contactLimiter,
  checkoutLimiter,
};
