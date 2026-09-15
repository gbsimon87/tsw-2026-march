# PostHog analytics handbook

**Status:** privacy/contract implementation in progress 12 September 2026. This is the current
source of truth for PostHog in The Sporty Way. It supersedes
[`analytics-plan.md`](analytics-plan.md).

This handbook explains what exists today, what is unsafe or incomplete, which
events The Sporty Way should collect, how to configure both PostHog projects,
and how to verify development and production. It is deliberately detailed so
that somebody who has never used PostHog can follow it.

This document is an implementation plan and operating manual. The execution log
below records changes made after the original audit.

## 0. Pick up here next time

Last worked on 12 September 2026, on branch `feat/posthog`. Phases A-C of §15
are complete apart from one blocked item, and §16.1 (local browser test,
steps 1-15) passes on a clean profile.

**Do this next, in order:**

1. **Finish §16.1 steps 16-18** — needs a signed-in local session. Log in and
   confirm the distinct ID becomes the internal user ID, that only the approved
   person properties appear, that logout resets the identity, and that signing
   in as a second account does not merge with the first.
2. **Run §16.2** (sensitive routes: Google completion, verification link,
   password reset, Stripe test checkout → `/billing/success`). This is the test
   that proves no token or session ID reaches PostHog.
3. **Run §16.3 locally** — the server outcome test. It exercises the P1
   activation events end to end and is the first real proof that
   `resource_created`, `roster_populated`, `league_team_created`,
   `game_scheduled`, `game_tracking_started` and `game_completed` fire once and
   only after the write succeeds. Nothing has confirmed them outside unit tests.
4. **Deploy to Render development and repeat §16.3-§16.4 there**, then inspect
   the payloads in Dev **Activity → Live events**.
5. **Only then mark the P1 event definitions verified** in Dev. They are all
   currently `verified: false`, deliberately: none of the new P1 events has ever
   been ingested, so the definitions are documentation, not proof.

**State of the PostHog projects:** every P1 event definition now exists in Dev
(unverified). Production analytics is disabled in `render.yaml` for both the
browser and the API, and the live Render dashboard has still not been checked
by hand. Three `tsw_probe_local` events exist in Dev from debugging the
ingestion endpoint; they are not real traffic.

**Social backlog setup updated through MCP on 15 September 2026:**
`social_landing_viewed`, `share_initiated`, `share_completed` and
`league_enquiry_submitted` now have definitions in Dev project `247334`, with
descriptions, tags, and `verified: false`. The landing and enquiry definitions
were created; the already-ingested share definitions were updated. The share events
gained `game_kit`, `carousel_slide` and `leaderboard_card` target types (and a
`league_page` source); the definitions also include `player_game_card`,
`milestone`, and the `post`/`story`/`link` formats.

Four captured share payloads from 14 September 2026 were inspected through
MCP: initiation/completion pairs for `player_game_card` and `carousel_slide`,
both `download` / `game_detail` / `post`. Completion carried
`result=succeeded`; `app_env=development`, schema version 1, and first touch
`direct` / `none` / `none` matched the contract. A sensitive-key check found
only the public SDK project capture key, SDK rate-limit metadata, and a
referring-domain sentinel without URL/path syntax. No contact content or raw
URL-bearing key was found in these samples.

Landing and enquiry events have not been received. Tagged/referrer landings,
other asset types/formats, signup attribution, cancellation/failure paths, and
successful enquiries remain part of the browser verification work in items
1–5 above. All four definitions remain unverified until that coverage is
complete. Production was not changed.

First-touch attribution also now rides
on every browser event as a super property and on the person via `$set_once`;
§16.2 should confirm no `utm_*` value reaches PostHog outside the three
`first_touch_*` properties.

**Blocked on a decision, not on engineering:**

- the historical URL-exposure deletion (§13.4) — 2,095 Dev and 606 Prod
  `$pageview` events carry URL-bearing properties, and deletion is irreversible;
- organisation MFA, which §17.1 gates production analytics on;
- sign-off on the consent wording.

**Deliberately not done** (out of the agreed P1 scope): moving the durable feed
success events to the server (the last open Phase B box), and all of Phase D
and E. `game_tracking_finished` and `consent_decision` still have visible Dev
definitions and could be hidden.

**Lesson worth keeping:** both defects found on 12 September lived at a
boundary the unit tests mock out — the SDK's request builder and the CORS
preflight. Green unit tests say nothing about whether an event reaches PostHog.
Run §16 against a real browser after any change to the sanitizer, the consent
header, or the SDK config.

### Execution log — 12 September 2026

- Applied the strict project baseline to Dev and Prod: Europe/London timezone,
  IP anonymization on, and autocapture, replay, heatmaps, surveys, exceptions,
  web vitals, performance, console, and dead-click capture off.
- Renamed the development project to `Dev - The Sporty Way`.
- Replaced pre-consent capture with versioned opt-in/opt-out, propagated the
  positive consent state to the API, and added browser/server event allowlists.
- Removed raw URL/query/referrer page properties, added a final property
  sanitizer, completed the route-pattern manifest, and selected the application
  as the only pageleave owner.
- Removed the generic analytics endpoint and email-derived pseudonymous ID.
- Added common schema/environment/build properties, safe person properties,
  account-switch identity reset, onboarding/resource/roster/game scheduling,
  and server-confirmed `game_completed` capture.
- Disabled production analytics in the Render blueprint pending deployment and
  verification. The live Render dashboard must still be checked manually.
- Updated the production internal/demo cohort to use `is_internal` or `is_demo`
  and made its exclusion the default for new insights.
- Created unverified Dev event definitions for the new P1 events. They remain
  unverified until a deployed-development smoke journey is inspected.
- Reviewed organisation access: there is one owner and no additional members,
  but two-factor authentication is not enabled. Enable MFA before production
  analytics is re-enabled.
- Aggregate-only historical review for the preceding 45 days found URL-bearing
  properties on 2,095 Dev and 606 Prod `$pageview` events, plus related
  `$pageleave` and custom events. No explicit `email` or `name` event property
  was found. Historical data was not deleted; that irreversible step requires
  the privacy/security decision in §13.4.

### Execution log — 12 September 2026 (P1 activation completion)

- Added `game_tracking_started` and `league_team_created` to the server event
  contract, and gave `game_tracking_started` and `game_completed` one shared
  context builder so a funnel across them cannot drift apart.
- Captured `game_tracking_started` on the committed `scheduled` →
  `in_progress` clock transition, and on creation for a "quick game" that is
  committed straight into tracking. A resumed clock does not re-emit it.
- Captured `league_team_created` and league-team `roster_populated` after the
  write, translating the authorization roles (`owner` / `manager`) into the
  analytics vocabulary (`league_owner` / `team_manager`) in one place.
- Wired the consent header through the league team, league player, and clock
  endpoints, so these events fail closed exactly like the existing ones.
- Added the §16.5 contract tests still missing: browser and server event
  allow-lists, the one-time roster/tracking transitions under a repeated
  request, a finish retry not re-emitting `game_completed`, and
  `captureUserEventDetached` swallowing a failure rather than failing the
  request that triggered it.

- Created the Dev event definitions this work introduced —
  `game_tracking_started` and `league_team_created` — as unverified, tagged
  `activation` / `server` / `p1`, with the sending moment and approved
  properties in the description.
- Audited the rest of the P1 set against Dev while doing so: every other P1
  definition already existed except `registration_failed`, which was missing
  and has now been created on the same pattern.
- All P1 definitions remain **unverified**. None of the new P1 events has been
  ingested yet — `Data management → Events` still shows only the pre-audit
  event set as seen — so the deployed-development smoke journey in §16 is still
  the outstanding proof of integration.

Still outstanding before production analytics is re-enabled: the historical
URL-exposure deletion (needs the §13.4 privacy decision), organisation MFA,
moving the durable feed success events to the server, and every Phase D/E item.

The deprecated `game_tracking_finished` and `consent_decision` events (§4.4)
still have live, visible Dev definitions. Hiding them preserves their history
while removing them from pickers; that has deliberately not been done yet.

### Execution log — 12 September 2026 (§16.1 local verification)

Running the §16.1 local browser test found two defects that no unit test could
have caught, because both live at a boundary the tests mock out. Both are fixed
and covered by regression tests.

1. **Every browser event was rejected with HTTP 400.** `posthog-js` stashes the
   public project key on each event as `properties.token`, then reads it back
   off the first event of a batch to build the request's `api_key`. Both the
   `property_denylist` and the `FORBIDDEN_KEY` sanitizer stripped any key named
   `token`, so every batch left with no `api_key`, and ingestion rejected it
   with the badly misleading message `non-engage request missing event name
attribute`. The bare key is now preserved at the top level of an event's
   properties; `reset_token`, `token_id` and nested `token` keys are still
   stripped, and no schema in `analyticsContract.js` defines a `token`
   property, so a call site still cannot smuggle a secret through.
2. **Accepting analytics broke the entire API.** `x-analytics-consent` was
   added to the API client but never to the server's CORS `allowedHeaders`, so
   the preflight rejected it and every request failed for exactly the users who
   consented. Added to `cors.js` with a regression test asserting the allowlist
   covers every custom header the client sends.

Verified afterwards in a clean browser profile:

- no PostHog request and no PostHog storage before a decision, or after a
  decline — only `tsw_consent` and the CSRF cookie, both strictly necessary;
- after acceptance, ingestion returns 200 and events arrive in Dev carrying
  `route_pattern`, `app_env=development`, `app_version`, `event_source=browser`
  and a null `$current_url`;
- one `$pageview` per route and one `$pageleave` per departure.

Note that `properties.token` (the public `phc_` project key, the same value
shipped in the client bundle) is now visible on stored events. It is not a
secret and cannot be removed without breaking `api_key`, because `posthog-js`
reads it after `before_send` has run.

§16.1 steps 16-18 (identify, logout, account switch) and all of §16.2-§16.4
still require a signed-in journey and have not been run.

## Next-session checkpoint — start here

Resume from this exact order; do not build dashboards or add Phase D/E events
before the Dev stream passes these checks.

1. Merge/deploy this `feat/posthog` branch to the Render development services.
   Set `APP_VERSION` and `VITE_APP_VERSION` to the deployed commit SHA, confirm
   `ENABLE_ANALYTICS=true` only on the Dev API, and confirm the Dev browser/API
   each use the Dev project key. Keep both production enable flags false.
2. Finish §16.1 steps 16-18 with two development accounts: identify, logout,
   account switch, and confirm no person merge or unapproved person property.
3. Run §16.2 with harmless development-only OAuth, verification, reset, and
   Stripe test tokens. Search for the harmless marker and confirm no URL,
   query, fragment, referrer, session ID, or secret-bearing token property was
   stored. The SDK's top-level public `phc_` project-key property is the one
   documented exception.
4. Run §16.3 end to end. Confirm first-roster and first-tracking events occur
   once, a failed finish emits nothing, a successful finish emits one
   `game_completed`, and a retry emits nothing additional.
5. Inspect each new Dev payload, then mark the P1 event definitions verified
   and document their reusable properties. Do not reproduce definitions in
   Prod until this succeeds.
6. Obtain decisions/approval for historical URL-bearing data deletion, the
   final consent wording, and the proposed 13-month retention period. Enable
   organisation MFA. These are human/privacy account tasks, not code tasks.
7. Then resume at the first unchecked engineering item in §15: move durable
   feed create/delete success events to the server. Phase D/E and dashboards
   remain later work.

Production re-enablement is the final step only: check the live Render settings
manually, deploy with the approved production key/version, run one internal
smoke journey, annotate the release, and immediately disable collection if any
payload or project separation check fails.

> Privacy note: this is an engineering recommendation, not legal advice. The
> service operates in the UK and may serve people elsewhere. Have the final
> consent wording, retention period, and deletion process checked by somebody
> responsible for privacy compliance before enabling production collection.

## 1. Read this first

Do not add more production events yet. Work through the priorities in this
order:

1. **P0 — protect secrets:** stop raw URLs, query strings, fragments, and
   referrers from reaching PostHog. The current client can expose email
   verification tokens, password-reset tokens, the Google completion token,
   and Stripe Checkout session IDs.
2. **P0 — make consent real:** no browser event should leave the device before
   a person accepts analytics, and no server analytics event should be sent for
   that browser unless the server receives a trustworthy consent state.
3. **P1 — make the data dependable:** use one pageview/pageleave owner, validate
   event shapes, capture authoritative successes on the server, and add common
   environment/version properties.
4. **P1 — instrument the core journey:** registration → onboarding → resource
   creation → roster → scheduled game → tracking → completed game.
5. **P2 — add collaboration, discovery, billing, sharing, and feature-quality
   events.**
6. **P3 — build dashboards and alerts only after the event definitions pass the
   verification checklist.** A beautiful dashboard made from unsafe or
   duplicated events is still wrong.

The two most important rules are simple:

- Never put a secret, name, email address, search phrase, caption, transcript,
  or other free text in an event.
- An event named as a successful outcome must be captured only after that
  outcome succeeds.

## 2. What PostHog is, in plain language

PostHog receives small records called **events**. An event says that something
happened. For example, `game_completed` says that a game was successfully
completed.

Each event can have **properties**. Properties add safe context. A
`game_completed` event might say that the game was a league game, that dual-team
tracking was used, and that the actor was a league manager. The property must
not contain a player's name or another piece of unnecessary personal data.

Other useful PostHog words:

| Word             | Meaning in this project                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Project          | A separate bucket of events. Development and production use different projects.                                          |
| Project API key  | The public-looking `phc_…` token which tells an SDK which project receives an event. It is not a personal API key.       |
| Personal API key | A powerful `phx_…` credential used to administer PostHog. It must never be placed in this application or committed.      |
| Distinct ID      | The identifier PostHog uses to recognise one visitor or signed-in user.                                                  |
| Anonymous user   | A browser which has not been identified as an account. Under the recommended model it is collected only after consent.   |
| Identify         | Joining future activity to the application's stable internal user ID.                                                    |
| Person property  | A relatively durable fact about a person, such as `email_verified`. It is not ordinary event context.                    |
| Event property   | Context belonging to one event, such as `tracking_mode`.                                                                 |
| Funnel           | Ordered steps used to see where people stop in a journey.                                                                |
| Retention        | Whether people who perform an important action return and perform it again.                                              |
| Cohort           | A saved group, such as users who completed a game in their first 30 days.                                                |
| Insight          | A chart or query.                                                                                                        |
| Dashboard        | A collection of insights.                                                                                                |
| Annotation       | A dated note on charts, normally a deployment or product launch.                                                         |
| Autocapture      | Automatic click/input capture. It is deliberately disabled here.                                                         |
| Session replay   | A recording-like reconstruction of a visit. It is deliberately disabled here.                                            |
| Group analytics  | Optional paid PostHog functionality for treating a team or league as an entity. It is not required for the initial plan. |

An event definition in the PostHog interface does not make the application send
that event. It documents and organises an event. The application must still be
instrumented and deployed.

## 3. Product and repository scope reviewed

The audit covered the application described in
[`PROJECT-KNOWLEDGE.md`](PROJECT-KNOWLEDGE.md), the client routes and analytics
helpers, the server modules and services, environment validation, Render
configuration, privacy copy, and the existing analytics plan.

The product journeys included in the event design are:

- public Pulse feed, discovery, and public game, player, team, and league pages;
- local and Google registration, verification, login, password reset, and role
  onboarding;
- standalone teams and games;
- leagues, seasons, league teams, schedules, standings, managers, team managers,
  join requests, data health, and exports;
- one-sided and dual-team live tracking, lineups, clock management, voice
  commands, box scores, recaps, replay, shot maps, and highlights;
- follows, player claims, feed posts, automatic milestone/game posts, and
  sharing;
- Stripe subscriptions attached to a team or league rather than one global
  user plan;
- operator-only Instagram and administration workflows.

This matters because one account can have different roles and different billing
plans for different resources. A single `plan` person property cannot describe
that model accurately.

## 4. What is implemented today

### 4.1 Browser

| Area                  | Current behaviour                                                                                                    | Source                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| SDK                   | `posthog-js` is installed.                                                                                           | [`client/package.json`](../client/package.json)                                                                         |
| Initialisation        | Enabled only when `VITE_ENABLE_ANALYTICS` and `VITE_POSTHOG_KEY` are truthy.                                         | [`client/src/lib/posthog.js`](../client/src/lib/posthog.js)                                                             |
| Host                  | Defaults to the EU ingest host.                                                                                      | [`client/src/lib/env.js`](../client/src/lib/env.js)                                                                     |
| Automatic pageviews   | Disabled.                                                                                                            | [`client/src/lib/posthog.js`](../client/src/lib/posthog.js)                                                             |
| Application pageviews | `$pageview` and `$pageleave` are sent by the React route tracker.                                                    | [`PostHogRouteTracker.jsx`](../client/src/features/analytics/PostHogRouteTracker.jsx)                                   |
| Autocapture           | Disabled. This is good and should remain explicit.                                                                   | [`client/src/lib/posthog.js`](../client/src/lib/posthog.js)                                                             |
| Session replay        | Disabled. This is good and should remain explicit.                                                                   | [`client/src/lib/posthog.js`](../client/src/lib/posthog.js)                                                             |
| Consent               | Before acceptance, persistence is memory-only. Acceptance changes to cookie/local storage; decline resets to memory. | [`consent.js`](../client/src/lib/consent.js), [`ConsentBanner.jsx`](../client/src/features/analytics/ConsentBanner.jsx) |
| Identification        | After consent, the internal user ID is used and several person properties are set. Logout resets PostHog.            | [`client/src/lib/posthog.js`](../client/src/lib/posthog.js)                                                             |
| Common property       | `app_env` is registered.                                                                                             | [`client/src/lib/posthog.js`](../client/src/lib/posthog.js)                                                             |

### 4.2 Server

| Area                           | Current behaviour                                                                                                                                              | Source                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| SDK                            | `posthog-node` is installed.                                                                                                                                   | [`server/package.json`](../server/package.json)                                  |
| Initialisation                 | A client is created whenever `POSTHOG_KEY` exists.                                                                                                             | [`analytics.service.js`](../server/src/modules/analytics/analytics.service.js)   |
| Development delivery           | Development flushes each event immediately.                                                                                                                    | [`analytics.service.js`](../server/src/modules/analytics/analytics.service.js)   |
| Production delivery            | Production uses batching and graceful shutdown.                                                                                                                | [`analytics.service.js`](../server/src/modules/analytics/analytics.service.js)   |
| Failure behaviour              | Analytics failures are logged and do not fail the product request. This is correct.                                                                            | [`analytics.service.js`](../server/src/modules/analytics/analytics.service.js)   |
| Anonymous registration failure | ~~An email is converted to a deterministic hash.~~ **Removed 12 September 2026**; `registration_failed` now carries only a generic reason.                     | [`analytics.service.js`](../server/src/modules/analytics/analytics.service.js)   |
| Generic endpoint               | ~~An authenticated route accepts an arbitrary event name and arbitrary properties.~~ **Removed 12 September 2026**; every event is allow-listed by a contract. | [`analytics.contract.js`](../server/src/modules/analytics/analytics.contract.js) |

### 4.3 Environments

There are already two EU PostHog projects:

| Runtime                     | PostHog project       | `app_env`     |
| --------------------------- | --------------------- | ------------- |
| Local machine               | Dev - The Sporty Way  | `development` |
| Render development services | Dev - The Sporty Way  | `development` |
| Render production services  | Prod - The Sporty Way | `production`  |

Both the browser and server need the key belonging to the same project. The
repository has client/server host and key slots in the environment files and
Render blueprint. Do not copy the actual values into this guide, tickets,
screenshots, or chat messages.

### 4.4 Events currently found in application source

The audit found these event names. This table records reality; it does not mean
that every event should remain unchanged.

| Current event                                                  | Origin                | Decision                                                                                                                           |
| -------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `$pageview`, `$pageleave`                                      | Browser route tracker | Keep after consent, sanitisation, and single-owner correction.                                                                     |
| `consent_decision`                                             | Browser               | Deprecate under strict opt-in. Send only `analytics_consent_accepted` after acceptance; a decline must not be reported to PostHog. |
| `signup_cta_clicked`                                           | Browser               | Keep. Use a fixed `source` enumeration.                                                                                            |
| `auth_page_viewed`                                             | Browser               | Keep if it helps the acquisition funnel.                                                                                           |
| `oauth_started`                                                | Browser               | Keep; provider is a fixed enum.                                                                                                    |
| `user_registered`                                              | Server                | Keep, but gate it on known consent.                                                                                                |
| `user_logged_in`                                               | Server                | Keep only if needed; gate it on known consent. Do not use login as retention.                                                      |
| `registration_failed`                                          | Server                | Keep only with a generic reason and known consent. Remove the email-derived distinct ID.                                           |
| `feed_load_more`                                               | Browser               | Optional interaction event.                                                                                                        |
| `feed_composer_opened`                                         | Browser               | Keep as intent.                                                                                                                    |
| `feed_post_created`                                            | Browser               | Move the authoritative success to the server.                                                                                      |
| `feed_post_deleted`                                            | Browser               | Move the authoritative success to the server.                                                                                      |
| `game_detail_feed_composer_opened`                             | Browser               | Optional; combine with `feed_composer_opened` plus `source=game_detail` when history permits.                                      |
| `game_detail_feed_post_created`                                | Browser               | Replace with server `feed_post_created` and `source=game_detail`.                                                                  |
| `game_detail_tab_changed`                                      | Browser               | Keep only for a named, fixed tab enumeration.                                                                                      |
| `game_highlight_clip_shared`                                   | Browser               | Migrate to the shared event contract in §11.7.                                                                                     |
| `game_highlight_reel_opened`                                   | Browser               | Keep.                                                                                                                              |
| `game_highlight_reel_shared`                                   | Browser               | Migrate to the shared event contract in §11.7.                                                                                     |
| `game_tracking_overlay_opened`, `game_tracking_overlay_closed` | Browser               | Optional UI diagnostics; do not confuse these with tracking starting or completing.                                                |
| `game_tracking_finished`                                       | Browser               | Deprecate. It is currently sent before the finish request succeeds. Replace with server `game_completed`.                          |
| `court_layout_unknown`                                         | Browser               | Keep as a low-volume diagnostic with a safe layout identifier.                                                                     |

## 5. Audit findings and decisions

### 5.1 P0: raw URLs can expose secrets

The route tracker currently supplies the current URL, raw search string, path,
and referrer. The PostHog SDK can also attach `$current_url` itself. The
application uses sensitive query parameters on routes including:

- `/auth/google/complete?token=…`;
- `/verify-email?token=…`;
- `/reset-password?token=…`;
- `/billing/success?session_id=…`.

Other query values such as `redirectTo`, resource IDs, and filters create
high-cardinality or unnecessary data even when they are not secrets.

**Required response:**

1. If production collection is active, consider disabling browser analytics and
   redeploying until the sanitizer is ready.
2. Open **Activity → Live events** in both PostHog projects. Filter for
   `$pageview` and `$pageleave` and inspect `$current_url`, `url`, `search`, and
   `$referrer`.
3. Check the sensitive paths above. Do not copy a discovered token into a ticket
   or screenshot.
4. If any secret was captured, record the date range and affected property names
   privately. Delete the affected data using the project's data-management
   controls or contact PostHog support for the correct deletion procedure.
5. Treat any still-valid credential as exposed. Expire or revoke it where that
   is possible. Most application tokens are short-lived, but short-lived does
   not mean safe to collect.
6. Before re-enabling collection, change the application so browser events send
   a stable route pattern only. Never send a query string or fragment.
7. Add a global `before_send` sanitizer as a second line of defence. It must
   clean SDK-added URL and referrer properties as well as application-added
   properties.
8. Test every sensitive route in deployed development, not only `/`.

A safe pageview describes `/games/:gameId`; it does not contain the actual game
ID, `?token=…`, `#…`, or a full external referrer URL. If campaign attribution
is introduced later, allow-list individual campaign fields and validate them;
do not preserve the whole query string.

### 5.2 P0: memory persistence is not consent

Memory-only persistence means PostHog does not write its normal identifier to a
cookie or local storage. It does **not** stop network requests or prevent
PostHog from processing an event. The current client can therefore capture
before acceptance and after decline.

The chosen project policy should be strict opt-in:

- initialise PostHog with capture opted out by default;
- send no PostHog request before the person chooses Accept;
- on Accept, call the SDK's opt-in operation and begin collection;
- after acceptance, capture exactly one sanitized pageview for the route which
  is already open; the pre-consent attempt was discarded, so the route tracker
  must deliberately retry without duplicating it;
- on Decline or withdrawal, call its opt-out operation, clear persistence, and
  reset identity;
- store the decision locally for the published consent period;
- do not send a “declined” event, because sending it contradicts the choice;
- keep a first-party operational record only if it is genuinely needed for
  compliance and its lawful basis and retention have been approved.

The server is a separate problem. It currently has no reliable knowledge of the
browser's local consent decision. Authentication events can be sent regardless
of that decision. Future server instrumentation must receive and validate a
positive, versioned consent state from the request or an approved account
preference. Absence means no analytics capture; authentication must never imply
consent. The signal is analytics context only and must not grant authorization.
Google OAuth registration may need to defer the event until the token exchange
returns to a browser whose choice is known.

Do not assume that a deterministic hash of an email is anonymous. It is stable,
linkable pseudonymous data.

The UK's statistical storage/access exception has conditions: the processing
must be for improving the service, clear information and an easy opt-out are
needed, and information must be aggregated with individual-level data not kept
longer than necessary. This product's proposed person-level funnels, attribution,
and long-term retention should not claim that exception without legal review.

### 5.3 P1: route patterns are incomplete

The current pattern list does not cover every route. A missed route falls back
to a raw pathname, which can contain IDs. The canonical list must include all
router destinations, including:

- `/about`, `/contact`, `/pricing`, `/billing/success`, `/billing/cancel`;
- `/players/:userId`, `/my-sporty`, `/onboarding`, `/following`;
- `/admin/leagues/:leagueId/schedule`;
- `/admin/leagues/:leagueId/teams/new`;
- `/admin/teams/:teamId`;
- `/admin/social/instagram`;
- all authentication, team, league, season, game, and redirect routes.

Make the route manifest the single source used by routing and analytics if that
is practical. At minimum, add a test which enumerates every router path and
fails when the analytics matcher cannot turn it into a safe pattern. The safe
fallback is `route_pattern=unknown`, not the raw path.

### 5.4 P1: pageleave has two possible owners

The application sends route-change `$pageleave` events while the SDK option
`capture_pageleave` is also enabled. That can duplicate exits or give different
meanings to the same event.

Choose exactly one owner. For this React application, the recommended choice is:

- the route tracker sends one `$pageview` after a route becomes active;
- the route tracker sends one `$pageleave` on an internal route change and on
  final `pagehide`;
- the SDK's automatic pageleave option is disabled;
- duration and maximum scroll depth are attached to that single leave event.

Test back/forward navigation, redirects, query-only changes, hidden tabs, page
refresh, and closing a tab. Decide whether a query-only change represents a new
page; normally it should not here.

### 5.5 P1: remote defaults should not decide data collection

Only autocapture and session recording are explicitly disabled today. PostHog
has other capture features and some can follow project-side settings when the
SDK option is not pinned.

The browser configuration contract should explicitly disable:

- autocapture;
- automatic pageview and automatic pageleave capture;
- dead-click capture;
- exception/error capture;
- heatmaps;
- web-performance capture;
- session recording;
- surveys.

If feature flags and surveys are not used, prevent their background requests as
well. Set person profiles to “identified only”. On deployed HTTPS, use secure
cookies. Respect Do Not Track as a best-effort additional signal. Add a property
deny-list and the URL sanitizer. Pin a dated PostHog default set only after
testing the SDK version in development; do not inherit a new default blindly.

### 5.6 P1: event authority and validation are inconsistent

Browser events are useful for intentions such as opening a composer or clicking
Checkout. They are not dependable proof that the server saved something. A
browser can close, lose its network, be blocked, or emit before an API fails.

Use this ownership rule:

| Kind of fact                   | Owner                                               | Example                                      |
| ------------------------------ | --------------------------------------------------- | -------------------------------------------- |
| UI intention or presentation   | Browser                                             | `signup_cta_clicked`, `feed_composer_opened` |
| Durable application success    | Server, after database success                      | `game_completed`, `feed_post_created`        |
| Billing lifecycle truth        | Stripe webhook handler, after idempotent processing | `subscription_started`                       |
| Derived total or current state | MongoDB/reporting, not another event                | standings, total points, current roster size |

The authenticated `/api/v1/analytics/event` endpoint currently permits an
arbitrary name and arbitrary properties, and no caller was found. Remove it if
it has no purpose. If it remains, give it a strict event allow-list, per-event
schemas, property length/enumeration rules, sanitisation, and rate limiting. It
must continue binding identity on the server; never accept a client-supplied
distinct ID.

### 5.7 P1: person properties do not match the product model

The existing `plan` person property is a legacy simplification and can say
`starter` even when the person controls several differently billed teams or
leagues. Remove it. Plan belongs to the resource involved in a billing or
entitlement event.

Allowed person properties:

| Property            | Shape               | Meaning                                                  |
| ------------------- | ------------------- | -------------------------------------------------------- |
| `auth_provider`     | `local` or `google` | How this account authenticates.                          |
| `email_verified`    | boolean             | Verification state, without the email.                   |
| `onboarding_status` | fixed enum          | Whether onboarding is incomplete, completed, or skipped. |
| `onboarding_roles`  | fixed enum list     | Roles selected during onboarding.                        |
| `is_internal`       | boolean             | Staff/test traffic that dashboards should exclude.       |

Do not send name, email, image, bio, phone number, or address. Use lower
snake_case consistently. Resource-specific `actor_role` belongs on the event,
because one person can be an owner in one league and a helper in another.

Continue resetting PostHog on logout. Also reset before identifying a different
signed-in user in the same browser so two accounts cannot be merged accidentally.

### 5.8 P1: deployment context is too small

`app_env` is useful but insufficient. Every event should receive the common
properties in §9. A commit/build version makes it possible to connect a sudden
change to a deployment. A schema version makes event migrations auditable.

### 5.9 Privacy promises need an operating process

The privacy page currently describes consent and says account deletion includes
analytics deletion. The application needs a runbook that makes this promise
true. The page must accurately explain browser and server collection. When the
purpose, property set, processors, retention, or consent mechanism changes:

1. review the privacy text;
2. obtain privacy approval;
3. increment the consent-policy version if renewed consent is necessary;
4. test withdrawal;
5. document how an internal user ID is located and deleted in PostHog;
6. record who performed a deletion and when, without copying deleted data into
   the record.

## 6. Target architecture

The intended flow is:

```text
Browser UI intention ── consent accepted ──> browser PostHog client
          │                                      │
          └── product API request ──> database ──┴──> server PostHog client
                                           successful durable outcome only

Stripe webhook ── signature + idempotency ──> billing state ──> PostHog event
```

Both SDKs send to the same environment's PostHog project. Browser delivery may
later use a first-party reverse proxy for reliability. Server delivery should
continue using the EU ingest host directly.

PostHog is not the database of record. MongoDB remains the source of truth for
games, rosters, follows, standings, and content. Stripe remains the source of
truth for payments. PostHog answers behaviour questions about consented users
and should not be used to repair application data.

## 7. Naming and schema rules

### 7.1 Event names

Keep the repository's established lower-snake-case convention. Use a stable
object plus outcome, normally past tense:

- good: `game_completed`, `checkout_started`, `join_request_resolved`;
- avoid: `Game Completed`, `completed-game`, `clicked`, `game_123_finished`.

PostHog's current general guidance may show other conventions. Consistency
inside one long-lived project is more valuable than splitting history every time
a style recommendation changes.

Do not place IDs or property values in an event name. Significant contract
changes use `event_schema_version`; they do not create a timestamped event name.

### 7.2 Property names and values

- Use lower snake case: `resource_type`, not `resourceType`.
- Use booleans for yes/no, numbers for quantities, and ISO timestamps only when
  event time itself is not sufficient.
- Keep enumerations short and documented.
- Put an identifier in a property value, never in the property key.
- Use integer buckets when an exact number is unnecessary.
- Omit an inapplicable property rather than filling it with `unknown`.
- Use `unknown` only when “the application attempted to determine this and
  could not” is itself meaningful.
- Never accept arbitrary property bags from browser code.

### 7.3 Changing a schema

Before adding or changing an event:

1. write the product question it will answer;
2. find whether an existing event already answers it;
3. choose browser, server, webhook, or job ownership;
4. list every property, type, allowed value, and privacy classification;
5. update this handbook and the PostHog event definition;
6. increment `event_schema_version` for a breaking meaning/property change;
7. add contract tests;
8. release to development;
9. verify the real payload in PostHog;
10. release to production and annotate the release.

PostHog event names cannot simply be renamed in Data Management. A rename is a
new data stream. Prefer keeping a sound existing name and improving its
definition.

## 8. Data rules: what must never be sent

Never send:

- raw URLs, query strings, URL fragments, or complete referrer URLs;
- verification, reset, OAuth, refresh, access, invite, or checkout tokens;
- names, email addresses, phone numbers, postal addresses, biographies, or
  contact-form fields;
- player names, team names, league names, opponent labels, venue text, or image
  filenames/URLs;
- feed captions, descriptions, comments, search terms, or other free text;
- audio, speech transcripts, resolved player/team words, or raw voice commands;
- Stripe customer, Checkout session, subscription, invoice, or payment IDs;
- Cloudinary public IDs or asset URLs;
- full error messages, request/response bodies, or stack traces;
- IP addresses when the project can be configured not to retain them;
- precise geolocation;
- raw stat taps, every game-clock tick, every lineup tap, or pointer movement;
- facts already better answered as a database query, such as total points,
  standings, current follower count, or current roster size.

Internal MongoDB resource IDs may be used only on relevant server-confirmed
resource events and only when the analysis genuinely needs a resource journey.
They are still linkable data, so access and retention rules apply.

## 9. Common properties

Every custom event should have these properties added centrally rather than by
each call site:

| Property               | Type    | Allowed/example value                            | Purpose                               |
| ---------------------- | ------- | ------------------------------------------------ | ------------------------------------- |
| `app_env`              | enum    | `development`, `production`                      | Detect key/environment mistakes.      |
| `app_version`          | string  | deployment commit SHA                            | Tie changes to a release.             |
| `event_schema_version` | integer | start at `1`                                     | Make schema migrations explicit.      |
| `event_source`         | enum    | `browser`, `api`, `stripe_webhook`, `system_job` | Identify authority and delivery path. |
| `is_internal`          | boolean | `true`, `false`                                  | Exclude staff/test traffic.           |
| `is_demo`              | boolean | `true`, `false`                                  | Exclude seeded/demo resources.        |

Browser events should also include `is_authenticated` as a boolean.

Add this context only when relevant:

| Property         | Allowed values/shape                             | Notes                                                                                                                 |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `resource_type`  | `team`, `league`                                 | The entitlement/resource being acted upon.                                                                            |
| `resource_id`    | internal ID                                      | Never use a display name.                                                                                             |
| `team_id`        | internal ID                                      | Standalone team context.                                                                                              |
| `league_id`      | internal ID                                      | League context.                                                                                                       |
| `league_team_id` | internal ID                                      | A team inside a league.                                                                                               |
| `season_id`      | internal ID                                      | Only for season-specific analysis.                                                                                    |
| `game_id`        | internal ID                                      | Only for a durable game journey.                                                                                      |
| `actor_role`     | approved permission enum                         | Use the exact authorization vocabulary, such as `league_owner`, `league_manager`, `team_manager`, `helper`, `player`. |
| `game_context`   | `standalone`, `league`                           | Do not infer from a display label.                                                                                    |
| `tracking_mode`  | `one_sided`, `dual_team`                         | The tracker mode.                                                                                                     |
| `plan_id`        | `starter`, `team_extra`, `league`, `league_plus` | Event/resource context, never a global person plan.                                                                   |
| `billing_source` | `stripe`, `comp`                                 | How entitlement is supplied.                                                                                          |

## 10. Recommended event set at a glance

This is the target set, not permission to implement all events at once.

| Priority | Journey             | Events                                                                                                                     |
| -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| P1       | Navigation          | `$pageview`, `$pageleave`                                                                                                  |
| P1       | Consent             | `analytics_consent_accepted`                                                                                               |
| P1       | Acquisition/auth    | `signup_cta_clicked`, `auth_page_viewed`, `oauth_started`, `user_registered`, `user_logged_in`, `registration_failed`      |
| P1       | Onboarding          | `onboarding_step_completed`, `onboarding_completed`, `onboarding_skipped`                                                  |
| P1       | Activation          | `resource_created`, `league_team_created`, `roster_populated`, `game_scheduled`, `game_tracking_started`, `game_completed` |
| P2       | League/season       | `season_created`, `season_completed`, `schedule_created`                                                                   |
| P2       | Collaboration       | `manager_invited`, `join_request_created`, `join_request_resolved`, `player_claim_requested`, `player_claim_resolved`      |
| P2       | Community           | `follow_created`, `follow_removed`, `feed_composer_opened`, `feed_post_created`, `feed_post_deleted`                       |
| P2       | Discovery/share     | `discover_search_completed`, `discover_result_opened`, `share_initiated`, `share_completed`, `game_highlight_reel_opened`  |
| P2       | Billing             | `checkout_started`, `checkout_completed`, `customer_portal_opened`, subscription lifecycle events, `free_team_selected`    |
| P2       | Operations/features | `export_completed`, voice-tracking events, `court_layout_unknown`                                                          |
| Optional | UI research         | `feed_load_more`, `game_detail_tab_changed`, overlay open/close                                                            |

## 11. Event dictionary

Every implementation ticket should copy the appropriate contract below. “After
success” means after the authoritative operation, not before the request.

### 11.1 Navigation and consent

| Event                        | Capture when                                           | Owner                 | Properties                                                                               |
| ---------------------------- | ------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------- |
| `$pageview`                  | A consented browser enters a recognised route pattern. | Browser route tracker | `route_pattern`, `is_authenticated`, common properties. No raw URL/referrer/search/hash. |
| `$pageleave`                 | A consented browser leaves that route, exactly once.   | Browser route tracker | `route_pattern`, `duration_seconds`, `max_scroll_depth`, common properties.              |
| `analytics_consent_accepted` | Immediately after opt-in succeeds.                     | Browser               | `consent_policy_version`. Do not send a decline.                                         |

Pageviews are sufficient for public profile/game/team/league views. Do not add a
second `public_game_viewed` event unless it answers a question that a safe route
pattern plus event context cannot answer.

### 11.2 Acquisition and authentication

| Event                          | Capture when                                                                   | Owner   | Properties                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `signup_cta_clicked`           | A visitor deliberately selects a registration CTA.                             | Browser | `source`: `nav`, `home`, `pulse`, `feed_composer`, `follow_button`, `pricing`.                        |
| `auth_page_viewed`             | A consented browser sees login or registration.                                | Browser | `mode`: `login` or `register`; `has_redirect`: boolean. Never send redirect URL.                      |
| `oauth_started`                | A person starts Google auth.                                                   | Browser | `provider=google`, `mode`.                                                                            |
| `user_registered`              | The account is committed and consent is known.                                 | Server  | `auth_provider`: `local` or `google`.                                                                 |
| `user_logged_in`               | Authentication succeeds and consent is known.                                  | Server  | `auth_provider`, `is_first_login`.                                                                    |
| `registration_failed`          | Registration fails for a product-relevant generic reason and consent is known. | Server  | `reason`: fixed safe enum such as `email_in_use`, `invalid_input`, `provider_failure`. No email hash. |
| `email_verification_requested` | A verification message is accepted for sending.                                | Server  | `request_context`: `registration` or `resend`.                                                        |
| `email_verified`               | The token is valid and the account is marked verified.                         | Server  | no route/token/email property.                                                                        |
| `password_reset_requested`     | The endpoint accepts the request.                                              | Server  | no `account_exists` signal; no email.                                                                 |
| `password_reset_completed`     | A valid reset succeeds.                                                        | Server  | none beyond common properties.                                                                        |

The password-request event must not reveal whether the email exists. A public
failure event must not become an account-enumeration dataset.

**Campaign attribution.** §5.1 permits campaign fields only as an allow-list:
"allow-list individual campaign fields and validate them; do not preserve the
whole query string." `client/src/features/analytics/attribution.js` is that
allow-list, and it owns both the link builder and the parser so a tagged link
and the value read back cannot drift apart.

| Event                   | Capture when                                                              | Owner   | Properties                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `social_landing_viewed` | Once per session, on the first page of a tagged or social-referred entry. | Browser | `first_touch_source`, `first_touch_medium`, `first_touch_campaign`, `is_tagged`, `route_pattern`. No raw URL. |

`first_touch_source`, `first_touch_medium` and `first_touch_campaign` are also
registered as super properties on every browser event, and set on the person
with `$set_once` at identify — first touch means the channel that ORIGINALLY
found someone, so a later session must not overwrite it.

Only a closed vocabulary travels. An unrecognised `utm_source` is treated as no
tag at all rather than passed through, and only the referring HOST is mapped to
a source — never the referrer URL, which is on the §8 never-send list. A direct
or search arrival is described in the super properties but emits no
`social_landing_viewed`: it is not a landing a campaign can claim.

Storage of first touch is consent-gated. It is held in memory for the session
always (reading the current URL is not storage), and written to `localStorage`
only once the visitor accepts — the same memory-until-accepted shape §5.2
requires of PostHog's own identifier. Declining costs the return-visit
attribution, which is the correct trade until the §5.2 exception question has
had legal review.

### 11.3 Onboarding

| Event                       | Capture when                                         | Owner  | Properties                                                                  |
| --------------------------- | ---------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `onboarding_step_completed` | A step is successfully persisted.                    | Server | `step`: fixed step key; `selected_role_count`; optionally fixed role flags. |
| `onboarding_completed`      | Final onboarding state is persisted.                 | Server | `selected_roles`: approved enum list.                                       |
| `onboarding_skipped`        | A skippable step is deliberately skipped and stored. | Server | `step`.                                                                     |

Do not send free-form answers. Update the safe person properties after final
completion.

### 11.4 Activation and games

`game_completed` is the recommended North Star action. It represents the core
product value much better than login or pageviews.

| Event                   | Capture when                                                       | Owner  | Properties                                                                                        |
| ----------------------- | ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `resource_created`      | A standalone team or league is committed.                          | Server | `resource_type`, `resource_id`, `actor_role`.                                                     |
| `league_team_created`   | A team inside a league is committed.                               | Server | `league_id`, `league_team_id`, `actor_role`.                                                      |
| `roster_populated`      | A resource gets its first eligible player. Send once per resource. | Server | resource context, `actor_role`, `method`: `manual`, `join_request`, `claim`, `import` when known. |
| `game_scheduled`        | A game is committed.                                               | Server | `game_id`, game/resource context, `tracking_mode`, `creation_method`: `single` or `bulk`.         |
| `schedule_created`      | A bulk schedule operation succeeds.                                | Server | `league_id`, `season_id`, `game_count_bucket`, `replace_existing`: boolean.                       |
| `game_tracking_started` | The game moves into tracking for the first time. Send once.        | Server | game/resource context, `tracking_mode`, `actor_role`.                                             |
| `game_completed`        | Finish succeeds and completed state is committed.                  | Server | game/resource context, `tracking_mode`, `actor_role`, safe duration bucket if useful.             |
| `season_created`        | A season is committed.                                             | Server | `league_id`, `season_id`, `actor_role`.                                                           |
| `season_completed`      | Completed status is committed.                                     | Server | `league_id`, `season_id`, `actor_role`.                                                           |

Do not send an event for every score, rebound, substitution, or clock action.
Those are high volume, contain gameplay detail already stored in MongoDB, and
would distort product-usage charts.

The current `game_tracking_finished` browser event must not be used as the
completion metric because it fires before the finish request has succeeded.

### 11.5 Collaboration and claims

| Event                    | Capture when                                | Owner  | Properties                                                              |
| ------------------------ | ------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `manager_invited`        | An invitation is successfully created/sent. | Server | resource context, `invited_role`; no invitee email.                     |
| `join_request_created`   | A request is committed.                     | Server | resource context, `request_type`, requester `actor_role` if applicable. |
| `join_request_resolved`  | The state change succeeds.                  | Server | resource context, `outcome`: `approved`, `rejected`, `cancelled`.       |
| `player_claim_requested` | A claim is committed.                       | Server | safe resource/player-record ID only if analysis requires it.            |
| `player_claim_resolved`  | The claim is resolved.                      | Server | `outcome`: `approved`, `rejected`, `cancelled`.                         |

Do not add an artificial “invitee activated” event unless the product stores a
reliable link from invitation to the invited account. It can otherwise be
derived from the first real action by the invited user.

### 11.6 Pulse, feed, discovery, and follows

| Event                       | Capture when                                | Owner   | Properties                                                                                |
| --------------------------- | ------------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `follow_created`            | The follow is committed.                    | Server  | `target_type`: `player`, `league`, `league_team`; target internal ID if needed; `source`. |
| `follow_removed`            | The follow is deleted.                      | Server  | same safe target context.                                                                 |
| `feed_composer_opened`      | The composer becomes intentionally visible. | Browser | `source`: `pulse`, `game_detail`, or another fixed surface.                               |
| `feed_post_created`         | The post is committed.                      | Server  | `post_type`, `source`: `manual`, `automatic`, `game_detail`; no caption/media URL.        |
| `feed_post_deleted`         | Deletion succeeds.                          | Server  | `post_type`; no content.                                                                  |
| `feed_load_more`            | The person requests another page.           | Browser | `surface`, `page_bucket`; optional.                                                       |
| `discover_search_completed` | A debounced search response arrives.        | Browser | `tab`, `has_results`, `result_count_bucket`; never the query.                             |
| `discover_result_opened`    | A result is selected.                       | Browser | `result_type`, `tab`, `position_bucket`; no display name.                                 |

Automatic milestone/game feed items should use `source=automatic`; do not emit a
second synthetic “milestone reached” event if MongoDB can answer the milestone
fact and the product question is simply content creation.

### 11.7 Highlights and sharing

Use generic sharing events so one dashboard can compare surfaces.

| Event                        | Capture when                                    | Owner   | Properties                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game_highlight_reel_opened` | A person opens the reel.                        | Browser | `game_id`, safe game context, `source`.                                                                                                                         |
| `share_initiated`            | The share control is deliberately selected.     | Browser | `target_type`: `highlight_clip`, `highlight_reel`, `game_card`, `player_card`, `team_card`, `feed_post`; `method`: `native`, `clipboard`, `download`; `source`. |
| `share_completed`            | The application can confirm its part succeeded. | Browser | same properties plus `result=succeeded`.                                                                                                                        |

Native operating-system share APIs often cannot prove that the person actually
sent the item. In that case `share_completed` means the share sheet opened
successfully, not that a recipient received anything. State that meaning in the
PostHog definition.

Migrate existing clip/reel-specific names deliberately. Keep old charts labelled
as legacy; do not silently combine events with different meanings.

As implemented for the social asset backlog, both events also carry an optional
`format` (`post`, `story`, `link`) so an export preset can be compared against
the others, and `source` covers `pulse`, `game_detail`, `player_profile`,
`team_profile`, `admin_social`. `target_type` also accepts `game_kit`,
`carousel_slide` and `leaderboard_card`, and `source` also accepts
`league_page`: the completed-game social kit downloads several images as one
ZIP and fires ONE event for the kit, so a kit download counts once rather than
inflating the per-card numbers beside it, while `carousel_slide` records a
single box-score slide downloaded on its own. Both are emitted from `useShareImage`, not from
the button: only that hook knows whether the OS share sheet or the download
fallback was used, and reporting one method on `share_initiated` and another on
`share_completed` would make the method breakdown unreadable. `share_initiated`
therefore means the share was actually attempted, after the PNG rendered; a
failed render emits neither event, because nothing was ever offered to the
operating system.

| Event                      | Capture when                         | Owner   | Properties                                                                                                                                           |
| -------------------------- | ------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `league_enquiry_submitted` | The contact form's request succeeds. | Browser | `interest`, `role`. Both closed enums, nothing else — the name, email, club name and message are §8 contact-form fields and never leave the browser. |

### 11.8 Billing and entitlements

Stripe webhooks are retried. Emit an analytics event only as part of idempotent
webhook processing so the same Stripe event cannot create duplicate PostHog
events.

| Event                                 | Capture when                                               | Owner                  | Properties                                                                                       |
| ------------------------------------- | ---------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `checkout_started`                    | The server successfully creates a Checkout Session.        | Server                 | resource context, `plan_id`, `billing_source=stripe`. No session ID.                             |
| `checkout_completed`                  | The verified webhook is processed successfully.            | Stripe webhook handler | resource context, `plan_id`, `is_trial`; optionally `amount_gbp` and `currency=gbp` if approved. |
| `customer_portal_opened`              | The server creates a portal session.                       | Server                 | resource context, `plan_id`. No portal/session URL.                                              |
| `subscription_started`                | Active subscription state is committed for the first time. | Stripe webhook handler | resource context, `plan_id`, `is_trial`.                                                         |
| `subscription_plan_changed`           | A plan change is committed.                                | Stripe webhook handler | `previous_plan_id`, `plan_id`, resource context.                                                 |
| `subscription_cancellation_scheduled` | End-of-period cancellation is committed.                   | Stripe webhook handler | resource context, `plan_id`.                                                                     |
| `subscription_cancelled`              | Cancellation becomes effective.                            | Stripe webhook handler | resource context, `plan_id`.                                                                     |
| `subscription_payment_failed`         | A relevant invoice failure is processed.                   | Stripe webhook handler | resource context, `plan_id`, safe attempt bucket.                                                |
| `subscription_payment_recovered`      | A later successful payment resolves a failed state.        | Stripe webhook handler | resource context, `plan_id`.                                                                     |
| `free_team_selected`                  | The durable free-team selection changes successfully.      | Server                 | `resource_type=team`, `resource_id`, `plan_id=starter`.                                          |

Do not send a global user `plan`. Do not send Stripe IDs. Revenue totals should
remain reconciled against Stripe; PostHog is for product-behaviour analysis.
See [`stripe.md`](stripe.md) for the billing source of truth.

### 11.9 Exports, voice tracking, and diagnostics

| Event                              | Capture when                                                     | Owner   | Properties                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `export_completed`                 | The server finishes generating a valid export.                   | Server  | `dataset`, `scope`, `row_count_bucket`; no filename or URL.                                                        |
| `voice_tracking_enabled`           | A consented user deliberately enables voice input.               | Browser | `trigger`: `court` or `button`; `tracking_mode`.                                                                   |
| `voice_command_resolved`           | A command is safely classified. Consider sampling/volume limits. | Browser | `result`: `succeeded`, `rejected`, `fallback`; `command_kind`; fixed `failure_reason`; `trigger`; `tracking_mode`. |
| `voice_tracking_session_completed` | Voice input is stopped after use.                                | Browser | count buckets for attempted/succeeded/fallback commands and duration bucket.                                       |
| `court_layout_unknown`             | Layout resolution genuinely fails.                               | Browser | `court_layout_id` only when it is an approved technical identifier; app version.                                   |

Never send microphone audio, the speech transcript, raw recognised text, a
participant's name, or an error message. If `voice_command_resolved` volume is
too high, keep only the session summary or apply documented sampling. The
current game-event persistence does not retain the voice source, so PostHog
cannot infer voice adoption from MongoDB alone.

### 11.10 Events deliberately not recommended

Do not add:

- `button_clicked` or other context-free UI noise;
- one event per basketball stat or clock tick;
- impression events for every card in an infinite feed;
- duplicate “page viewed” custom events;
- login-based daily active user events;
- client-side “success” events before server confirmation;
- dynamic error events with messages embedded in their names;
- milestone/standing/score totals already queryable from MongoDB;
- admin/operator actions unless there is a clear operational question and they
  are excluded from customer-product metrics.

## 12. Step-by-step: configure PostHog projects

PostHog changes its menu labels occasionally. If a label has moved, use the
settings search and match the described setting rather than guessing.

### 12.1 Sign in and confirm the region

1. Open [PostHog EU Cloud](https://eu.posthog.com/).
2. Sign in with the company-controlled account.
3. Turn on multi-factor authentication for every administrator.
4. Confirm that the organisation is the one owned by The Sporty Way, not a
   personal test organisation.
5. Confirm the two projects are named clearly:
   - `Dev - The Sporty Way`;
   - `Prod - The Sporty Way`.
6. In each project's settings, confirm the data region is EU. A project's
   region is not something to casually move after collection starts.
7. Give production access only to people who need it. Development can have a
   broader engineering audience.
8. Do not make production insights or dashboards public.

If either project does not exist, use the project switcher, choose to create a
new project, give it the exact name above, select the EU region, and keep the
new onboarding snippet private. Do not create a third project merely because an
old key is hard to find.

### 12.2 Find the correct project API keys

Repeat these steps once in Dev and once in Prod:

1. Select the project using the project switcher at the upper left.
2. Open **Settings**.
3. Open **Project** or **Project details**.
4. Find **Project API key**.
5. Confirm it begins with `phc_`.
6. Record it only in the approved secret manager or the environment-setting
   screen where it will be used.
7. Label the record with `development` or `production` immediately.
8. Never substitute a personal key beginning `phx_`.

The `phc_` token is designed to be present in browser code, but it still should
not be sprinkled through docs and screenshots. It routes data and accidental
reuse contaminates a project.

### 12.3 Apply privacy-oriented project settings

In **Dev - The Sporty Way**, then again in **Prod - The Sporty Way**:

1. Open **Settings → Project**.
2. Set the timezone to `Europe/London` so daily charts align with the business.
3. Find IP collection or IP geolocation and disable it.
4. Open the product analytics/autocapture settings.
5. Disable autocapture.
6. Disable session replay/recording.
7. Disable heatmaps.
8. Disable web vitals/performance capture.
9. Disable automatic exception capture/error tracking.
10. Disable surveys until there is an approved survey plan.
11. Disable dead-click capture.
12. Leave feature flags unused unless a feature-flag implementation is planned
    and reviewed separately.
13. Save, reload the settings page, and confirm the toggles stayed off.

The SDK must also pin these settings. A dashboard toggle alone is not the whole
control.

### 12.4 Set retention and access

1. Open the project's data-management or billing/retention settings.
2. Choose a documented retention period. Thirteen months is a reasonable
   product proposal because basketball usage is seasonal, but it requires
   privacy and plan-availability approval.
3. Apply the same documented rule to both projects unless development should be
   shorter.
4. Record the decision, approver, effective date, and review date.
5. In organisation members/access settings, use least privilege.
6. Remove departed or unknown members.
7. Confirm MFA is enabled for administrators.
8. Do not give contractors production access by default.

### 12.5 Optional: set up a first-party browser proxy

A reverse proxy can improve browser delivery because some blockers reject known
analytics hosts. It does not relax consent or privacy rules.

Suggested names, subject to DNS/security approval:

- production: `e.thesportyway.com`;
- development: `e-dev.thesportyway.com`.

Follow PostHog's current [reverse proxy guide](https://posthog.com/docs/advanced/proxy)
for a supported managed or controlled proxy. Then:

1. point the browser `api_host` at the environment's first-party hostname;
2. set `ui_host` to `https://eu.posthog.com`;
3. leave the server SDK pointed directly at `https://eu.i.posthog.com`;
4. preserve the full ingest path and request body;
5. do not log request payloads at the proxy;
6. rate limit abuse without breaking normal batches;
7. test ingestion, CSP, CORS, DNS, TLS, and failure behaviour;
8. document ownership and monitoring.

This is recommended for data quality after the P0 fixes. It is not a reason to
delay URL sanitisation or consent enforcement.

## 13. Step-by-step: configure application environments

### 13.1 Variable contract

| Side    | Variable                | Development                      | Production                 |
| ------- | ----------------------- | -------------------------------- | -------------------------- |
| Browser | `VITE_ENABLE_ANALYTICS` | `true` only for deliberate tests | `true` after P0 approval   |
| Browser | `VITE_POSTHOG_KEY`      | Dev project `phc_…`              | Prod project `phc_…`       |
| Browser | `VITE_POSTHOG_HOST`     | EU ingest or dev proxy           | EU ingest or prod proxy    |
| Server  | `POSTHOG_KEY`           | Dev project `phc_…`              | Prod project `phc_…`       |
| Server  | `POSTHOG_HOST`          | `https://eu.i.posthog.com`       | `https://eu.i.posthog.com` |
| Server  | `APP_ENV`               | `development`                    | `production`               |

Add an explicit server-side analytics enable switch during implementation so an
operator can stop server collection without deleting a key. Use the same
fail-closed idea on both sides.

### 13.2 Local development

1. Make sure the selected key belongs to **Dev - The Sporty Way**.
2. Put browser variables in the approved development client environment file.
3. Put server variables in the approved development server environment file.
4. Do not use the production key locally.
5. Restart Vite after any `VITE_…` change. Vite reads those values when it
   starts/builds.
6. Restart the API after any server environment change.
7. Keep analytics disabled for ordinary automated tests unless the test uses a
   mocked SDK and specifically validates the contract.

### 13.3 Render development

1. Open the Render dashboard.
2. Open the development client service.
3. Open **Environment**.
4. Confirm its browser key belongs to the Dev project and its host is the
   approved dev host.
5. Open the development API service.
6. Confirm its server key belongs to the same Dev project.
7. Confirm `APP_ENV=development` even though Render may correctly use
   `NODE_ENV=production` to run an optimized service.
8. Save and redeploy/restart both services when values change.
9. Run the deployed-development test plan in §16.

### 13.4 Render production

Do this only after P0 checks pass:

1. Open the production client service and its **Environment** screen.
2. Confirm the browser key belongs to **Prod - The Sporty Way**.
3. Confirm the browser host is the approved EU ingest/proxy host.
4. Open the production API service.
5. Confirm the server key belongs to the Prod project.
6. Confirm `APP_ENV=production`.
7. Have a second person compare project name, key label, service name, and host.
8. Redeploy the client because `VITE_…` values are build-time values.
9. Restart/redeploy the API.
10. Run the production smoke test in §17 using an internal test account.

### 13.5 Fail-closed validation to add

The current browser silently disables analytics when enablement is true but a
key is missing. The server simply enables when a key exists. The future contract
should instead:

- reject a deployed configuration where analytics is enabled but key/host is
  absent;
- reject a personal key (`phx_`) in the SDK slots;
- allow only the approved HTTPS EU/proxy hosts;
- require an explicit server enable switch;
- log a startup status such as enabled/disabled, environment, and host without
  logging the key;
- expose enough health information to find a disabled integration without
  revealing credentials;
- fail ordinary requests open when PostHog delivery fails; analytics must never
  make the product unavailable.

### 13.6 Exact target browser SDK options

When the browser integration is changed, review these exact options against the
installed SDK version and the current
[configuration reference](https://posthog.com/docs/libraries/js/config). This
is a contract table, not a copy-and-paste code snippet.

| PostHog option/control         | Target                                           | Reason                                                                                                    |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `api_host`                     | Approved EU ingest endpoint or first-party proxy | Keeps browser data in the intended region/path.                                                           |
| `ui_host`                      | `https://eu.posthog.com` when using a proxy      | Makes links generated by the SDK point at the correct EU UI.                                              |
| `autocapture`                  | disabled                                         | Avoid uncontrolled click/input properties.                                                                |
| `capture_pageview`             | disabled                                         | The route tracker owns SPA pageviews.                                                                     |
| `capture_pageleave`            | disabled                                         | The route tracker owns route changes and final `pagehide`.                                                |
| `capture_dead_clicks`          | disabled                                         | Not an approved collection purpose.                                                                       |
| `capture_exceptions`           | disabled                                         | Prevent unexpected error text/stacks. Use a separately reviewed error system if required.                 |
| `capture_heatmaps`             | disabled                                         | Not needed for the defined product questions.                                                             |
| `capture_performance`          | disabled                                         | Not needed for this analytics contract.                                                                   |
| `disable_session_recording`    | enabled                                          | No replay recording.                                                                                      |
| `disable_surveys`              | enabled                                          | Surveys are outside the current purpose.                                                                  |
| `advanced_disable_flags`       | enabled while feature flags are unused           | Avoid unnecessary flag requests. Revisit before using flags or dependent features.                        |
| `opt_out_capturing_by_default` | enabled                                          | No event leaves before opt-in.                                                                            |
| `person_profiles`              | `identified_only`                                | Do not create profiles for every anonymous browser.                                                       |
| `persistence`                  | approved only after opt-in                       | Persist only after a valid accepted decision.                                                             |
| `secure_cookie`                | enabled on deployed HTTPS                        | Prevent analytics cookies travelling over HTTP.                                                           |
| `respect_dnt`                  | enabled                                          | Honour Do Not Track as an additional privacy signal.                                                      |
| `property_denylist`            | forbidden URL/PII property names                 | Reject known-dangerous properties centrally.                                                              |
| `before_send`                  | global event sanitizer                           | Strip raw current URL, referrer, query/hash, tokens, and unapproved properties, including SDK-added ones. |
| `loaded`/central registration  | common safe properties only                      | Register environment, version, source, and approved traffic flags.                                        |
| dated `defaults`               | pin only after compatibility testing             | Prevent an SDK upgrade silently changing collection behaviour.                                            |

The sanitizer is the last safety net, not permission for call sites to pass raw
objects. It should return only the event's allow-listed properties and approved
PostHog system fields. Test the actual outgoing request because SDK properties
can be added after application code constructs an event.

On acceptance, the lifecycle must be ordered deliberately: persist the choice,
opt in, establish safe persistence/identity, capture one current-route pageview,
and then capture later interactions normally. On decline or withdrawal: opt
out first, clear PostHog persistence, reset identity, and confirm no later
request leaves the browser.

### 13.7 Exact target server behaviour

The Node integration should have one centrally owned client and this contract:

| Control              | Target                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Enablement           | An explicit analytics-enabled flag and a valid `phc_` project key are both required.                                          |
| Host                 | Direct EU ingest host, even if the browser uses a reverse proxy.                                                              |
| Common context       | Add environment, deployment version, schema version, source, internal/demo flags centrally.                                   |
| Identity             | Resolve the authenticated internal user ID on the server; never accept a distinct ID from the browser.                        |
| Consent              | Capture only with the approved positive, current consent signal. Missing, declined, expired, or unknown means do not capture. |
| Validation           | A fixed event allow-list and per-event property schema. Drop/log the contract name—not the payload—when validation fails.     |
| Development delivery | Immediate or near-immediate flush so tests are observable.                                                                    |
| Production delivery  | Batching with a documented interval and size.                                                                                 |
| Shutdown             | Flush and shut down the PostHog client during graceful process termination.                                                   |
| Failure mode         | Product operations succeed even if analytics delivery fails. Log a safe operational warning.                                  |
| Retry/idempotency    | Outcome events are once per state transition; webhook events share the webhook's durable idempotency.                         |

Do not forward the browser's arbitrary event object to this client. The server
should construct the event from trusted application state after the operation
succeeds.

## 14. Step-by-step: define the schema in PostHog

Repeat these steps in the Dev project first. Export or manually reproduce the
approved definitions in Prod after development verification.

### 14.1 Create event definitions

1. Select **Dev - The Sporty Way**.
2. Open **Data management**.
3. Select **Events**.
4. Choose **Create event** or **New event definition**.
5. Copy one exact event name from §11.
6. Re-read the spelling before saving. Event names are part of the permanent
   data contract.
7. Write a one-sentence description beginning with the exact moment it is sent.
   Example: “Sent after the server commits a game as completed.”
8. Add the owner: a real team or person responsible for the event.
9. Add tags such as `activation`, `server`, and `p1`.
10. Add every approved property with its description and allowed values where
    the interface supports it.
11. Save.
12. Repeat for the P1 events only.
13. Do not create P2 events until the P1 stream is verified.

Events may first appear automatically after they are captured. If so, open the
discovered event and add the same definition, ownership, and tags. A definition
without a real event is documentation, not proof of integration.

### 14.2 Create reusable property documentation

1. In **Data management**, open the properties area.
2. Document the common properties in §9.
3. Create logical groups in the description/tagging system if available:
   - environment and release;
   - resource context;
   - game context;
   - billing context;
   - privacy/traffic filters.
4. For enumeration properties, paste the complete allowed-value list.
5. Mark deprecated properties such as person `plan`, camelCase
   `emailVerified`, and raw `url`/`search` clearly as deprecated or hidden.
6. Never delete/hide a suspicious URL property before completing the historical
   exposure review; hiding is not deletion.

### 14.3 Decide whether to use group analytics

Do not enable it merely because teams and leagues exist. Initially keep
`resource_type` and `resource_id` as event properties. This supports most
funnels and avoids a paid/complex feature before it is needed.

Consider PostHog groups later only when questions genuinely need persistent
team/league properties, group-level funnels, or group-level retention. Before
that migration, define:

- whether `team`, `league`, and `league_team` are separate group types;
- how standalone and league teams differ;
- how historical events will be associated;
- access and deletion behaviour;
- pricing impact.

## 15. Engineering implementation sequence

This is the safe order for later code work. Each phase should be a separate,
reviewable change with tests.

### Phase A — privacy and integrity

- [x] Disable production browser collection while exposure is assessed, if
      necessary.
- [ ] Audit and delete historical secret-bearing properties/events.
- [x] Replace memory-only pseudo-consent with real opt-in/opt-out capture.
- [x] Define how the API receives consent for server events.
- [x] Sanitize SDK and application URL/referrer properties globally.
- [x] Complete and test every route pattern.
- [x] Make safe `unknown` the route fallback.
- [x] Pin all unwanted PostHog capture features off.
- [x] Choose one pageleave owner.
- [x] Remove or strictly validate the generic analytics endpoint.
- [x] Remove the email-derived pseudonymous identifier.
- [x] Update the privacy page and consent-policy version.

### Phase B — common contract and current-event repair

- [x] Add common properties centrally.
- [x] Add app version/build SHA.
- [x] Normalize person properties to snake case and remove person `plan`.
- [x] Reset identity safely on logout and account switch.
- [x] Add per-event schemas and tests.
- [ ] Move durable feed success events to the server.
- [x] Replace premature `game_tracking_finished` with server
      `game_completed`.
- [x] Make analytics enablement explicit and fail closed.

### Phase C — P1 journey

- [x] Verify acquisition/auth event consent.
- [x] Add onboarding events.
- [x] Add resource/team creation.
- [x] Add one-time first-roster and first-tracking transitions.
- [x] Add scheduled and completed game events.
- [x] Verify no retry or repeated request produces a duplicate outcome.

### Phase D — P2 journeys

- [ ] Add league, season, collaboration, and claim events.
- [ ] Add follows, discovery, and server feed events.
- [ ] Consolidate sharing events.
- [ ] Add idempotent billing lifecycle events.
- [ ] Add export and privacy-safe voice-quality events.

### Phase E — reporting and governance

- [ ] Build the dashboards in §18.
- [ ] Create cohorts and retention insights.
- [x] Mark internal and demo traffic.
- [ ] Add deployment annotations.
- [ ] Establish weekly and monthly reviews.
- [ ] Run a deletion rehearsal.

## 16. Development verification

### 16.1 Local browser test

Use an incognito/private window so an old consent choice or PostHog ID cannot
hide a bug.

1. Select the Dev key and start the client/API.
2. Open the browser developer tools.
3. Open **Network** and filter for `posthog`, `capture`, the EU host, or the proxy
   hostname.
4. Visit `/` without choosing the banner.
5. Navigate to several pages.
6. Confirm **zero PostHog ingest requests** are sent before acceptance.
7. Reload, choose Decline, and navigate again.
8. Confirm zero ingest requests and no PostHog persistence.
9. Clear site data and repeat; choose Accept.
10. Confirm capture begins only after acceptance.
11. Open Dev PostHog **Activity → Live events**.
12. Confirm `app_env=development`, the correct app version, schema version, and
    `event_source=browser`.
13. Confirm exactly one `$pageview` per route and one `$pageleave` per departure.
14. Confirm the route is a pattern such as `/games/:gameId`.
15. Confirm there is no query string, fragment, raw referrer, token, name, or
    email in any property.
16. Log in and confirm the distinct ID becomes the application's internal user
    ID and only approved person properties appear.
17. Log out and confirm the identity resets.
18. Sign in as a different account and confirm it is not merged with the first.

### 16.2 Sensitive-route test

Use development-only accounts and tokens:

1. Complete Google authentication through `/auth/google/complete`.
2. Open a verification link.
3. Open a password-reset link.
4. Complete a Stripe test-mode checkout and land on `/billing/success`.
5. Inspect every event emitted during each journey.
6. Confirm no property contains `token`, `session_id`, the raw query, or a full
   redirect/referrer.
7. Search the PostHog project for a distinctive harmless fragment from the test
   token/session ID. It should return nothing.

### 16.3 Server outcome test

1. Use a consented development account.
2. Create a team or league.
3. Add the first player and then a second player.
4. Confirm `roster_populated` appears once, not twice.
5. Schedule a game.
6. Start tracking more than once.
7. Confirm `game_tracking_started` appears once.
8. Make the finish request fail intentionally in a safe test scenario.
9. Confirm no `game_completed` event is sent for the failure.
10. Finish successfully and confirm exactly one event.
11. Retry/reload and confirm it remains exactly one.
12. Compare the stored game state with the PostHog payload.

### 16.4 Feature journey test

For each P2 event added later:

1. test a successful path;
2. test validation failure;
3. test authorization failure;
4. test a repeated request;
5. inspect the payload, not only the event count;
6. confirm property types and allowed enums;
7. confirm free text and external IDs are absent;
8. confirm the event goes to Dev, never Prod.

For voice tracking, say commands containing realistic player names and confirm
that neither the names nor transcripts appear in PostHog.

### 16.5 Automated contract tests to require

- analytics disabled means no SDK capture;
- undecided/declined consent means no SDK network capture;
- accept and withdrawal call the proper opt-in/opt-out lifecycle;
- the route matcher covers every route and never falls back to an ID-bearing
  pathname;
- the global sanitizer strips query, hash, and sensitive built-in properties;
- event names and properties are allow-listed;
- person properties contain no PII and no global plan;
- each durable event is emitted after success and once under retry;
- Stripe webhook retries do not duplicate lifecycle events;
- analytics failure never fails the application operation;
- both browser and server attach environment/version/schema/source context.

## 17. Production rollout and rollback

### 17.1 Before enabling production

- [ ] Historical URL exposure has been reviewed and remediated.
- [ ] Privacy/consent wording has approval.
- [ ] No request leaves the browser before consent.
- [ ] Server capture respects the chosen consent policy.
- [ ] Every route becomes a safe pattern.
- [ ] P1 events passed deployed-development verification.
- [ ] Dev traffic goes only to Dev.
- [ ] Production keys/hosts were checked by two people.
- [ ] Internal and demo accounts/resources are marked.
- [ ] A data deletion rehearsal succeeded.
- [ ] Dashboards default to excluding `is_internal=true`, `is_demo=true`, and
      `app_env!=production`.

### 17.2 Production smoke test

1. Deploy the client and API.
2. Add a PostHog annotation with the commit SHA and “analytics contract release”.
3. Use one clearly marked internal test account.
4. Decline consent and confirm no browser events.
5. Accept consent and visit three route types, including one with a parameter.
6. Register/log in only if the test plan and account allow it.
7. Complete one small core journey.
8. In Prod Live events, filter to the internal account.
9. Check event count, identity, environment, version, schema, source, and every
   property.
10. Confirm no secret or free text exists.
11. Confirm the event is excluded from customer dashboards.
12. Watch ingestion errors and volume for 24–48 hours.

Do not generate fake customer activity merely to fill a chart.

### 17.3 Rollback

If unsafe browser data or a large volume spike appears:

1. disable browser analytics in the production environment;
2. redeploy the client because the Vite flag is build-time;
3. disable server analytics with the explicit server switch and restart the API;
4. confirm events stop;
5. preserve only the minimum incident evidence and do not paste sensitive event
   bodies into ordinary logs/tickets;
6. delete contaminated data using the approved procedure;
7. fix and repeat development verification before re-enabling.

If only one newly added event is wrong and no sensitive data is involved, stop
that event at its source rather than deleting unrelated history.

## 18. Dashboards, funnels, cohorts, and retention

Build these only after the relevant events are verified. Every production
insight should filter:

- `app_env=production`;
- `is_internal=false`;
- `is_demo=false`.

Remember that strict opt-in analytics describes consented usage, not every
person who uses the service. State that limitation on each dashboard.

### 18.1 Dashboard: Acquisition and registration

Create a funnel with:

1. `$pageview` on a public route;
2. `signup_cta_clicked`;
3. `auth_page_viewed` with `mode=register`;
4. `user_registered`;
5. `onboarding_completed`.

Use unique users, a 30-day conversion window, and breakdowns for CTA `source`
and `auth_provider`. Add median time to convert. Do not treat a raw visit count
as a unique-person count.

### 18.2 Dashboard: Core activation

Create a funnel:

1. `user_registered`;
2. `resource_created`;
3. `roster_populated`;
4. `game_scheduled`;
5. `game_tracking_started`;
6. `game_completed`.

Break down by `resource_type`, `game_context`, and `tracking_mode`. Show median
time from registration to first completed game. Create a cohort “Activated
within 30 days” for users who reached `game_completed` within 30 days of
registration.

### 18.3 Dashboard: League adoption

Include trends/funnels for:

- `resource_created` where `resource_type=league`;
- `league_team_created`;
- `manager_invited` and approved join requests;
- `schedule_created` or `game_scheduled`;
- `game_completed`.

Break down by `actor_role` and plan only where the plan belongs to the league
resource.

### 18.4 Dashboard: Meaningful engagement and growth

Define a meaningful active user as someone who performs at least one approved
value event, for example:

- `game_completed`;
- `feed_post_created`;
- `follow_created`;
- `discover_result_opened`;
- `game_highlight_reel_opened`;
- `share_completed`.

Show weekly and monthly active users, not login-based activity. Compare
discovery results, follows, content creation, highlight opens, and shares.

### 18.5 Dashboard: Billing

Create a funnel:

1. `checkout_started`;
2. `checkout_completed`;
3. `subscription_started`.

Add trends for plan changes, scheduled cancellations, effective cancellations,
payment failures, and recoveries. Break down by `resource_type`, `plan_id`, and
`billing_source`. Reconcile money with Stripe rather than PostHog.

### 18.6 Dashboard: Feature quality

Include:

- voice command/session success, rejection, and fallback rates;
- breakdown by safe `failure_reason`, trigger, and tracking mode;
- `court_layout_unknown` by app version;
- export success by dataset;
- ingestion/event volume by source and schema version.

Add an alert only after a normal baseline exists. An alert without a baseline
usually creates noise.

### 18.7 Retention

Create retention where both the start and return action are `game_completed`.
Use weekly and monthly periods because basketball teams and leagues may have a
weekly cadence. Compare standalone/league and one-sided/dual-team contexts.

Do not use `user_logged_in` as the return action. Opening the application is not
the value The Sporty Way promises.

### 18.8 Saved cohorts

Create and describe:

- New consented users: `user_registered` in the selected period.
- Activated in 30 days: first `game_completed` within 30 days of registration.
- Retained resource managers: relevant manager role plus a later meaningful
  resource event.
- Internal users: `is_internal=true`.
- Demo/test traffic: `is_demo=true`.

Avoid cohorts built from names or email domains. Mark the internal flag in the
application's approved account metadata instead.

## 19. Monitoring and routine maintenance

### After every analytics release

- Add a PostHog annotation with date, commit, event names changed, and schema
  versions.
- Inspect Live events in Dev, then the internal smoke event in Prod.
- Compare release volume to the preceding baseline.
- Check for new, unexpected event/property names in Data Management.

### Weekly

- Review P1 event counts and duplicate rates.
- Check `app_env` contamination in both projects.
- Check `unknown` route/layout counts.
- Look for unexpected properties and cardinality growth.
- Review browser versus server volumes with expected consent/ad-blocking limits.
- Review billing analytics against Stripe operational totals.

### Monthly

- Review access and remove people who no longer need it.
- Sample payloads for PII/secrets.
- Review unused events and dashboards.
- Confirm retention and deletion settings.
- Check SDK release notes before dependency upgrades.
- Review event cost/volume, especially voice and feed interactions.
- Rehearse or audit the deletion process.

### Quarterly

- Re-read the privacy page against reality.
- Review the event dictionary with product, engineering, and privacy owners.
- Verify every dashboard has production/internal/demo filters.
- Re-evaluate whether each event still answers a real question.
- Check whether group analytics or a warehouse export is now justified.

## 20. Account deletion and data requests

The product promise requires a reproducible process.

1. Authenticate and authorise the deletion request using the application's
   normal process.
2. Resolve the internal user ID before the application account is removed.
3. Do not use or expose email as the PostHog lookup identifier.
4. In PostHog, find the person by exact internal distinct ID.
5. Confirm the result is the intended person without copying event contents.
6. Use PostHog's current person/data deletion operation.
7. If resource IDs make other events linkable to that person, follow the
   approved scope decision for deletion/anonymisation.
8. Complete the application-side deletion.
9. Record request ID, operator, systems completed, and date—never the deleted
   payload.
10. Confirm completion within the organisation's required timeframe.

Test this process with a development account before claiming it works. PostHog
deletion behaviour and timing can change, so consult the current official data
documentation each time the runbook is revised.

## 21. Incident response for sensitive analytics data

If a token, PII field, transcript, or other forbidden value is found:

1. stop the affected capture path;
2. identify projects, event/property names, date range, and approximate volume;
3. do not spread the value through screenshots, Slack, logs, or tickets;
4. notify the security/privacy owner;
5. expire/revoke live credentials where applicable;
6. request/perform deletion in PostHog;
7. verify that hiding a property is not being mistaken for deletion;
8. fix the source and global sanitizer;
9. add a regression test;
10. verify in Dev with synthetic, harmless marker values;
11. document the incident and decision without retaining the exposed content;
12. obtain approval before production re-enablement.

## 22. Troubleshooting

### Nothing appears in Live events

Check, in order:

1. Was analytics consent accepted?
2. Is analytics explicitly enabled for this runtime?
3. Is the correct `phc_` key present?
4. Was the client restarted/rebuilt after a `VITE_…` change?
5. Was the API restarted after a server change?
6. Are you looking at the Dev project rather than Prod, or vice versa?
7. Does `app_env` match the expected project?
8. Is a browser blocker or proxy rejecting the request?
9. Does the browser Network panel show a capture request and response?
10. Does the API log an analytics-delivery warning?

Do not “solve” missing consented events by turning autocapture or consent off.

### Events appear twice

Check:

- manual plus automatic pageview/pageleave;
- capture before and after an API request;
- React development remount behaviour;
- a click handler plus a parent handler;
- API retry or duplicated request;
- Stripe webhook retry without analytics idempotency;
- two SDK initialisations;
- client and server both claiming the same success event.

### Development events appear in production

1. Filter by `app_env` and `app_version` to find the source.
2. Check client and server keys separately.
3. Check Render dev and prod services separately.
4. Remember the client value is embedded at build time.
5. Correct the key, rebuild/restart, and annotate the contaminated date range.
6. Do not rewrite `app_env` in PostHog to hide the mistake.

### Counts do not equal MongoDB

That is expected under strict consent and browser blocking. Compare only events
which have the same definition, population, and time range. Server outcome
events should be more reliable, but when they are consent-gated they still
represent the consented population. MongoDB remains the authoritative total.

### A property has thousands of unique values

Look for raw paths, URLs, errors, search phrases, names, timestamps, IDs used
where grouping was intended, or values placed in property keys. Stop the bad
property, sanitize it, and decide whether historical deletion is required.

## 23. Definition of done

PostHog is ready for normal production use only when all of these are true:

- no browser capture occurs before opt-in or after withdrawal;
- the API honours the approved consent policy;
- no URL/query/referrer can contain secrets or raw identifiers;
- every route is reduced to a safe pattern;
- unwanted automatic collection is explicitly off in code and project settings;
- pageview/pageleave are emitted once;
- identity uses only stable internal IDs and approved person properties;
- browser intent and server/webhook outcome events have clear owners;
- event schemas are allow-listed, tested, defined, and versioned;
- the core activation funnel ends in server-confirmed `game_completed`;
- Stripe retry cannot duplicate billing events;
- Dev and Prod keys are separated and protected by `app_env`;
- internal/demo traffic is excluded by default;
- privacy wording, retention, access, withdrawal, and deletion match reality;
- dashboards state that analytics represents the consented population;
- an operator can disable both browser and server collection quickly.

## 24. Official references

Use primary documentation when revising this handbook:

- [PostHog JavaScript installation](https://posthog.com/docs/libraries/js)
- [PostHog JavaScript configuration options](https://posthog.com/docs/libraries/js/config)
- [Capturing events](https://posthog.com/docs/product-analytics/capture-events)
- [Identifying users and resetting identity](https://posthog.com/docs/product-analytics/identify)
- [Product analytics best practices](https://posthog.com/docs/product-analytics/best-practices)
- [Schema management](https://posthog.com/docs/product-analytics/schema-management)
- [Privacy controls](https://posthog.com/docs/product-analytics/privacy)
- [Opt-in and opt-out data collection](https://posthog.com/docs/privacy/data-collection)
- [GDPR compliance](https://posthog.com/docs/privacy/gdpr-compliance)
- [PostHog data storage](https://posthog.com/docs/privacy/data-storage)
- [PostHog data management](https://posthog.com/docs/data)
- [Group analytics](https://posthog.com/docs/product-analytics/group-analytics)
- [Reverse proxy](https://posthog.com/docs/advanced/proxy)
- [ICO storage and access technologies guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/)
- [ICO exceptions guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)
- [ICO consent management guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/how-should-we-obtain-record-and-manage-consent/)
- [ICO Data (Use and Access) Act 2025 summary](https://ico.org.uk/about-the-ico/what-we-do/legislation-we-cover/data-use-and-access-act-2025/the-data-use-and-access-act-2025-what-does-it-mean-for-organisations/)
- [GOV.UK Data (Use and Access) Act 2025 guidance](https://www.gov.uk/guidance/data-use-and-access-act-2025-data-protection-and-privacy-changes)

## 25. Repository reference map

Use these files when the later implementation starts:

| Concern                       | Source                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Product/architecture overview | [`PROJECT-KNOWLEDGE.md`](PROJECT-KNOWLEDGE.md)                                        |
| Client environment contract   | [`client/src/lib/env.js`](../client/src/lib/env.js)                                   |
| Browser SDK lifecycle         | [`client/src/lib/posthog.js`](../client/src/lib/posthog.js)                           |
| Consent storage               | [`client/src/lib/consent.js`](../client/src/lib/consent.js)                           |
| Consent UI                    | [`ConsentBanner.jsx`](../client/src/features/analytics/ConsentBanner.jsx)             |
| Browser event helper          | [`trackEvent.js`](../client/src/features/analytics/trackEvent.js)                     |
| Route/page/scroll tracking    | [`PostHogRouteTracker.jsx`](../client/src/features/analytics/PostHogRouteTracker.jsx) |
| Signup sources                | [`signupEvents.js`](../client/src/features/analytics/signupEvents.js)                 |
| Server analytics client       | [`analytics.service.js`](../server/src/modules/analytics/analytics.service.js)        |
| Server event contract         | [`analytics.contract.js`](../server/src/modules/analytics/analytics.contract.js)      |
| Browser event contract        | [`analyticsContract.js`](../client/src/features/analytics/analyticsContract.js)       |
| Route pattern manifest        | [`routePatterns.js`](../client/src/features/analytics/routePatterns.js)               |
| API consent parser            | [`analyticsConsent.js`](../server/src/modules/analytics/analyticsConsent.js)          |
| Client privacy wording        | [`PrivacyPage.jsx`](../client/src/pages/PrivacyPage.jsx)                              |
| Application routes            | [`AppRouter.jsx`](../client/src/app/router/AppRouter.jsx)                             |
| Render environments           | [`render.yaml`](../render.yaml)                                                       |
| Billing contract              | [`stripe.md`](stripe.md)                                                              |
| Historical analytics plan     | [`analytics-plan.md`](analytics-plan.md)                                              |
