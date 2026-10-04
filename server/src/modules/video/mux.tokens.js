const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');

const MUX_AUDIENCE = { video: 'v', thumbnail: 't', storyboard: 's' };

// Claims set by this module; callers may never supply them.
const RESERVED_CLAIMS = new Set(['sub', 'aud', 'exp', 'kid', 'iat', 'nbf', 'iss']);

// Non-reserved claims Mux documents for signed playback
// (https://www.mux.com/docs/guides/secure-video-playback):
//  - asset_start_time / asset_end_time: instant-clip window on the video audience
//  - time: thumbnail frame; width/height/rotate/fit_mode/flip_v/flip_h: thumbnail
//    transforms. Tokens carry these because signed URLs must not accept
//    unsigned query overrides.
const ALLOWED_CLAIMS = new Set([
  'asset_start_time',
  'asset_end_time',
  'time',
  'width',
  'height',
  'rotate',
  'fit_mode',
  'flip_v',
  'flip_h',
]);

/**
 * Sign a Mux playback/thumbnail/storyboard JWT (RS256).
 * The caller owns the lifetime (`ttlSeconds`, positive integer); this module
 * hard-codes no TTL. Throws on reserved/unknown claims or invalid input.
 */
function signPlaybackToken({ playbackId, audience, ttlSeconds, claims = {}, now = Date.now() }) {
  if (!playbackId || typeof playbackId !== 'string') throw new Error('playbackId is required');
  if (!Object.values(MUX_AUDIENCE).includes(audience))
    throw new Error('Unknown Mux token audience');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('ttlSeconds must be a positive integer');
  }
  for (const key of Object.keys(claims)) {
    if (RESERVED_CLAIMS.has(key)) throw new Error(`Claim "${key}" is reserved and cannot be set`);
    if (!ALLOWED_CLAIMS.has(key)) throw new Error(`Claim "${key}" is not allowed`);
  }
  const privateKey = Buffer.from(env.MUX_SIGNING_PRIVATE_KEY, 'base64').toString('utf8');
  return jwt.sign(
    {
      ...claims,
      sub: playbackId,
      aud: audience,
      exp: Math.floor(now / 1000) + ttlSeconds,
      kid: env.MUX_SIGNING_KEY_ID,
    },
    privateKey,
    { algorithm: 'RS256', keyid: env.MUX_SIGNING_KEY_ID, noTimestamp: true }
  );
}

module.exports = { MUX_AUDIENCE, ALLOWED_CLAIMS, signPlaybackToken };
