# Stripe Billing & Pricing

> Part of the [Application Audit](./README.md) · July 2026

Files: `server/src/modules/billing/{billing.routes,billing.controller,billing.service,billing.validation}.js`;
client `client/src/features/billing/pages/PricingPage.jsx`, `BillingSuccessPage.jsx`.
Tests: `server/src/tests/unit/billing.service.test.js`,
`server/src/tests/integration/billing.routes.test.js`.

## Products & pricing

Two billable resource types, each with two intervals → **4 Stripe prices**:

| Resource | Interval | Env var                          | Display price (hardcoded `PricingPage.jsx:27-29`) |
| -------- | -------- | -------------------------------- | ------------------------------------------------- |
| Team     | monthly  | `STRIPE_PRICE_ID_TEAM_MONTHLY`   | $12/mo                                            |
| Team     | season   | `STRIPE_PRICE_ID_TEAM_SEASON`    | $89/season                                        |
| League   | monthly  | `STRIPE_PRICE_ID_LEAGUE_MONTHLY` | $49/mo                                            |
| League   | season   | `STRIPE_PRICE_ID_LEAGUE_SEASON`  | $299/season                                       |

Both carry a **14-day trial** (`trial_period_days: 14`). Actual amounts live in
Stripe price objects; the client display prices can drift from Stripe —
consider fetching them or asserting parity in CI.

Legacy: `STRIPE_PRICE_ID_PRO_MONTHLY` (env only, unused), plan value `'pro'`
still honoured by entitlement checks, and `/billing/checkout-session` (a
byte-identical duplicate of team-checkout, `billing.controller.js:16-36`).

## Checkout flows

- **Team** (`createTeamCheckoutSession`, `billing.service.js:192-247`):
  owner check → reject if already active → Stripe Checkout (mode=subscription)
  with metadata `{resourceType:'team', teamId, ownerUserId, plan, billingInterval}`
  duplicated on session and `subscription_data`.
- **League** (`:249-291`): rejects if the user already owns an active league.
  **No leagueId in metadata** — the League document is created lazily by the
  `checkout.session.completed` webhook (avoids creating leagues that never pay).
- **Customer portal** (`:329` area): teamId XOR leagueId → Stripe billing portal.
- All behind `authMiddleware` + `checkoutLimiter` (5/10min). Local dev:
  `pnpm stripe-listen` (see `docs/stripe-development-setup.md`).

## Subscription state storage

No subscriptions collection — state lives **on the Team/League documents**:
`plan`, `subscriptionStatus` (inactive/trialing/active/past_due/canceled),
`stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `billingInterval`
(monthly/season), `currentPeriodEnd`, `cancelAtPeriodEnd`, `trialEnd`,
`billingEmail`, plus webhook idempotency fields.

Field lifecycle is applied by `applyTeamSubscriptionState` /
`applyLeagueSubscriptionState` (`billing.service.js:335-369`) from the Stripe
subscription object. `syncOwnerPlan` (`:152-156`) then mirrors `User.plan`
(pro/free) from **all** of the owner's teams after each team webhook.

Caveats:

- The Stripe client is initialised **without a pinned `apiVersion`**, and the
  code reads `subscription.current_period_end` at the top level — deprecated in
  newer Stripe API versions. Pin the version to avoid surprise breakage.
- League records are keyed by `stripeCustomerId` uniqueness when created from
  webhooks; the placeholder league is named `'My League'` and later claimed by
  `createLeagueForUser` via a **literal name lookup**
  (`leagues.service.js:398-401`) — fragile coupling.

## Entitlements

Derived on read, never stored (`billing.service.js:59-92`):

- `isTeamActive`: plan ∈ {team, pro} AND status ∈ {active, trialing}
- `isLeagueActive`: plan ∈ {league, pro} AND status ∈ {active, trialing}
- `getTeamEntitlements`: canTrackStats, canViewReplay, canViewShotMaps,
  canViewHighlightClips
- `getLeagueEntitlements`: same + canManageLeague

A parallel user-level entitlement derivation exists in
`auth.service.js:76-85` — **duplicated logic, drift risk**.

Related: [08-subscription-logic](./08-subscription-logic.md),
[09-payment-webhooks](./09-payment-webhooks.md).
