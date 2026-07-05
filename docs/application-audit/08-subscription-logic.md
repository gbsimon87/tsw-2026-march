# Subscription Logic

> Part of the [Application Audit](./README.md) · July 2026

How subscription state gates features across the app. Core:
`server/src/modules/billing/billing.service.js`.

## State machine

`subscriptionStatus` is normalised to
`inactive → trialing → active → past_due → canceled`:

- Checkout completes → webhook `customer.subscription.created` → `trialing`
  (14-day trial) or `active`.
- `customer.subscription.updated` → any status transition, plus
  `cancelAtPeriodEnd`, `currentPeriodEnd`, `trialEnd`, price/interval changes.
- `invoice.payment_failed` → `past_due`
  (`markTeamInvoiceFailure`/`markLeagueInvoiceFailure`, `billing.service.js:403-483`).
- `customer.subscription.deleted` → `canceled`.

"Active" for feature purposes = status ∈ {active, trialing} AND plan matches
the resource (team/pro or league/pro) — `isTeamActive`/`isLeagueActive`
(`billing.service.js:59-71`).

## Enforcement points

| Gate                                                 | Where                                                                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team creation                                        | `assertTeamCreationAllowed` in `teams.service.js` (billing check)                                                                                        |
| League creation                                      | `createLeagueForUser` requires `isLeagueActive` (`leagues.service.js:391+`)                                                                              |
| League team creation                                 | `createLeagueTeamForLeague` billing check (`leagues.service.js:599+`)                                                                                    |
| Stat tracking / replay / shot maps / highlight clips | entitlement flags returned by `GET /teams/:teamId/entitlements` and embedded in game payloads (`billingSnapshot`/`entitlementsSnapshot` on participants) |
| Client UI                                            | renders against server-provided entitlement flags                                                                                                        |

**Entitlement snapshots on games**: at game creation the participants embed
`billingSnapshot`/`entitlementsSnapshot` (Mixed) — a game tracked during an
active subscription remains viewable after expiry. Note the shim
`getLeagueTeamRosterSnapshotForGame` hardcodes
`plan:'pro', subscriptionStatus:'active'` (`leagues.service.js:1873-1874`).

## Owner-plan mirror

`syncOwnerPlan` (`billing.service.js:152-156`) recomputes `User.plan`
(pro/free) from **all** the owner's teams after every team webhook — loads all
owner teams per event. `User.leaguePlan` and user-level league Stripe fields
exist in the schema but are **never written** (dead fields, surfaced by
`sanitizeUser` only).

## Known limitations

1. Entitlement logic duplicated between `billing.service.js:73-92` and
   `auth.service.js:76-85`.
2. Legacy `'pro'` plan accepted everywhere; legacy checkout route/env retained.
3. No grace-period logic beyond Stripe's own dunning; `past_due` immediately
   fails `isActive`.
4. No proration/upgrade path between monthly and season (users must cancel and
   re-subscribe via the portal).
5. Client display prices hardcoded (drift risk with Stripe dashboard edits).

Related: [07-stripe-billing-pricing](./07-stripe-billing-pricing.md),
[09-payment-webhooks](./09-payment-webhooks.md).
