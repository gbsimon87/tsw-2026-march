const { v4: uuidv4 } = require('uuid');
const { sha256 } = require('../utils/crypto');

function createSessionPayload(userId) {
  const sessionId = uuidv4();
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
