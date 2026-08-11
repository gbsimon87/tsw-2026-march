# Security

Report vulnerabilities privately to the maintainer. Include the affected
component, reproduction, and impact; do not open a public issue containing
sensitive details.

## Controls

- Never commit secrets. Render stores deployed secrets; dev and production use
  separate MongoDB, JWT, OAuth, Resend, Stripe, Cloudinary, and OpenAI values.
- Run `pnpm check-secrets` before pushing. The pre-commit hook scans staged
  content and CI scans every tracked file.
- Keep local env files owner-readable only (`chmod 600 env/*/.env.*`).
- All mutations require the double-submit `x-csrf-token`; the validated Google
  OAuth callback is exempt.
- CORS uses `CLIENT_ORIGIN` in production and permits local-network origins only
  in development.
- Helmet and request IDs are applied globally.
- Rate limits: API 300/15 minutes; login/register/refresh 20/15 minutes; auth
  recovery 8/15 minutes; checkout 5/10 minutes; contact 5/hour.
- Refresh tokens are hashed, persisted, rotated, and expired with a TTL index.
- Uploaded media is MIME- and size-limited before Cloudinary upload.

Rotate affected credentials after exposure or team-member offboarding. The
current rate-limit store is process-local; use a shared store before running
multiple API instances.
