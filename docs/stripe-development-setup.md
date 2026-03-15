# Stripe Development Setup

## Overview

This project uses Stripe Checkout plus Stripe webhooks for Team Pro monthly subscriptions.

Required local result:

- checkout session creation works
- webhook events reach the local API
- team billing state updates in MongoDB
- replay and shot maps unlock for the upgraded team

## 1. Work in Stripe Test Mode

- Sign in to Stripe
- Turn on `Test mode`
- Confirm all keys and products below are test-mode values

## 2. Create the Product

In Stripe test mode:

1. Open `Product catalog`
2. Create product `Team Pro`
3. Add a recurring monthly price
4. Copy the generated `price_...` ID

Save this as:

- `STRIPE_PRICE_ID_PRO_MONTHLY`

## 3. Copy API Keys

From Stripe developer settings in test mode, copy:

- Publishable key
- Secret key

Save them as:

- `VITE_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`

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
- `VITE_STRIPE_PUBLISHABLE_KEY`

### Server

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PRO_MONTHLY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `CLIENT_ORIGIN`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

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
8. Confirm webhook processing updates the team to Pro
9. Reload a game page and verify replay and shot maps are unlocked

## 10. Failure Checks

Verify these cases as well:

- checkout canceled returns to `/billing/cancel`
- failed invoice does not activate Pro
- canceled subscription removes entitlements after webhook processing

## Troubleshooting

- If checkout creation fails, verify `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID_PRO_MONTHLY`
- If webhook verification fails, verify `STRIPE_WEBHOOK_SECRET` came from the current `stripe listen` session
- If billing state does not update, inspect server logs and Stripe CLI output for event delivery errors
