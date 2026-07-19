# 09 · Backend Changes

> Module-by-module backend work. Functions to **add** / **change** / **delete**, with
> the file each lives in. Cross-reference [`15-task-backlog.md`](./15-task-backlog.md)
> for effort and acceptance criteria.

## `server/src/modules/billing/`

**Add:**

- `plan-catalog.js` — the config source of truth (shape in
  [`05-architecture.md`](./05-architecture.md) §1).
- `entitlements.service.js` — the resolver (`resolveEntitlements`, `resolveForTeam`,
  `resolveForLeague`, `resolveForLeagueTeam`, `resolveForUser`, `createRequestCache`).
- `billing.controller.getCatalog` + route `GET /catalog` (public, no auth) →
  `getDisplayCatalog()`.

**Change — `billing.service.js`:**

- `isTeamActive`/`isLeagueActive`/`getTeamEntitlements`/`getLeagueEntitlements` →
  **one-line adapters** delegating to the resolver (keep exports so call sites migrate
  incrementally; the dependency-contract test stays green).
- `resolveTeamPriceId`/`resolveLeaguePriceId` → delegate to catalog `resolvePriceId`.
- Checkout builders: read `planId`/`interval`/`trialDays` from the catalog; set
  `subscription_data.metadata { planId, interval, resourceType, resourceId?,
ownerUserId }`; set `billingSource:'stripe'` on provisioning.
- Webhook handlers: derive plan via `planForPriceId(subscription price)` instead of
  trusting `metadata.resourceType`; **skip any doc where `billingSource !== 'stripe'`**;
  handle `invoice.paid` (renewal) and `customer.subscription.trial_will_end` (email
  trigger).
- `applyTeamSubscriptionState`/`applyLeagueSubscriptionState`: write **canonical** plan
  ids (`team_pro`/`league`), not `'team'`/`'league'`.
- `syncOwnerPlan`: derive canonical `User.plan` via the resolver.
- Wrap all four session URLs in `assertSafeStripeUrl` (from `utils/stripeUrl.js`).

**Delete (after callers migrated):** legacy aliases `createCheckoutSession`,
`createCustomerPortalSession`, `getBillingSummary`; the legacy `POST /checkout-session`
route.

## `server/src/utils/`

**Add:** `stripeUrl.js` — `isSafeStripeUrl(url)` + `assertSafeStripeUrl(url)` (throws
`ApiError(502)`). Mirrors the client check (`PricingPage.jsx:15-25`).

## `server/src/modules/games/games.service.js`

- **Remove the free-tracking 402s** at `:1077-1078` (create) and `:1400-1401` (append).
- `entitlementsSnapshot` write (`:730`): source → `resolveForTeam(team).entitlements` /
  `resolveForLeague(league).entitlements`; expand to full key set.
- Replace hard-coded `plan:'pro'` / `{canViewReplay:true,canViewShotMaps:true}`
  fallbacks (`:825-826,894-926,1029-1042`) with resolved league entitlements.
- Add the light server guard on replay/shot-map data reads using the **frozen
  snapshot** (default absent keys).

## `server/src/modules/leagues/leagues.service.js`

- Season create (`:433`), league config (`:556`), add league team (`:809`): swap
  `isLeagueActive`/`getLeagueEntitlements(...).canManageLeague` for
  `resolveForLeague(league).entitlements.canManageLeague`. Semantics unchanged.
- We-ball Saturday synthetic-`'pro'` object (`:2454-2455`): replace with a real
  `billingSource:'comp'` doc (set by migration); the resolver handles comp.
- Cascade (fast-follow): `resolveForLeagueTeam` used by `PublicLeaguePlayerPage`'s
  service path to set `richProfile`.

## `server/src/modules/teams/teams.service.js`

- Entitlement reads (`:70,605,643,782`): swap `getTeamEntitlements(team)` for
  `resolveForTeam(team).entitlements`.
- `assertTeamCreationAllowed` usage (`:522`): relax for free tracking; reframe around
  Starter `maxTeams` (fast-follow, config-driven).
- Cascade (fast-follow): `PublicPlayerPage` service path sets `richProfile` via
  `resolveForTeam`.

## `server/src/modules/auth/`

- `auth.service.js`: **delete** `getUserLeagueBillingSummary`,
  `getUserLeagueEntitlements`, `normalizeLeagueSubscriptionStatus`. `sanitizeUser`
  pulls league-level flags from `resolveForUser`.
- `auth.repository.js`: **remove** the seven `User.league*` fields; `User.plan` enum →
  `['starter','team_pro']` (Phase 6, after migration).

## `server/src/modules/export/`

- Gate every export endpoint on `resolveForTeam/resolveForLeague(...).entitlements
.canExportCsv` → `ApiError(402)` if absent. (Reuses the existing
  `assertLeagueManagerOrOwner`/`assertTeamManagerOrOwner` role gates _in addition to_
  the new entitlement gate.)

## `server/src/config/env.js`

- Remove `STRIPE_PRICE_ID_PRO_MONTHLY`.
- Add a `superRefine`: if `STRIPE_SECRET_KEY` is set, the four TEAM/LEAGUE price IDs are
  **required** (fail fast instead of runtime 503).

## Migration scripts — `server/src/scripts/` (Phase 6)

`migrate-unify-plan-enums.js`, `migrate-drop-user-league-fields.js`,
`migrate-league-stripe-customer-index.js`. All idempotent + `--dry-run` (see
[`13-migration-plan.md`](./13-migration-plan.md)). Fix `seed.js`/`seed-demo-account.js`
to write canonical plan ids and stop writing `User.league*`.

## Order within the backend phase

1. `plan-catalog.js` (no deps).
2. `entitlements.service.js` + adapters in `billing.service.js` (behavior-preserving).
3. `stripeUrl.js` + apply to session creators.
4. Migrate call sites (games/leagues/teams/export/auth) off the old helpers.
5. Free-tracking flip + snapshot source change.
6. Webhook `planForPriceId`/`billingSource`/`invoice.paid`/`trial_will_end`.
7. Catalog endpoint.

(Enum tightening + field drops happen in Phase 6 migration, not here.)

## Cross-module contract

Add `server/src/tests/unit/billing.dependency-contract.test.js` (unmocked) asserting
the resolver exports exist and consumers import real symbols — the
`follows.dependency-contract.test.js` pattern, which exists precisely because a missing
export once 500'd past mocked tests.
