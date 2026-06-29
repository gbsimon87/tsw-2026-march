# Pricing Redesign Plan

## Finalised Decisions

All decisions below are locked. Do not revisit them during implementation unless a
technical blocker forces a change — in that case, document the deviation here.

### Pricing tiers

| Tier | Name       | Price                 | Who pays                    |
| ---- | ---------- | --------------------- | --------------------------- |
| 0    | **Free**   | $0                    | Anyone                      |
| 1    | **Team**   | $12/mo or $89/season  | Coach, parent, team manager |
| 2    | **League** | $49/mo or $299/season | League organiser            |

### What each tier includes

**Free (no subscription)**

- View public team, player, and league pages
- View and manage their own My Sporty profile (claimed league profiles)
- Post to The Pulse — only if they hold any role on any team or league (owner, manager,
  helper, player). A registered user with no team/league affiliation cannot post.
- Cannot create a team or a league

**Team plan (per team, 14-day trial, card required upfront)**

- Full game tracking (court-tap shot capture, lineups, subs, all stat types)
- Box score, recap tab, play-by-play
- Replay tab (event-by-event progression)
- Shot maps (public game pages)
- Highlight clip sharing from YouTube-linked games
- Public team and player pages
- Feed posting for the team manager, helpers, and claimed players on that team
- Each additional team requires a separate Team subscription
- No league features (standings, dual-team tracking, join requests, etc.)

**League plan (per league, 14-day trial, card required upfront)**

- Everything in Team, applied to all teams within the league
- League creation and management
- Dual-team game tracking for league games
- Standings, public league/team/player pages
- Join request system
- Multiple league managers
- League logo and branding
- Feed posting for league owner, league managers, and all claimed players in the league
- Each additional league requires a separate League subscription

### Trials

- Both Team and League plans include a 14-day free trial
- Card details required upfront at checkout (Stripe handles this natively)
- If a user cancels during the trial, the resource locks immediately — tracking stops,
  data is retained so they can resubscribe
- Stripe `trial_period_days: 14` on subscription creation

### Free tier creation gate

- No free team creation. Creating a team triggers Team plan checkout.
- No free league creation. Creating a league triggers League plan checkout.
- `/teams/new` and `/admin/leagues/new` redirect to checkout if no active subscription exists.

### Feed posting rule

- Any authenticated user who holds at least one role (owner, manager, helper, player)
  on any team or league can post to The Pulse
- A registered user with no team/league affiliation can view the feed but cannot post
- Posting is not restricted to paid subscribers — a player added to a league by a paying
  organiser can post for free

### Existing production data

- There is one active league in production: **We-ball Saturday** (`slug: 'we-ball-saturday'`).
- Their `plan: 'pro'` and `subscriptionStatus: 'active'` are set directly on the **League
  document** — not on any team documents, and not via Stripe. All Stripe fields on the
  document are null. They were manually granted pro access in the database.
- There is no Stripe subscription to protect. The risk is purely that a code change
  accidentally ignores or overwrites their `plan` and `subscriptionStatus` fields.
- The League billing schema additions in Section 3 must be written so that existing
  field values on the document are preserved — no default overwrites, no migrations.
- All server-side entitlement checks must treat `plan: 'pro'` on a League document as
  equivalent to the new `plan: 'league'` — granting full league access.
- When the new League checkout flow writes `plan: 'league'` for new subscribers, the
  entitlement functions must accept both `'pro'` and `'league'` as active values.
- No data changes to this document under any circumstances.

---

## Section 1 — Stripe Product & Price Setup

Do this before any code changes. Work in test mode first, replicate in live mode only
after the full test flow is confirmed.

### 1.1 Create products and prices in Stripe Dashboard (test mode)

**Product: Team — Monthly**

- Recurring, monthly
- Unit amount: $12.00 USD
- `trial_period_days: 14` (set on the price or at subscription creation time)
- Copy `price_...` ID → save as `STRIPE_PRICE_ID_TEAM_MONTHLY`

**Product: Team — Season**

- Recurring, every 6 months (or match your season length)
- Unit amount: $89.00 USD
- `trial_period_days: 14`
- Copy `price_...` ID → save as `STRIPE_PRICE_ID_TEAM_SEASON`

**Product: League — Monthly**

- Recurring, monthly
- Unit amount: $49.00 USD
- `trial_period_days: 14`
- Copy `price_...` ID → save as `STRIPE_PRICE_ID_LEAGUE_MONTHLY`

**Product: League — Season**

- Recurring, every 6 months
- Unit amount: $299.00 USD
- `trial_period_days: 14`
- Copy `price_...` ID → save as `STRIPE_PRICE_ID_LEAGUE_SEASON`

> To set a trial with card required upfront in Stripe Checkout, use
> `subscription_data: { trial_period_days: 14 }` in the checkout session. Stripe will
> collect card details but not charge until the trial ends.

### 1.2 Configure Stripe Billing Portal

In Stripe Dashboard → Settings → Billing → Customer portal:

- Enable the portal
- Allow customers to cancel subscriptions
- Allow customers to update payment method
- Set the return URL to your app's `/billing/success`

### 1.3 Webhook events

Ensure the webhook endpoint (`/api/v1/billing/webhooks`) receives:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.paid` (optional, for future receipt handling)
- `customer.subscription.trial_will_end` (optional, for trial reminder emails later)

Add these in Stripe Dashboard → Developers → Webhooks → your endpoint.

### 1.4 New environment variables

Server — add these, keep all existing vars:

```
STRIPE_PRICE_ID_TEAM_MONTHLY
STRIPE_PRICE_ID_TEAM_SEASON
STRIPE_PRICE_ID_LEAGUE_MONTHLY
STRIPE_PRICE_ID_LEAGUE_SEASON
```

Retire after migration (do not delete until old plan: 'pro' subscriptions have cycled off):

```
STRIPE_PRICE_ID_PRO_MONTHLY  ← keep temporarily, remove once safe
```

Client — no change:

```
VITE_STRIPE_PUBLISHABLE_KEY
```

---

## Section 2 — Server: Environment Config

File: `server/src/config/env.js`

Add the four new price ID vars as `.optional()` (same pattern as existing Stripe vars).
The server boots without them but checkout endpoints return 503 if the relevant price ID
is absent.

---

## Section 3 — Server: League Schema (billing fields)

File: `server/src/modules/leagues/leagues.repository.js`

Add billing fields to the League Mongoose schema:

```js
plan: { type: String, enum: ['free', 'league'], default: 'free' },
subscriptionStatus: { type: String, default: 'inactive' },
stripeCustomerId: { type: String, default: null },
stripeSubscriptionId: { type: String, default: null },
stripePriceId: { type: String, default: null },
billingInterval: { type: String, enum: ['monthly', 'season', null], default: null },
currentPeriodEnd: { type: Date, default: null },
cancelAtPeriodEnd: { type: Boolean, default: false },
trialEnd: { type: Date, default: null },
billingEmail: { type: String, default: null },
processedWebhookEventIds: [String],
lastWebhookEventId: { type: String, default: null },
```

---

## Section 4 — Server: Billing Service

File: `server/src/modules/billing/billing.service.js`

### 4.1 Update entitlement constants

```js
const ACTIVE_STATUSES = new Set(['active', 'trialing']); // trialing = within trial period
```

This is already present. Keep it. `trialing` covers the 14-day trial window.

### 4.2 Backward-compatible entitlement check for teams

Team entitlements are unchanged from today — `plan: 'pro'` or `plan: 'team'` on a
team document grants full access:

```js
function isTeamActive(team) {
  const plan = team.plan || 'free';
  const status = normalizeSubscriptionStatus(team.subscriptionStatus);
  return (plan === 'team' || plan === 'pro') && ACTIVE_STATUSES.has(status);
}

function getTeamEntitlements(team) {
  const active = isTeamActive(team);
  return {
    canViewReplay: active,
    canViewShotMaps: active,
    canShareHighlightClips: active,
    canTrackGames: active,
  };
}
```

### 4.3 Backward-compatible entitlement check for leagues

The production league (We-ball Saturday) has `plan: 'pro'` set directly on its League
document with no Stripe subscription. New league subscribers will have `plan: 'league'`.
Both must be treated as active:

```js
function isLeagueActive(league) {
  const plan = league.plan || 'free';
  const status = normalizeSubscriptionStatus(league.subscriptionStatus);
  // 'pro' is the legacy value manually set on the existing production league.
  // 'league' is the value written by new Stripe-backed subscriptions.
  return (plan === 'league' || plan === 'pro') && ACTIVE_STATUSES.has(status);
}

function getLeagueEntitlements(league) {
  const active = isLeagueActive(league);
  return {
    canManageLeague: active,
    canTrackLeagueGames: active,
    canCreateLeagueTeams: active,
    canManageRoster: active,
  };
}
```

The Mongoose schema additions in Section 3 must use `{ default: undefined }` or omit
defaults entirely for the new billing fields — so that existing documents like
We-ball Saturday are not touched when the schema is updated.

### 4.3 League entitlements

```js
function isLeagueActive(league) {
  const plan = league.plan || 'free';
  const status = normalizeSubscriptionStatus(league.subscriptionStatus);
  return plan === 'league' && ACTIVE_STATUSES.has(status);
}

function getLeagueEntitlements(league) {
  const active = isLeagueActive(league);
  return {
    canManageLeague: active,
    canTrackLeagueGames: active,
    canCreateLeagueTeams: active,
    canManageRoster: active,
  };
}
```

### 4.4 Team checkout session (replaces createCheckoutSession — renumbered from old 4.4)

```js
async function createTeamCheckoutSession(userId, teamId, interval = 'monthly') {
  // interval: 'monthly' | 'season'
  // Uses STRIPE_PRICE_ID_TEAM_MONTHLY or STRIPE_PRICE_ID_TEAM_SEASON
  // Passes subscription_data: { trial_period_days: 14, metadata: { resourceType: 'team', teamId, ... } }
  // metadata on checkout session: { resourceType: 'team', teamId, ownerUserId, plan: 'team' }
}
```

### 4.5 League checkout session (new)

```js
async function createLeagueCheckoutSession(userId, leagueId, interval = 'monthly') {
  // interval: 'monthly' | 'season'
  // Uses STRIPE_PRICE_ID_LEAGUE_MONTHLY or STRIPE_PRICE_ID_LEAGUE_SEASON
  // Passes subscription_data: { trial_period_days: 14, metadata: { resourceType: 'league', leagueId, ... } }
  // metadata: { resourceType: 'league', leagueId, ownerUserId, plan: 'league' }
}
```

### 4.6 Webhook handler — route by resourceType

Update `handleWebhookEvent` to read `metadata.resourceType` from the subscription or
checkout session and route to the correct update function:

```
resourceType === 'team'   → updateTeamFromSubscription (existing, updated plan string)
resourceType === 'league' → updateLeagueFromSubscription (new)
resourceType missing      → fall through to existing logic (handles legacy 'pro' subscriptions)
```

### 4.7 updateLeagueFromSubscription (new)

Mirror of `updateTeamFromSubscription` but writes to the League document.
Sets `league.plan = 'league'` when status is active/trialing, `'free'` otherwise.

### 4.8 Keep existing createCheckoutSession for legacy

Do not delete the old `createCheckoutSession` function yet. It handles the existing
`plan: 'pro'` subscription renewals via webhook. Remove it only after the old plan
has been fully retired (i.e. no active subscribers on it).

---

## Section 5 — Server: League Service (gate creation)

File: `server/src/modules/leagues/leagues.service.js`

In the `create` function, before creating the league document, check that the user
does not already have an active league they own (one league per subscription, for now).
Return a clear error that the client can use to redirect to checkout:

```js
// If user has no active league subscription → throw ApiError(402, 'League plan required')
// Client catches 402 and redirects to /pricing#league
```

Do not gate based on user.plan — gate based on whether the user owns an active league
subscription. This is more accurate and handles edge cases like cancelled subscriptions.

---

## Section 6 — Server: Teams Service (gate creation)

File: `server/src/modules/teams/teams.service.js` (or wherever team creation is handled)

In the team `create` function, check that the user does not already own a team without
an active Team subscription. Since each team needs its own subscription, the logic is:

```
New team creation is always allowed at the API level — the subscription is created
BEFORE the team in the checkout flow. The team is created post-checkout (or at checkout
completion via webhook).
```

Alternative simpler approach: allow team creation at the API level but immediately
initiate checkout. The team record exists but is locked until the subscription activates.

> Decide which approach before implementing. Recommendation: **checkout first, team
> created after**. This avoids orphaned locked team records. Implement as:
>
> 1. User clicks "Create Team" → goes to Team checkout
> 2. Checkout success → webhook fires → server creates the team record
> 3. User lands on success page → redirected to their new team

This requires a small schema change: store `pendingTeamName` in the Stripe checkout
session metadata so the webhook handler knows what to create.

Simpler alternative (lower effort): create the team first, gate tracking behind
subscription check. Team record exists but track page shows "subscription required"
if no active subscription. Keeps the current flow intact.

**Start with the simpler alternative.** Refactor to checkout-first later.

---

## Section 7 — Server: Feed Posting Gate

File: `server/src/modules/feed/feed.service.js` (or feed routes middleware)

Add a middleware or service check on all feed post creation routes:

```js
// User must have at least one affiliation:
// - owns a team (any plan state)
// - is a league owner or manager
// - is a league team member (any role: manager, helper, player)
// If no affiliation found → throw ApiError(403, 'You must be part of a team or league to post')
```

The affiliation check queries:

- `Team.exists({ ownerUserId: userId })`
- `LeagueManager.exists({ userId })`
- `LeagueTeamMember.exists({ userId })`

Cache this per-request (not per-session) — it's a lightweight DB check.

---

## Section 8 — Server: New API Routes

File: `server/src/modules/billing/billing.routes.js`
File: `server/src/modules/billing/billing.controller.js`

### New endpoints

```
POST /api/v1/billing/team-checkout
  Body: { teamId, interval: 'monthly' | 'season' }
  Creates a Team plan checkout session with 14-day trial

POST /api/v1/billing/league-checkout
  Body: { leagueId, interval: 'monthly' | 'season' }
  Creates a League plan checkout session with 14-day trial

POST /api/v1/billing/customer-portal
  Body: { teamId } OR { leagueId }
  Extended to handle both resource types
```

Keep existing `POST /billing/checkout-session` working during transition.

---

## Section 9 — Client: AppRouter

File: `client/src/app/router/AppRouter.jsx`

### 9.1 Re-enable billing routes

Currently redirecting to `/`:

```jsx
<Route path="/pricing" element={<Navigate to="/" replace />} />
<Route path="/billing/success" element={<Navigate to="/" replace />} />
<Route path="/billing/cancel" element={<Navigate to="/" replace />} />
```

Change to:

```jsx
<Route path="/pricing" element={<PricingPage />} />
<Route path="/billing/success" element={<BillingSuccessPage />} />
<Route path="/billing/cancel" element={<BillingCancelPage />} />
```

### 9.2 Add imports

Add `PricingPage`, `BillingSuccessPage`, `BillingCancelPage` imports (they exist, just
not wired into the router).

---

## Section 10 — Client: Pricing Page (full rebuild)

File: `client/src/features/billing/pages/PricingPage.jsx`

### 10.1 Layout

Three plan columns (stacked on mobile, side-by-side on desktop).
Billing interval toggle at the top: **Monthly / Season** — affects price display and
CTA for Team and League columns simultaneously.

```
[ Free ]          [ Team ]              [ League ]
$0                $12/mo · $89/season   $49/mo · $299/season
                  14-day free trial     14-day free trial

✓ Public pages    All Free features     All Team features
✓ My Sporty       ✓ Game tracking       ✓ League creation
✓ View stats      ✓ Box scores          ✓ Standings
✓ Post to Pulse*  ✓ Replay tab          ✓ Public league pages
                  ✓ Shot maps           ✓ Join requests
                  ✓ Highlight clips     ✓ Dual-team tracking
                  Per team              Per league

[View Public Feed] [Start 14-day Trial] [Start 14-day Trial]
                   [Monthly / Season]   [Monthly / Season]

* if you hold a role on any team or league
```

### 10.2 Team column behaviour

- If logged in with existing teams: show team selector (same as current PricingPage)
- If logged in with no teams: show "You'll name your team after checkout" note
- If not logged in: CTA redirects to `/register?redirectTo=/pricing`
- Show current plan status on each team in the selector

### 10.3 League column behaviour

- If logged in with existing leagues: show league selector + "Manage billing" if already active
- If logged in with no leagues: show "You'll set up your league after checkout" note
- If not logged in: CTA redirects to `/register?redirectTo=/pricing`

### 10.4 billingApi.js additions

```js
createTeamCheckoutSession(teamId, interval)   → POST /billing/team-checkout
createLeagueCheckoutSession(leagueId, interval) → POST /billing/league-checkout
```

---

## Section 11 — Client: Feature Gating UX

### 11.1 LockedFeatureCard rebuild

File: `client/src/features/billing/components/LockedFeatureCard.jsx`

Rebuild from the current plain message box into a blurred overlay component:

Props:

- `planName` — `'Team'` or `'League'`
- `children` — the actual feature UI, rendered behind a blur + overlay
- `pricingHref` — defaults to `/pricing`

Rendered output:

```
┌─────────────────────────────────────────┐
│ [blurred content behind overlay]        │
│  ┌─────────────────────────────────┐   │
│  │ 🔒 Team feature                  │   │
│  │ Upgrade to Team to unlock this.  │   │
│  │ [See pricing →]                  │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

Use `filter: blur(4px)` + pointer-events none on the children, overlay div with
backdrop and the lock message centred on top.

### 11.2 Apply to existing gated surfaces

**Replay tab** — `client/src/features/games/pages/GameDetailPage.jsx`

- Wrap replay content with new `LockedFeatureCard` when `canViewReplay` is false
- Pass the replay UI skeleton as children so the blur shows something meaningful

**Shot maps** — wherever `canViewShotMaps` is checked

- Same blurred overlay pattern

**Highlight clip tab** — feed composer

- Grey out the tab + show "Team feature" badge when user has no active Team subscription
- File: `client/src/features/feed/components/FeedComposer.jsx`

**Tracking page** — `client/src/features/games/pages/GameTrackPage.jsx`

- If team has no active subscription (Team or League), show a full-page locked state
  instead of the tracking interface: "This team needs an active plan to track games.
  [Start free trial →]"

### 11.3 Create team → checkout gate

File: `client/src/features/teams/pages/NewTeamPage.jsx`

On mount (or on submit), check if the user has an existing Team subscription with
capacity for a new team. If not, redirect to `/pricing#team` with a message:
"Each team requires a Team plan. Start a free trial to create your first team."

---

## Section 12 — Client: Admin Dashboard Reorganisation

File: `client/src/features/dashboard/AdminPage.jsx`

### 12.1 Rename tabs

| Current | New           |
| ------- | ------------- |
| Leagues | My Leagues    |
| Games   | One-off Games |
| Teams   | One-off Teams |

Update the `TABS` constant labels and the section headings inside each tab panel.

### 12.2 Add contextual descriptions

Under **My Leagues** tab:

> "Leagues bring multiple teams under one roof with standings, fixtures, and join requests."

Under **One-off Games** tab:

> "Standalone games tracked outside of any league."

Under **One-off Teams** tab:

> "Standalone teams and their games, managed independently from any league."

### 12.3 Update "New League" button

Currently links to `/contact`. Change to:

- If user has an active League subscription → link to `/admin/leagues/new`
- If user has no active League subscription → link to `/pricing#league` with tooltip:
  "League plan required to create a league"

### 12.4 Empty state for My Leagues with no subscription

If the user has no leagues and no active League subscription, show:

```
You don't have any leagues yet.
[Start a free trial → ] to create your first league.
```

---

## Section 13 — Client: BillingSuccessPage

File: `client/src/features/billing/pages/BillingSuccessPage.jsx`

Update to handle both Team and League resource types via query params:

- `?teamId=...&resourceType=team` → poll team billing state (existing logic)
- `?leagueId=...&resourceType=league` → poll league billing state (new)

Update copy to reference plan names correctly:

- Team: "Your team is now on the Team plan"
- League: "Your league is now on the League plan"
- Both: mention the 14-day trial when `subscriptionStatus === 'trialing'`:
  "Your 14-day free trial has started. You won't be charged until [trialEnd date]."

---

## Section 14 — Client: BillingCancelPage

File: `client/src/features/billing/pages/BillingCancelPage.jsx`

Minor copy update: replace "Your team is still on Free" with copy that handles both
resource types based on query param (`resourceType=team` or `resourceType=league`).

---

## Section 15 — Client: Feed Posting Gate

File: `client/src/features/feed/pages/FeedPage.jsx`
File: `client/src/features/feed/components/FeedComposer.jsx`

The FAB (floating action button) currently shows for any logged-in user and redirects
unauthenticated users to login.

Update behaviour:

- Unauthenticated → redirect to login (no change)
- Authenticated, no affiliation → show FAB but on click show modal:
  "You need to be part of a team or league to post. Join a team or start a free trial."
- Authenticated, has affiliation → open composer (no change)

The server will also reject posts from unaffiliated users (Section 7), so the client
gate is for UX only — not the security boundary.

---

## Section 16 — Client: Navigation

File: `client/src/layouts/AppLayout.jsx` (or wherever nav links are defined)

Add a **Pricing** link visible to all users (authenticated and unauthenticated).
Place it in the main nav alongside About and Contact.

---

## Section 17 — Terminology Cleanup

### Server

The `plan` field on Team currently stores `'free'` or `'pro'`.
New values going forward: `'free'` or `'team'`.
League documents store `'free'` or `'league'`.

**Do not rename existing `'pro'` records in the DB.** The backward-compatible
`isTeamActive` check in billing.service.js handles `'pro'` as equivalent to `'team'`.
Write a migration script only after the last `plan: 'pro'` subscription has been
cancelled by the subscriber naturally. Until then, leave the data as-is.

### Client

Files that reference `'Team Pro'`, `'pro'`, or old copy:

- `PricingPage.jsx` — full rewrite, no manual find/replace needed
- `BillingSuccessPage.jsx` — update copy strings
- `BillingCancelPage.jsx` — update copy strings
- `GameDetailPage.jsx` — update locked-state copy to say "Team plan" not "Team Pro"
- `LockedFeatureCard.jsx` — rebuild, new copy by default

---

## Section 18 — Stripe Local Development Setup

Reference: update `docs/stripe-development-setup.md` after this is complete.

### Full local setup steps

1. Sign in to Stripe → enable Test mode
2. Create all four products from Section 1.1 — copy all four price IDs
3. Add price IDs to `server/.env`:
   ```
   STRIPE_PRICE_ID_TEAM_MONTHLY=price_...
   STRIPE_PRICE_ID_TEAM_SEASON=price_...
   STRIPE_PRICE_ID_LEAGUE_MONTHLY=price_...
   STRIPE_PRICE_ID_LEAGUE_SEASON=price_...
   ```
4. Install Stripe CLI if not already: `stripe login`
5. Forward webhooks:
   ```
   stripe listen --forward-to localhost:4000/api/v1/billing/webhooks
   ```
6. Copy webhook signing secret → `STRIPE_WEBHOOK_SECRET` in `server/.env`
7. Set return URLs in `.env`:
   ```
   STRIPE_SUCCESS_URL=http://localhost:5173/billing/success
   STRIPE_CANCEL_URL=http://localhost:5173/billing/cancel
   ```
8. Run `pnpm dev` and keep the webhook forwarder running in a separate terminal

### Test: Team plan trial flow

1. Register and sign in
2. Navigate to `/pricing`
3. Select Team → Monthly → click "Start 14-day Trial"
4. Enter test card `4242 4242 4242 4242`, any future expiry, any CVC
5. Confirm checkout shows "$0 today, then $12/mo after trial"
6. Complete checkout → confirm redirect to `/billing/success?teamId=...&resourceType=team`
7. Confirm page shows "14-day trial started"
8. Open a game for that team → confirm tracking and Replay tab are accessible
9. Confirm shot maps render on the game detail page

### Test: League plan trial flow

1. Navigate to `/pricing`
2. Select League → Monthly → click "Start 14-day Trial"
3. Complete checkout → confirm redirect to `/billing/success?leagueId=...&resourceType=league`
4. Navigate to `/admin` → My Leagues tab → "New League" button should now be active
5. Create a league, add teams, schedule a game
6. Confirm dual-team tracking works for the league game

### Test: No free team creation

1. Navigate to `/teams/new` without a Team subscription
2. Confirm redirect to `/pricing#team` with explanatory message
3. Confirm no team record is created without a subscription

### Test: Feed posting gate

1. Register a new user with no team/league affiliation
2. Navigate to `/feed`
3. Click the FAB → confirm modal appears: "Join a team or league to post"
4. Add user to a league team as a player → confirm FAB now opens composer

### Test: Trial cancellation lockout

1. Start a Team trial
2. Cancel immediately via billing portal
3. Confirm tracking page shows "subscription required" state
4. Confirm team data is retained (box scores, game history still viewable publicly)

### Test: Existing 'pro' plan compatibility (We-ball Saturday)

We-ball Saturday has `plan: 'pro'` and `subscriptionStatus: 'active'` set directly on
the League document. No Stripe subscription is attached. This must keep working exactly
as today after every code change.

1. In dev, seed a League document with `plan: 'pro'`, `subscriptionStatus: 'active'`,
   and all Stripe fields null (mirroring the production record exactly)
2. Confirm league management pages load without errors
3. Confirm dual-team tracking works for a league game in that league
4. Confirm Replay tab unlocks for games belonging to teams in that league
5. Confirm shot maps render correctly
6. Confirm the League document fields are unchanged after any schema migration runs —
   specifically that `plan` is still `'pro'` and not overwritten by a default
7. Do not modify this document in production under any circumstances

---

## Implementation Order

Work through these in sequence:

1. **Stripe products** — create all four in test mode, record price IDs (Section 1)
2. **Server env config** — add new price ID vars (Section 2)
3. **League schema** — add billing fields (Section 3)
4. **Billing service** — backward-compatible entitlements, new checkout functions,
   updated webhook router (Section 4)
5. **League service** — gate createLeague (Section 5)
6. **Feed service** — affiliation check for posting (Section 7)
7. **New API routes** — team-checkout and league-checkout (Section 8)
8. **AppRouter** — re-enable /pricing, /billing/success, /billing/cancel (Section 9)
9. **PricingPage** — full rebuild with three tiers and interval toggle (Section 10)
10. **LockedFeatureCard** — rebuild as blurred overlay (Section 11.1)
11. **Apply gating** — replay, shot maps, highlight clips, track page, new team gate
    (Section 11.2–11.3)
12. **AdminPage** — rename tabs, update New League button, add empty states (Section 12)
13. **BillingSuccessPage** — handle both resource types, trial copy (Section 13)
14. **BillingCancelPage** — copy update for both resource types (Section 14)
15. **Feed FAB gate** — affiliation check in FeedPage (Section 15)
16. **Nav** — add Pricing link (Section 16)
17. **Terminology cleanup** — update copy strings across client (Section 17)
18. **QA** — run all test flows from Section 18
19. **Stripe live mode** — replicate product setup for production
20. **Docs update** — update stripe-development-setup.md, billing.md, app-overview.md
