const { env } = require('./env');

const isProduction = env.NODE_ENV === 'production';

function cookieBase() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

function accessCookieOptions() {
  return {
    ...cookieBase(),
    maxAge: 15 * 60 * 1000,
    path: '/',
  };
}

function refreshCookieOptions() {
  return {
    ...cookieBase(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  };
}

function csrfSecretCookieOptions() {
  return {
    ...cookieBase(),
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function csrfTokenCookieOptions() {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  };
}

module.exports = {
  accessCookieOptions,
  refreshCookieOptions,
  csrfSecretCookieOptions,
  csrfTokenCookieOptions,
};
