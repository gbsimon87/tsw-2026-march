# Instagram Integration Architecture

## Boundary

Instagram is an outbound delivery adapter. It must receive an already rendered, publicly
accessible asset and an already approved caption. It must not decide whether a player may be
featured, whether a statistic is correct, or whether a post is ready to publish.

The intended flow is:

```text
TSW source data
  -> deterministic social export
  -> consent and attribution checks
  -> operator preview and approval
  -> durable social-post record
  -> background Instagram publisher
  -> container status polling
  -> published media ID/permalink or actionable failure
```

The current slice implements the operator connection, a deliberately narrow social-post review
workflow for uploaded demo game cards, and a separately gated one-shot delivery worker. It does not
run on a recurring scheduler.

## Implemented Components

| Component                                                            | Responsibility                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `server/src/config/env.js`                                           | Feature flag, API location/version, bootstrap account, token, and timeout validation.                         |
| `server/src/modules/social/instagram/instagram.client.js`            | Account verification, image/Reel container creation, readiness polling, publication, and error normalisation. |
| `server/src/scripts/verify-instagram-connection.js`                  | Read-only check of the configured account; prints no credential.                                              |
| `server/src/tests/unit/instagram.client.test.js`                     | Contract-level unit tests using a mocked network boundary.                                                    |
| `server/src/modules/social/instagram/instagram.oauth.service.js`     | OAuth exchange, account verification, encrypted token refresh/health, and key rotation.                       |
| `server/src/modules/social/instagram/instagram.repository.js`        | Single Instagram connection and expiring one-time OAuth state persistence.                                    |
| `server/src/modules/social/instagram/instagram.routes.js`            | Operator-only status, connect, callback, verify, refresh, and disconnect API.                                 |
| `client/src/features/social/pages/InstagramConnectionPage.jsx`       | Operator connection, token-health, refresh, and verification screen; no credential or publish action.         |
| `server/src/scripts/ensure-instagram-indexes.js`                     | Additive setup for connection, OAuth-state, and social-post indexes.                                          |
| `server/src/scripts/rotate-instagram-token-key.js`                   | Compare-and-set re-encryption of the stored credential during a controlled key rotation.                      |
| `server/src/modules/social/instagram/instagram.social-post.*`        | Durable demo game-card drafts, content digests, and atomic review/approval/cancellation transitions.          |
| `client/src/features/social/components/InstagramSocialPostPanel.jsx` | Exact upload preview, declaration checks, and operator review queue.                                          |
| `server/src/modules/social/instagram/instagram.delivery.service.js`  | Durable delivery claim, container reuse, bounded retry, publication, and ambiguous-outcome handling.          |
| `server/src/scripts/process-instagram-deliveries.js`                 | Explicit one-shot worker entry point; processes at most ten due records.                                      |

## Target Domain Model

The current `InstagramConnection` holds the single official publishing account:

- platform and external account ID;
- display username and professional account type;
- encrypted access token and key version;
- token expiry, granted scopes, connection status, and last verification time; and
- created/updated/revoked audit metadata.

The access token is encrypted with AES-256-GCM. The configured key version is authenticated as
associated data, which detects ciphertext or key-version tampering. The API never serialises the
encrypted value to the browser. A temporary previous-key pair permits controlled re-encryption;
the compare-and-set update prevents overwriting a credential changed concurrently.

Long-lived tokens expose an operator-visible health state (`healthy`, `expiring`, `expired`, or
`unknown`). An operator can refresh an eligible unexpired token after it is 24 hours old. A short
database lease prevents two instances from refreshing it concurrently, and successful or failed
attempts leave timestamps and a non-secret error classification.

`InstagramSocialPost` is now the durable approval record. The first version stores:

- the connected Instagram account and source Pulse game-card post;
- a snapshotted game-card source plus the exact Cloudinary image URL and image-byte SHA-256;
- the exact caption, optional attribution URL, and demo/rights declaration;
- a digest binding the connection, source, asset bytes, caption, attribution, and declaration;
- operator identities and timestamps for creation, readiness, approval, and cancellation; and
- a stable private idempotency key reserved for the delivery worker.

Delivery state now includes queue time, a bounded lease, container ID, published media ID,
permalink, attempt count, next retry time, classified last error, and a private bounded attempt
history.

Recommended lifecycle:

```text
draft -> ready_for_review -> approved -> scheduled
  -> creating_container -> processing -> publishing -> published
                                      \-> failed
draft/review/approved/scheduled -> cancelled
```

The current image-only path uses `approved -> queued -> creating_container -> processing ->
publishing -> published`. Draft content is immutable: if the image or caption is wrong, cancel it
and create a new record. Queueing atomically requires the approval digest to match the content
digest.

State transitions should use atomic compare-and-set updates so two workers cannot publish the
same record. A worker restart after `media_publish` is ambiguous until the job reconciles the
stored container/media state; it must not blindly create and publish a second container.

## Security and Authorisation

- Never send a platform access token to the browser.
- Never place a token in a log entry, analytics event, exception detail, or committed file. Meta's
  exchange and refresh endpoints require a token query parameter; never log or expose those URLs.
- Store production tokens encrypted at rest with a managed key and support rotation.
- Validate OAuth `state`, use exact redirect URLs, and attach the callback to the initiating
  operator session.
- Store only a SHA-256 hash of each random OAuth state, consume it atomically once, and expire it
  after ten minutes.
- Introduce a platform-operator permission. League owner, manager, and scorekeeper permissions do
  not imply authority to publish from TSW's company account.
- Require an explicit human approval after the exact asset and caption are available.
- Record who approved and who initiated publication.

## Assets

Meta fetches the supplied media URL. Therefore the publisher cannot use a browser blob URL,
localhost URL, authenticated application route, or short-lived URL that expires before Meta has
processed it. The asset pipeline must provide a public HTTPS URL with a lifetime long enough for
container creation, retries, and reconciliation.

The current Cloudinary integration is a likely storage path, but social exports need a deliberate
upload policy, retention policy, content type, dimensions, and consent-aware deletion workflow
before it is connected.

## Reliability

The client exposes retryability but does not perform blind internal retries. The delivery worker
owns retry policy so attempts are durable and visible.

- Retry transient network failures, HTTP 429, and HTTP 5xx with capped exponential backoff and
  jitter.
- Do not retry validation, permission, or rejected-media failures without operator action.
- Poll asynchronously; do not keep an end-user HTTP request open while Meta processes a Reel.
- Persist the container ID before polling.
- Reconcile unknown outcomes before retrying publication.
- Alert on token expiry/revocation, sustained rate limiting, and repeated media rejection.

The database record is the durable job state, but the repository still has no recurring scheduler.
The explicit worker command is appropriate for the first controlled test; automated scheduling
requires a dedicated recurring process later.

## AI Boundary

No model call is needed to connect an account, render a known template, validate consent, create a
container, poll it, publish it, or record the result. If AI assistance is later added, limit it to
drafting captions, alt text, or rankings. Keep deterministic rules, operator review, and a complete
audit trail around every publish action.
