const { randomUUID } = require('crypto');
const { sha256 } = require('../utils/crypto');

function createSessionPayload(userId) {
  const sessionId = randomUUID();
  return {
    sub: String(userId),
    sid: sessionId,
  };
}

function hashRefreshToken(token) {
  return sha256(token);
}

module.exports = {
  createSessionPayload,
  hashRefreshToken,
};
