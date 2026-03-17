# V1 Monetization Plan: Pricing Page + Stripe Billing Integration

## Status

Historical planning document.

This plan captured the original monetization implementation scope before checkout/portal flows, webhook replay protection, team-level billing status refresh, and current billing docs were finalized in the app. Use it for background context only.

Current billing guidance lives in:

- [docs/billing.md](/Users/simoncordova/Desktop/Simon/tsw-2026-march/docs/billing.md)
- [docs/stripe-development-setup.md](/Users/simoncordova/Desktop/Simon/tsw-2026-march/docs/stripe-development-setup.md)
- [docs/status-snapshot-2026-03-17.md](/Users/simoncordova/Desktop/Simon/tsw-2026-march/docs/status-snapshot-2026-03-17.md)

## Summary

Implement a first-pass monetization system for the app with:

- A dedicated React pricing page that presents the available products/plans
- Team-level plan selection and Stripe Checkout entry
- Stripe webhook-driven subscription state updates
- Team-level entitlements that gate paid features
- A complete Stripe development-environment runbook
- A complete environment variable inventory for local and deployed setups

The first paid offering remains:

- `Free`
- `Team Pro` billed monthly per team

Free covers the core product and growth loop:

- team creation
- roster management
- game creation
- live tracking
- basic box score
- public team/player pages
- explore visibility

`Team Pro` unlocks:

- replay
- public game shot maps

The pricing page is a required first-class product surface, not just a small CTA embedded elsewhere.

## Product Scope

### Plans to Offer on the Pricing Page

#### Free

Includes:

- Create a team
- Create and manage roster
- Create games
- Track games live
- View basic box scores
- Public player pages
- Public team pages
- Explore feed visibility

#### Team Pro

Includes:

- Everything in Free
- Replay tab and replay interaction
- Public game shot maps
- Pro upgrade status for that team

### Out of Scope for This Phase

Do not implement yet:

- Team Elite
- club plans
- recruiting profiles
- exports
- advanced trends dashboards
- seasonal billing
- season entities
- video products
- lineup analytics
- multi-team organizational billing

The pricing page should still be structured so future plans can be added without redesigning the entire system.

## Required User Experience

### New Pricing Page

Add a dedicated pricing page in the React app.

Recommended route:

- `/pricing`

This page must:

- explain the Free and Team Pro plans clearly
- list included features by plan
- indicate that billing is per team
- let a user select a plan
- if the selected plan is paid, move them into the Stripe payment flow
- if the selected plan is Free, route them into the app without Stripe
- work for logged-out users and logged-in users with different CTA behavior

### Pricing Page Behavior by User State

#### Logged-out visitor

- Can view pricing page
- Can select a plan
- If they choose `Free`, direct them to registration or login, then into normal team creation flow
- If they choose `Team Pro`, direct them to registration/login first, because checkout requires authenticated team ownership

#### Logged-in user with no teams

- Can view pricing page
- Can choose `Free` and go to `/teams/new`
- Can choose `Team Pro`
- If they choose `Team Pro`, the flow must first create a team before Stripe checkout, because billing is per team and the system needs a `teamId`

This implies the pricing page cannot directly start paid checkout for users with zero teams unless the plan includes a pre-checkout team setup step.

#### Logged-in user with one or more teams

- Can view pricing page
- Can choose `Free`
- Can choose `Team Pro`
- If `Team Pro` is chosen, the page must let them pick which owned team they are upgrading before calling Stripe Checkout

### Required Paid Upgrade Flow

Recommended flow:

1. User visits `/pricing`
2. User chooses `Team Pro`
3. If not authenticated, redirect to login/register with return path to `/pricing`
4. If authenticated but owns no teams, redirect to create team first
5. After team creation, return to pricing or team billing entry
6. User selects one owned team to upgrade
7. Frontend calls backend to create Stripe Checkout session
8. Frontend redirects to Stripe Checkout
9. Stripe returns to a success route in the client
10. Client refreshes billing state
11. Webhook finalizes subscription state on the backend

## Team Billing Model

### Billing Scope

Billing is per team.

This is the canonical rule for the first implementation.

A user owning multiple teams can have:

- one free team
- one Pro team
- multiple Pro teams
- mixed billing states across teams

No account-wide Pro entitlement should exist in V1.

### Team Billing Fields

Extend the team record with:

- `plan`: `'free' | 'pro'`
- `subscriptionStatus`: `'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled'`
- `stripeCustomerId`: `string | null`
- `stripeSubscriptionId`: `string | null`
- `stripePriceId`: `string | null`
- `currentPeriodEnd`: `Date | null`
- `cancelAtPeriodEnd`: `boolean`

Optional but useful:

- `billingEmail`: `string | null`
- `lastWebhookEventId`: `string | null`

## Entitlements

### Entitlement Resolution

Add a centralized entitlement resolver based on team billing state.

Suggested shape:

```ts
type TeamEntitlements = {
  canViewReplay: boolean;
  canViewShotMaps: boolean;
};
```

Suggested rules:

- `canViewReplay = true` only when team is on active/trialing Pro
- `canViewShotMaps = true` only when team is on active/trialing Pro

### Why Centralize This

Do not scatter `team.plan === 'pro'` checks across components and controllers. Add a shared backend function and matching frontend type so product gating stays consistent.

## Backend Changes

### New Billing Module

Add a new module under:

- `server/src/modules/billing/`

Recommended files:

- `billing.routes.js`
- `billing.controller.js`
- `billing.service.js`
- `billing.validation.js`

### New Backend Endpoints

#### `POST /api/v1/billing/checkout-session`

Purpose:

- Create a Stripe Checkout session for a team owner upgrading one team to Pro

Input:

```json
{
  "teamId": "..."
}
```

Rules:

- authenticated
- team owner only
- reject if team does not exist
- reject if user does not own team
- handle already-active Pro subscriptions gracefully

Output:

```json
{
  "url": "https://checkout.stripe.com/..."
}
```

#### `POST /api/v1/billing/customer-portal`

Purpose:

- Create a Stripe Billing Portal session so the team owner can manage their Pro subscription

Input:

```json
{
  "teamId": "..."
}
```

Rules:

- authenticated
- team owner only
- team must have Stripe customer/subscription context

Output:

```json
{
  "url": "https://billing.stripe.com/..."
}
```

#### `POST /api/v1/billing/webhooks`

Purpose:

- Receive Stripe webhook events and update the team record

Rules:

- must use raw body parsing for Stripe signature verification
- must verify `stripe-signature`
- must not use auth middleware
- must be mounted before JSON parsing conflicts are introduced for this route

#### `GET /api/v1/teams/:teamId/entitlements`

Purpose:

- Return billing summary + entitlements for a team
- owner-facing endpoint

Output:

```json
{
  "billing": {
    "plan": "free",
    "subscriptionStatus": "inactive",
    "cancelAtPeriodEnd": false,
    "currentPeriodEnd": null
  },
  "entitlements": {
    "canViewReplay": false,
    "canViewShotMaps": false
  }
}
```

### Existing Endpoint Extensions

Extend owner-facing team responses to include:

- `billing`
- `entitlements`

Extend public game responses to include enough team billing/entitlement context for gated UI rendering without exposing private Stripe IDs.

Recommended public response addition:

```json
{
  "teamEntitlements": {
    "canViewReplay": false,
    "canViewShotMaps": false
  }
}
```

If ownership context is needed in UI, expose it only in authenticated owner contexts, not broadly on public pages.

## Stripe Integration Design

### Product/Price Strategy in Stripe

In Stripe dev, create:

- Product: `Team Pro`
- Recurring monthly price for `Team Pro`

Only one paid price is required for V1.

### Checkout Session Metadata

When creating Checkout Sessions, attach metadata:

- `teamId`
- `ownerUserId`
- `plan = pro`

This makes webhook reconciliation deterministic.

### Webhook Events to Handle

Handle at minimum:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

### Canonical Billing State Source

Stripe webhooks are the source of truth for subscription lifecycle persistence.

The client is never allowed to mark a team Pro directly.

### Customer Strategy

For V1, one team may map to one Stripe subscription, persisted on the team document.

This is simpler than introducing a separate billing aggregate model.

## React Frontend Changes

### New Routes

Add:

- `/pricing`
- `/billing/success`
- `/billing/cancel`

### New Pricing Page

Recommended location:

- `client/src/features/billing/pages/PricingPage.jsx`

This page should include:

- Free card
- Team Pro card
- feature comparison
- plan selection CTA
- billing note: `Billed per team monthly`
- team selector for authenticated users with teams
- owner-only checkout initiation
- conditional redirect/login behavior

### New Billing UI Helpers

Recommended new components:

- `PlanCard`
- `FeatureComparisonTable`
- `UpgradeTeamSelector`
- `LockedFeatureCard`
- `BillingStatusBadge`

### Gating in Existing Pages

#### Game detail page

In:

- `client/src/features/games/pages/GameDetailPage.jsx`

Behavior:

- Replay tab visible for all users
- If team lacks entitlement, replay tab content becomes a locked teaser
- Box score and play-by-play remain free

#### Public game shot-map surfaces

Wherever shot maps render on the public game page, replace the live shot-map content for free teams with:

- teaser shell
- value message
- owner upgrade CTA if owner is viewing
- non-owner informational lock message otherwise

### Team/Dashboard Billing Surface

Add upgrade and manage billing entry points in:

- dashboard
- teams page
- team management/edit page

But `/pricing` remains the main product showcase and should be linkable from navigation and marketing surfaces.

## API Client Additions

Add a billing client module in the frontend, e.g.:

- `client/src/features/billing/api/billingApi.js`

Methods:

- `createCheckoutSession(teamId)`
- `createCustomerPortalSession(teamId)`
- `getTeamEntitlements(teamId)`

## Server-Side Enforcement

### Hard Requirement

Do not rely on frontend gating alone.

If premium data is computed specifically for:

- replay features
- shot-map features

the backend should either:

- omit premium-only computed payloads for free teams
- or gate them via a dedicated entitlement-aware response shape

Basic game data required for free box score and play log should remain available.

## Stripe Development Environment Runbook

### Goal

Set up Stripe entirely in development so local frontend/backend can:

- create Checkout sessions
- receive webhook events
- update team billing state
- unlock Pro entitlements locally

### Step-by-Step Stripe Dev Setup

#### 1. Create or use a Stripe account

- Sign in to Stripe
- Switch to Stripe test mode
- Confirm you are operating in the test environment, not live mode

#### 2. Create the product

In Stripe test mode:

- Go to Product Catalog
- Create product named `Team Pro`
- Create a recurring monthly price
- Copy the generated `price_...` ID

Required output from this step:

- `STRIPE_PRICE_ID_PRO_MONTHLY`

#### 3. Get API keys

From Stripe test mode developer settings, collect:

- Publishable key
- Secret key

Required output from this step:

- `VITE_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`

#### 4. Install and use Stripe CLI locally

Install Stripe CLI on the development machine.

Use it to log in:

```bash
stripe login
```

This authorizes local webhook forwarding in test mode.

#### 5. Start local webhook forwarding

Run Stripe CLI to forward webhook events to the local backend webhook endpoint.

Example target:

```bash
stripe listen --forward-to localhost:4000/api/v1/billing/webhooks
```

Stripe CLI will print a webhook signing secret.

Required output from this step:

- `STRIPE_WEBHOOK_SECRET`

Use the secret printed by the CLI for local development, not a guessed value.

#### 6. Configure success and cancel URLs

Decide client routes for post-checkout return:

- success: `http://localhost:5173/billing/success`
- cancel: `http://localhost:5173/billing/cancel`

Required output from this step:

- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

#### 7. Add environment variables

Populate local env files with the required Stripe values listed in the environment section below.

#### 8. Start the app locally

Run the client and server in development.

The backend must have:

- Stripe secret key
- webhook secret
- price ID
- success/cancel URLs

The frontend must have:

- Stripe publishable key if Stripe JS is used directly
- API base URL

#### 9. Create test teams and test user

Locally:

- register/login
- create at least one team
- navigate to `/pricing`
- choose Team Pro
- select the team
- begin checkout

#### 10. Use Stripe test card data

At Checkout, use Stripe’s test card values from the Stripe test docs.

Minimum expected successful flow:

- payment succeeds
- Checkout redirects to success page
- webhook hits local backend
- team billing fields update
- entitlements change to Pro
- replay and shot maps unlock

#### 11. Test failed and canceled flows

Verify:

- canceled checkout returns to cancel route
- failed invoice / failed payment does not incorrectly activate Pro
- deleted subscription removes Pro entitlements

#### 12. Inspect Stripe CLI and server logs

Confirm:

- webhook signature verification passes
- expected events are received
- no duplicate processing bugs break billing state

### Local Development Checklist

A local developer should be able to follow this sequence exactly:

1. Start MongoDB / database dependency
2. Set Stripe env vars
3. Start `stripe listen --forward-to localhost:4000/api/v1/billing/webhooks`
4. Start app services
5. Create user and team
6. Visit `/pricing`
7. Buy Team Pro in test mode
8. Confirm webhook updates team
9. Reload game pages and verify paid features unlock

## Required Environment Variables and Keys

### Frontend

Add to client environment:

- `VITE_API_BASE_URL`
- `VITE_STRIPE_PUBLISHABLE_KEY`

Optional only if needed later:

- `VITE_STRIPE_PRODUCT_PRO_NAME`
- `VITE_ENABLE_BILLING=true`

### Backend

Add to server environment:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PRO_MONTHLY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

Existing required backend envs still apply:

- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CLIENT_ORIGIN`

### Meaning of Each Stripe Variable

- `VITE_STRIPE_PUBLISHABLE_KEY`
  - public key used by frontend Stripe integration if needed
- `STRIPE_SECRET_KEY`
  - private backend key used to create Checkout and Portal sessions
- `STRIPE_WEBHOOK_SECRET`
  - secret used to verify forwarded webhook signatures
- `STRIPE_PRICE_ID_PRO_MONTHLY`
  - Stripe price ID for the Team Pro monthly product
- `STRIPE_SUCCESS_URL`
  - frontend URL Stripe redirects to on successful checkout
- `STRIPE_CANCEL_URL`
  - frontend URL Stripe redirects to when checkout is canceled

## Documentation Deliverables

Add/update docs so setup is reproducible.

### New Docs to Add

Recommended:

- `docs/billing.md`
- `docs/stripe-development-setup.md`

### `docs/billing.md` should cover

- business model overview
- plan definitions
- what is free vs paid
- entitlement rules
- backend billing architecture
- webhook ownership of state transitions

### `docs/stripe-development-setup.md` should cover

- exact Stripe test-mode setup steps
- Stripe CLI usage
- local webhook forwarding
- required env vars
- test checkout flow
- troubleshooting notes

## Testing and Acceptance Criteria

### Backend Tests

Add tests for:

- owner can create checkout session for owned team
- non-owner cannot create checkout session
- user cannot create checkout for nonexistent team
- webhook activates Pro for correct team
- webhook cancellation removes Pro entitlements
- duplicate webhook delivery is safe
- entitlement resolution works for free, active, canceled, past_due states

### Frontend Tests

Add tests for:

- pricing page renders Free and Team Pro plans
- logged-out user clicking Team Pro is redirected to auth
- logged-in user with no teams is routed to create team before checkout
- logged-in user with teams can choose one and start checkout
- free team sees locked replay teaser
- Pro team sees replay
- free team sees locked shot-map teaser
- Pro team sees shot maps
- success page refreshes billing state correctly
- cancel page shows non-destructive return path

### Manual Acceptance Scenarios

1. Logged-out user visits `/pricing` and sees both plans
2. Logged-out user selects Pro and is redirected to auth
3. Logged-in user with no teams selects Pro and is redirected to team creation
4. Logged-in user with an owned team selects Pro and reaches Stripe Checkout
5. Successful Stripe test checkout activates Pro on that team only
6. Replay unlocks for that team
7. Public game shot maps unlock for that team
8. Another team owned by the same user remains free unless separately upgraded
9. Billing portal opens for owner of subscribed team
10. Cancelation or failed payment updates billing state correctly after webhook processing

## File-Level Implementation Targets

### Frontend

Likely changes in:

- `client/src/app/router/AppRouter.jsx`
- `client/src/features/billing/pages/PricingPage.jsx`
- `client/src/features/billing/pages/BillingSuccessPage.jsx`
- `client/src/features/billing/pages/BillingCancelPage.jsx`
- `client/src/features/billing/api/billingApi.js`
- `client/src/features/games/pages/GameDetailPage.jsx`
- public game shot-map component/page files
- navigation or homepage links to `/pricing`
- team/dashboard pages for upgrade/manage billing CTAs

### Backend

Likely changes in:

- `server/src/app.js`
- `server/src/routes/index.js`
- `server/src/modules/billing/*`
- `server/src/modules/teams/teams.repository.js`
- `server/src/modules/teams/teams.service.js`
- team model/schema files
- public game/team response shapers
- environment config files and validation

### Docs

Add/update:

- `docs/billing.md`
- `docs/stripe-development-setup.md`
- `README.md`
- possibly `docs/api.md`

## Assumptions and Defaults

- No existing users need grandfathering
- First paid product is only `Team Pro`
- Billing is monthly, per team
- Only team owners can initiate and manage billing
- Stripe Checkout + webhooks is the first payment flow
- `/pricing` is required and will be the main commercial entry page
- Free plan retains the core tracking workflow
- Paid features for V1 are replay and public game shot maps
- Team selection is required before checkout because billing is team-scoped
- Logged-in users without a team must create one before checkout
- Stripe development setup documentation is a required deliverable, not optional
