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

// Mux game video (E5): creating a direct upload provisions billable provider
// media, so it gets its own tight budget. Mounted AFTER authMiddleware and
// keyed by the authenticated user (IP only as a fallback that should never be
// hit), so a club sharing one Wi-Fi does not share a budget and a user cannot
// rotate IPs past it. In-memory like the other limiters (single instance);
// the atomic per-League quota reservation in video.repository is the real
// guard (reserveUploadSlot). V17: only successful creates count — rejected
// requests (quota, policy, a Mux outage's 502) provision nothing, and counting
// them would lock a retrying manager out for the hour.
const videoUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.auth?.userId ? `user:${req.auth.userId}` : `ip:${req.ip}`),
  message: {
    error: {
      message: 'Too many video uploads started. Please try again later.',
      details: { reason: 'rate_limited' },
    },
  },
});

module.exports = {
  apiRateLimiter,
  authRecoveryLimiter,
  authCredentialLimiter,
  contactLimiter,
  checkoutLimiter,
  videoUploadLimiter,
};
