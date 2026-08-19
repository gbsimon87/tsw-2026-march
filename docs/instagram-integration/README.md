# Instagram Publishing Integration

This folder is the living record for TSW's Instagram publishing integration. Update it whenever
the implementation, Meta configuration, operational process, or delivery status changes.

**Status:** foundation in progress, disabled by default  
**Started:** 19 August 2026  
**Branch:** `feat/instagram-publishing`, based on `dev`

## Goal

Allow an authorised TSW operator to publish an approved, consent-safe image or Reel to the TSW
Instagram professional account. AI is not required for publishing: this is a deterministic API
workflow. AI may later assist with optional caption drafts or content ranking, but it must not be
in the approval or delivery path.

## Current Scope

The first implementation slice provides:

- a disabled-by-default Instagram Graph API configuration;
- a server-side client for account verification, image and Reel containers, container polling,
  and publication;
- structured errors that do not expose the access token;
- a read-only connection verification command; and
- unit coverage for request construction, polling, errors, and configuration validation.

There is intentionally no HTTP publishing endpoint yet. The application currently has no
platform-operator role or social approval workflow, so exposing one would create an unsafe
authorisation boundary.

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

- [ ] Create the Meta developer app and configure Instagram Login redirect URLs.
- [ ] Implement OAuth connection and callback endpoints with CSRF/state validation.
- [ ] Store access tokens encrypted at rest; record expiry and account metadata.
- [ ] Add a platform-operator permission separate from league and team roles.
- [ ] Add a social-post record with approval, scheduling, attempts, and platform result state.
- [ ] Connect approved share exports to durable, publicly accessible HTTPS asset URLs.
- [ ] Add an authenticated operator UI for preview, consent checks, caption editing, and approval.
- [ ] Add an idempotent background publishing job with retry/backoff and reconciliation.
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
- [`decisions.md`](./decisions.md) — concise architecture decision records.

The broader content strategy remains in [`../marketing-social.md`](../marketing-social.md), and
the related product backlog remains in [`../ideas.md`](../ideas.md).

## Change Log

- **19 August 2026:** created the feature branch, API client foundation, tests, verification
  command, and documentation set. No production credentials or public endpoints were added.
