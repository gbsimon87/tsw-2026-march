# Analytics (PostHog)

**Status: Phase 1 implemented and enabled in the Render blueprint.** Single
source of truth for PostHog in this repo. §11 lists the remaining dashboard and
live-environment checks that cannot be completed from the repository.

Goal: get trustworthy baseline numbers before onboarding more leagues. Today we
cannot answer "how many people are signing up or viewing pages".

## 1. Current state (verified 2026-08-13)

| Thing             | State                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Client SDK        | `posthog-js` in [`client/src/lib/posthog.js`](../client/src/lib/posthog.js)                                                               |
| Server SDK        | `posthog-node` in [`analytics.service.js`](../server/src/modules/analytics/analytics.service.js)                                          |
| Pageviews         | Explicit `$pageview` / `$pageleave` + scroll depth, [`PostHogRouteTracker.jsx`](../client/src/features/analytics/PostHogRouteTracker.jsx) |
| Autocapture       | Disabled                                                                                                                                  |
| Session recording | Disabled                                                                                                                                  |
| Identify          | Internal user ID only, with `plan`, `roles`, `emailVerified`, `authProvider`                                                              |
| Custom events     | ~13 `trackEvent` calls (feed, game detail, game tracking)                                                                                 |
| Server endpoint   | `POST /api/v1/analytics/event`, auth required, `distinctId` bound to `req.auth.userId` (OPT-024)                                          |
| Environment tag   | `app_env` on both browser and server events                                                                                               |

### Privacy rules — preserve these

Signed-in users are identified by internal user ID with only `plan`, `roles`,
`emailVerified`, and `authProvider`. **Never send names, email addresses, form
values, or other personal data.** Autocapture and session recording stay off.

### Outstanding problems

1. ~~Cookies written before consent~~ — **resolved.** PostHog initialises with
   `persistence: 'memory'` and upgrades only on accept (§3).
2. ~~`trackEvent.js` gated only on `env.enableAnalytics`~~ — **resolved.** It now
   also checks initialisation.
3. ~~Env-validator defaults pointed at the US host~~ — **resolved.** Both client
   and server now default to `https://eu.i.posthog.com`, matching both projects;
   every environment still sets the host explicitly (§2).

Environment configuration (keys, hosts) is resolved — see §2.

## 2. Environment separation — **DECIDED**

Two projects: **Prod - The Sporty Way** (`phc_CkHe…`) and **Dev - The Sporty
Way** (`phc_royF…`), both EU-hosted. Two projects _plus_ an `app_env` property
on every event, as a safety net against key misconfiguration.

Six key slots, two keys — the server sends independently of the client. Render
also sets `APP_ENV` on each API because both deployed APIs correctly run with
`NODE_ENV=production`; `NODE_ENV` therefore cannot distinguish the dev service:

| Environment           | Client key | Server key |
| --------------------- | ---------- | ---------- |
| Local machine         | Dev        | Dev        |
| Render `dev` service  | Dev        | Dev        |
| Render `main` service | **Prod**   | **Prod**   |

### Local env files — complete

All four files verified correct on 2026-08-13 — right key per environment, EU
host throughout:

| File                          | Key            | Host  |
| ----------------------------- | -------------- | ----- |
| `env/client/.env.development` | ✅ `phc_royF…` | ✅ EU |
| `env/client/.env.production`  | ✅ `phc_CkHe…` | ✅ EU |
| `env/server/.env.development` | ✅ `phc_royF…` | ✅ EU |
| `env/server/.env.production`  | ✅ `phc_CkHe…` | ✅ EU |

### `render.yaml` — complete

All four hosts are on `https://eu.i.posthog.com`; both clients set
`VITE_ENABLE_ANALYTICS: true`; the prod API sets `APP_ENV: production` and the
dev API sets `APP_ENV: development`. The consent banner ships with the client,
so enabling browser analytics does not permit durable PostHog storage before an
explicit Accept decision (§3).

### Render dashboard — outstanding

`sync: false` means the blueprint declares the variable but Render supplies the
value, so the key is never committed. Set under **Dashboard → service →
Environment**:

| Service                      | Variable           | Value                |
| ---------------------------- | ------------------ | -------------------- |
| `tsw-2026-march-api-prod`    | `POSTHOG_KEY`      | **prod** `phc_CkHe…` |
| `tsw-2026-march-client-prod` | `VITE_POSTHOG_KEY` | **prod** `phc_CkHe…` |
| `tsw-2026-march-api-dev`     | `POSTHOG_KEY`      | **dev** `phc_royF…`  |
| `tsw-2026-march-client-dev`  | `VITE_POSTHOG_KEY` | **dev** `phc_royF…`  |

> ⚠️ The pairing is the point: both prod services take the prod key, both dev
> services take the dev key. A dev key on a prod service silently merges the
> environments and undoes this section — both keys are valid, so nothing errors.

## 3. Consent and privacy — **DECIDED**

Jurisdiction is the **UK**: GDPR plus PUECR (UK ePrivacy, as amended by the Data
(Use and Access) Act 2025). PUECR governs storing information on a device and
has no legitimate-interest route — analytics cookies need prior consent. The
obligation attaches to _writing the identifier_, so "we only send internal IDs"
does not exempt us.

The DUAA 2025 added a consent exemption for audience-measurement analytics, but
it excludes marketing attribution — which is exactly what we want. **We are not
relying on it.**

> Engineering read of published regulator guidance, not legal advice.

### Decision: consent banner with cookieless pre-consent counting

- **Before consent:** `persistence: 'memory'`, no device storage, no PUECR
  trigger. Anonymous pageviews still counted, so traffic totals stay honest even
  for people who decline.
- **On accept:** switch to `localStorage+cookie`; capture remains enabled.
- **On decline:** stay in memory mode. Counted, never persisted, never attributed.
- Pre-consent sessions cannot be linked across visits. Accepted trade-off.

Built in-house, no third-party CMP. PostHog supports the storage boundary via
`persistence: 'memory'` and runtime `set_config`. Capturing is intentionally not
opted out because anonymous, memory-only pageviews are part of the baseline.

### Banner — placement, copy, behaviour

**Placement:** bottom of viewport, full width, fixed, rendered in `AppLayout` so
it covers every route. Most anonymous arrivals land on `/pulse`, but shared game
cards and public league pages are entry points too. Bottom rather than modal: it
does not obscure the content someone followed a link to see. Must not overlap
the mobile nav — check `AppLayout`'s mobile menu z-index.

**Copy:**

> **We use analytics cookies**
> We'd like to count visits and see which pages people find useful, so we can
> improve The Sporty Way. We never collect your name, email, or anything you
> type. You can change your mind any time.
> `[Accept]` `[Decline]` · [Privacy](/privacy)

Accept and Decline are equally weighted buttons — GDPR requires consent to be
freely given, so no prominent Accept beside a greyed-out link, no pre-ticked
boxes, no "by continuing you agree", no cookie wall. The purpose is stated
specifically rather than as "improve your experience", which regulators treat as
insufficiently informed.

**Behaviour:**

- Dismissing without choosing is **not** consent — the banner stays, app remains
  memory-only. Only explicit Accept opts in.
- Store the decision in `localStorage` with `consentVersion` and a timestamp.
  Storing the decision itself is exempt: it is strictly necessary to honour the
  choice.
- **Re-consent** when `consentVersion` is bumped (do this whenever events,
  purposes, or processors change) or after **12 months**.
- **Withdrawal must be as easy as giving it** (GDPR Art. 7(3)). Persistent
  "Cookie settings" link in the footer re-opens the banner. Declining after
  having accepted switches back to memory, resets the PostHog identity, and
  clears the PostHog cookie and `localStorage` entries.
- Fires `consent_decision` (§7) either way.

## 4. Instrumentation sequence — **DECIDED**

**Phase 1: acquisition funnel.** Anonymous visitor → public page → signup. The
number we are missing, and it gates the marketing work.

**Phase 2 (later): product funnels**, covering league-owner and standalone-team
paths with one shared vocabulary.

Funnel-optimisation data is noise until people are entering the funnel, so
Phase 1 establishes whether traffic exists at all. **Phase 2 names are fixed now
(§9)** even though they ship later — renaming after events accumulate history
breaks funnels and does not apply retroactively.

## 5. Plan and identity model

**Plan: Pay-as-you-go.** Includes a monthly event allowance; overage bills to
the card on file.

### Identity model — **DECIDED**

Identify by internal **user ID**; use **event properties and breakdowns** for
league/team analysis rather than PostHog Groups (which are gated by plan tier).
This works on any tier, and if Groups later become available the same
`resource_id` properties become the group keys — additive, not a rewrite.

## 6. Acquisition funnel — current state and required changes

### What exists today

| Entry point                | Where                                                                                | Goes to                         |
| -------------------------- | ------------------------------------------------------------------------------------ | ------------------------------- |
| Nav "Sign in"              | [`AppLayout.jsx`](../client/src/layouts/AppLayout.jsx) L57 desktop, L188 mobile      | `/login`                        |
| Gated feed composer        | [`FeedPage.jsx`](../client/src/features/feed/pages/FeedPage.jsx) L90                 | `/login?redirectTo=…`           |
| Follow button (logged out) | [`FollowButton.jsx`](../client/src/features/follows/components/FollowButton.jsx) L69 | `/login`                        |
| Pricing CTAs               | [`PricingPage.jsx`](../client/src/features/billing/pages/PricingPage.jsx) L341, L404 | `/register?redirectTo=/pricing` |

**The problem:** every entry point except `/pricing` — which production redirects
away — lands on **login**, framed for people who already have accounts. A
stranger arriving from a shared game card sees "Sign in", an invitation to
return rather than to join.

`AuthPage` derives its mode from the pathname alone
(`isRegister = pathname === '/register'`), so "default to register" is a question
of **where links point**, not new component state. The tab toggle, register form,
and `redirectTo` preservation all already work.

### Decided changes

- Nav link becomes **"Sign in / Join"**, pointing at `/register`.
- Add a register CTA to **`/home`** (labelled "Discover" in the nav — there is no
  `/discover` route) and `/pulse`; these are the two pages anonymous visitors see
  first.
- `/about` is **not** a funnel step.

### Registration will sign the user in

`handleRegistered` currently redirects to `/login?registered=1`, so a new user
enters credentials twice immediately after choosing to join — the most avoidable
loss point in the funnel.

`register()` already holds the `user` object and `issueAuthTokens(user, metadata)`
is the same function `login()` and `loginWithGoogle()` already call, so this is a
small change rather than new session plumbing. `register` also needs
`metadata(req)` in the controller, as `login` has.

**The two events stay separate regardless.** `user_registered` is _acquisition_,
firing once per account ever; `user_logged_in` is _engagement_, firing on every
return. Merging them would make returning users indistinguishable from new
signups. Auto-login only means they fire back-to-back the first time.

### Future work: email verification (separate task)

`register()` sets `emailVerified: true` unconditionally and `login()` never
checks it, so **local accounts are unverified in practice** and the "verify your
inbox" copy in `AuthPage` is vestigial. Real verification is its own task, but it
interacts with this plan three ways:

- **It adds a funnel step.** Reserve `verification_email_sent` and
  `email_verified` now so they need no renaming later.
- **It changes the auto-login decision above** — registration could no longer
  sign the user straight in, or would sign them into a restricted state. Revisit
  `is_first_login` at the same time.
- **`emailVerified` is already sent as a person property**, so it becomes
  meaningful only once verification is real.

Until then, treat `emailVerified` in PostHog as **not a signal**.

## 7. Phase 1 — the event list

### Governing principle: if MongoDB already has it, do not pay PostHog for it

Anything persisted as a record — games, leagues, teams, rosters, stat events —
is queryable from Mongo for free, with complete history and no sampling. PostHog
earns its cost only on what Mongo **cannot** see: anonymous visitors, page views,
and drop-off _before_ a record exists.

**First consequence: remove the four per-tap `game_stat_recorded` calls** in
[`GameTrackPage.jsx`](../client/src/features/games/pages/GameTrackPage.jsx). A
busy game emits hundreds, and every one is already a `Game.events` document.
Delete rather than aggregate — aggregation still costs events for data we hold.

### Naming convention

`snake_case`, `object_verb_past_tense` (`user_registered`, not `register`).
PostHog's own events keep their `$` prefix.

### Properties

`app_env` (`development` | `production`) is set as a PostHog **super property**
(`posthog.register(...)`) so it attaches automatically. `$pageview` also carries
`route_pattern`, `path`, `search`, `referrer`, `scroll_depth` — already
implemented.

Phase 2 adds `resource_type`, `resource_id`, `actor_role`, `season_id` as
per-event properties (§9). Phase 1 needs none of them; the names are fixed now so
Phase 1 does not establish a conflicting convention.

### The events

Nine events. Client-side unless stated.

| Event                 | Fires when                                   | Properties                                                                              | Notes                                                                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$pageview`           | Route change                                 | _(implemented)_                                                                         | The baseline traffic number we cannot answer today                                                                                                                                                                                                                |
| `$pageleave`          | Leaving a route                              | `scroll_depth`                                                                          | Implemented                                                                                                                                                                                                                                                       |
| `signup_cta_clicked`  | Any "Sign in / Join" or register CTA clicked | `source`: `nav` \| `home` \| `pulse` \| `feed_composer` \| `follow_button` \| `pricing` | **The key new event.** `source` is what makes the funnel attributable                                                                                                                                                                                             |
| `auth_page_viewed`    | `/login` or `/register` renders              | `mode`: `login` \| `register`, `redirect_to`: bool                                      | Separates "reached the form" from "completed it"                                                                                                                                                                                                                  |
| `oauth_started`       | "Continue with Google" clicked               | `provider`: `google`, `mode`: `login` \| `register`                                     | The visitor leaves the site here. Without it an abandoned OAuth round-trip — cancelled, wrong account, provider error — is indistinguishable from never filling the form in                                                                                       |
| `user_registered`     | Registration succeeds                        | `auth_provider`: `local` \| `google`                                                    | **Server.** Acquisition; once per account ever. Google creation is detected by `findOrCreateGoogleUser` and carried through the exchange token so first login remains accurate                                                                                    |
| `user_logged_in`      | Login succeeds                               | `auth_provider`, `is_first_login`: bool                                                 | **Server.** Engagement; every return. `is_first_login` marks the auto-login after registration                                                                                                                                                                    |
| `registration_failed` | Registration rejected                        | `reason`: `email_in_use`                                                                | **Server.** High rates mean returning users are hitting the register form by mistake. Only `email_in_use` is emitted: Zod rejects malformed input in the controller before the service runs, so a `validation` reason would need a separate controller-level hook |
| `consent_decision`    | Banner accepted or declined                  | `decision`: `accepted` \| `declined`                                                    | The denominator for what fraction of traffic is attributable                                                                                                                                                                                                      |

**Why the auth events are server-side:** the client cannot reliably observe
success — the request may complete mid-redirect, and a lost client event would
undercount the most important number in the funnel. `registration_failed` has no
authenticated user at all.

**`registration_failed` transport:** capture directly via `posthog-node` in
`auth.service.js`, not through a new unauthenticated endpoint — no new public
surface to rate-limit or allowlist. Use a hash of the attempted email as
`distinctId` so repeated failures group without storing the address.

### The funnel this builds

```
$pageview (/pulse, /home, public league/team/player pages)
   → signup_cta_clicked            [source = where they came from]
   → auth_page_viewed              [mode = register]
   → user_registered               [server]
   → user_logged_in                [is_first_login = true]
```

Each step answers a distinct question: is there traffic; does anything prompt
action; do people reach the form; do they complete it; do they get in.

### Anonymous → identified stitching — **DECIDED**

**Pre-consent activity cannot be stitched.** In `persistence: 'memory'` there is
no durable identifier, so PostHog generates a fresh anonymous ID per page load.
Nothing links those events to each other or to a later account. This is the cost
of not writing a cookie before consent, and no implementation recovers it.

| Visitor                               | What we can attribute                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| Declines consent                      | Pageview counts only                                         |
| Accepts, signs up same session        | **Full journey**, including which page and CTA led to signup |
| Accepts, returns days later, signs up | Full journey across both visits                              |
| Never sees the banner                 | Signup recorded; source unknown                              |

Implementation:

1. On **Accept**: `posthog.set_config({ persistence: 'localStorage+cookie' })`.
2. On **first login** (including auto-login after registration):
   `posthog.identify(user.id, safeProperties)`. PostHog merges accumulated
   anonymous history automatically.
3. **Never call `identify()` before consent** — in memory mode it creates an
   identified person with no history and no way to link later sessions, which
   looks like it worked but did not.
4. `resetPostHogUser()` on logout stays as-is.
5. Consent changes received through the browser `storage` event immediately
   reconfigure every open tab. Accept upgrades that tab to persistent storage;
   decline or clearing the decision returns it to memory and resets its id.

`PostHogRouteTracker`'s identify effect implements step 2 and retries when
consent changes, so a signed-in visitor who accepts is identified without a
reload.

**Reading the data:** top-of-funnel is "consented visitors", not "all visitors".
Compare against total `$pageview` — which includes decliners — to see what share
of traffic is attributable. `consent_decision` is the denominator.

### Volume

At ~50 users, with per-tap stat events removed, volume is not a realistic
constraint — the allowance would need roughly 33,000 events/day. The real risk is
dev traffic reaching the prod project, which §2 addresses.

## 8. PostHog console setup

### Which key, and what scopes

**No scopes, and no new key to create.** Each project already has one **Project
API key** (`phc_…`), found at **Settings → Project → General**. It has no scope
picker: it is write-only by design, embedded in the JS bundle, and safe to
expose. Both `posthog-js` and `posthog-node` use the same value.

> If PostHog is showing a scope picker, you are on the **Personal API key**
> (`phx_…`) screen. That grants read access to your data. **Nothing in this plan
> needs one** — do not create it, and never commit it.

| Variable           | Used by                            | For                            |
| ------------------ | ---------------------------------- | ------------------------------ |
| `VITE_POSTHOG_KEY` | `posthog-js` (browser)             | Pageviews, CTA clicks, consent |
| `POSTHOG_KEY`      | `posthog-node` (`auth.service.js`) | The three server events (§7)   |

Same value, two names — Vite requires the `VITE_` prefix to expose a variable to
browser code; the server has no such convention.

### Per-project settings — do in **both** projects

1. **Autocapture off** — Settings → Project → Autocapture & heatmaps: disable
   Autocapture, Web vitals, Heatmaps. Code sets `autocapture: false` already;
   this is the second line of defence.
2. **Session replay off** — Settings → Project → Session replay. Replay captures
   far more personal data than pageviews and is outside the §3 consent model.
3. **Retention** — Settings → Project → Data management. Confirm the window
   covers any year-over-year season comparison you intend.
4. **Internal traffic filters** — Settings → Project → Internal & test users:
   `Host` does not contain `localhost`, and `app_env` is not `development` (add
   the second once the property ships).

### After events flow

Build the §7 funnel under **Product analytics → New insight → Funnel**. Do this
_after_ data arrives — an empty funnel is not diagnostic.

## 9. Phase 2 — event vocabulary (named now, shipped later)

**Nothing here ships with Phase 1.** These names are fixed so Phase 1's property
schema is forward-compatible; renaming later costs the history.

### Shared properties

| Property        | Values                                                                       | Notes                                                |
| --------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `resource_type` | `league` \| `team`                                                           | Lets one funnel definition serve both customer types |
| `resource_id`   | league or team id                                                            | Disambiguated by `resource_type`                     |
| `actor_role`    | `league_owner` \| `league_manager` \| `team_manager` \| `helper` \| `player` | Mirrors [`permissions.md`](./permissions.md)         |
| `season_id`     | id                                                                           | Everything league-side is season-scoped              |

`resource_type` + `resource_id` rather than separate `league_id`/`team_id` is
what makes one funnel work across both customer types, and it maps onto PostHog
Groups later if the tier allows.

### Activation — does a new customer reach first value?

| Event                   | Fires when                            | Extra properties                               |
| ----------------------- | ------------------------------------- | ---------------------------------------------- |
| `resource_created`      | League or standalone team created     | `resource_type`, `resource_id`                 |
| `roster_populated`      | First player added                    | `resource_type`, `resource_id`, `player_count` |
| `game_scheduled`        | Game created with `status: scheduled` | `resource_type`, `resource_id`, `season_id`    |
| `game_tracking_started` | Clock starts for the first time       | `resource_id`, `game_id`                       |
| `game_completed`        | `finishGameForUser` succeeds          | `resource_id`, `game_id`, `duration_minutes`   |

**`game_completed` is the activation moment** — the point at which a customer has
done the thing TSW exists for. Everything above is funnel; everything after is
retention.

### Multi-actor adoption — do invited people show up?

The distinctive part of the league funnel, with no standalone-team equivalent. A
league is only genuinely adopted when people _other than the owner_ use it.

| Event                       | Fires when                                      | Extra properties                      |
| --------------------------- | ----------------------------------------------- | ------------------------------------- |
| `manager_invited`           | `addManagerByEmail` succeeds                    | `resource_id`, `invited_role`         |
| `join_request_created`      | `createJoinRequest` succeeds                    | `resource_id`, `actor_role`           |
| `join_request_resolved`     | Approved, rejected, or cancelled                | `resource_id`, `outcome`              |
| `invited_user_first_action` | An invited non-owner performs their first write | `resource_id`, `actor_role`, `action` |

`invited_user_first_action` is the one that matters — an invite accepted but
never acted on is not adoption. Without it, `manager_invited` counts optimism.

### Retention

| Event              | Fires when                       | Extra properties                       |
| ------------------ | -------------------------------- | -------------------------------------- |
| `season_created`   | `createSeasonForLeague` succeeds | `resource_id`, `is_first_season`: bool |
| `season_completed` | `completeSeasonForUser` succeeds | `resource_id`, `games_played`          |

A second season is the strongest retention signal this product has — a league
chose TSW again after a full cycle.

### Growth loop

| Event                             | Fires when                                      | Extra properties           |
| --------------------------------- | ----------------------------------------------- | -------------------------- |
| `share_initiated`                 | Share/copy-link on a game, player, or team card | `share_target`             |
| `public_page_viewed_by_anonymous` | Anonymous view of a public page                 | `page_type`, `resource_id` |

`share_initiated` is the supply side, `public_page_viewed_by_anonymous` the
demand side, and `signup_cta_clicked` (§7) is where it converts.

### Billing — reserved, not designed

Production pricing is disabled and dev league checkout is comped, so this funnel
is not measurable yet. **Reserve only:** `checkout_started`,
`checkout_completed`, `subscription_cancelled`.

### Deliberately excluded

| Not tracked                           | Get it from                      |
| ------------------------------------- | -------------------------------- |
| Individual stat recordings            | `Game.events`                    |
| Box scores, standings, player stats   | Materialized collections         |
| Counts of games/teams/players/leagues | Direct Mongo queries             |
| Roster changes beyond the first       | `Team.players`, roster snapshots |

The test for any future event: **does it capture an intention, a drop-off, or an
anonymous action that leaves no database record?** If a Mongo query answers it,
it does not belong in PostHog.

## 10. Domain context

From [`PROJECT-KNOWLEDGE.md`](./PROJECT-KNOWLEDGE.md):

- **Two customer types**: standalone teams (`team_pro`) and leagues (`league`).
- **Multi-actor leagues**: owner → managers → team managers → helpers → players.
  Adoption depends on invited people showing up — a separate funnel from the
  owner's own actions.
- **Public surfaces are the growth loop**: `/pulse`, public league/team/player
  pages, shareable cards, highlights — all seen by logged-out visitors.
- **Pricing is disabled in production**; dev league checkout is comped.

## 11. Outstanding

**Configuration** (§2):

- [x] All four env files — correct key per environment, EU host _(2026-08-13)_
- [x] All four `render.yaml` PostHog hosts → EU _(2026-08-13)_
- [x] Both Render clients → `VITE_ENABLE_ANALYTICS: true` _(2026-08-13)_
- [x] Render APIs declare `APP_ENV` explicitly _(2026-08-13)_
- [ ] Four Render dashboard keys (§2 table)
- [ ] PostHog per-project settings (§8)

**Implementation — Phase 1 complete** _(2026-08-13)_:

- [x] **Privacy policy page** at `/privacy` (§13) — the banner links to it, so
      informed consent required it first
- [x] **Consent infrastructure** — `lib/consent.js`, `ConsentBanner`,
      memory→localStorage switch, footer "Cookie settings", `consent_decision`
- [x] **Auth changes** — auto-login on register, nav/CTAs repointed to
      `/register`, three server events, `trackEvent.js` init gate
- [x] **CTA + tracking** — `signup_cta_clicked` with `source`,
      `auth_page_viewed`, register CTAs on `/home` and `/pulse`, four
      `game_stat_recorded` calls removed
- [x] **Google acquisition** — new Google accounts emit `user_registered`, and
      their completed exchange emits `user_logged_in` with `is_first_login`
- [x] **Cross-tab consent** — a decision in one tab immediately changes PostHog
      persistence in every other open tab

Two implementation notes worth keeping:

- **`user_logged_in` is emitted from the sign-in entry points, not from
  `issueAuthTokens`.** That function is also called by `refresh()`, which
  rotates tokens every ~15 minutes for an active user — emitting there would
  turn an engagement metric into a session-duration proxy and inflate volume.
  The two Google steps would double-count for the same reason. A test pins this.
- **Server capture is detached and swallows its own failures.** A PostHog
  outage must never delay or fail a registration.

**Dashboard/deployment checks still required:**

- [ ] Four Render dashboard keys (§2)
- [ ] PostHog per-project settings (§8)
- [ ] Verify against §12 in each environment

**Later:**

- [ ] Email verification (§6)
- [ ] Phase 2 events (§9), once Phase 1 shows there is traffic to analyse
- [ ] Dashboards, once data flows

## 12. Verification

**Start here: does the consent banner appear on a fresh visit?** It is the
fastest signal that the client is wired up at all. `isPostHogEnabled()` requires
**both** `VITE_ENABLE_ANALYTICS=true` **and** `VITE_POSTHOG_KEY`, so a missing
key means no banner, no cookie, and no events — with nothing logged anywhere.
On Render the key is `sync: false`, supplied from the dashboard, and Vite
inlines it at **build** time: setting it takes effect only after a redeploy.

After any analytics config change, check **per environment**:

- the consent banner appears for an undecided visitor;
- route changes produce `$pageview` / `$pageleave` in Live Events;
- events land in the **correct project** — confirm via `app_env`, not just the
  dashboard you happen to have open;
- identity properties contain no names, emails, or form values;
- autocapture and session recordings remain absent;
- before consent, only intended anonymous events are captured; no PostHog cookie
  or PostHog `localStorage` entry is written (the strictly necessary
  `tsw_consent` decision record exists only after a choice);
- accepting in one open tab upgrades persistence in another; declining in one
  returns every open tab to memory-only capture and clears its PostHog id;
- server capture returns `{captured: true}` — if `POSTHOG_KEY` is unset it
  silently returns `{captured: false}`.

### Two silent failure modes to know about

Both produce no error, no log, and a `{captured: true}` return — they simply
result in nothing arriving:

1. **`posthog-node` batches.** It holds events until the batch fills or a timer
   elapses, so on a long-running server a handful of manual test events never
   arrive. Outside production the client uses `flushAt: 1, flushInterval: 0`;
   graceful shutdown flushes what remains. Production keeps batching, which is
   correct under real traffic.
2. **A US host with an EU key is accepted and ingests nothing.** Both env
   validators default to `https://eu.i.posthog.com`, but an explicitly wrong
   value fails quietly.

If events are missing, check the browser Network tab filtered on `posthog`
before assuming the code is at fault: ad blockers and privacy extensions block
the domain outright, and they run in incognito unless explicitly disabled.

## 13. Privacy policy page — implemented

The public `/privacy` route is implemented and linked from both the footer and
consent banner. Keep it current: GDPR requires consent to be _informed_, so any
material change to analytics events, purposes, or processors also requires a
`CONSENT_VERSION` bump.

It is needed independently of analytics anyway: TSW already processes accounts,
emails, player records, and uploaded media.

### What it covers and must continue to cover

- **What is collected** — separate account data (name, email, membership,
  uploaded media) from analytics data (pages viewed, actions, internal user ID)
- **Why**, per purpose, specifically — not "to improve your experience"
- **Legal basis** — consent for analytics cookies (PUECR); contract or
  legitimate interests for account data
- **Processors** — PostHog (analytics, EU-hosted), Cloudinary (media), Resend
  (email), Stripe (payments), MongoDB Atlas (hosting), and where data is stored
- **Retention** — analytics window (§8) and what happens on account deletion
- **Rights** — access, rectification, erasure, objection, withdrawal of consent,
  and how to exercise each
- **Contact** — `/contact` already exists
- **Last updated** date

### Notes

- Route at `/privacy`, linked from footer and consent banner. Public, no auth.
- State explicitly that **autocapture and session recording are disabled** and
  that form values are never collected — true (§1), and a genuine differentiator.
- A cookie table (name, purpose, lifetime) makes the PUECR position easy to
  demonstrate.
- **Not legal advice** — this is an engineering checklist. Have it reviewed.
