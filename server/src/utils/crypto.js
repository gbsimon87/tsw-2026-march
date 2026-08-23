const crypto = require('crypto');

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function parseEncryptionKey(hexKey) {
  if (typeof hexKey !== 'string' || !/^[a-fA-F0-9]{64}$/.test(hexKey)) {
    throw new Error('Encryption key must be a 32-byte hexadecimal value');
  }
  return Buffer.from(hexKey, 'hex');
}

function encryptSecret(plaintext, hexKey, { associatedData = '' } = {}) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Secret to encrypt must be a non-empty string');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', parseEncryptionKey(hexKey), iv);
  if (associatedData) cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(payload, hexKey, { associatedData = '' } = {}) {
  const parts = typeof payload === 'string' ? payload.split('.') : [];
  if (parts.length !== 3) throw new Error('Encrypted secret has an invalid format');

  try {
    const [iv, authTag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', parseEncryptionKey(hexKey), iv);
    if (associatedData) decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Encrypted secret could not be decrypted');
  }
}

module.exports = {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
};
