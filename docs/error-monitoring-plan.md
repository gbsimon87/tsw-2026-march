# Error monitoring plan

**Status:** implementation in progress, 13 September 2026. This is the
implementation plan for [P4 in the backlog](ideas.md); Sentry projects have
been created, but no monitoring code or event delivery has shipped from it.

## Three free tools considered

Prices and limits checked on 13 September 2026. “Free” here means an ongoing
hosted $0 plan, with no self-hosted infrastructure bill; all three stop or drop
events at a quota unless an account deliberately upgrades. Quotas and plan
features can change, so verify the account screen before rollout.

| Tool                                                  | Ongoing free allowance                                                                                                  | Fit for TSW                                                                                                                                                                                                                               | Main cost or suitability constraint                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [PostHog Error Tracking](https://posthog.com/pricing) | 100,000 exceptions/month; up to [five insight alerts](https://posthog.com/docs/alerts), checked hourly on the free tier | `posthog-js` and `posthog-node` are installed, the EU host and Dev/Prod projects already exist, and there is no new vendor to manage.                                                                                                     | The published free plan includes **one project**, while TSW uses two. We cannot assume those existing projects are both free. Free email trend alerts are hourly; faster insight checks require a paid tier.                                                             |
| [Sentry Developer](https://sentry.io/pricing/)        | 5,000 errors/month, unlimited projects, one user, email alerts, 30-day lookback                                         | First-class React/Node error tracking; separate browser/API and Dev/Prod projects fit within the free plan. [EU storage is available on Developer](https://sentry.io/changelog/data-storage-location-in-germany-is-generally-available/). | Two new SDKs and a separate vendor; the one-user limit matters if another operator needs dashboard access. The 5,000-error quota is ample for today's handful of leagues, but a burst can exhaust it.                                                                    |
| [Rollbar Free](https://rollbar.com/pricing)           | 5,000 occurrences/month, unlimited users/projects, real-time alerts, 30-day retention                                   | Strong free alerting and enough capacity for current traffic.                                                                                                                                                                             | New SDKs/vendor, and [Rollbar identifies the US as its data-processing location](https://docs.rollbar.com/docs/gdpr-rollbar); this is a worse fit for TSW's EU-oriented telemetry setup. Its free quota also stops processing after the limit unless overage is enabled. |

**Choose Sentry Developer for error tracking.** It is the clearest $0 route to
separate Dev and Prod, supports EU storage, and includes email error alerts
without waiting for an hourly insight check. The one-user and 5,000-error
limits fit TSW's current scale if one person owns monitoring; monitor quota use
and revisit this choice if another operator needs access or volume grows.
Create the Sentry organization in the EU region, use its free Developer plan,
and do not enable pay-as-you-go or paid add-ons. PostHog remains the
product-analytics system, with automatic exception capture off. Rollbar's free
plan is attractive on
alerts and seats, but its US data location adds a less suitable data-transfer
decision for this project.

## Decision: one application error-reporting pipeline

**All actionable application incidents go through one reporting policy and one
destination: Sentry.** Sentry groups issues and sends the operator's production
email alerts. A separate Resend operator mailer would need its own triggers,
deduplication, and delivery checks, with little benefit at TSW's current
scale. Do not add a second incident store or duplicate PostHog exception
events.

Keep three responsibilities distinct:

- **Handle the failure where recovery is possible.** Existing billing,
  Instagram, API, and browser code still decides whether to retry, return a
  safe response, or record a durable failed state. Centralizing reporting must
  not turn these into one catch-all handler.
- **Report once at a small number of boundaries.** A server reporter and a
  browser reporter apply the same severity/category rules, privacy allowlist,
  fingerprint, and environment/version tags, then send to Sentry. Domain code
  never imports a Sentry SDK directly. The table below names the owner for
  each incident, so a failure cannot be sent from both a domain service and
  the final Express middleware.
- **Keep existing platform diagnostics.** Pino writes a structured error
  record with a request ID for diagnosis; Render displays those logs and sends
  native notifications when the API or DB-backed health check becomes
  unhealthy or a deploy fails. Render covers platform availability, not
  per-error application alerts. PostHog remains product analytics only.

Render's Hobby log retention is seven days, so logs are a short-lived
diagnostic record. Sentry is the issue inbox and alert source.

## Reporting ownership and coverage

| Signal                                                                                                  | Single reporting owner                                                      | Rule                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API request ends in an unexpected 5xx, including a thrown Stripe/webhook error                          | Final Express error middleware                                              | Log with request ID and report once. Billing code attaches a safe category/stage to the error but does not send it. Expected 4xx, auth, and validation failures stay out of Sentry.                                                     |
| Process fails during startup or a standalone script fails                                               | Top-level process/script handler                                            | Report a safe fatal incident, log it, flush briefly, then exit; Render detects a service outage. Do not register a second automatic SDK handler for the same failure.                                                                   |
| Stripe reports a business failure but the webhook succeeds (for example, `invoice.finalization_failed`) | The webhook outcome branch                                                  | Report a stable `billing` code once per handling attempt; the normal 2xx acknowledgement remains. If processing throws instead, the Express middleware owns the incident. Sentry groups repeat deliveries.                              |
| Instagram post reaches terminal failure or requires reconciliation                                      | The delivery state transition, **after** it is durably saved                | Report the stable stage/code once for that transition. Retry attempts and optional permalink lookup failures do not create issues. The manually run delivery script's fatal errors belong to its top-level handler.                     |
| Browser render crash or unhandled rejection                                                             | One browser reporter called by the React boundary or guarded global handler | Deduplicate if both see the same error. Send only after a consent choice covering error reporting; otherwise show recovery/support guidance.                                                                                            |
| Browser API request fails                                                                               | API client                                                                  | Do not send received server 5xx again. In the first release, report only a final network/timeout failure of a critical mutation, subject to consent and a bounded cooldown; ignore expected status responses and routine read failures. |

For the first release, an exception payload contains only a fixed error
category/code, fixed operation or route **template**, severity, `app_env`,
`app_version`, and a server-generated request ID when there is one. Do not send
user IDs, email, names, raw URL/query/referrer, request/response bodies,
headers/cookies, Stripe or Instagram objects, captions, transcripts, original
error messages, original stacks, or session replay. Use Sentry's
`captureException` with a **new, safe Error** and a stable explicit fingerprint;
never pass a raw third-party `Error` to the SDK. Disable automatic request
context, breadcrumbs, replay, tracing, and global exception collection at SDK
initialization; keep a final `beforeSend` allowlist for the entire outgoing
event. A future source-map/stack-trace upgrade needs its own payload review.
The Render log and the response's request ID hold the detail needed to
investigate a particular API failure. Browser reports without the relevant
consent are deliberately absent; the recovery screen should offer a visible
way to contact support.

Server operational reporting should have its own `ENABLE_ERROR_MONITORING`
switch, separate from `ENABLE_ANALYTICS` and its consent-gated event contract.
Create separate API and browser projects for Dev and Prod (four free projects),
and configure an EU Sentry DSN for each behind this switch. Keep the reporter
module and allowlist separate from PostHog analytics. Give the browser its own
`VITE_ENABLE_ERROR_MONITORING` switch and DSN. Sending to
Sentry is a new processing purpose and vendor: update the privacy copy and
versioned consent choice so browser error reporting is explicitly covered, or
leave browser sending off. Before sending server diagnostics without analytics
consent, review and document the operational purpose, payload, retention,
access, and legal basis. If that review does not support it, keep server
reports in Pino/Render logs while the purpose is resolved; this would lose
per-error email alerts. Do not silently reuse the existing analytics consent
or alter PostHog's capture rules.

## Master implementation log

**Last updated:** 13 September 2026. **Resume at:** Step 02. The project owner
reports that all four Sentry projects have been created. Step 02's contract
and copy are drafted below; privacy approval is outstanding. No monitoring
code or event delivery has shipped from this plan.

Read only **Manual steps for you** when you need your next action. **None**
means I will handle that step. The project table and variable values below
use your `tsw-client-*` names.

Use only these values in each **Completion Status** field: **Not started**,
**In progress**, **Blocked**, or **Done**. When work starts, update the status
and the evidence/handoff field. Mark a step Done only after its completion
criteria are met; for a Blocked step, record the precise blocker and the next
independent step that can proceed. Keep this resume pointer on the first
unfinished step, and record the date whenever it moves.

### 01. Create the Sentry projects

**Requirements:** Create separate API and client projects for Dev and Prod
with the agreed platform and product settings. Record the project slugs and
Render mapping here; keep actual DSNs in environment settings rather than
this document. Step 02 verifies the account's EU region, free plan, operator
seat, quota, and paid-overage settings before any event is sent.

**Manual steps for you:** Done. You created the projects. Do not run Sentry's
SDK setup wizard; I will handle the code later.

| Project name and slug | Platform | Team              | Error monitoring | Logging | Tracing | Profiling | Application Metrics | Alert frequency          | Matching Render service      |
| --------------------- | -------- | ----------------- | ---------------- | ------- | ------- | --------- | ------------------- | ------------------------ | ---------------------------- |
| `tsw-api-dev`         | Express  | `#the-sporty-way` | On               | Off     | Off     | Off       | Off                 | I'll set up alerts later | `tsw-2026-march-api-dev`     |
| `tsw-client-dev`      | React    | `#the-sporty-way` | On               | Off     | Off     | Off       | Off                 | I'll set up alerts later | `tsw-2026-march-client-dev`  |
| `tsw-api-prod`        | Express  | `#the-sporty-way` | On               | Off     | Off     | Off       | Off                 | I'll set up alerts later | `tsw-2026-march-api-prod`    |
| `tsw-client-prod`     | React    | `#the-sporty-way` | On               | Off     | Off     | Off       | Off                 | I'll set up alerts later | `tsw-2026-march-client-prod` |

The project-creation product switch enables Sentry's error-monitoring product;
it does not by itself implement the SDK. Pino/Render remain the log source.
Step 11 briefly tests Dev alerts; Step 09 defines production email alerts.

**Done when:** The owner confirms that all four named projects have been
created; account and privacy controls are checked before ingestion in Step 02.

**Completion Status:** Done (project creation reported by the owner).

**Evidence / handoff:** Owner reported all four projects created on 13
September 2026. No account access was available for independent verification;
region, plan, overage settings, operator email, and exact slugs remain a
pre-ingestion checklist in Step 02 and are rechecked in Step 12.

> **Resume here next time — 14 September 2026, 00:30 BST.** Continue with
> Step 02 and its **Manual steps for you** below.

### 02. Approve the reporting data contract and privacy treatment

**Requirements:** Approve the fixed report contract and its single-owner
categories, codes, severities, safe operation labels, and fingerprint rules.
Approve the server lawful-basis assessment and Sentry processor treatment.
Approve browser reporting as a separate opt-in purpose or keep it disabled.
Only after approval, update `PrivacyPage.jsx`, `ConsentBanner.jsx`, the
versioned consent model, and related tests so the shipped wording matches the
actual collection. Keep PostHog automatic exception capture disabled; the
cross-reference is added to `posthog.md` now. Draft contract and copy are
recorded below for review.

**Manual steps for you:**

1. In Sentry, check **Germany/EU** region and **Developer ($0)** plan. Keep
   paid overages off. Turn on **Prevent Storing of IP Addresses** and the
   default data scrubbers. Accept the [Sentry DPA](https://sentry.io/legal/dpa/)
   if you have not already.
2. Read the short [proposed privacy wording](#product-copy-to-approve).
   Tell me two choices: **Server reports: approve or keep off? Browser reports:
   separate opt-in or keep off?** Include the approver's name and date. I will
   update the app after that decision.

**Done when:** The data contract and privacy wording are documented and
reviewed, and the browser/server collection decisions are explicit. If a
decision is pending, keep its corresponding capture switch off.

**Completion Status:** In progress (engineering draft complete; operator
privacy and account decisions pending; no capture enabled).

**Evidence / handoff:** Reviewed existing `PrivacyPage.jsx`,
`ConsentBanner.jsx`, `consent.js` (`CONSENT_VERSION=2` is analytics-only), and
`posthog.md` on 13 September 2026. Draft contract, copy, and operator checklist
are below. Pending: server decision/approver/date; browser decision/approver/date;
Sentry region/plan/overage/privacy/DPA check; publish approved copy and tests.

**Step 02 answer to record:** Account checks — pending. Server reports —
pending. Browser reports — pending. Approver/date — pending. Do not paste
DSNs or passwords here.

### 03. Make Pino logs and request IDs safe

**Requirements:** In `server/src/config/logger.js` and `server/src/app.js`,
remove raw query strings from HTTP logs, redact sensitive headers and known
nested secret fields, and avoid logging successful health probes on every
poll. Audit current error logging for Resend, Stripe, OAuth, and Instagram
SDK objects. Validate or replace untrusted `x-request-id` values in
`requestId.middleware.js`. Emit one structured error record per server
incident with request ID, environment/version, safe operation/code, and
status; keep the existing 5xx response shape and request ID.

**Manual steps for you:** None.

**Done when:** Tests show malformed IDs, fake tokens, and query-bearing URLs
do not enter logs, while a 5xx remains findable by its response request ID.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 04. Add disabled-by-default Sentry configuration

**Requirements:** Add `@sentry/node` and `@sentry/react`. Define
`ENABLE_ERROR_MONITORING` and `VITE_ENABLE_ERROR_MONITORING` independently of
PostHog analytics, with EU DSNs and version/environment tags. Update
`server/src/config/env.js`, `client/src/lib/env.js`,
`scripts/validate-env.mjs`, and all four Render services in `render.yaml`;
keep DSNs dashboard-owned and switches off until their rollout step. Initialize
the SDKs with automatic request context, global exception capture,
breadcrumbs, replay, tracing, console, and performance collection disabled.
Attach a final `beforeSend` allowlist.

**Manual steps for you:** When I finish the code for this step, open each
Render service's **Environment** page and enter these values:

| Render service               | Set this key      | Value to copy from Sentry | Set this switch                      |
| ---------------------------- | ----------------- | ------------------------- | ------------------------------------ |
| `tsw-2026-march-api-dev`     | `SENTRY_DSN`      | DSN of `tsw-api-dev`      | `ENABLE_ERROR_MONITORING=false`      |
| `tsw-2026-march-client-dev`  | `VITE_SENTRY_DSN` | DSN of `tsw-client-dev`   | `VITE_ENABLE_ERROR_MONITORING=false` |
| `tsw-2026-march-api-prod`    | `SENTRY_DSN`      | DSN of `tsw-api-prod`     | `ENABLE_ERROR_MONITORING=false`      |
| `tsw-2026-march-client-prod` | `VITE_SENTRY_DSN` | DSN of `tsw-client-prod`  | `VITE_ENABLE_ERROR_MONITORING=false` |

Click **Save only**. I cannot give you the DSN strings because Sentry creates
a different one for each project; copy each from that project's **Client Keys**
page. Keep the strings out of this document.

**Done when:** Both builds pass with monitoring off; no Sentry request or
browser storage is created by initialization alone; invalid enabled
configuration fails validation.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 05. Implement the shared server reporting policy

**Requirements:** Create one server reporter module that maps a failure to
the approved contract, constructs a new safe Error and stable fingerprint,
and sends it through Sentry. No domain service imports the Sentry SDK. The
reporter must be best-effort, bounded in time, non-recursive on failure, and
unable to change API or webhook results. Provide a short flush during
graceful shutdown.

**Manual steps for you:** None.

**Done when:** Unit tests prove the outgoing payload is allow-listed, a
repeated safe code groups consistently, reporting failure is logged locally,
and no raw Error reaches Sentry.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 06. Wire thrown server failures at their final boundaries

**Requirements:** Call the server reporter once for unexpected 5xx from the
final Express error middleware, with the existing response request ID. Wire
startup and standalone-script fatal handlers to report a safe fatal incident,
flush briefly, log, and exit. Do not register overlapping automatic SDK
handlers. Expected 4xx, validation, and auth failures must not report.

**Manual steps for you:** None.

**Done when:** A thrown billing/webhook 5xx and a normal API 5xx each create
one issue occurrence, a 4xx creates none, and Sentry failure never changes
the HTTP response or process exit behavior.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 07. Wire non-throwing business failures

**Requirements:** In the Stripe webhook branch, report a safe billing code
for a business-failure event that is acknowledged with 2xx; thrown processing
errors remain owned by Step 06. In Instagram delivery, report only after a
terminal failure or reconciliation-required state is durably saved. Do not
report ordinary retries or optional permalink lookup failures. Use local
event/post identifiers only for deduplication; do not transmit them to Sentry.
Keep the manually run processor's fatal error at its top-level handler.

**Manual steps for you:** None.

**Done when:** Tests show one reporting path per handling attempt/state
transition, preserved Stripe acknowledgement and Instagram persistence
semantics, and no duplicate report when an error reaches Express.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 08. Add the browser reporter and recovery UI

**Requirements:** Create one browser reporting module used by a top-level
React error boundary and guarded global error/rejection handlers; deduplicate
overlap. Show a usable recovery/support fallback. In the API client, report
only a final network/timeout failure for an approved critical mutation, with
a bounded cooldown; never repeat a received server 5xx or expected status.
Gate every send on the current consent choice approved in Step 02, and stop
capture on withdrawal. Keep PostHog `capture_exceptions: false`.

**Manual steps for you:** None. Your browser-reporting choice is in Step 02.

**Done when:** A consented render crash sends one sanitized event, declined
or stale consent sends none, withdrawal stops later events, and a server 5xx
is not reported twice.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 09. Configure production alerts and the operator runbook

**Requirements:** Enable Render failure email notifications for the
production API and verify the DB-backed `/api/v1/health` check. Configure
Sentry email issue alerts for production API and browser projects; keep Dev
alerts quiet after testing. Define who receives and reviews alerts, where to
search Pino logs by request ID, how to compare a billing incident with
Stripe, how to inspect a durable Instagram delivery state, and how to check
Sentry quota and delivery. Include a daily manual queue/reconciliation check
until the Instagram processor is scheduled.

**Manual steps for you:**

1. In Sentry, email yourself on **new or regressed issues** in
   `tsw-api-prod` and `tsw-client-prod`. Name the alerts `TSW Prod API` and
   `TSW Prod Client`. If Sentry already made an alert, edit it instead of
   adding a duplicate.
2. In Render, set `tsw-2026-march-api-prod` notifications to **Only failure
   notifications**. I will write the runbook; tell me which email address
   should own these alerts.

**Done when:** An operator can follow the runbook from an alert to the
relevant application or durable state, and the intended email destinations
are verified.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 10. Complete automated regression checks

**Requirements:** Test classification and exactly-one-owner rules across
Express, Stripe, Instagram, browser boundary, and API client. Assert no
capture without the relevant consent, no raw secrets or URLs in outgoing
events, Sentry failure does not alter business behavior, and the network
cooldown works. Run `pnpm check-env`, `pnpm check-secrets`, `pnpm lint`,
`pnpm test`, and `pnpm build`, as required by `PROJECT-KNOWLEDGE.md`.

**Manual steps for you:** None.

**Done when:** All relevant tests and repository checks pass on the final
implementation; failures and their fixes are recorded here.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 11. Prove delivery in deployed Dev

**Requirements:** Deploy the gated implementation to Render Dev. Use
synthetic API, browser, Stripe, and Instagram failures with test data.
Inspect the actual outbound payload and Sentry issue in the correct EU Dev
project, including environment/version, fingerprint, and request ID where
applicable. Search for planted fake secrets, names, tokens, and query strings.
Temporarily test an email alert, then return Dev alerts to quiet.

**Manual steps for you:** Open `tsw-api-dev` and `tsw-client-dev` in Sentry
and check that my test errors appear. If browser reporting is off, check that
no client test error appears. Tell me whether the temporary Dev alert email
arrived; then turn that Dev alert off. I will check the event contents.

**Done when:** Each approved reporting path behaves exactly as designed, no
forbidden data is present, the email destination works, and the evidence is
recorded. Unit tests alone do not satisfy this step.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 12. Enable and smoke-test production

**Requirements:** Reconfirm the free account and privacy gates. Configure
Prod API/browser DSNs in Render, turn on only the approved server and browser
switches, and deploy through the existing manual production process. Send
one safe production probe per enabled source; confirm the correct Prod
project, grouping, alert delivery, environment/version, and absence of
sensitive data. Keep rollback documented as disabling the monitoring
switches; Pino and Render health notifications remain.

**Manual steps for you:** When I say the rollout is ready, in Render set
`ENABLE_ERROR_MONITORING=true` on `tsw-2026-march-api-prod`. Set
`VITE_ENABLE_ERROR_MONITORING=true` on `tsw-2026-march-client-prod` **only if**
you approved browser reports in Step 02; otherwise keep it `false`. Choose
**Save, rebuild, and deploy** for the client so its `VITE_` values take effect.
Use **Deploy latest commit** for the API. Then confirm the production alert
email arrives. To turn monitoring off, set the same switch(es) back to `false`
and redeploy (rebuild the client).

**Done when:** Production probes and operator emails are verified without a
charge or privacy-contract breach, and rollback settings are recorded.

**Completion Status:** Not started.

**Evidence / handoff:** —

### 13. Observe the first week and close P4

**Requirements:** For seven days after enablement, review new Sentry issues,
alert delivery, quotas, Render health/deploy notifications, and the manual
Instagram queue check; tune only noisy classification or safe cooldown rules.
Record any missed incidents or privacy findings and resolve them before
closing. Update this plan's operating notes and `PROJECT-KNOWLEDGE.md`, then
remove P4 from `ideas.md` only after error monitoring is actually live, as
that backlog requires.

**Manual steps for you:** For seven days, check your Sentry alert email, Sentry
usage, Render failure emails, and the Instagram delivery queue once a day.
Tell me about missed or noisy alerts; I will record and fix them.

**Done when:** The first-week review is recorded, there is a working alert
and diagnostic path for the agreed failure classes, and the backlog reflects
the shipped state.

**Completion Status:** Not started.

**Evidence / handoff:** —

## Technical notes for Step 02

### Report contract

The first release sends only **application-controlled, bounded values**. Sentry
will also need its own protocol fields (for example an event ID and timestamp),
which the SDK allowlist must review in Step 04. Reporters must construct a new
safe `Error` from a fixed code and strip the generated stack before sending.
No raw exception, request, response, user, Stripe, or Instagram object is ever
passed to Sentry. Use a final `beforeSend` allowlist and inspect the actual
outbound envelope in Step 11; SDK defaults are not a privacy guarantee.

| Field         | Allowed value and validation                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `category`    | One of `api`, `process`, `billing`, `instagram`, `browser`, `network`.                                      |
| `code`        | One fixed code from the incident table below; never concatenate an exception message or dynamic ID.         |
| `operation`   | A fixed route **template** or approved operation label from a code-owned manifest; otherwise `unknown`.     |
| `stage`       | Omit in v1; the fixed billing/Instagram codes already distinguish the recovery states.                      |
| `severity`    | `error` or `fatal` as specified below.                                                                      |
| `app_env`     | `development` or `production`, from validated configuration.                                                |
| `app_version` | A validated release/build identifier from application configuration.                                        |
| `request_id`  | Only a server-generated UUID after Step 03 rejects or replaces untrusted incoming IDs; omit if unavailable. |

| Boundary/event                           | Fixed code                            | Severity | Grouping operation                             |
| ---------------------------------------- | ------------------------------------- | -------- | ---------------------------------------------- |
| Unexpected API 5xx                       | `api.unexpected_5xx`                  | `error`  | Approved Express route template or `unknown`   |
| Startup failure                          | `process.startup_failure`             | `fatal`  | `server.startup`                               |
| Standalone script failure                | `process.script_failure`              | `fatal`  | Approved script label or `unknown`             |
| Invoice finalization business failure    | `billing.invoice_finalization_failed` | `error`  | `billing.webhook`                              |
| Instagram terminal delivery failure      | `instagram.delivery_failed`           | `error`  | `instagram.delivery`                           |
| Instagram reconciliation required        | `instagram.reconciliation_required`   | `error`  | `instagram.delivery`                           |
| React render crash                       | `browser.render_crash`                | `error`  | Approved component/screen label or `unknown`   |
| Browser unhandled rejection              | `browser.unhandled_rejection`         | `error`  | Approved screen label or `unknown`             |
| Critical mutation exhausts network retry | `network.critical_mutation_failed`    | `error`  | Approved mutation label from a short allowlist |

Use the explicit fingerprint `[category, code, operation]`. Do not include
event IDs, user IDs, URLs, timestamps, exception text,
or the request ID in the fingerprint. Allow the existing response's request
ID to correlate a server Sentry issue with Pino/Render, but never send it if
it originated from an untrusted `x-request-id`. Unknown failures use a fixed
fallback, never a raw message. The code list can change only through a
reviewed contract update and a Dev payload test.

Excluded from **every** event and breadcrumb: account/person identifiers,
email, names, IP field, raw URL/path/query/referrer, headers/cookies, request
or response bodies, payment data, Instagram identifiers or content, captions,
transcripts, original exception messages/stacks, device/session identity,
attachments, replay, and performance spans. Disable automatic collection
that could reintroduce them. A browser-to-Sentry HTTPS request still exposes
the browser's network address to Sentry in transit; **Prevent Storing of IP
Addresses** concerns event storage, not transport. The browser choice and
privacy copy must reflect that distinction.

### Processing decision

**Proposed server purpose:** detect and investigate unexpected API faults and
durable billing/Instagram failure states so the requested service can be kept
reliable. Proposed UK GDPR basis: **legitimate interests**, separate from
PostHog analytics consent. The purpose test is concrete service reliability;
the necessity case is that short-lived Render logs have no grouped issue
inbox or per-error email alert; the balancing case depends on fixed,
non-content payloads, one operator seat, EU storage, IP-event scrubbing, short
Developer lookback, and no profiling or reuse for marketing. Review whether
minors' data, rare request IDs, and any residual SDK/transport metadata alter
that balance. This is a proposed [legitimate-interests assessment](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/),
not a recorded legal approval. If rejected, leave server Sentry capture off
and use Pino/Render while the basis is resolved.

**Proposed browser purpose:** optional technical error reports to diagnose
render crashes and a small set of failed critical writes. Make this an
**independent opt-in**: `tsw_consent` and `CONSENT_VERSION=2` remain analytics
only; a future `tsw_error_consent` decision with
`ERROR_CONSENT_VERSION=1` is off by default, expires, and can be withdrawn
from Privacy/Cookie settings. The choice UI must appear when browser error
monitoring is offered even if PostHog analytics is disabled. Do not infer
permission from analytics consent, login, or continued use. If browser
reporting is not approved for this release, keep the browser switch off and
do not show an error-reporting choice yet. The ICO's [storage/access
guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)
has a narrow technical-fault exception; separate opt-in avoids claiming that
the planned third-party browser SDK and its processing meet that exception
without a specific assessment.

**Processor and retention review:** Sentry is a new processor for this
purpose. Confirm the four projects are in the EU organization, review/accept
the applicable DPA, restrict dashboard access to the operator, enable IP-event
scrubbing, and verify the current Developer data lookback/retention and deletion
controls in the account. Do not equate EU **storage** with a claim that every
support or network-processing operation stays in the EU. Use the verified
account setting in the privacy page. The source of truth for failed billing
and Instagram work remains the application database, not a Sentry event.

### Product copy to approve

These are proposed additions for `PrivacyPage.jsx`, **not yet published**:

> **Error reports.** To find and fix faults, we may send limited technical
> reports about unexpected server errors to Sentry. A report identifies the
> type of fault, the part of the service involved, the app version, and
> sometimes a request reference we can use to find our own server log. The
> error event we construct excludes your name, email, form entries, page
> address, payment details, and screen recordings. Sentry may process a
> network address and other connection metadata when receiving a report; we
> configure its projects not to store IP addresses in error events. Server
> fault reporting is used to keep the service working;
> it is separate from optional analytics.
>
> **Optional browser error reports.** If you choose to allow these, your
> browser can send a similarly limited report when the site crashes or a
> critical action fails because of a network problem. You can refuse or
> withdraw this choice in Privacy/Cookie settings without affecting your use
> of the service. We do not send browser error reports before you agree.

Add **Sentry — error diagnosis — Germany/EU data storage** to the processor
table, noting that Sentry is US-based, the operator verifies the region, and
Sentry may process connection metadata. Under legal bases, describe the approved server
legitimate interest and the separate browser opt-in. Under retention, state
the verified Sentry period (Developer currently advertises a 30-day
lookback), plus the right to request deletion where applicable. Update the
policy review date only when this text is published, and keep any statement
about actual capture conditional on the feature being enabled.

Proposed `ConsentBanner.jsx` choice copy, shown only if browser reporting is
approved and enabled:

> **Optional privacy choices.** Analytics helps us understand which pages
> are useful. Error reports help us fix crashes and failed critical actions.
> Choose each separately; both are off until you allow them. Error reports
> contain limited technical labels, not your name, email, form entries, or a
> screen recording. You can change either choice at any time.

Provide separate, unchecked **Analytics** and **Error reports** controls,
with equally accessible **Reject optional** and **Save choices** actions.
Store and honor the error decision independently, including expiry and
withdrawal; keep the existing analytics decision and its version separate.
The current banner opens for undecided visitors only when PostHog is enabled,
so Step 08 must change that rule before browser Sentry is activated.

## Current limits

Render does not emit logs for the static client, and Sentry browser errors are
consent-limited and may be blocked by the browser. Sentry's free quota can drop
new errors after 5,000 in a month; Pino/Render remains the server fallback.
Health checks detect an unhealthy API/DB, but cannot prove that Stripe webhooks
or the manually run Instagram processor are making progress. Sentry delivery
is best-effort; the durable billing and Instagram records remain the source of
truth. Revisit queue-lag and no-run alerts when the planned job runner ships.

## Vendor references checked 13 September 2026

- [PostHog pricing and free limits](https://posthog.com/pricing)
- [PostHog insight alert frequencies and free alert count](https://posthog.com/docs/alerts)
- [Sentry Developer pricing, projects, alerts, and quotas](https://sentry.io/pricing/)
- [Sentry EU storage on the free Developer plan](https://sentry.io/changelog/data-storage-location-in-germany-is-generally-available/)
- [Sentry DPA and acceptance instructions](https://sentry.io/legal/dpa/)
- [Sentry organization privacy settings, including IP-event scrubbing](https://docs.sentry.io/api/organizations/update-an-organization/)
- [ICO legitimate-interests assessment guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/)
- [ICO storage/access technology exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)
- [Rollbar free plan and quota behavior](https://rollbar.com/pricing)
- [Rollbar data-processing location](https://docs.rollbar.com/docs/gdpr-rollbar)
- [Render log retention and static-site logging](https://render.com/docs/logging)
- [Render failure notifications](https://render.com/docs/notifications)
