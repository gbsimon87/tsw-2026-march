# Security Baseline

Security controls included by default:

- Helmet headers
- CORS allowlist with credentials
- Rate limiting for `/api`
- httpOnly auth cookies
- Short-lived access token + rotating refresh token
- CSRF protection via token + secret cookie
- Password hashing with bcrypt
- Email verification before local password login
- One-time hashed verification/reset tokens with TTL expiry
- Structured request IDs and safe logging

## Required Production Updates

- Replace JWT secrets with high-entropy values.
- Set `COOKIE_DOMAIN` and `CLIENT_ORIGIN` to production hosts.
- Enable HTTPS-only cookie behavior (`NODE_ENV=production`).
- Configure Google OAuth callback URLs and consent screen correctly.
- Keep prod (`main`) and dev (`dev`) credentials and databases fully separate.
- Configure SMTP credentials for production (required to send auth emails).
