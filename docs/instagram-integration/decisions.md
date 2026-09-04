# Instagram Integration Decisions

## ADR-001: Use Instagram API with Instagram Login

**Status:** accepted on 19 August 2026.

The initial use case is owned organic publishing to an Instagram professional account. Instagram
Login connects that account without requiring a linked Facebook Page and gives the required basic
and content-publishing permissions. Advertising, tagging, messaging, and comment management are
outside this slice.

Revisit this decision if TSW needs a capability that only the Facebook Login path supports.

## ADR-002: Ship the foundation dark

**Status:** accepted.

Publishing is disabled by default. Enabling it requires an explicit Graph API version, Instagram
professional account ID, and access token. This keeps incomplete environments bootable while
making an accidentally half-enabled environment fail validation.

## ADR-003: Do not expose a publish route yet

**Status:** accepted.

The current global user model does not distinguish a trusted TSW platform operator from ordinary
product users. A route added now would either be inaccessible or grant external publishing power
to an inappropriate role. The client remains internal until operator authorisation, approval, and
auditing exist.

## ADR-004: Human approval remains mandatory

**Status:** accepted.

Asset generation may become automatic, but Instagram delivery requires an operator to review the
exact asset, caption, consent status, attribution, and destination account. Automated scheduling
may execute a previously approved post; it may not silently create the approval.

## ADR-005: AI is optional and outside the critical path

**Status:** accepted.

The integration is deterministic. OAuth, permission checks, rendering, validation, queueing,
publishing, retries, and auditing do not need AI. A later assistant may propose captions, alt text,
or ranked assets, but an operator must approve the output and the system must work without it.

## ADR-006: Publish stable public HTTPS assets

**Status:** accepted.

Meta fetches media from the URL supplied during container creation. The social asset pipeline must
therefore produce a stable public HTTPS resource with an adequate lifetime. Browser blobs,
localhost, and session-authenticated asset routes are rejected before calling Meta.

## ADR-007: One company connection, restricted to platform operators

**Status:** accepted on 23 August 2026.

The connection API and UI require the global `platform_operator` user role. League ownership,
league management, team management, and ordinary authentication do not imply this permission.
The database maintains one Instagram connection for the official TSW account. Multi-tenant user
connections remain a separate future product decision.

## ADR-008: Encrypt OAuth tokens with a versioned application key

**Status:** accepted on 23 August 2026.

OAuth access tokens are encrypted with AES-256-GCM before persistence. A 32-byte key comes from the
deployment secret store, and its version is authenticated with the ciphertext. Neither plaintext
nor ciphertext is returned through the status API. Managed-KMS envelope encryption and an online
key-rotation process should replace the single application key before broader production scale.

## ADR-009: Connecting does not enable publishing

**Status:** accepted on 23 August 2026.

OAuth configuration uses its own disabled-by-default flag. A successful connection only stores and
verifies account access; there is still no HTTP publish action. The existing bootstrap publishing
configuration remains isolated until durable post approval and delivery state are implemented.

## ADR-010: Refresh explicitly and rotate keys with a transition pair

**Status:** accepted on 4 September 2026.

The operator screen shows token health and provides an explicit refresh action for an eligible
unexpired long-lived token. Refresh uses a short database lease to prevent concurrent replacement
and records the operator and outcome timestamps. Automated scheduling can be added later when the
application has a durable job runner.

Encryption-key rotation temporarily configures the old key/version alongside the new current
pair. An idempotent command decrypts with the old key and uses compare-and-set to persist ciphertext
under the new version. The temporary pair is removed after verification; secrets never appear in
command arguments or committed configuration.

## ADR-011: Begin approval with uploaded demo game-card exports

**Status:** accepted on 4 September 2026.

The first `InstagramSocialPost` accepts only a PNG/JPEG 4:5 export tied to an existing Pulse
game-card post. The operator must declare that it is labelled demo content and confirm TSW's rights
to every visible element. The server uploads the exact file to Cloudinary and binds its SHA-256,
caption, source, destination connection, attribution, and declaration into the approval digest.

Draft content is immutable. Corrections require cancellation and a new draft, avoiding approval
invalidation complexity before delivery exists. This slice adds no publish endpoint; approval is
safe to exercise while `INSTAGRAM_PUBLISHING_ENABLED=false`.

## ADR-012: Separate queueing from a conservative one-shot delivery worker

**Status:** accepted on 5 September 2026.

There is no direct publish HTTP route. A platform operator may explicitly queue an approved demo
post only while `INSTAGRAM_PUBLISHING_ENABLED=true`; the separate `instagram:publish-pending`
command claims due records with a database lease and uses the encrypted OAuth credential.

Failures before `media_publish` use bounded durable retry and reuse a stored container. Once the
worker enters `publishing`, an error or expired lease becomes `reconciliation_required` and is not
retried automatically, because the remote post may exist even if the response was lost.
