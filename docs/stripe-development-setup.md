# Stripe Development Setup

## Overview

This project uses Stripe **hosted** Checkout plus Stripe webhooks for two
subscription products — **Team Pro** and **League Pro** — each with a **monthly**
and a **season** price (four prices total). There is no client-side Stripe.js;
the client redirects to the hosted Checkout/Portal URL.

> This file covers one-time local Stripe **setup**. For the full manual **QA
> flows** (trial start, upgrade, portal cancel/reactivate, entitlement checks per
> product/interval), use [`qa-billing-dev.md`](./qa-billing-dev.md).

Required local result:

- checkout session creation works for team and league checkouts
- webhook events reach the local API
- team/league billing state updates in MongoDB
- replay, shot maps, and highlight clips unlock for the upgraded team; league
  management unlocks for the upgraded league
- billing success redirect confirms the upgraded resource after webhook processing

## 1. Work in Stripe Test Mode

- Sign in to Stripe
- Turn on `Test mode`
- Confirm all keys and products below are test-mode values

## 2. Create the Products and Prices

In Stripe test mode, open `Product catalog` and create two products, each with a
recurring monthly price and a recurring season price. Copy each generated
`price_...` ID into the matching env var:

| Product    | Interval | Env var                          |
| ---------- | -------- | -------------------------------- |
| Team Pro   | monthly  | `STRIPE_PRICE_ID_TEAM_MONTHLY`   |
| Team Pro   | season   | `STRIPE_PRICE_ID_TEAM_SEASON`    |
| League Pro | monthly  | `STRIPE_PRICE_ID_LEAGUE_MONTHLY` |
| League Pro | season   | `STRIPE_PRICE_ID_LEAGUE_SEASON`  |

(`STRIPE_PRICE_ID_PRO_MONTHLY` is a legacy var still read only by the seed
script; the live billing flow uses the four price IDs above.)

## 3. Copy API Keys

From Stripe developer settings in test mode, copy the **Secret key** and save it as:

- `STRIPE_SECRET_KEY`

There is no client-side Stripe key to set — the client redirects to hosted
Checkout, so `@stripe/stripe-js` / a publishable key are not used.

## 4. Install Stripe CLI

Install the Stripe CLI locally, then authenticate:

```bash
stripe login
```

## 5. Forward Webhooks to Local API

Start webhook forwarding:

```bash
stripe listen --forward-to localhost:4000/api/v1/billing/webhooks
```

Stripe CLI will print a webhook signing secret. Save it as:

- `STRIPE_WEBHOOK_SECRET`

## 6. Set Return URLs

Use these local URLs:

- `STRIPE_SUCCESS_URL=http://localhost:5173/billing/success`
- `STRIPE_CANCEL_URL=http://localhost:5173/billing/cancel`

## 7. Required Environment Variables

### Client

- `VITE_API_BASE_URL`

### Server

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_TEAM_MONTHLY`
- `STRIPE_PRICE_ID_TEAM_SEASON`
- `STRIPE_PRICE_ID_LEAGUE_MONTHLY`
- `STRIPE_PRICE_ID_LEAGUE_SEASON`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `CLIENT_ORIGIN`
- `MONGO_URI`
- `MONGO_DB_NAME` (optional)
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Note: all Stripe vars are declared `.optional()` in `env.js` — the server boots without them, but billing endpoints will respond with `503 Billing is not configured` if `STRIPE_SECRET_KEY` (or the relevant price ID) is absent. For local portal testing (cancel/reactivate), ensure the Stripe Dashboard has the portal enabled in test mode and that `STRIPE_SUCCESS_URL` is set as the portal return URL (`POST /api/v1/billing/customer-portal` uses it).

## 8. Start the App

Run:

```bash
pnpm dev
```

Keep the Stripe webhook forwarding command running in a separate terminal.

## 9. Test the Flow

1. Register and sign in
2. Create a team
3. Open `/pricing`
4. Choose `Team Pro`
5. Select the team to upgrade
6. Complete checkout with Stripe test payment details
7. Confirm redirect to the success page
8. Confirm the success page is checking the specific upgraded team
9. Confirm webhook processing updates the team to Pro

   > Note: `checkout.session.completed` only stores the Stripe customer ID and billing email on the team — it does **not** set the plan to Pro. The plan upgrade is applied by the `customer.subscription.created` or `customer.subscription.updated` event that Stripe sends immediately after. Both events must be delivered and processed for Pro status to appear.

10. Reload a game page and verify replay and shot maps are unlocked

## 10. Failure Checks

Verify these cases as well:

- checkout canceled returns to `/billing/cancel`
- failed invoice does not activate Pro
- canceled subscription removes entitlements after webhook processing
- replaying the same Stripe webhook does not create duplicate state transitions
- a `past_due` team is not treated like fully active Team Pro in pricing or gated surfaces
- `checkout.session.completed` arrives but no subsequent `customer.subscription.created` or `customer.subscription.updated` event — team remains on free plan even though checkout succeeded (check Stripe CLI output for the subscription event delivery)

## Troubleshooting

- If checkout creation fails, verify `STRIPE_SECRET_KEY` and the price ID for the product/interval being purchased (`STRIPE_PRICE_ID_TEAM_MONTHLY|SEASON` / `STRIPE_PRICE_ID_LEAGUE_MONTHLY|SEASON`)
- If webhook verification fails, verify `STRIPE_WEBHOOK_SECRET` came from the current `stripe listen` session
- If billing state does not update, inspect server logs and Stripe CLI output for event delivery errors
- If checkout finishes but the success page stays pending, confirm the returned `teamId` matches an owned team and the webhook event reached the API
- If the team remains on the free plan after checkout completes, confirm both `checkout.session.completed` and `customer.subscription.created` (or `customer.subscription.updated`) were delivered — only the subscription event applies Pro entitlements

## Deployment Checklist

Before validating billing in staging or production:

- Confirm `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the four price IDs (`STRIPE_PRICE_ID_TEAM_MONTHLY|SEASON`, `STRIPE_PRICE_ID_LEAGUE_MONTHLY|SEASON`), `STRIPE_SUCCESS_URL`, and `STRIPE_CANCEL_URL` are set for the correct environment.
- Confirm `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL` point to the deployed client origin, not localhost.
- Confirm the Stripe webhook endpoint is configured to hit `/api/v1/billing/webhooks` on the deployed API.
- Confirm Cloudinary env vars are present if feed uploads are enabled in that environment:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
  - `CLOUDINARY_FOLDER`
- Replay a recent Stripe test webhook in the target environment and verify the team billing state remains stable.
