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

## OAuth Connection Configuration

The operator UI and database-backed connection use a separate feature flag from publishing:

```dotenv
INSTAGRAM_OAUTH_ENABLED=true
INSTAGRAM_GRAPH_API_BASE_URL=https://graph.instagram.com
INSTAGRAM_GRAPH_API_VERSION=vN.N
INSTAGRAM_APP_ID=replace-with-instagram-app-id
INSTAGRAM_APP_SECRET=replace-in-secret-manager
INSTAGRAM_OAUTH_REDIRECT_URL=https://dev-api.thesportyway.com/api/v1/social/instagram/oauth/callback
INSTAGRAM_TOKEN_ENCRYPTION_KEY=replace-with-64-hex-character-key
INSTAGRAM_TOKEN_KEY_VERSION=v1
INSTAGRAM_REQUEST_TIMEOUT_MS=10000
INSTAGRAM_PUBLISHING_ENABLED=false
```

Generate the encryption key with `openssl rand -hex 32` and store it alongside the app secret.
The redirect URL must exactly match the URL registered with Meta. Choose and pin a supported API
version during Meta app setup; never use `latest`.

Grant the designated TSW user the separate operator permission:

```bash
pnpm --filter server instagram:ensure-indexes
pnpm --filter server instagram:operator -- operator@example.com
```

The index command is additive and is required once per deployed database because production
disables Mongoose automatic index creation.

After signing in again, open `/admin/social/instagram`. The page can connect, show safe account
metadata and token health, refresh an eligible token, re-verify the credential, reconnect, and
disconnect. It cannot publish.

## Token Health and Refresh

The operator screen warns when the stored long-lived token has 14 days or fewer remaining. Use
**Refresh access token** before it expires. Meta only permits renewal of an unexpired long-lived
token, and TSW keeps the control disabled until the token is at least 24 hours old. A successful
refresh stores only the encrypted replacement token and updates the expiry and audit timestamps.

If the token has expired, use **Reconnect account** instead. A failed refresh is recorded without
storing token material or Meta's raw response.

See [`manual-actions.md`](./manual-actions.md) for the complete ordered setup and test checklist.

## Legacy Bootstrap Configuration

The API client foundation also temporarily accepts one server-side connection from environment
variables. It is used only by the legacy command-line verification script; guarded delivery uses
the encrypted OAuth connection instead:

```dotenv
INSTAGRAM_PUBLISHING_ENABLED=false
INSTAGRAM_GRAPH_API_BASE_URL=https://graph.instagram.com
INSTAGRAM_GRAPH_API_VERSION=vN.N
INSTAGRAM_USER_ID=replace-with-professional-account-id
INSTAGRAM_ACCESS_TOKEN=replace-in-secret-manager
INSTAGRAM_REQUEST_TIMEOUT_MS=10000
```

Production values belong in the deployment provider's secret store, not the repository. Do not
enable this bootstrap publishing flag for the OAuth connection milestone.

## Meta App Setup Checklist

- [ ] Create or select the Meta developer business app owned by TSW.
- [ ] Add the Instagram product and choose Instagram API with Instagram Login.
- [ ] Configure exact development and production OAuth redirect URLs.
- [ ] Add the designated test professional account and verify tester access.
- [ ] Request only `instagram_business_basic` and `instagram_business_content_publish` initially.
- [ ] Record app IDs and non-secret operational metadata in this folder.
- [ ] Store the app secret and tokens only in the approved secret manager.
- [ ] Complete the permission-review and business-verification requirements before production.

## Verify the Legacy Bootstrap Connection

From the repository root, after setting the variables in the selected server environment:

```bash
pnpm --filter server instagram:verify
```

Expected output contains `connected: true` plus the Instagram account ID, username, and account
type. It never prints the token. A non-zero exit with `INSTAGRAM_CONFIGURATION_ERROR` means the
feature is disabled or incomplete; `INSTAGRAM_API_ERROR` means Meta responded and its message
should guide the next check.

To verify the OAuth-backed connection, use **Verify connection** on
`/admin/social/instagram`. That reads and decrypts the database credential only on the server and
returns account metadata, never the token.

## Create and Approve the First Demo Post

This workflow records approval but cannot publish:

1. Create or locate a labelled demo `game_card` post in The Pulse.
2. Use **Share as image** to export its 4:5 PNG.
3. Open `/admin/social/instagram` and select that source game card.
4. Upload the exact exported PNG, enter the final test caption and optional HTTPS attribution URL,
   then confirm both demo-content and publication-rights declarations.
5. Create the draft and inspect the uploaded image and caption in the review queue.
6. Choose **Mark ready for review**, inspect it again, then choose
   **Approve exact image and caption**.

The server stores the image on Cloudinary, hashes its bytes, and binds the hash and reviewed fields
into an approval digest. To correct anything, cancel the record and create a new draft. An approved
record remains inert until it is explicitly queued with delivery enabled.

## Guarded Demo Delivery

Keep `INSTAGRAM_PUBLISHING_ENABLED=false` while creating and approving the post. For the controlled
test only:

1. Confirm the connected account is the designated non-production professional account.
2. Recheck the approved image, caption, and declaration.
3. Set `INSTAGRAM_PUBLISHING_ENABLED=true` in the development API environment and deploy it.
4. Use **Queue guarded test publish** on exactly the approved record to test.
5. In the development API Render Shell, run:

   ```bash
   pnpm --filter server instagram:publish-pending
   ```

6. Refresh `/admin/social/instagram` and confirm `Published` plus the media ID/permalink.
7. Set `INSTAGRAM_PUBLISHING_ENABLED=false` again and redeploy after the controlled test.

The command claims at most ten due posts. Transient failures before publication receive bounded
backoff and can be processed by a later command run. `reconciliation_required` must be investigated
against the Instagram account; do not requeue or invoke `media_publish` blindly.

## Local Automated Checks

```bash
pnpm --filter server test -- instagram.client.test.js instagram.oauth.service.test.js instagram.social-post.service.test.js instagram.social-post.repository.schema.test.js instagram.delivery.service.test.js platform-operator.middleware.test.js crypto.test.js env.schema.test.js
pnpm --filter client test -- InstagramConnectionPage.test.jsx InstagramSocialPostPanel.test.jsx
pnpm --filter server lint
pnpm --filter client lint
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

## Token Encryption-Key Rotation

Keep publishing disabled while rotating the application encryption key:

1. In the deployment secret store, copy the existing key and version temporarily into
   `INSTAGRAM_TOKEN_PREVIOUS_ENCRYPTION_KEY` and `INSTAGRAM_TOKEN_PREVIOUS_KEY_VERSION`.
2. Generate a new key with `openssl rand -hex 32`, set it as
   `INSTAGRAM_TOKEN_ENCRYPTION_KEY`, and increment `INSTAGRAM_TOKEN_KEY_VERSION` in configuration.
3. Deploy those values together. The server can still read the old ciphertext via the temporary
   previous-key pair.
4. In the API service shell, run:

   ```bash
   pnpm --filter server instagram:rotate-key
   ```

5. Verify the command reports the new key version, then use **Verify connection** and refresh the
   page.
6. Remove both temporary previous-key variables and redeploy. Retain the old secret only in the
   approved recovery store according to the project's secret-retention policy.

The command is idempotent and never prints the token. Do not pass encryption keys as command-line
arguments or commit them to `render.yaml`.

## Token Revocation

1. Disable publishing in the affected environment.
2. Use the operator UI to disconnect; this erases the locally stored credential.
3. Revoke TSW access in Meta/Instagram as well. Local disconnect does not call Meta revocation.
4. Verify logs and error stores contain no token material.
5. Reconnect through OAuth and confirm the intended account identity.
6. Re-enable publishing only after reconnecting, verifying the account, and reconciling any post
   left in an ambiguous delivery state.
