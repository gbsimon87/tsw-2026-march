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

module.exports = {
  apiRateLimiter,
  authRecoveryLimiter,
};
