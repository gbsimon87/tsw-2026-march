# Authentication Flow

> Part of the [Application Audit](./README.md) · July 2026

Custom JWT implementation (not NextAuth/Auth.js). Passport is used **only** for
the Google OAuth handshake. Key files:

- `server/src/modules/auth/` — routes, controller, service, repository, validation
- `server/src/services/token.service.js` — access/refresh JWT sign/verify
- `server/src/services/session.service.js` — session payloads (`{sub, sid}`)
- `server/src/services/authToken.service.js` — verify/reset tokens (sha256, TTL)
- `server/src/middleware/auth.middleware.js` — `authMiddleware`, `optionalAuthMiddleware`
- `server/src/middleware/csrf.middleware.js` — double-submit CSRF
- `server/src/config/cookie.js` — cookie settings
- Client: `client/src/app/store/AuthContext.jsx`, `client/src/lib/apiClient.js`

## Token model

| Token                              | TTL (default)            | Where                                            |
| ---------------------------------- | ------------------------ | ------------------------------------------------ |
| Access JWT (`JWT_ACCESS_SECRET`)   | 15m (`ACCESS_TOKEN_TTL`) | `accessToken` cookie (httpOnly) or Bearer header |
| Refresh JWT (`JWT_REFRESH_SECRET`) | 7d (`REFRESH_TOKEN_TTL`) | `refreshToken` cookie, path `/api/v1/auth`       |
| Google exchange JWT                | 60s                      | query param → POST body                          |
| Email verify / password reset      | 60m / 30m                | sha256-hashed in `authtokens` (TTL index)        |

Cookies: httpOnly, `secure` in prod, `sameSite:'none'` prod / `'lax'` dev,
optional `COOKIE_DOMAIN` (`server/src/config/cookie.js`).

## Flows

**Register** (`auth.service.js:136-158`): zod → bcrypt cost 12 → user created
with **`emailVerified: true`** — email verification is bypassed;
`request-verification` is a no-op stub (`auth.service.js:227-234`). The
verify-email endpoint, token type, and TTL env all still exist (dead path).

**Login** (`auth.service.js:160-172` → `issueAuthTokens` `:96-116`): password
check → new session `{sid: uuid}` upserted into `sessions` with
sha256(refreshToken), UA, IP, `expiresAt = now + 7d` (**hardcoded — does not
follow `REFRESH_TOKEN_TTL`** if changed) → both cookies set.

**Session use**: `authMiddleware` verifies the access JWT statelessly — **no
session lookup**, so a revoked session's access token remains valid up to 15m.

**Refresh rotation** (`auth.service.js:174-203`): verify refresh JWT → load
session by `sid` → compare token hash; mismatch **deletes the session** (reuse
detection) → delete old session → issue fresh session/tokens. Four sequential
DB queries per refresh.

**Logout**: best-effort session delete + clear both cookies.

**Google OAuth**: `/auth/google/start` → Google → `/auth/google/callback`
(`auth.controller.js:110-123`) — issues a **60-second exchange JWT** (signed
with the access secret) and redirects to the client
`/auth/google/complete?token=…` without setting cookies (bounce-tracking
mitigation). Client POSTs `/auth/google/exchange` → cookies issued.
`findOrCreateGoogleUser` links by googleId, then by email
(`auth.repository.js:86-114`). The exchange token is not single-use
(replayable within 60s).

**Password reset**: forgot-password → Resend email (sent inline, blocking the
response) → reset-password verifies hashed token, rehashes password, clears
sessions.

## CSRF

`attachCsrfToken` mints a token on **every request** (2 Set-Cookie headers +
response header per request — avoidable churn). `csrfProtection` skips safe
methods and the Google callback; verifies double-submit secret+header with an
**Origin-allowlist fallback** (`csrf.middleware.js:52-56`) — since the fallback
passes whenever Origin ∈ `CLIENT_ORIGIN`, the token machinery is largely
redundant for the first-party client.

## Client side

`AuthContext` hydrates via `GET /auth/me` on every app load (blocking protected
routes on `isLoading`). `apiClient.js` implements single-flight refresh-on-401
with one retry; the XHR upload path (`postFormDataWithProgress`) does **not**
participate in refresh — a 401 there surfaces as "session expired".

## Known limitations

1. Email verification dead path (register pre-verifies).
2. Login/register/refresh have no dedicated rate limiter (only global 300/15m,
   in-memory per instance).
3. Access tokens outlive session revocation by up to 15m (accepted trade-off).
4. Session `expiresAt` hardcoded to 7d, decoupled from `REFRESH_TOKEN_TTL`.
5. Google exchange token replayable within 60s (single-use flag would close it).
6. `loginWithGoogle` exported but unused (`auth.service.js:290-298`).
7. `/auth/me` DB hit per SPA load — a candidate for short-TTL client caching
   once React Query lands.
