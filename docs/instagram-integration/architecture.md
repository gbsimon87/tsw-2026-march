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

The connection slice now implements the operator and `SocialConnection` portions of this flow. It
is not connected to a social-post model, approval workflow, publishing route, or scheduler.

## Implemented Components

| Component                                                        | Responsibility                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `server/src/config/env.js`                                       | Feature flag, API location/version, bootstrap account, token, and timeout validation.                         |
| `server/src/modules/social/instagram/instagram.client.js`        | Account verification, image/Reel container creation, readiness polling, publication, and error normalisation. |
| `server/src/scripts/verify-instagram-connection.js`              | Read-only check of the configured account; prints no credential.                                              |
| `server/src/tests/unit/instagram.client.test.js`                 | Contract-level unit tests using a mocked network boundary.                                                    |
| `server/src/modules/social/instagram/instagram.oauth.service.js` | One-time OAuth state, code/token exchange, account verification, encryption, and safe connection projection.  |
| `server/src/modules/social/instagram/instagram.repository.js`    | Single Instagram connection and expiring one-time OAuth state persistence.                                    |
| `server/src/modules/social/instagram/instagram.routes.js`        | Operator-only status, connect, callback, verify, and disconnect API.                                          |
| `client/src/features/social/pages/InstagramConnectionPage.jsx`   | Operator connection and verification screen; it exposes no credential or publish action.                      |
| `server/src/scripts/ensure-instagram-indexes.js`                 | Additive production setup for single-account uniqueness and OAuth-state uniqueness/expiry indexes.            |

## Target Domain Model

The current `InstagramConnection` holds the single official publishing account:

- platform and external account ID;
- display username and professional account type;
- encrypted access token and key version;
- token expiry, granted scopes, connection status, and last verification time; and
- created/updated/revoked audit metadata.

The access token is encrypted with AES-256-GCM. The configured key version is authenticated as
associated data, which detects ciphertext or key-version tampering. The API never serialises the
encrypted value to the browser. Key rotation remains an operational follow-up before production.

A future `SocialPost` should be the durable source of truth for every delivery attempt:

- platform, connection, asset URL/type, caption, source entity, and attribution link;
- consent evidence and operator approval identity/time;
- scheduled time and lifecycle status;
- stable idempotency key;
- container ID, published media ID, permalink, attempt count, and last error; and
- timestamps for every material transition.

Recommended lifecycle:

```text
draft -> ready_for_review -> approved -> scheduled
  -> creating_container -> processing -> publishing -> published
                                      \-> failed
draft/review/approved/scheduled -> cancelled
```

State transitions should use atomic compare-and-set updates so two workers cannot publish the
same record. A worker restart after `media_publish` is ambiguous until the job reconciles the
stored container/media state; it must not blindly create and publish a second container.

## Security and Authorisation

- Never send a platform access token to the browser.
- Never place a token in a URL, log entry, analytics event, exception detail, or committed file.
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

The current client exposes retryability but does not perform blind internal retries. The future
job runner should own retry policy so attempts are durable and visible.

- Retry transient network failures, HTTP 429, and HTTP 5xx with capped exponential backoff and
  jitter.
- Do not retry validation, permission, or rejected-media failures without operator action.
- Poll asynchronously; do not keep an end-user HTTP request open while Meta processes a Reel.
- Persist the container ID before polling.
- Reconcile unknown outcomes before retrying publication.
- Alert on token expiry/revocation, sustained rate limiting, and repeated media rejection.

The repository currently has no persistent job queue or scheduler. Adding one is a prerequisite
for scheduling and resilient publication.

## AI Boundary

No model call is needed to connect an account, render a known template, validate consent, create a
container, poll it, publish it, or record the result. If AI assistance is later added, limit it to
drafting captions, alt text, or rankings. Keep deterministic rules, operator review, and a complete
audit trail around every publish action.
