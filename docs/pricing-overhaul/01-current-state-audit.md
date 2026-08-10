# 01 · Current-State Audit

> Ground truth as of 2026-07-16, from direct code exploration. Every claim carries a
> `file:line` reference. **Where the code and the docs disagree, this file trusts the
> code.** The whole plan rests on this being accurate — if a reference is stale when
> you read it, fix this file first.

## 1. Billing module — `server/src/modules/billing/`

Four files: `billing.routes.js`, `billing.controller.js`, `billing.service.js`
(≈578 lines), `billing.validation.js`.

### Routes & webhook mount

- Two routers: `billingRouter` (authed, `billing.routes.js:12`) and
  `billingWebhookRouter` (public, `:10`). All authed routes behind `checkoutLimiter`.
- Endpoints: `POST /checkout-session` (`:15`, legacy alias), `/team-checkout` (`:22`),
  `/league-checkout` (`:27`), `/customer-portal` (`:32`).
- Webhook mounted **before** `express.json()` with `express.raw()` at
  `server/src/app.js:34-39`; path is `/api/v1/billing/webhooks` (**plural**). Not
  behind `apiRateLimiter`/CSRF (registered later, `app.js:44-46`).

### Stripe client & checkout

- Lazy singleton, API version pinned **`2024-06-20`** (`billing.service.js:26-39`);
  throws `ApiError(503, 'Billing is not configured')` if `STRIPE_SECRET_KEY` unset.
- `createTeamCheckoutSession` (`:178-233`): rejects if `isTeamActive`; `mode:
'subscription'`, `payment_method_collection: 'always'`, `trial_period_days: 14`
  (`:213`); metadata `{resourceType:'team', teamId, ownerUserId, plan:'team',
billingInterval}`.
- `createLeagueCheckoutSession` (`:235-277`): metadata `{resourceType:'league', …,
plan:'league'}`. **The League doc is not created here** — the webhook creates it
  (`:402-417`).
- Portal: `createTeamPortalSession` (`:286`), `createLeaguePortalSession` (`:299`).
- Aliases: `createCheckoutSession` (`:280`), `createCustomerPortalSession` (`:315`),
  `getBillingSummary` (`:551`) — "kept for backward compatibility."

### Webhook handling

- `handleWebhookEvent(signature, rawBody)` (`:471-518`) verifies via
  `stripe.webhooks.constructEvent`; dispatches by
  `event.data.object.metadata?.resourceType` (`'league'` vs team fallback).
- Handled: `checkout.session.completed` (`:485`), `customer.subscription.created|
updated|deleted` (`:493-495`), `invoice.payment_failed` (`:503`). **No-ops:**
  `invoice.paid`, `customer.subscription.trial_will_end`, default (`:511-514`).
- Idempotency: `claimWebhookEvent(Model, filter, eventId)` in
  `server/src/utils/webhookIdempotency.js` — atomic `findOneAndUpdate` gated on
  `processedWebhookEventIds: {$ne: eventId}`, `$push` + `$slice: -25`
  (`MAX_PROCESSED_WEBHOOK_EVENT_IDS = 25`). Wrappers: `claimTeamWebhookEvent`
  (`teams.repository.js:127`), `claimLeagueWebhookEvent` (`leagues.repository.js:319`).
- ⚠️ **League create path is NOT event-id idempotent** —
  `createLeagueFromCheckoutSession` (`billing.service.js:414-417`) dedups by
  `League.findOne({stripeCustomerId})`; a concurrent-create race is open (comment
  `:407-413`), deferred pending a `stripeCustomerId` unique index.

## 2. Entitlements — scattered, not centralized

### Canonical readers (`billing.service.js`)

- `ACTIVE_STATUSES = {'active','trialing'}` (`:22`).
- `isTeamActive` (`:62-67`): `(plan==='team' || plan==='pro') && status ∈ ACTIVE`.
  `'pro'` is "legacy plan value used before the pricing redesign" (`:65`).
- `isLeagueActive` (`:69-74`): `(plan==='league' || plan==='pro') && active`. `'pro'`
  is the manual value on We-ball Saturday (`:72`).
- `getTeamEntitlements` (`:76-84`): `{canTrackStats, canViewReplay, canViewShotMaps,
canViewHighlightClips}` — **all four equal `isTeamActive`** (no granularity).
- `getLeagueEntitlements` (`:86-95`): adds `canManageLeague`, all equal `isLeagueActive`.

### Parallel, partly-dead path (`auth.service.js`)

- `getUserLeagueBillingSummary` (`:69-77`) reads `user.leaguePlan` etc.
- `getUserLeagueEntitlements` (`:78-87`): `hasLeagueAccess = billing.plan === 'pro' &&
status ∈ {active,trialing}` → `{canCreateLeague, canOwnAnotherLeague}`. **Checks
  `'pro'` only, not `'league'`.**
- ⚠️ The `User.league*` mirror fields these read are **written only by `seed.js`
  (`:718-751`), never by webhooks** — so these entitlements are effectively dead
  outside seeded data.

### `syncOwnerPlan` (`billing.service.js:138-142`)

Re-scans owned teams; sets `User.plan = 'pro'` if any team `isTeamActive`, else
`'free'` (`updateUserPlan`, `auth.repository.js:220-222`). Called after team webhooks
(`:371,383,397`); **not** called for league mutations.

## 3. Feature-gating enforcement (server-side)

**Hard payment gates (`ApiError(402)`):**

- `games.service.js:1077-1078` — **create standalone game** requires `isTeamActive`.
- `games.service.js:1400-1401` — **append event** requires `isTeamActive`.
- `leagues.service.js:433-434` — create season requires `canManageLeague`.
- `leagues.service.js:556-557` — configure league requires `isLeagueActive`.
- `leagues.service.js:809-810` — add league team requires `isLeagueActive`.
- `billing.service.js:522-528` — `assertTeamCreationAllowed` (2nd inactive team).

> **The two `games.service.js` gates are what D2 removes** — they make tracking a paid
> feature today, contradicting the "free tracking" model.

**View entitlements are NOT route-guarded.** `canViewReplay`/`canViewShotMaps`/
`canViewHighlightClips` are computed and written into responses as snapshot booleans
(`games.service.js:730` `entitlementsSnapshot`, `:943`; `teams.service.js:70,605,643,
782`), and the client renders locked states from them. There is no server endpoint
that refuses to return replay/shot data for a non-Pro team — gating is
client-presentational + data-omission only.

**Authorization gates (`403`)** in `leagues.service.js` and `games.service.js` are
role checks (owner/manager), unrelated to plan.

## 4. Billing state on models

| Model  | File:line                  | Plan enum                 | Notes                             |
| ------ | -------------------------- | ------------------------- | --------------------------------- |
| User   | `auth.repository.js:12`    | `['free','pro']`          | + dead `league*` block (`:13-23`) |
| Team   | `teams.repository.js:47`   | `['free','pro','team']`   | Fullest billing block (`:47-62`)  |
| League | `leagues.repository.js:36` | `['free','pro','league']` | Mirror of Team's (`:36-55`)       |

Team billing fields (`teams.repository.js:47-62`): `plan`, `subscriptionStatus`
(`['inactive','trialing','active','past_due','canceled']`), `stripeCustomerId/
SubscriptionId/PriceId`, `billingInterval` (`['monthly','season',null]`),
`currentPeriodEnd`, `trialEnd`, `cancelAtPeriodEnd`, `billingEmail`,
`lastWebhookEventId`, `processedWebhookEventIds`. League mirrors these
(`leagues.repository.js:36-55`). **Three plan enums disagree; `User.plan` is written
`'pro'` even for `'team'`-plan teams** (`syncOwnerPlan`).

## 5. Env & config

- `server/src/config/env.js:36-44` (Zod, all `.optional()`): `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO_MONTHLY` (**legacy, unread**),
  `STRIPE_PRICE_ID_TEAM_MONTHLY|SEASON`, `STRIPE_PRICE_ID_LEAGUE_MONTHLY|SEASON`,
  `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`.
- Price resolution: `resolveTeamPriceId` (`:166-169`), `resolveLeaguePriceId`
  (`:171-174`). `STRIPE_PRICE_ID_PRO_MONTHLY` is declared but **never read**.
- Feature-flag idiom: `AUTO_FEED_ENABLED` (`env.js:68-71`) —
  `z.string().optional().transform(v => v === 'true')`.
- ⚠️ **`render.yaml` drift:** both API services (`:54-62`, `:160-168`) declare only
  `STRIPE_PRICE_ID_PRO_MONTHLY` + secret/webhook/URLs — **the 4 real TEAM/LEAGUE price
  IDs the code uses are missing.** `docs/render-env-matrix.md` is up to date; the
  committed `env/server/.env.development` has all 4 real IDs.
- Client: `client/src/lib/env.js` — `appEnv` (`VITE_APP_ENV`, `:8`), `apiBaseUrl`,
  `stripePublishableKey` (`:16`, optional, effectively unused).

## 6. Hard-coded pricing / plan assumptions

- **Display prices hard-coded** in `client/src/features/billing/pages/PricingPage.jsx:27-30`:
  `{team:{monthly:'$12/mo',season:'$89/season'}, league:{monthly:'$49/mo',
season:'$299/season'}}` — **stale vs the agreed $9/$79, $29/$199**. Feature lists
  hard-coded `:32-58`.
- Legacy `'pro'` tolerated in `isTeamActive`/`isLeagueActive`.
- `auth.service.js:81` hard-codes `plan === 'pro'` (won't accept `'league'`).
- `plan:'team'`/`plan:'league'` string literals in `applyTeamSubscriptionState:323`,
  `applyLeagueSubscriptionState:341`, checkout metadata (`:219,227,263,271`).
- `trial_period_days: 14` hard-coded (`:213,259`).
- Interval strings `'monthly'`/`'season'` in validation (`billing.validation.js:5,9`),
  resolvers, schema enums.
- `games.service.js` snapshot fallbacks hard-code `plan:'pro'`/`status:'active'` and
  `{canViewReplay:true, canViewShotMaps:true}` (`:825-826,894-895,902-903,921-926,
1029-1030,1041-1042`).
- We-ball Saturday: synthetic `plan:'pro', subscriptionStatus:'active'` on a
  non-persisted team object (`leagues.service.js:2454-2455`).
- Seed scripts hard-code plans throughout (`seed.js`, `seed-demo-account.js`).
- No literal dollar amounts in **backend** business logic (amounts live on Stripe
  prices).

## 7. Frontend billing & gating

- **Billing feature** (`client/src/features/billing/`): `api/billingApi.js`,
  `components/LockedFeatureCard.jsx`, `pages/PricingPage.jsx`, `BillingSuccessPage.jsx`,
  `BillingCancelPage.jsx` (+ tests). No `hooks/`/`schemas/`.
- **Client-side `isSafeStripeUrl`** (`PricingPage.jsx:15-25`): requires `https:` +
  hostname `checkout.stripe.com`/`billing.stripe.com` before
  `window.location.assign`. **No server-side equivalent exists** (grep found none in
  `server/`); the server helper `appendQueryParam` (`billing.service.js:43-50`) does
  no host/scheme validation.
- **`/pricing` prod gate:** `AppRouter.jsx:194-199` —
  `env.appEnv === 'production' ? <Navigate to="/pulse"/> : <PricingPage/>`. Many CTAs
  point at `/pricing` (AdminPage, LeaguesPage, NewTeamPage, GameDetailPage,
  GameTrackPage, `LockedFeatureCard`, the 402 handler) — all dead-ends in prod today.
- **Data loading on billing pages is imperative** (`useEffect`+`useState`, not
  TanStack Query): `PricingPage.jsx:115-145`, `BillingSuccessPage.jsx:30-115` (5-attempt
  poll). The client learns plan via `team.billing`/`league.billing` in
  `teamsApi.list()`/`leaguesApi.list()` responses, and per-game entitlements via
  `gamesApi.getById` (`data.teamEntitlements`, `data.canShareHighlights`).
- Replay gating: `GameDetailPage.jsx:151-167` `canAccessReplay`, renders
  `LockedFeatureCard` when denied (`:592-609`). Tracking gate:
  `GameTrackPage.jsx:1338-1356`.
- No pricing/upgrade CTA in nav (`AppLayout.jsx`).

## 8. Dead / vestigial code

- **`client/src/features/games/components/GameShotMap.jsx`** — fully implemented,
  **imported nowhere** (live public shot rendering uses `RecapShotSnapshot`). Dead.
- **`STRIPE_PRICE_ID_PRO_MONTHLY`** — declared in env + render.yaml, never read.
- **`User.league*` fields** (`auth.repository.js:13-23`) — written only by seed.
- **Backward-compat aliases** — `createCheckoutSession`, `createCustomerPortalSession`,
  `getBillingSummary`, `billingApi.createCheckoutSession`.
- **`User.roles`** (`auth.repository.js:24`) — set at creation, never read for authz
  (out of billing scope, but noted).

## 9. Data model relationships (relevant to the cascade)

- Ownership = denormalized `ownerUserId` on `Team` (`teams.repository.js:41`), `League`
  (`leagues.repository.js:18`), `Game` (`games.repository.js:138`).
- Standalone `Team.players[]` are **embedded, with no user link**
  (`teams.repository.js:29-37`).
- `LeaguePlayer.claimedByUserId` (`leagues.repository.js:89-94`) links a roster slot to
  a `User`; written in `approveJoinRequest` (`leagues.service.js:1738`), cleared in
  `unclaimLeaguePlayer` (`:1819`). Reverse lookup `listLeaguePlayersByClaimedUser`
  (`leagues.repository.js:363`).
- **`Team` and `LeagueTeam` are parallel, unlinked hierarchies** — no FK between them.
  This asymmetry is why the cascade needs two entry points (see
  [`05-architecture.md`](./05-architecture.md) §cascade).
- Profile surfaces: `PublicPlayerPage` (standalone), `PublicLeaguePlayerPage` (league).

## 10. Reusable patterns to follow

- **Materialization / resolver pattern:** `leagues.service.js` `getLeagueStandings`
  (`:2141`)/`getLeaguePlayerStats` (`:2262`) — indexed `findOne` → compute-on-miss →
  best-effort `upsert` → return; `recomputeLeagueAggregates` (`:2293`) coalesced via
  in-flight `Map` + `dirty` flag; `scheduleLeagueAggregateRecompute` (`:2349`) uses
  `setImmediate`. **The entitlement resolver should mirror this.**
- **Snapshot freeze:** `Game.participant.entitlementsSnapshot`
  (`games.repository.js:35`), written `games.service.js:730`.
- **Atomic idempotency:** `claimWebhookEvent` (`utils/webhookIdempotency.js`).
- **Migration scripts:** `server/src/scripts/*` — idempotent, `--dry-run`, parity
  checks; index migrations match **by key-shape, not name**
  (`migrate-leaguestandings-season-index.js`, `migrate-drop-dead-indexes.js`).
- **Cross-module export guard:** `tests/unit/follows.dependency-contract.test.js`
  (unmocked) — replicate for the new billing/entitlements modules.

## 11. Tests touching billing

- Server: `tests/unit/billing.service.test.js` (mocks stripe + repos),
  `webhookIdempotency.test.js`, `weball-saturday.test.js`;
  `tests/integration/billing.routes.test.js`, `gates.test.js` (402/403 gates
  end-to-end).
- Client: `PricingPage.test.jsx` (asserts `$12/mo`→`$89/season` toggle — will need
  updating), `BillingSuccessPage.test.jsx`, `GameDetailPage.test.jsx` (extensive
  `canViewReplay`/`canViewShotMaps` permutations).
- ⚠️ **`OPT-026` marker not found in code** — grep returned nothing. The "~20
  pre-existing client failures" cited in `PROJECT-KNOWLEDGE.md` couldn't be confirmed
  from source; verify with a live `vitest run` before relying on the client suite as a
  regression baseline.
