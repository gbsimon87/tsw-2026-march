const crypto = require('crypto');
const { verifyMuxSignature, MuxSignatureError } = require('../../modules/video/mux.webhook');

const SECRET = 'whsec_test';
const NOW = 1_800_000_000_000;
const T = NOW / 1000;
const BODY = Buffer.from('{"type":"video.asset.ready"}');

const sign = (body, t = T, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');
const verify = (body, header, extra = {}) =>
  verifyMuxSignature(body, header, SECRET, { now: NOW, ...extra });
const reason = (fn) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(MuxSignatureError);
    return e.reason;
  }
  throw new Error('did not throw');
};

describe('verifyMuxSignature', () => {
  test('accepts a valid signature and returns the timestamp', () => {
    expect(verify(BODY, `t=${T},v1=${sign(BODY)}`)).toEqual({ timestamp: T });
  });

  test('accepts when any of several v1 values matches (rotation)', () => {
    const bad = 'a'.repeat(64);
    expect(verify(BODY, `t=${T},v1=${bad},v1=${sign(BODY)}`)).toEqual({ timestamp: T });
    expect(verify(BODY, `t=${T},v1=${sign(BODY)},v1=${bad}`)).toEqual({ timestamp: T });
  });

  test('rejects when no v1 matches', () => {
    expect(reason(() => verify(BODY, `t=${T},v1=${'a'.repeat(64)}`))).toBe('mismatch');
  });

  test.each(['1.5', 'abc', '-1', '', '1e3', ' '])('rejects malformed t %p', (t) => {
    expect(reason(() => verify(BODY, `t=${t},v1=${sign(BODY)}`))).toBe('malformed');
  });

  test.each([
    ['short', 'abcd'],
    ['long', 'a'.repeat(66)],
    ['uppercase', sign(BODY).toUpperCase()],
    ['non-hex', 'z'.repeat(64)],
  ])('rejects malformed v1 (%s)', (_n, v1) => {
    expect(reason(() => verify(BODY, `t=${T},v1=${v1}`))).toBe('malformed');
  });

  test('rejects a malformed v1 even when a valid one is also present', () => {
    expect(reason(() => verify(BODY, `t=${T},v1=nothex,v1=${sign(BODY)}`))).toBe('malformed');
  });

  test('rejects missing t or missing v1', () => {
    expect(reason(() => verify(BODY, `v1=${sign(BODY)}`))).toBe('malformed');
    expect(reason(() => verify(BODY, `t=${T}`))).toBe('malformed');
  });

  test('rejects stale timestamps', () => {
    const t = T - 301;
    expect(reason(() => verify(BODY, `t=${t},v1=${sign(BODY, t)}`))).toBe('stale');
    const ok = T - 300;
    expect(verify(BODY, `t=${ok},v1=${sign(BODY, ok)}`)).toEqual({ timestamp: ok });
  });

  test('rejects future timestamps', () => {
    const t = T + 301;
    expect(reason(() => verify(BODY, `t=${t},v1=${sign(BODY, t)}`))).toBe('future');
  });

  test('honours custom tolerance', () => {
    const t = T - 20;
    expect(reason(() => verify(BODY, `t=${t},v1=${sign(BODY, t)}`, { toleranceSeconds: 10 }))).toBe(
      'stale'
    );
  });

  test('signs exact bytes of a non-ASCII / non-UTF-8 body', () => {
    const utf8 = Buffer.from('{"name":"Zoë 🏀 日本"}', 'utf8');
    expect(verify(utf8, `t=${T},v1=${sign(utf8)}`)).toEqual({ timestamp: T });
    const invalid = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    expect(verify(invalid, `t=${T},v1=${sign(invalid)}`)).toEqual({ timestamp: T });
  });

  test('rejects a body altered by one byte', () => {
    const header = `t=${T},v1=${sign(BODY)}`;
    const altered = Buffer.from(BODY);
    altered[5] ^= 0x01;
    expect(reason(() => verify(altered, header))).toBe('mismatch');
  });

  test('rejects wrong secret', () => {
    expect(
      reason(() => verifyMuxSignature(BODY, `t=${T},v1=${sign(BODY)}`, 'other', { now: NOW }))
    ).toBe('mismatch');
  });

  test('rejects missing header, non-Buffer body, missing secret', () => {
    expect(reason(() => verify(BODY, undefined))).toBe('missing');
    expect(reason(() => verify(BODY, ''))).toBe('missing');
    expect(reason(() => verify('str', `t=${T},v1=${sign(BODY)}`))).toBe('invalid_body');
    expect(
      reason(() => verifyMuxSignature(BODY, `t=${T},v1=${sign(BODY)}`, '', { now: NOW }))
    ).toBe('missing_secret');
  });

  test('splits parts on first = only and ignores unknown schemes', () => {
    expect(reason(() => verify(BODY, `t=${T},v1=${sign(BODY)}=extra`))).toBe('malformed');
    expect(verify(BODY, `t=${T},v0=whatever,v1=${sign(BODY)}`)).toEqual({ timestamp: T });
  });
});
