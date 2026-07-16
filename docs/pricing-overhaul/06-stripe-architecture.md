# 06 · Stripe Architecture

> Products, prices, metadata, webhooks, portal, promos, and the env/`render.yaml`
> alignment. Keeps everything that already works (hosted Checkout, raw-body webhook,
> atomic idempotency) and fixes the drift.

## Products & prices

Two subscription products, two prices each. Amounts live on the Stripe price; the
catalog references them by **env var name**, never a literal amount.

```
Product: Team Pro                     metadata: { kind: 'team', planId: 'team_pro' }
 ├─ price  STRIPE_PRICE_ID_TEAM_MONTHLY   $9/mo    recurring·month
 └─ price  STRIPE_PRICE_ID_TEAM_SEASON    $79/yr   recurring·year
Product: League                       metadata: { kind: 'league', planId: 'league' }
 ├─ price  STRIPE_PRICE_ID_LEAGUE_MONTHLY $29/mo   recurring·month
 └─ price  STRIPE_PRICE_ID_LEAGUE_SEASON  $199/yr  recurring·year (season-aligned)

Starter (Free) = no Stripe object — the default unentitled state.
```

- **Retire `STRIPE_PRICE_ID_PRO_MONTHLY`** — declared but unread (audit §5). Remove
  from `env.js` and `render.yaml` once no data references it (migration re-derives via
  `planForPriceId`).
- Reuse the existing dev test-mode price IDs (already in
  `env/server/.env.development`). Create **prod** products/prices during launch (see
  [`17-launch-checklist.md`](./17-launch-checklist.md)).

## Price metadata (on each Stripe price)

Set `{ planId, interval }` on every price. This lets `planForPriceId(priceId)` reverse
a subscription's real price back to a plan without trusting client-supplied metadata —
more robust than the current `metadata.resourceType` dispatch.

## Subscription structure & metadata

- **One subscription per resource** (a Team or a League). Resource-scoped, not
  user-scoped — unchanged from today.
- **Checkout `subscription_data.metadata`:** `{ resourceType, resourceId?,
ownerUserId, planId, interval }`. (`resourceId` absent for League — created by the
  webhook.)
- `payment_method_collection: 'always'`, `trial_period_days` from
  `trialDaysFor(planId, interval)` (replaces the hard-coded `14`).

## Webhooks

Endpoint unchanged: `POST /api/v1/billing/webhooks`, mounted **before**
`express.json()` with `express.raw()` (`app.js:34-39`), signature-verified via
`stripe.webhooks.constructEvent`.

| Event                                           | Action                                           | Change vs today                                                |
| ----------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `checkout.session.completed`                    | Provision resource + set plan/status             | Derive plan via `planForPriceId`; set `billingSource:'stripe'` |
| `customer.subscription.created/updated/deleted` | Sync status/plan/periodEnd/cancelAtPeriodEnd     | Skip if doc `billingSource !== 'stripe'`                       |
| `invoice.payment_failed`                        | → `past_due`                                     | unchanged                                                      |
| `invoice.paid`                                  | **Now handled** — confirm renewal, extend period | was no-op                                                      |
| `customer.subscription.trial_will_end`          | **Now handled** — trigger trial-ending email     | was no-op                                                      |

- **Idempotency:** keep atomic `claimWebhookEvent` (`$ne` + `$push $slice:-25`).
- **League create race:** add a **unique sparse index on `League.stripeCustomerId`**
  (after a dedup pass) so the create path is idempotent at the DB layer, closing the
  known race (audit §1).
- **Comp safety:** the `billingSource !== 'stripe'` skip prevents a stray event from
  resetting a comp/manual grant.

## Customer Portal

Configure the Stripe Billing Portal (dashboard or API) to allow: update payment
method, view invoices, cancel (at period end), and switch interval within the same
product. **Don't rebuild** portal UI — the app already redirects to hosted Portal
(`createTeamPortalSession`/`createLeaguePortalSession`). Apply `assertSafeStripeUrl` to
the returned URL.

## Coupons & promotion codes

- **Annual/season discount:** baked into the annual price amount (cleaner than a
  coupon).
- **Promotion codes** (customer-facing) on top of internal coupons: `LAUNCH` (early
  adopters), `NONPROFIT`/`SCHOOL` (verified). Referral credits later.
- Enable "allow promotion codes" on Checkout Sessions so codes are redeemable at
  checkout.

## Env vars

Canonical set (all in `env.js`, all four price IDs **required in any env where billing
is enabled**):

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_TEAM_MONTHLY
STRIPE_PRICE_ID_TEAM_SEASON
STRIPE_PRICE_ID_LEAGUE_MONTHLY
STRIPE_PRICE_ID_LEAGUE_SEASON
STRIPE_SUCCESS_URL
STRIPE_CANCEL_URL
# removed: STRIPE_PRICE_ID_PRO_MONTHLY
```

> Consider tightening the Zod schema so that **if `STRIPE_SECRET_KEY` is set, the four
> price IDs are required** (currently all `.optional()`, so a misconfigured prod
> silently 503s at checkout). A refinement (`superRefine`) enforces "all-or-nothing."

## `render.yaml` fix (audit §5 — this is a real gap)

Both API services declare only `STRIPE_PRICE_ID_PRO_MONTHLY`. **Add the four
TEAM/LEAGUE price IDs** (`sync:false`, set in dashboard) to `-api-dev` and `-api-prod`,
and remove `PRO_MONTHLY`. Without this, production checkout resolves `undefined` →
`503`. `docs/render-env-matrix.md` already documents the correct set — align
`render.yaml` to it.

## Dev vs prod setup

- **Dev:** test-mode keys + the 4 test price IDs already in
  `env/server/.env.development`; Stripe CLI for webhook forwarding (see
  `docs/stripe-development-setup.md`, `docs/qa-billing-dev.md`).
- **Prod:** create live products/prices at launch; set the 6 secrets + 2 URLs in the
  Render dashboard; register the live webhook endpoint and set
  `STRIPE_WEBHOOK_SECRET`. All in the launch checklist.

## What deliberately does NOT change

- Hosted Checkout + hosted Portal (no client Stripe.js / Elements).
- Resource-scoped subscriptions.
- Atomic webhook idempotency.
- API version pin `2024-06-20` (revisit only on an SDK upgrade).
