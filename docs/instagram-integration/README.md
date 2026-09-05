# Instagram Publishing Integration

This folder is the living record for TSW's Instagram publishing integration. Update it whenever
the implementation, Meta configuration, operational process, or delivery status changes.

**Status:** test-account OAuth, demo game-card approval, and guarded one-shot delivery are
implemented, and an operator can hand a Pulse game card straight to the review screen; delivery
remains disabled by default

**Started:** 19 August 2026  
**Branch:** `feat/instagram-publishing`, based on `dev`

## Goal

Allow an authorised TSW operator to publish an approved, consent-safe image or Reel to the TSW
Instagram professional account. AI is not required for publishing: this is a deterministic API
workflow. AI may later assist with optional caption drafts or content ranking, but it must not be
in the approval or delivery path.

## Current Scope

The implementation currently provides:

- a disabled-by-default Instagram Graph API configuration;
- a server-side client for account verification, image and Reel containers, container polling,
  and publication;
- structured errors that do not expose the access token;
- a read-only bootstrap connection verification command;
- unit coverage for request construction, polling, errors, and configuration validation;
- a separate `platform_operator` permission and grant/revoke command;
- operator-only OAuth start, callback, status, verification, token-refresh, and disconnect
  endpoints;
- one-time OAuth state bound to the initiating user and session;
- encrypted database storage for one official Instagram connection;
- token-expiry health, refresh auditing, and a controlled encryption-key rotation command; and
- an operator screen at `/admin/social/instagram` with a durable demo game-card review queue;
- an operator-only hand-off that renders a Pulse game card to 1080x1350 in the browser and
  prefills that review screen with it; and
- a separately gated, one-shot delivery worker with durable retries and ambiguous-outcome handling.

There is no direct HTTP publishing endpoint. Operators can queue an approved demo post only when
delivery is explicitly enabled; a separate command claims and processes queued records.

## Delivery Tracker

### Completed in the foundation slice

- [x] Choose Instagram API with Instagram Login for the initial account connection.
- [x] Keep the integration off unless all required configuration is present.
- [x] Add professional-account connection verification.
- [x] Add single-image container creation and publication primitives.
- [x] Add Reel container creation and publication primitives.
- [x] Poll container status and classify failed, timed-out, transient, and API errors.
- [x] Require public HTTPS media URLs before any call reaches Meta.
- [x] Keep access tokens out of URLs and normalised error details.
- [x] Add a read-only verification script and unit tests.

### Next implementation slice

- [x] Create the Meta developer app and configure Instagram Login redirect URLs.
- [x] Implement OAuth connection and callback endpoints with one-time state validation.
- [x] Store access tokens encrypted at rest; record expiry and account metadata.
- [x] Add a platform-operator permission separate from league and team roles.
- [x] Add an authenticated operator UI for connection status, verification, and disconnect.
- [x] Configure a Meta test app/account and complete the first real OAuth connection.
- [x] Add token refresh/expiry monitoring and encryption-key rotation operations.

### Publishing and approval slice

- [x] Add the first social-post record and audited approval states. Scheduling, attempts, and
      platform result state remain for the delivery slice.
- [x] Upload the exact reviewed demo game-card export to a durable public HTTPS asset URL.
- [x] Add an authenticated operator UI for preview, demo/rights checks, caption entry, and approval.
- [x] Add a guarded one-shot publishing worker with durable claim, retry/backoff, and conservative
      reconciliation state. A recurring scheduler remains future work.
- [x] Remove the manual download-and-re-upload step: render the reviewed card in the browser and
      carry it to the review screen. Approval and both declarations are unchanged.
- [ ] Exercise a private test account end to end, including token expiry and rejected media.

### Later or explicitly deferred

- [ ] Carousels.
- [ ] Instagram insights ingestion and attribution reporting.
- [ ] Multiple Instagram account connections.
- [ ] Optional AI caption suggestions or asset ranking, behind human approval.
- [ ] TikTok integration, after the Instagram lifecycle is proven.

## Definition of Done

Instagram publishing is production-ready only when an authorised operator can select a consented
asset, preview and approve the exact caption, schedule or publish it once, see the resulting
Instagram media identifier and permalink, and safely recover from expired tokens, invalid media,
rate limits, restarts, and ambiguous delivery outcomes.

## Document Map

- [`architecture.md`](./architecture.md) — boundaries, lifecycle, and target design.
- [`platform-knowledge.md`](./platform-knowledge.md) — Meta API facts and decisions.
- [`runbook.md`](./runbook.md) — setup, verification, security, and incident checks.
- [`manual-actions.md`](./manual-actions.md) — the exact Meta, environment, and operator setup still
  required outside the repository.
- [`decisions.md`](./decisions.md) — concise architecture decision records.

The broader content strategy remains in [`../marketing-social.md`](../marketing-social.md), and
the related product backlog remains in [`../ideas.md`](../ideas.md).

## Change Log

- **19 August 2026:** created the feature branch, API client foundation, tests, verification
  command, and documentation set. No production credentials or public endpoints were added.
- **23 August 2026:** added the operator-only OAuth connection milestone: role enforcement,
  one-time state, long-lived token exchange, encrypted database storage, status/verify/disconnect
  endpoints, admin UI, operator utility, tests, and deployment placeholders. No publish endpoint
  was added.
- **4 September 2026:** configured the Meta development app and test professional account, granted
  the development operator, and completed the first OAuth connection, server-side verification,
  disconnect, and reconnect cycle through the deployed TSW development application. Publishing
  remains disabled.
- **4 September 2026:** added token-health warnings, an operator-triggered long-lived-token refresh
  with concurrency protection and audit timestamps, plus a controlled encryption-key rotation
  command. No publishing endpoint was added.
- **4 September 2026:** added the first durable `InstagramSocialPost` approval workflow for a
  manually exported 4:5 demo game-card image. The uploaded bytes and reviewed content are bound by
  SHA-256 digests; approval still cannot publish.
- **5 September 2026:** added explicit delivery queueing and a one-shot worker using the encrypted
  OAuth credential. Pre-publish failures retry durably; uncertain publish outcomes stop in
  `reconciliation_required` rather than risking duplication.
- **5 September 2026:** added an operator-only Instagram button beside the Pulse share button. It
  renders the exact feed game card to a 1080x1350 PNG in the browser and carries it, the source
  post id and the Pulse caption to `/admin/social/instagram`, where the existing form is prefilled.
  The export now reuses the live `GameCardPost` inside a TSW frame instead of the separate
  honours-board composition, so the approved image is the card the operator saw. Nothing is created
  or published by the hand-off: the demo and rights declarations, draft creation, review and
  approval steps are untouched.
