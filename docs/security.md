# Security Policy

## Reporting a Vulnerability

Do not open public issues for sensitive vulnerabilities.

Report privately to your project maintainer/security contact with:

- affected component and endpoint
- reproduction steps
- impact assessment
- suggested remediation (if known)

The maintainer will acknowledge receipt within 3 business days and provide remediation status updates until resolved.

## Secret Management

- Never commit `.env` files or production secrets. Env files live under `env/server/` and `env/client/` and are excluded from git. Production secrets are injected at deploy time through the Render dashboard — never stored in `render.yaml`.
- Use separate credentials for prod (`main`) and dev (`dev`) environments. Note: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are currently shared between both env files and should be rotated to distinct values per environment.
- Rotate JWT, OAuth, Resend API key, Stripe secret and webhook keys, Cloudinary API secret, OpenAI API key, and database credentials after exposure or team-member offboarding.
- SMTP variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, etc.) remain present in `env/server/.env.production` and `render.yaml` as legacy config from the nodemailer era. Email sending now runs exclusively through Resend. These SMTP vars are unused by the application and should be cleaned up to avoid confusion about active credentials.

## Security Controls

### CSRF Protection

All non-idempotent requests (POST, PUT, PATCH, DELETE) require a valid `x-csrf-token` request header. The server issues a `_csrfSecret` HttpOnly cookie and a corresponding `XSRF-TOKEN` readable cookie on every response. Clients must echo the token back in the `x-csrf-token` header.

The Google OAuth callback route (`/api/v1/auth/google/callback`) is exempt. For browsers that block third-party cookies (Safari ITP, Chrome Privacy Sandbox), a validated `Origin` header is accepted as a fallback.

### Rate Limiting

- General API (`/api/*`): 300 requests per 15-minute window.
- Auth credential endpoints (`/register`, `/login`, `/refresh`): 20 requests per 15-minute window (`authCredentialLimiter`). Note: in-memory store, so per-process — revisit for multi-instance.
- Auth recovery endpoints (forgot-password, reset-password, verify-email, request-verification): 8 requests per 15-minute window.
- Contact form: 5 requests per hour.

### HTTP Security Headers

Helmet is applied globally to set security-relevant HTTP response headers (CSP, X-Frame-Options, etc.).

### CORS

In production, only origins matching `CLIENT_ORIGIN` are allowed. In development, any `localhost`, `127.0.0.1`, `192.168.x.x`, or `10.x.x.x` origin is permitted.
