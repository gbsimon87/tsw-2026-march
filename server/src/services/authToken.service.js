const crypto = require('crypto');
const { env } = require('../config/env');
const { sha256 } = require('../utils/crypto');

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashAuthToken(rawToken) {
  return sha256(rawToken);
}

function buildTokenExpiry(type) {
  const now = Date.now();
  const ttlMinutes =
    type === 'email_verification' ? env.EMAIL_VERIFY_TTL_MINUTES : env.PASSWORD_RESET_TTL_MINUTES;
  return new Date(now + ttlMinutes * 60 * 1000);
}

module.exports = {
  generateRawToken,
  hashAuthToken,
  buildTokenExpiry,
};
