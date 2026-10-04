const crypto = require('crypto');

/**
 * Thrown by verifyMuxSignature on any failure; the controller maps it to 400.
 * `reason` is one of: missing, missing_secret, invalid_body, malformed,
 * stale, future, mismatch. Never include header/secret/body in logs.
 */
class MuxSignatureError extends Error {
  constructor(reason) {
    super(`Invalid Mux webhook signature (${reason})`);
    this.name = 'MuxSignatureError';
    this.reason = reason;
  }
}

const TIMESTAMP_RE = /^\d+$/;
const V1_RE = /^[0-9a-f]{64}$/;

function parseHeader(header) {
  let timestamp;
  const v1 = [];
  for (const part of String(header).split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) throw new MuxSignatureError('malformed');
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') {
      if (timestamp !== undefined || !TIMESTAMP_RE.test(value))
        throw new MuxSignatureError('malformed');
      timestamp = Number(value);
      if (!Number.isSafeInteger(timestamp)) throw new MuxSignatureError('malformed');
    } else if (key === 'v1') {
      if (!V1_RE.test(value)) throw new MuxSignatureError('malformed');
      v1.push(value);
    }
    // Other schemes (e.g. future v2) are ignored.
  }
  if (timestamp === undefined || v1.length === 0) throw new MuxSignatureError('malformed');
  return { timestamp, v1 };
}

/**
 * Verify a Mux-Signature header: "t=<unix s>,v1=<hex HMAC-SHA256(`${t}.` + rawBody)>[,v1=...]".
 * rawBody must be the exact request bytes (Buffer from express.raw).
 * Returns { timestamp } on success, throws MuxSignatureError otherwise.
 */
function verifyMuxSignature(
  rawBody,
  header,
  secret,
  { toleranceSeconds = 300, now = Date.now() } = {}
) {
  if (!header) throw new MuxSignatureError('missing');
  if (!secret) throw new MuxSignatureError('missing_secret');
  if (!Buffer.isBuffer(rawBody)) throw new MuxSignatureError('invalid_body');

  const { timestamp, v1 } = parseHeader(header);
  const nowSeconds = Math.floor(now / 1000);
  if (nowSeconds - timestamp > toleranceSeconds) throw new MuxSignatureError('stale');
  if (timestamp - nowSeconds > toleranceSeconds) throw new MuxSignatureError('future');

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  // Compare every candidate (no early exit) so timing does not leak which matched.
  let matched = false;
  for (const candidate of v1) {
    if (crypto.timingSafeEqual(expected, Buffer.from(candidate, 'hex'))) matched = true;
  }
  if (!matched) throw new MuxSignatureError('mismatch');
  return { timestamp };
}

module.exports = { MuxSignatureError, verifyMuxSignature };
