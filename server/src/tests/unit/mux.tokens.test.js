const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

jest.mock('../../config/env', () => ({
  env: { MUX_SIGNING_KEY_ID: 'kid-1', MUX_SIGNING_PRIVATE_KEY: undefined },
}));

const { env } = require('../../config/env');
const { MUX_AUDIENCE, signPlaybackToken } = require('../../modules/video/mux.tokens');

env.MUX_SIGNING_PRIVATE_KEY = Buffer.from(privatePem).toString('base64');

const NOW = 1_800_000_000_000;

describe('signPlaybackToken', () => {
  test('signs RS256 with kid, sub, aud, exp from caller TTL', () => {
    const token = signPlaybackToken({
      playbackId: 'pb1',
      audience: MUX_AUDIENCE.video,
      ttlSeconds: 3600,
      now: NOW,
    });
    const decoded = jwt.verify(token, publicPem, {
      algorithms: ['RS256'],
      clockTimestamp: NOW / 1000,
    });
    expect(decoded.sub).toBe('pb1');
    expect(decoded.aud).toBe('v');
    expect(decoded.exp).toBe(NOW / 1000 + 3600);
    expect(decoded.kid).toBe('kid-1');
    expect(jwt.decode(token, { complete: true }).header).toMatchObject({
      alg: 'RS256',
      kid: 'kid-1',
    });
  });

  test('audiences map to v/t/s', () => {
    expect(MUX_AUDIENCE).toEqual({ video: 'v', thumbnail: 't', storyboard: 's' });
  });

  test('allows clip window and thumbnail claims', () => {
    const token = signPlaybackToken({
      playbackId: 'pb1',
      audience: 'v',
      ttlSeconds: 900,
      claims: { asset_start_time: 5, asset_end_time: 15 },
      now: NOW,
    });
    const decoded = jwt.verify(token, publicPem, {
      algorithms: ['RS256'],
      clockTimestamp: NOW / 1000,
    });
    expect(decoded.asset_start_time).toBe(5);
    expect(decoded.asset_end_time).toBe(15);
    const thumb = signPlaybackToken({
      playbackId: 'pb1',
      audience: 't',
      ttlSeconds: 900,
      claims: { time: 7 },
      now: NOW,
    });
    expect(jwt.decode(thumb).time).toBe(7);
  });

  test('tampering with window/time claims after signing fails verification', () => {
    const token = signPlaybackToken({
      playbackId: 'pb1',
      audience: 'v',
      ttlSeconds: 900,
      claims: { asset_start_time: 5, asset_end_time: 15 },
      now: NOW,
    });
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.asset_end_time = 9999;
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
    expect(() =>
      jwt.verify(forged, publicPem, { algorithms: ['RS256'], clockTimestamp: NOW / 1000 })
    ).toThrow(/invalid signature/);
  });

  test.each(['sub', 'aud', 'exp', 'kid', 'iat', 'nbf', 'iss'])(
    'reserved claim %s cannot be overridden',
    (claim) => {
      expect(() =>
        signPlaybackToken({
          playbackId: 'pb1',
          audience: 'v',
          ttlSeconds: 60,
          claims: { [claim]: 'x' },
          now: NOW,
        })
      ).toThrow(/reserved/i);
    }
  );

  test('unknown claims are rejected', () => {
    expect(() =>
      signPlaybackToken({
        playbackId: 'pb1',
        audience: 'v',
        ttlSeconds: 60,
        claims: { admin: true },
        now: NOW,
      })
    ).toThrow(/not allowed/i);
  });

  test('requires a positive integer ttl, a playback id and a known audience', () => {
    const base = { playbackId: 'pb1', audience: 'v', now: NOW };
    expect(() => signPlaybackToken({ ...base, ttlSeconds: undefined })).toThrow();
    expect(() => signPlaybackToken({ ...base, ttlSeconds: 0 })).toThrow();
    expect(() => signPlaybackToken({ ...base, ttlSeconds: 1.5 })).toThrow();
    expect(() => signPlaybackToken({ ...base, ttlSeconds: 60, playbackId: '' })).toThrow();
    expect(() => signPlaybackToken({ ...base, ttlSeconds: 60, audience: 'x' })).toThrow();
  });
});
