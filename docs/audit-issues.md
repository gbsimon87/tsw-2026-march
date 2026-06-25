# Security & Bug Audit Issues

Issues found during pre-production audit of the pricing redesign (Phase 6–11).

## Second Pass — Additional Issues (all fixed)

---

## Issue 1 — `markLeagueInvoiceFailure` silently does nothing

**File:** `server/src/modules/billing/billing.service.js` lines 467–473
**Priority:** CRITICAL
**Status:** Fixed

### Problem

```js
const customerId = invoice.parent?.subscription_details?.metadata?.ownerUserId
  ? null // if ownerUserId metadata exists, customerId is forced to null
  : typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id;
if (!customerId) return; // early return, function does nothing
```

All league invoices have `subscription_details.metadata.ownerUserId` set (we write it at checkout). So `customerId` is always forced to `null`, the early return fires, and invoice failures are silently ignored. A league owner who fails to pay stays on their active plan indefinitely.

### Fix

Remove the ownerUserId ternary — just read `invoice.customer` directly:

```js
const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
```

---

## Issue 2 — Slug collision crash on rapid webhook retries

**File:** `server/src/modules/billing/billing.service.js` line 430
**Priority:** HIGH
**Status:** Fixed

### Problem

```js
const placeholderSlug = `league-${Date.now()}`;
```

`slug` has a MongoDB `unique: true` index. Two webhook deliveries within the same millisecond (concurrent retries, test load) both produce the same slug. The second `League.create()` throws an unhandled duplicate-key error, the handler returns 500, Stripe retries, and inconsistent state can result.

### Fix

Add enough entropy to make collisions impossible in practice:

```js
const placeholderSlug = `league-${String(ownerUserId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
```

---

## Issue 3 — New-user team checkout is broken

**File:** `client/src/features/billing/pages/PricingPage.jsx` line 161
**Priority:** HIGH
**Status:** Fixed

### Problem

```js
response = await billingApi.createTeamCheckoutSession(selectedTeamId || undefined, interval);
```

A new user with no teams has `selectedTeamId === ''`. The `|| undefined` coercion sends `undefined` as `teamId`. The server's Zod schema requires `teamId: z.string().min(1)` and returns 400. The user sees an error and cannot check out — the primary conversion flow for new users is broken.

### Decision required

Two options:

- **A (simpler):** Disable the checkout button when `teams.length === 0` and show "Create a team first" with a link to `/teams/new?redirectTo=/pricing`.
- **B (seamless):** Add a server-side path that creates a placeholder team at checkout time (mirrors the league chicken-and-egg pattern).

---

## Issue 4 — `handleWebhook` missing explicit signature guard

**File:** `server/src/modules/billing/billing.controller.js` lines 52–55
**Priority:** LOW
**Status:** Fixed

### Problem

If a request arrives without a `stripe-signature` header, `undefined` is passed to `billingService.handleWebhookEvent`. The Stripe SDK will catch it and throw (returning a 400), so it is functionally safe — but relying on the SDK as the sole guard is fragile.

### Fix

Add an explicit early check:

```js
if (!signature) throw new ApiError(400, 'Missing stripe-signature header');
```

---

## Issue 5 — `customerPortalSchema` allows both teamId and leagueId

**File:** `server/src/modules/billing/billing.validation.js` lines 12–19
**Priority:** LOW
**Status:** Fixed

### Problem

The schema requires at least one of `teamId`/`leagueId` but does not reject both. If both are sent, the controller silently ignores `teamId` and opens the league portal. Not a security issue, but a confusing silent behavior.

### Fix

Add a `.refine()` that rejects both:

```js
.refine((data) => !(data.teamId && data.leagueId), {
  message: 'Provide either teamId or leagueId, not both',
})
```

---

## Issue 6 — No duplicate subscription check for league checkout

**File:** `server/src/modules/billing/billing.service.js` lines 252–289
**Priority:** MEDIUM
**Status:** Fixed

### Problem

`createTeamCheckoutSession` checks `if (isTeamActive(team)) throw` before creating a Stripe session. `createLeagueCheckoutSession` has no equivalent guard. A user with an active league can open multiple checkout sessions in parallel. The webhook's `existingByCustomer` guard only fires after the first webhook completes — in the window before that, two parallel checkouts could both succeed and create two league records.

### Fix

```js
const existingLeagues = await findLeaguesByOwner(userId);
if (existingLeagues.some(isLeagueActive)) {
  throw new ApiError(400, 'You already have an active League subscription');
}
```

---

## Issue 7 — `normalizeLeagueBilling` bypasses status whitelist

**File:** `server/src/modules/leagues/leagues.service.js` lines 102–109
**Priority:** LOW
**Status:** Fixed

### Problem

`normalizeLeagueBilling` uses a plain string fallback (`league.subscriptionStatus || 'inactive'`) instead of the `normalizeSubscriptionStatus` whitelist used in `billing.service.js`. An unexpected raw DB value (e.g. `'unpaid'`, `'incomplete'`) would leak through to the public API response.

### Fix

Apply the same whitelist inline:

```js
const VALID_STATUSES = ['active', 'trialing', 'past_due', 'canceled'];
subscriptionStatus: VALID_STATUSES.includes(league.subscriptionStatus)
  ? league.subscriptionStatus
  : 'inactive',
```

---

---

## Second Pass Issues

## Issue A — Team schema missing `trialEnd`, `billingInterval`, and `'team'` plan value

**File:** `server/src/modules/teams/teams.repository.js` lines 45–58
**Priority:** CRITICAL
**Status:** Fixed

### Problem

`applyTeamSubscriptionState` in `billing.service.js` writes `plan: 'team'`, `team.trialEnd`, and `team.billingInterval` to team documents. None of these were declared in the Mongoose schema. With Mongoose strict mode (default), undeclared fields are **silently dropped** on `.save()`. The `plan` enum `['free', 'pro']` also rejects `'team'`, so webhooks either silently drop the plan value or throw a validation error. Teams never transition to `'team'` plan after subscribing — users are locked out of paid features.

### Fix

Added `'team'` to the plan enum, and added `billingInterval` and `trialEnd` fields to `teamSchema`.

---

## Issue B — `redirectTo` param in NewTeamPage not validated as relative path

**File:** `client/src/features/teams/pages/NewTeamPage.jsx` line 143
**Priority:** LOW (security)
**Status:** Fixed

### Problem

`const redirectTo = searchParams.get('redirectTo') || ''` — a crafted URL like `/teams/new?redirectTo=//evil.com` could redirect users to an external site after team creation.

### Fix

```js
const rawRedirectTo = searchParams.get('redirectTo') || '';
const redirectTo = rawRedirectTo.startsWith('/') ? rawRedirectTo : '';
```

---

## Issue 8 — Raw MongoDB `_id` displayed in UI

**File:** `client/src/features/billing/pages/BillingSuccessPage.jsx` line 185
**Priority:** LOW
**Status:** Fixed

### Problem

```js
{
  teamId ? ` for team ${teamId}` : '';
}
```

The raw MongoDB ObjectId is shown in the "Refresh attempts: N for team <id>" debug line. Not a security vulnerability (the ID is already in the URL and returned by the API), but unnecessary exposure in the user-facing UI.

### Fix

Remove the `for team ${teamId}` segment from the displayed text.
