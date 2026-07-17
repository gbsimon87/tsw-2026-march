# Stripe Test-Clock Runbook (T-27)

> The **manual, live-Stripe half** of Phase 7. The CI-runnable equivalent — the same
> four transitions asserted through `handleWebhookEvent` + the real resolver — lives in
> [`server/src/tests/unit/billing.lifecycle.test.js`](../../server/src/tests/unit/billing.lifecycle.test.js).
> Run this runbook once in **dev/test mode** before launch to confirm the live webhook
> wiring (signature verification, event subscription, real Stripe payloads) matches what
> the unit tests assert against synthetic events.

## Prerequisites

1. Dev API running on `:4000` with a **test-mode** `STRIPE_SECRET_KEY` and the four
   `STRIPE_PRICE_ID_{TEAM,LEAGUE}_{MONTHLY,SEASON}` set (see
   [`OUTSTANDING-MANUAL-ACTIONS.md`](./OUTSTANDING-MANUAL-ACTIONS.md)).
2. Stripe CLI logged in to the test-mode account.
3. The dev prices carry `{ planId, interval }` metadata (T-08) — the webhook derives the
   canonical plan from the price id via `planForPriceId`.

## Wire up webhook forwarding

```bash
stripe listen --forward-to localhost:4000/api/v1/billing/webhooks
```

Copy the `whsec_…` it prints into the dev `STRIPE_WEBHOOK_SECRET` and restart the API.
**Subscribe the endpoint to all handled events** (dashboard or `--events`):
`checkout.session.completed`, `customer.subscription.created|updated|deleted`,
`customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`.
Missing `invoice.paid` or `trial_will_end` means the renewal/trial handlers never fire.

## Scenarios

Each scenario uses a **test clock** so trials/renewals can be fast-forwarded. Create a
customer on a clock, subscribe via Checkout (or the API) with the clock attached, then
advance the clock and watch the forwarded events + the resolved entitlements.

Verify entitlements after each step by hitting an authenticated read for the resource
(e.g. a team game detail) and confirming replay/shot-map lock state, and/or the
billing summary endpoint.

### 1 · Trial → active

1. Checkout with a trial (Team Pro monthly). → `checkout.session.completed` +
   `customer.subscription.created` (status `trialing`).
   **Expect:** team `plan=team_pro`, resolver `active=true`, replay **unlocked**.
2. Advance the clock to ~1 day before trial end. → `customer.subscription.trial_will_end`.
   **Expect:** the trial-ending email trigger fires (owner billing email).
3. Advance past trial end. → `invoice.paid` + `customer.subscription.updated`
   (status `active`).
   **Expect:** `subscriptionStatus=active`, `currentPeriodEnd` advanced, replay stays
   unlocked.

### 2 · Dunning

1. From an active sub, force the next renewal to fail (attach a failing test card, or
   `stripe` test card `4000000000000341`). Advance the clock to the renewal.
   → `invoice.payment_failed`.
   **Expect:** `subscriptionStatus=past_due`, dunning email fired, resolver
   `active=false` (replay **locked**), **but** `canTrackStats` still true and the game
   data intact.
2. Let Stripe exhaust retries (advance the clock). → `customer.subscription.updated`
   (`canceled`/`unpaid`).
   **Expect:** `plan=starter`, premium locked, data still present.

### 3 · Cancel

1. Cancel at period end (portal or API `cancel_at_period_end=true`).
   → `customer.subscription.updated` (still `active`, `cancel_at_period_end=true`).
   **Expect:** access **holds** — resolver `active=true`, replay unlocked,
   `cancelAtPeriodEnd=true`.
2. Advance past `current_period_end`. → `customer.subscription.deleted`.
   **Expect:** `plan=starter`, replay locked, tracking still free.

### 4 · Reactivate

1. From a canceled/starter team, re-subscribe via Checkout.
   → `checkout.session.completed` + `customer.subscription.updated` (`active`).
   **Expect:** `plan=team_pro`, `active=true`, replay unlocked again.

### 5 · Comp-grant immunity (bonus)

Set a league `billingSource='comp'` (as the We-ball Saturday migration does), then send a
stray `customer.subscription.deleted` for it (`stripe trigger`, or the dashboard).
**Expect:** the doc is **skipped** — plan/status unchanged, still active. (Asserted in
`billing.lifecycle.test.js`.)

## Acceptance (T-27)

- [ ] All four scenarios observed end-to-end with CLI forwarding in dev.
- [ ] Entitlements matched the expectations above at every step (they mirror
      `billing.lifecycle.test.js`).
- [ ] No unexpected `saveTeam`/`saveLeague` on comp docs.
