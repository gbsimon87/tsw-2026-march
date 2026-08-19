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
