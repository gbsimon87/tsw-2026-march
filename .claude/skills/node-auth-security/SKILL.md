---
name: node-auth-security
description: Use when implementing or reviewing authentication (JWT, sessions, OAuth), authorization/role checks, password handling, or general security hardening in a Node/Express backend. Trigger on mentions of "auth", "login", "JWT", "session", "password", "bcrypt", "authorization", or "security".
---

# Node/Express Auth & Security

## Password handling

- Hash passwords with `bcrypt` (or `argon2`) — never store plaintext, never roll your own hashing, never use unsalted MD5/SHA.
- Use a cost factor of at least 10-12 for bcrypt (`bcrypt.hash(password, 12)`); higher costs slow down brute-force attempts.
- Exclude the password hash field from query results by default (`select: false` in the Mongoose schema) and only `.select('+passwordHash')` on the specific login query.
- Never send the password hash to the client, even by accident through a serialized user object — strip it explicitly before any response, or rely on the schema `select: false` plus a `toJSON` transform that deletes it.

## JWT pattern

- Sign access tokens with a short expiry (15 minutes to 1 hour). Use a separate, longer-lived refresh token stored in an `httpOnly`, `secure`, `sameSite=strict` cookie — never store any token in `localStorage` (vulnerable to XSS exfiltration).
- Verify tokens in a single auth middleware, not duplicated inline in each route:

```js
function requireAuth(req, res, next) {
  const token = req.cookies.accessToken;
  if (!token) return res.status(401).json({ error: { message: 'Not authenticated' } });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: { message: 'Invalid or expired token' } });
  }
}
```

- Keep JWT payloads minimal (user id, role) — don't put sensitive or large data in the token, since it's base64-decodable by anyone who has it.
- Rotate refresh tokens on use and store a revocation list (or a token version/counter on the user record) so logout and password changes can actually invalidate existing sessions.

## Authorization (role/permission checks)

- Never rely on the frontend hiding a button as the only access control — always re-check permissions server-side on every protected route.
- Keep role checks as their own middleware, composable with auth:

```js
const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) return res.status(403).json({ error: { message: 'Forbidden' } });
  next();
};
// router.delete('/users/:id', requireAuth, requireRole('admin'), controller.deleteUser)
```

- Check resource ownership, not just role, for user-owned resources (a `user` role deleting their own post vs. someone else's) — this is a common gap ("Insecure Direct Object Reference").

## Security headers & hardening checklist

- `helmet()` middleware for sensible default security headers.
- Explicit CORS config with an allowlist of origins — never `cors()` with no options in production (defaults to allow-all).
- Rate limiting (`express-rate-limit`) on login, signup, and password-reset routes specifically — these are brute-force targets even if the rest of the API isn't rate limited.
- Environment variables (`.env`, never committed) for all secrets: JWT secret, DB connection string, API keys. Add `.env` to `.gitignore` before the first commit, not after.
- Sanitize/validate all user input before it reaches a MongoDB query to prevent NoSQL injection (e.g., reject objects where a string is expected — `{ "$gt": "" }` as a login field is a classic injection attempt). Libraries like `express-mongo-sanitize` handle this.
- Set cookie flags correctly: `httpOnly`, `secure` (in production/HTTPS), `sameSite`.

## Common review flags

- JWT secret hardcoded in source instead of read from `process.env`.
- No token expiry set (`jwt.sign` without `expiresIn`).
- Password comparison using `===` instead of `bcrypt.compare()` (timing attack risk, and hashes won't match plaintext anyway).
- Missing `requireAuth` on a route that mutates or returns user-specific data.
- CORS configured with `origin: '*'` alongside `credentials: true` (invalid combination and a security hole).
