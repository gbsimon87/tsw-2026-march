const {
  publicCacheMiddleware,
  PUBLIC_CACHE_CONTROL,
} = require('../../middleware/publicCache.middleware');

function makeRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
    getHeader(name) {
      return headers[name];
    },
  };
}

function makeReq({ method = 'GET', authorization, accessToken } = {}) {
  return {
    method,
    headers: authorization ? { authorization } : {},
    cookies: accessToken ? { accessToken } : {},
  };
}

describe('publicCacheMiddleware (OPT-019)', () => {
  test('sets public Cache-Control for an anonymous GET', () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    const next = jest.fn();

    publicCacheMiddleware(req, res, next);

    expect(res.getHeader('Cache-Control')).toBe(PUBLIC_CACHE_CONTROL);
    expect(res.getHeader('Vary')).toBe('Cookie, Authorization');
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('sets public Cache-Control for an anonymous HEAD', () => {
    const req = makeReq({ method: 'HEAD' });
    const res = makeRes();

    publicCacheMiddleware(req, res, jest.fn());

    expect(res.getHeader('Cache-Control')).toBe(PUBLIC_CACHE_CONTROL);
  });

  test('does NOT publicly cache when an access-token cookie is present', () => {
    const req = makeReq({ method: 'GET', accessToken: 'token-abc' });
    const res = makeRes();

    publicCacheMiddleware(req, res, jest.fn());

    expect(res.getHeader('Cache-Control')).toBe('private, no-cache');
    // Vary must still be present so a shared cache never reuses an anon entry.
    expect(res.getHeader('Vary')).toBe('Cookie, Authorization');
  });

  test('does NOT publicly cache when a Bearer Authorization header is present', () => {
    const req = makeReq({ method: 'GET', authorization: 'Bearer token-abc' });
    const res = makeRes();

    publicCacheMiddleware(req, res, jest.fn());

    expect(res.getHeader('Cache-Control')).toBe('private, no-cache');
  });

  test('does NOT publicly cache a non-idempotent method even when anonymous', () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();

    publicCacheMiddleware(req, res, jest.fn());

    expect(res.getHeader('Cache-Control')).toBe('private, no-cache');
  });

  test('a non-Bearer Authorization header does not defeat caching (only Bearer counts)', () => {
    // Defensive: the app only reads Bearer tokens / the accessToken cookie, so
    // a stray non-Bearer Authorization value is treated as anonymous.
    const req = makeReq({ method: 'GET', authorization: 'Basic Zm9vOmJhcg==' });
    const res = makeRes();

    publicCacheMiddleware(req, res, jest.fn());

    expect(res.getHeader('Cache-Control')).toBe(PUBLIC_CACHE_CONTROL);
  });
});
