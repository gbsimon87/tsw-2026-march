# Instagram Integration Runbook

## Safety Rules

- Do not paste access tokens into issues, chat, documentation, screenshots, URLs, or committed
  environment files.
- Use a dedicated non-production professional account while building the OAuth and publishing
  lifecycle.
- Keep `INSTAGRAM_PUBLISHING_ENABLED=false` until the account and version are deliberately
  configured in the target environment.
- The connection check is read-only. Do not use a production account for an actual publish test
  until the approval and durable job workflow exists.

## Bootstrap Configuration

The current foundation temporarily accepts one server-side connection from environment variables:

```dotenv
INSTAGRAM_PUBLISHING_ENABLED=false
INSTAGRAM_GRAPH_API_BASE_URL=https://graph.instagram.com
INSTAGRAM_GRAPH_API_VERSION=vN.N
INSTAGRAM_USER_ID=replace-with-professional-account-id
INSTAGRAM_ACCESS_TOKEN=replace-in-secret-manager
INSTAGRAM_REQUEST_TIMEOUT_MS=10000
```

Choose and pin a supported API version during Meta app setup. Never use `latest`. Production
values belong in the deployment provider's secret store, not the repository. OAuth-backed,
encrypted database storage should replace this bootstrap token before production operation.

## Meta App Setup Checklist

- [ ] Create or select the Meta developer business app owned by TSW.
- [ ] Add the Instagram product and choose Instagram API with Instagram Login.
- [ ] Configure exact development and production OAuth redirect URLs.
- [ ] Add the designated test professional account and verify tester access.
- [ ] Request only `instagram_business_basic` and `instagram_business_content_publish` initially.
- [ ] Record app IDs and non-secret operational metadata in this folder.
- [ ] Store the app secret and tokens only in the approved secret manager.
- [ ] Complete the permission-review and business-verification requirements before production.

## Verify a Connection

From the repository root, after setting the variables in the selected server environment:

```bash
pnpm --filter server instagram:verify
```

Expected output contains `connected: true` plus the Instagram account ID, username, and account
type. It never prints the token. A non-zero exit with `INSTAGRAM_CONFIGURATION_ERROR` means the
feature is disabled or incomplete; `INSTAGRAM_API_ERROR` means Meta responded and its message
should guide the next check.

## Local Automated Checks

```bash
pnpm --filter server test -- instagram.client.test.js env.schema.test.js
pnpm --filter server lint
```

The unit tests use a mocked network boundary and do not publish or require credentials.

## Before the First Live Publish Test

- [ ] Use a non-production Instagram professional account.
- [ ] Upload a known-safe image or video to a stable public HTTPS location.
- [ ] Confirm format, dimensions, duration, and file size against current Meta documentation.
- [ ] Confirm the asset contains demo data or has recorded marketing consent.
- [ ] Use a caption that clearly identifies the test.
- [ ] Capture the container ID, final media ID, timestamps, and observed state sequence.
- [ ] Delete the test post manually if it should not remain visible.
- [ ] Add the result and any platform-specific finding to `platform-knowledge.md`.

## Failure Triage

| Symptom                              | First checks                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Configuration error                  | Feature flag, pinned API version, account ID, and secret presence.                                           |
| OAuth/permission error               | Token expiry, revoked access, granted scopes, app mode, and account role.                                    |
| Media rejected                       | Public reachability, content type, codec, dimensions, duration, and current platform limits.                 |
| Container never finishes             | Persist the container ID, check status directly, and avoid creating a duplicate while the result is unknown. |
| Rate limited/transient error         | Honour retryability, use capped backoff with jitter, and inspect account/app limits.                         |
| Publish returned but UI is uncertain | Reconcile using stored container/media data before attempting another publication.                           |

## Token Rotation or Revocation

1. Disable publishing in the affected environment.
2. Revoke or rotate the credential in Meta and the secret manager.
3. Verify logs and error stores contain no token material.
4. Configure the replacement credential and run the read-only connection check.
5. Re-enable only after the intended account identity is confirmed.
6. Reconcile any post left in an ambiguous processing/publishing state before retrying it.
