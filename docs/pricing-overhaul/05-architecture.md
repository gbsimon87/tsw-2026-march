# 05 · Target Architecture

> The technical design the implementation follows. Optimized for maintainability,
> config-driven change, and minimal blast radius at the current (tiny) scale.

## Principles

1. **Configuration over code.** Plans, prices, and entitlements live in one config
   module. Business logic reads config; it never encodes plan rules inline.
2. **Resolve, don't branch.** Features ask a resolver "what can this resource do?" and
   read entitlement booleans. **No `plan === 'x'` outside the catalog.**
3. **One vocabulary.** Canonical plan ids everywhere; legacy values tolerated only at
   a single normalization boundary.
4. **Freeze history.** Entitlements at record time are snapshotted onto games so
   downgrades never rewrite the past.
5. **Least new state.** Keep billing denormalized on Team/League; no new collection
   (D8). The catalog + resolver provide the abstraction, not a normalized store.

## Component overview

```
                         ┌──────────────────────────┐
                         │  plan-catalog.js (pure)  │  ← single source of truth
                         │  plans · prices · limits │
                         │  entitlements · bundles  │
                         └────────────┬─────────────┘
             getDisplayCatalog()      │  entitlementsForPlan / normalizePlanId
             resolvePriceId /         │  planForPriceId
             planForPriceId           │
        ┌────────────────────┐        │        ┌───────────────────────────┐
        │ GET /billing/catalog│◄──────┤        │ entitlements.service.js   │
        │ (client pricing UI) │        └───────►│ resolveForTeam/League/... │
        └────────────────────┘                 └───────────┬───────────────┘
                                                            │ reads Team/League/User
   checkout / webhooks (billing.service.js) ────────────────┤ docs (denormalized)
   games / leagues / teams / export / auth  ────────────────┘ consume resolver only
```

## 1. Plan catalog — `server/src/modules/billing/plan-catalog.js` (new)

Pure module: no DB, no Stripe client. Imports only `env` (for price-ID lookup).

**Shape (illustrative — final in code):**

```js
const FEATURES = Object.freeze({
  CAN_TRACK_STATS: 'canTrackStats',
  CAN_VIEW_BOX_SCORE: 'canViewBoxScore',
  CAN_VIEW_REPLAY: 'canViewReplay',
  CAN_VIEW_SHOT_MAPS: 'canViewShotMaps',
  CAN_VIEW_HIGHLIGHT_CLIPS: 'canViewHighlightClips',
  CAN_VIEW_FULL_HISTORY: 'canViewFullHistory',
  CAN_EXPORT_CSV: 'canExportCsv',
  CAN_RICH_PLAYER_PROFILES: 'canRichPlayerProfiles',   // fast-follow
  CAN_VIEW_COACH_REPORTS: 'canViewCoachReports',       // future
  CAN_MANAGE_LEAGUE: 'canManageLeague',
  CAN_USE_SPONSOR_TOOLS: 'canUseSponsorTools',         // future
});

const PLANS = Object.freeze({
  starter: {
    id: 'starter', scope: 'team', stripe: null,
    display: { name: 'Starter', tagline: '…', price: 'Free', features: [ … ] },
    entitlements: [FEATURES.CAN_TRACK_STATS, FEATURES.CAN_VIEW_BOX_SCORE],
    limits: { maxTeams: 1, historyWindow: 'recent-season' },   // not enforced yet
  },
  team_pro: {
    id: 'team_pro', scope: 'team',
    intervals: {
      monthly: { priceIdEnv: 'STRIPE_PRICE_ID_TEAM_MONTHLY', display: '$9/mo', trialDays: 14 },
      annual:  { priceIdEnv: 'STRIPE_PRICE_ID_TEAM_SEASON',  display: '$79/yr', trialDays: 14 },
    },
    entitlements: [ …starter, replay, shotMaps, highlights, fullHistory, csv,
                    richProfiles, coachReports ],
    cascade: { toPlayers: [FEATURES.CAN_RICH_PLAYER_PROFILES] },   // fast-follow
  },
  league: {
    id: 'league', scope: 'league',
    intervals: {
      monthly: { priceIdEnv: 'STRIPE_PRICE_ID_LEAGUE_MONTHLY', display: '$29/mo', trialDays: 14 },
      season:  { priceIdEnv: 'STRIPE_PRICE_ID_LEAGUE_SEASON',  display: '$199/season', trialDays: 14 },
    },
    entitlements: [FEATURES.CAN_MANAGE_LEAGUE],
    bundles: ['team_pro'],   // league grants every member team Team Pro entitlements
  },
});
```

**Exported helpers:**

| Helper                                | Purpose                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `getPlan(planId)`                     | Raw plan config                                                                                                      |
| `entitlementsForPlan(planId)`         | `Set`/object of entitlement booleans (absent ⇒ false), expanding `bundles`                                           |
| `normalizePlanId(scope, rawPlan)`     | **The only legacy shim.** `'free'→'starter'`; team `'pro'\|'team'→'team_pro'`; league `'pro'\|'league'→'league'`     |
| `resolvePriceId(planId, intervalKey)` | `env[priceIdEnv]` — the only place price IDs are dereferenced (replaces `resolveTeamPriceId`/`resolveLeaguePriceId`) |
| `planForPriceId(priceId)`             | Reverse lookup — webhooks derive plan+interval from the subscription's real price instead of trusting metadata       |
| `getDisplayCatalog()`                 | Price-ID-free projection (names, taglines, display prices, feature arrays) served to the client                      |
| `trialDaysFor(planId, intervalKey)`   | Replaces the hard-coded `14`                                                                                         |

**Client consumption:** `GET /api/v1/billing/catalog` (public) → `getDisplayCatalog()`.
`PricingPage.jsx` renders from it. Price **IDs never leave the server**; checkout
resolves them server-side. Note in the module: _Stripe price amounts are authoritative
for the charge; display strings are copy and can drift — keep them in sync manually or
derive from Stripe at build time later._

## 2. Entitlement resolver — `server/src/modules/billing/entitlements.service.js` (new)

Replaces `isTeamActive`, `isLeagueActive`, `getTeamEntitlements`,
`getLeagueEntitlements` (billing.service) **and** the dead `auth.service` path.

**API:**

| Function                                                                  | Input → Output                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveEntitlements({ scope, plan, subscriptionStatus, billingSource })` | Core **pure** fn. Normalizes plan; `active = billingSource !== 'stripe' ? true : status ∈ {active,trialing}`; returns `{ planId, active, entitlements, limits }` where entitlements = `entitlementsForPlan(active ? planId : starterForScope)` |
| `resolveForTeam(team)`                                                    | Reads the loaded doc's `plan`/`subscriptionStatus`/`billingSource`. **Zero extra queries.**                                                                                                                                                    |
| `resolveForLeague(league)`                                                | Same; entitlement set includes the `team_pro` bundle                                                                                                                                                                                           |
| `resolveForLeagueTeam(leagueTeam, { cache })`                             | Loads parent `League` (cached) → returns bundled Team-Pro entitlements. The league→member-team cascade                                                                                                                                         |
| `resolveForUser(userId, { cache })`                                       | Aggregate user-level flags (`canCreateLeague`, `canOwnAnotherLeague`, effective `plan` for `sanitizeUser`) from **actually-owned active resources**, not the dead `User.league*` fields                                                        |
| `createRequestCache()`                                                    | A `Map` for per-request memoization of League/Team lookups (the only place a resolve queries). Follows the in-flight-`Map` convention from `recomputeLeagueAggregates`                                                                         |

**Consumption rule:** features import `resolveForTeam`/`resolveForLeague` and read the
`entitlements` object. During transition, `billing.service.js` keeps
`isTeamActive`/`getTeamEntitlements`/etc. as **one-line adapters** delegating to the
resolver, so the ~10 call sites migrate incrementally and the dependency-contract test
stays green.

**Why it mirrors the materialization pattern:** the resolver is read-mostly and
derives from already-loaded docs; `resolveForLeagueTeam`/`resolveForUser` are the only
ones that trigger a lookup, and those use the request cache — exactly the
compute-cheaply-with-a-coalescing-cache shape of `getLeagueStandings`.

## 3. The cascade (fast-follow, designed now)

The `Team ↔ LeagueTeam` hierarchies are **unlinked** (audit §9). We do **not** unify
them — the cascade is computed independently per surface from whichever owning
resource is in hand:

- **Standalone team → its players.** `PublicPlayerPage` already loads the owning
  `Team`. Add `richProfile: resolveForTeam(team).entitlements.canRichPlayerProfiles` to
  the payload. Team-scoped; embedded players have no user link, so nothing per-player is
  stored.
- **League team → claimed players.** `PublicLeaguePlayerPage` resolves `LeaguePlayer →
LeagueTeam → League` via `resolveForLeagueTeam(leagueTeam, {cache})`; if the league is
  active (it bundles Team Pro), `canRichPlayerProfiles` is true.

**Two entry points, one rule:** callers on the embedded-player surface use
`resolveForTeam`; callers on the claimed-User surface use `resolveForLeagueTeam`.
Derived at resolve time, never stored. This is the minimal-blast-radius choice — no
new FK, no per-player writes, no backfill.

## 4. `billingSource` — first-class grants

New field on Team & League: `billingSource: enum ['stripe','manual','comp'] default
'stripe'`.

- `stripe` — real subscription; entitlement follows `subscriptionStatus`.
- `comp` — free grant (e.g. We-ball Saturday); resolver treats as active regardless of
  Stripe fields.
- `manual` — hand-set for support/testing; same as comp for resolution.
- **Webhooks skip any doc where `billingSource !== 'stripe'`** so a stray Stripe event
  can't reset a grant.

This replaces the `plan:'pro'`-with-no-subscription hack with an explicit, safe,
greppable state.

## 5. Enum reconciliation & dead fields

- Canonical ids: `Team.plan ['starter','team_pro']`, `League.plan
['starter','league']`, `User.plan ['starter','team_pro']` (a resolver-derived cache
  for `sanitizeUser`).
- **Tolerant-first sequencing:** ship `normalizePlanId` + resolver (Phase 2) → migrate
  live data (Phase 6) → _then_ tighten schema enums. Tightening earlier fails
  validation on existing `'free'/'pro'/'team'` docs.
- **Drop** the seven dead `User.league*` fields; remove
  `getUserLeagueBillingSummary`/`getUserLeagueEntitlements` from `auth.service.js`; have
  `sanitizeUser` pull league flags from `resolveForUser`; stop `seed.js` writing them.

## 6. Server-side redirect safety — `server/src/utils/stripeUrl.js` (new)

`isSafeStripeUrl(url)` (https + hostname ∈ {`checkout.stripe.com`,
`billing.stripe.com`}) and `assertSafeStripeUrl(url)` (throws `ApiError(502,
'Unexpected billing redirect')`). Apply `assertSafeStripeUrl(session.url)` before
returning in all four session creators. Client keeps its copy as defense-in-depth.

## 7. Snapshot-freeze consistency

- `entitlementsSnapshot` (written at `games.service.js:730`) source changes from
  `getTeamEntitlements(team)` to `resolveForTeam(team).entitlements` /
  `resolveForLeague(league).entitlements`, and expands to carry the full feature set.
- **Readers default absent keys to the plan-at-record-time** — old participants stored
  only `{canViewReplay, canViewShotMaps}`; do this defensively rather than backfilling.
  An optional idempotent backfill can warm them later.
- Replay/shot-map server guards read the **frozen snapshot**, not the live plan, so a
  later downgrade never retroactively locks a recorded game.

## Files added / changed (architecture-level)

**New:** `plan-catalog.js`, `entitlements.service.js`, `utils/stripeUrl.js`, catalog
route/controller wiring, migration scripts (see
[`13-migration-plan.md`](./13-migration-plan.md)), contract test.

**Changed:** `billing.service.js` (checkout/webhook/adapters/URL safety),
`billing.controller.js`/`billing.routes.js` (catalog endpoint), `games.service.js`
(free-tracking flip, snapshot source, league-game entitlements), `leagues.service.js`
(gates via resolver), `teams.service.js` (entitlements via resolver),
`auth.service.js`/`auth.repository.js` (drop league path/fields), `env.js`/`render.yaml`
(price IDs), and the frontend (see [`10-frontend-changes.md`](./10-frontend-changes.md)).

## Rejected alternatives

- **`Subscription` collection / normalized store** — D8. Adds a join per resolve and a
  second source of truth; denormalized state already has atomic idempotency and
  zero-query resolves. Revisit for billing history/audit or one-payer-many-resources.
- **Unifying `Team`/`LeagueTeam`** — large blast radius for no near-term benefit; the
  two-entry-point cascade avoids it.
- **Per-feature Stripe products** — overkill; entitlements are derived from plan, and
  plans map to a small set of prices.
