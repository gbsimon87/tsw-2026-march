---
name: node-auth-security
description: Use when implementing or reviewing authentication, authorization/permission checks, password/token handling, CSRF, rate limiting, or security hardening in this project's server. Trigger on "auth", "login", "JWT", "session", "refresh", "CSRF", "password", "permission", "role", "authorization", or "security".
---

# TSW Auth, Permissions & Security

The real model is documented in `docs/security.md` and `docs/permissions.md`;
this skill is the working guide. Do **not** introduce generic middleware RBAC
(`requireRole('admin')`) — that is not how this app authorizes.

## Authentication (cookie-based JWT + rotating sessions)

- Passwords hashed with **bcryptjs**; the hash uses `select: false` on `User` and
  is only pulled on the login query. Compare with `bcrypt.compare`, never `===`.
- **Dual token delivery**: `auth.middleware.js` accepts either an
  `Authorization: Bearer` header or an `accessToken` cookie. Access TTL ~15m.
- **Refresh tokens are hashed and stored** in the `Session` collection (TTL index
  auto-expires). `/auth/refresh` **rotates**: verify hash → delete old session →
  issue a new one. Token/session logic lives in `services/token.service.js` and
  `services/session.service.js` — reuse them, don't re-sign JWTs ad hoc.
- Local users **cannot log in until `emailVerified`**. Google OAuth via Passport
  (`modules/auth/oauth.google.js`) + `/auth/google/*`.
- Two middlewares: `authMiddleware` (required, 401s) and `optionalAuthMiddleware`
  (best-effort, ignores invalid tokens — for public+personalized routes).

## Authorization = resource ownership + league role (in services, not middleware)

`User.roles` exists but is **unused/unenforced** — do not build on it. Real
authorization is enforced in `leagues.service.js` via `assert*`/`can*` helpers that
throw `ApiError(403)`:

- Roles: league **owner**, league **manager** (`LeagueManager`), team **manager** /
  **helper** / **player** (`LeagueTeamMember.role`).
- Gates: `assertLeagueOwner`, `assertLeagueManagerOrOwner`,
  `assertTeamManagerOrOwner`, `canManageLeagueGame`, `canFinalizeLeagueGame`,
  `canEditCompletedLeagueGame`, `getLeagueContextForGame`.
- Every `GET /leagues/:id` returns `viewerContext: { viewerRole, managedTeamIds }`
  which drives **client** permission UI. Client checks are **UX-only** — always
  re-check on the server. The full matrix is in `docs/permissions.md`; keep it in
  sync when you change a gate.
- Always check **ownership**, not just role, for user-owned resources (IDOR).

## CSRF (double-submit) — already wired, don't bypass

- Server issues an HttpOnly `_csrfSecret` cookie + a readable `XSRF-TOKEN`; clients
  echo it as `x-csrf-token` on non-idempotent methods. `attachCsrfToken` +
  `csrfProtection` in `app.js`.
- Safe methods and the Google OAuth callback are exempt; a validated `Origin`
  header is the fallback for third-party-cookie-blocking browsers.
- Anonymous cacheable GETs deliberately skip CSRF `Set-Cookie` (OPT-019) so a
  shared cache can't replay a token — don't re-add emission there.

## Rate limiting (`rateLimit.middleware.js`)

- Global `/api/*`: 300 / 15min.
- `authCredentialLimiter`: 20 / 15min on `/register`, `/login`, `/refresh`.
- Auth-recovery (forgot/reset/verify): 8 / 15min. Contact: 5 / hour.
- Stores are in-memory (per-process) today — fine single-instance; a shared store
  (Redis) is deferred. Note this if you touch multi-instance behavior.

## Hardening checklist

- `helmet()` global; CORS is an allowlist from `CLIENT_ORIGIN` (prod) — never
  `origin: '*'` with `credentials: true`.
- All secrets come from Zod-validated env (`config/env.js`); JWT secrets enforced
  `≥ 32` chars. Never hardcode a secret; env files live in `env/server/` (gitignored).
- Cookie flags built in `config/cookie.js` (`httpOnly`, `secure` in prod,
  `sameSite`). Never put a token in `localStorage`.
- Validate every request through Zod (also blocks NoSQL-injection object payloads
  like `{ "$gt": "" }` where a string is expected).
- 500 error bodies are masked to "Internal server error" — don't leak internals.

## Review flags

- New mutating/user-scoped route missing `authMiddleware`, or a league action
  missing its `assert*` gate in the service.
- Permission checked only on the client (`viewerContext`) with no server gate.
- Re-signing JWTs or writing sessions outside `token`/`session` services.
- `jwt.sign` without `expiresIn`; password compared with `===`.
- A gate change not reflected in `docs/permissions.md`.
