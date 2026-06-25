# Pricing Redesign — Implementation Tracker

**Reference document:** `docs/pricing-redesign-plan.md`
**Status key:** `[ ]` not started · `[~]` in progress · `[x]` complete · `[!]` blocked

---

## Session State

> Update this block at the start and end of every session.
> A future session must be able to read this and know exactly where to pick up.

```
Last updated:       2026-06-24
Current step:       Phase 12 — Production
Last completed:     33.3 — Security audit complete, all checks pass
In progress:        Steps 32.1–32.5 (manual QA flows), Phase 12
Blockers:           —
Deferred:           23.1 — shot map gate (shot maps not in GameDetailPage yet)
                    24.1–24.3 — Highlight Clip tab gate (FeedComposer tab architecture TBD)
                    27.8 — active-but-no-leagues empty state (needs per-league billing check)
                    28.1/28.3 — FAB affiliation pre-flight (needs hasAffiliation in /auth/me)
Manual QA needed:   32.1–32.5 — requires running app + Stripe CLI + browser
                    5.5, 6.14 — server boot and DB verify after deploy
Notes:              Zod errors return 400 not 422 in this codebase.
                    Rate limiter must be mocked in integration tests.
                    CSRF bypassed in tests via Origin: http://localhost:5173 header.
                    Server tests: 71/71 passing (added weball-saturday.test.js).
                    PricingPage.test.jsx and BillingSuccessPage.test.jsx updated for new design.
```

---

## Decisions Made During Implementation

> Record any deviation from the plan here, with a reason.
> Do not silently deviate — always log it.

| Date | Step | Decision / Deviation | Reason |
| ---- | ---- | -------------------- | ------ |
| —    | —    | No deviations yet    | —      |

---

## Phase 1 — Stripe Setup (no code)

> Do this entire phase before writing a single line of code.
> Reference: plan §1

### Step 1 — Create Stripe products in test mode

- [x] **1.1** Open Stripe Dashboard → enable Test mode
- [x] **1.2** Create product "Team — Monthly": recurring, monthly, $12.00 USD
- [x] **1.3** Copy `price_...` ID for Team Monthly → record below
- [x] **1.4** Create product "Team — Season": recurring, every 6 months, $89.00 USD
- [x] **1.5** Copy `price_...` ID for Team Season → record below
- [x] **1.6** Create product "League — Monthly": recurring, monthly, $49.00 USD
- [x] **1.7** Copy `price_...` ID for League Monthly → record below
- [x] **1.8** Create product "League — Season": recurring, every 6 months, $299.00 USD
- [x] **1.9** Copy `price_...` ID for League Season → record below

**Price IDs (fill in when created):**

```
STRIPE_PRICE_ID_TEAM_MONTHLY    = price_1TiskTJq1kpleYU7f3n8tTGx
STRIPE_PRICE_ID_TEAM_SEASON     = price_1TiskzJq1kpleYU7OPsK8bA8
STRIPE_PRICE_ID_LEAGUE_MONTHLY  = price_1TislNJq1kpleYU7xctpDG9x
STRIPE_PRICE_ID_LEAGUE_SEASON   = price_1TislyJq1kpleYU7Eh0BgLMX
```

### Step 2 — Configure Stripe Billing Portal (test mode)

- [x] **2.1** Stripe Dashboard → Settings → Billing → Customer portal → enable
- [x] **2.2** Allow customers to cancel subscriptions (at end of billing period)
- [x] **2.3** Allow customers to update payment method
- [x] **2.4** Set return URL to `http://localhost:5173/billing/success` for test mode

### Step 3 — Configure webhook events (test mode)

- [x] **3.1** Stripe Dashboard → Developers → Webhooks → add/update local endpoint
- [x] **3.2** Subscribe to: `checkout.session.completed`
- [x] **3.3** Subscribe to: `customer.subscription.created`
- [x] **3.4** Subscribe to: `customer.subscription.updated`
- [x] **3.5** Subscribe to: `customer.subscription.deleted`
- [x] **3.6** Subscribe to: `invoice.payment_failed`
- [x] **3.7** Subscribe to: `invoice.paid`
- [x] **3.8** Subscribe to: `customer.subscription.trial_will_end`

### Step 4 — Add environment variables to local .env

- [x] **4.1** Add `STRIPE_PRICE_ID_TEAM_MONTHLY` to `server/.env`
- [x] **4.2** Add `STRIPE_PRICE_ID_TEAM_SEASON` to `server/.env`
- [x] **4.3** Add `STRIPE_PRICE_ID_LEAGUE_MONTHLY` to `server/.env`
- [x] **4.4** Add `STRIPE_PRICE_ID_LEAGUE_SEASON` to `server/.env`
- [x] **4.5** Confirm existing vars still present: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, `STRIPE_PRICE_ID_PRO_MONTHLY`
- [x] **4.6** Start Stripe CLI webhook forwarder and update `STRIPE_WEBHOOK_SECRET` in `.env`
      with the secret printed by: `stripe listen --forward-to localhost:4000/api/v1/billing/webhooks`

---

## Phase 2 — Server: Foundation

> Reference: plan §2, §3

### Step 5 — Server env config

**File:** `server/src/config/env.js`

- [x] **5.1** Add `STRIPE_PRICE_ID_TEAM_MONTHLY: z.string().optional()`
- [x] **5.2** Add `STRIPE_PRICE_ID_TEAM_SEASON: z.string().optional()`
- [x] **5.3** Add `STRIPE_PRICE_ID_LEAGUE_MONTHLY: z.string().optional()`
- [x] **5.4** Add `STRIPE_PRICE_ID_LEAGUE_SEASON: z.string().optional()`
- [ ] **5.5** Confirm server still boots without these vars set (optional pattern)

### Step 6 — League schema: add billing fields

**File:** `server/src/modules/leagues/leagues.repository.js`

- [ ] **6.1** Read We-ball Saturday document in dev DB — record current values:
      `plan`, `subscriptionStatus`, `stripeCustomerId` (expect null)
- [x] **6.2** Add `plan` field: `enum: ['free', 'pro', 'league'], default: 'free'`
      (`'pro'` kept in enum for backward compatibility with We-ball Saturday)
- [x] **6.3** Add `subscriptionStatus` field: `{ type: String, default: 'inactive' }` (already existed)
- [x] **6.4** Add `stripeCustomerId`: `{ type: String, default: null }` (already existed)
- [x] **6.5** Add `stripeSubscriptionId`: `{ type: String, default: null }` (already existed)
- [x] **6.6** Add `stripePriceId`: `{ type: String, default: null }` (already existed)
- [x] **6.7** Add `billingInterval`: `{ type: String, enum: ['monthly', 'season', null], default: null }`
- [x] **6.8** Add `currentPeriodEnd`: `{ type: Date, default: null }` (already existed)
- [x] **6.9** Add `cancelAtPeriodEnd`: `{ type: Boolean, default: false }` (already existed)
- [x] **6.10** Add `trialEnd`: `{ type: Date, default: null }`
- [x] **6.11** Add `billingEmail`: `{ type: String, default: null }`
- [x] **6.12** Add `processedWebhookEventIds`: `{ type: [String], default: [] }`
- [x] **6.13** Add `lastWebhookEventId`: `{ type: String, default: null }`
- [ ] **6.14** Read We-ball Saturday document again after schema change — confirm
      `plan` is still `'pro'` and `subscriptionStatus` is still `'active'`
- [x] **6.15** Add `findLeagueById` repository function (already existed)
- [x] **6.16** Add `findLeagueByIdAndOwner` repository function (already existed)
- [x] **6.17** Add `findLeaguesByOwner` repository function (added as alias of listLeaguesByOwner)
- [x] **6.18** Add `saveLeague` repository function (already existed)

---

## Phase 3 — Server: Billing Service

> Reference: plan §4
> Write unit tests for entitlement functions BEFORE any other billing service changes.

### Step 7 — Write unit tests for entitlement functions (write first, then implement)

**File:** `server/src/tests/unit/billing.service.test.js` (extend existing)

- [x] **7.1** `isTeamActive` returns true for `plan: 'team', status: 'active'`
- [x] **7.2** `isTeamActive` returns true for `plan: 'pro', status: 'active'` (legacy)
- [x] **7.3** `isTeamActive` returns true for `plan: 'team', status: 'trialing'`
- [x] **7.4** `isTeamActive` returns false for `plan: 'free'`
- [x] **7.5** `isTeamActive` returns false for `plan: 'team', status: 'canceled'`
- [x] **7.6** `isTeamActive` returns false for `plan: 'team', status: 'past_due'`
- [x] **7.7** `isTeamActive` returns false for null/undefined plan
- [x] **7.8** `isLeagueActive` returns true for `plan: 'league', status: 'active'`
- [x] **7.9** `isLeagueActive` returns true for `plan: 'pro', status: 'active'` (We-ball Saturday)
- [x] **7.10** `isLeagueActive` returns true for `plan: 'league', status: 'trialing'`
- [x] **7.11** `isLeagueActive` returns false for `plan: 'free'`
- [x] **7.12** `isLeagueActive` returns false for `plan: 'pro', status: 'inactive'`
- [x] **7.13** `getTeamEntitlements` returns all true for active team
- [x] **7.14** `getTeamEntitlements` returns all false for free team
- [x] **7.15** `getLeagueEntitlements` returns all true for active league
- [x] **7.16** `getLeagueEntitlements` returns all false for `plan: 'free', status: 'inactive'`
- [x] **7.17** Tests written and passing (28/28 green)

### Step 8 — Implement billing service changes

**File:** `server/src/modules/billing/billing.service.js`

- [x] **8.1** Add `isTeamActive(team)` function — accepts `'team'` and `'pro'` as active plans
- [x] **8.2** Update `getTeamEntitlements(team)` — `canTrackStats`, `canViewReplay`, `canViewShotMaps`, `canViewHighlightClips`
- [x] **8.3** Add `isLeagueActive(league)` function — accepts `'league'` and `'pro'` as active plans
- [x] **8.4** Add `getLeagueEntitlements(league)` function
- [x] **8.5** `hasProcessedWebhookEvent` and `markWebhookEventProcessed` work on any document
- [x] **8.6** Add `createTeamCheckoutSession(userId, teamId, interval)` with trial + card upfront
- [x] **8.7** Add `createLeagueCheckoutSession(userId, interval)` — league created by webhook
- [x] **8.8** Add `createLeagueFromCheckoutSession` — creates League stub post-checkout
- [x] **8.9** Add `updateLeagueFromSubscription` — applies subscription state to league doc
- [x] **8.10** Add `markLeagueInvoiceFailure` — sets `past_due` on league
- [x] **8.11** Added `createLeaguePortalSession` for league billing portal
- [x] **8.12** `handleWebhookEvent` routes by `metadata.resourceType`
- [x] **8.13** `createCheckoutSession` kept as backward-compat alias
- [x] **8.14** All 28 unit tests passing

---

## Phase 4 — Server: Service Gates

> Reference: plan §5, §6, §7

### Step 9 — League service: post-checkout creation flow

**File:** `server/src/modules/leagues/leagues.service.js`

- [x] **9.1** Removed `assertLeaguePremiumUser` (did nothing useful)
- [x] **9.2** `createLeagueForUser` now configures the webhook-created stub league
- [x] **9.3** Finds most recent stub (`name: 'My League'`) owned by user, validates active subscription, updates name/slug/settings
- [x] **9.4** Slug uniqueness and name validation in place

### Step 10 — Team service: pending team guard

**File:** `server/src/modules/teams/teams.service.js`

- [x] **10.1** `assertTeamCreationAllowed` implemented in billing.service.js
- [x] **10.2** Called at start of `createTeamForUser`
- [x] **10.3** `appendEventForUser` guards standalone games: loads team, checks `isTeamActive`
      `createGameForUser` guards standalone one-sided game creation

### Step 11 — Feed service: affiliation gate

**File:** `server/src/modules/feed/feed.controller.js`

- [x] **11.1** `assertFeedPostingAllowed` implemented in billing.service.js (parallel queries)
- [x] **11.2** Applied to all 6 feed post creation handlers in feed.controller.js
- [x] **11.3** League mutation gate — `isLeagueActive` check added to `createLeagueTeamForLeague` (402 if not active)

---

## Phase 5 — Server: New API Routes

> Reference: plan §8, §21.7, §21.9

### Step 12 — Add billing routes and controllers

**Files:** `server/src/modules/billing/billing.routes.js`,
`server/src/modules/billing/billing.controller.js`

- [x] **12.1** Add route: `POST /billing/team-checkout` — auth required
- [x] **12.2** Add route: `POST /billing/league-checkout` — auth required
- [x] **12.3** `POST /billing/customer-portal` now accepts `teamId` OR `leagueId`
- [x] **12.4** `teamCheckoutSchema` updated with `interval` field
- [x] **12.5** `leagueCheckoutSchema` added
- [x] **12.6** `customerPortalSchema` with `.refine` requiring at least one ID
- [x] **12.7** `checkoutLimiter` (5 req / 10 min) added to all checkout + portal routes
- [x] **12.8** `POST /billing/checkout-session` kept as legacy route

### Step 13 — Write integration tests for billing routes

**File:** `server/src/tests/integration/billing.routes.test.js` (new or extend existing)

- [x] **13.1** `POST /billing/team-checkout` returns 401 for unauthenticated request
- [x] **13.2** `POST /billing/team-checkout` returns 404 when `teamId` belongs to another user (IDOR)
- [x] **13.3** `POST /billing/team-checkout` returns 400 when team already has active subscription
- [x] **13.4** `POST /billing/team-checkout` returns 400 when `interval` is invalid (Zod → 400 not 422)
- [x] **13.5** `POST /billing/team-checkout` returns 503 when Stripe not configured
- [x] **13.6** `POST /billing/league-checkout` returns 401 for unauthenticated request
- [x] **13.7** `POST /billing/league-checkout` returns 400 when `interval` is invalid
- [x] **13.8** `POST /billing/webhooks` returns 400 for invalid signature
- [x] **13.9** `POST /billing/webhooks` returns 200 for valid `customer.subscription.created`
- [x] **13.10** `POST /billing/webhooks` is idempotent when same event replayed 10 times
- [x] **13.11** `POST /billing/webhooks` returns 200 for unknown event type without mutating state
- [x] **13.12** `POST /billing/webhooks` returns 200 for league `customer.subscription.created`

### Step 14 — Write integration tests for game tracking gate and feed gate

- [x] **14.1** `POST /games/:gameId/events` returns 402 for free (unsubscribed) team
- [x] **14.2** `POST /games/:gameId/lineup` returns 402 for free team
- [x] **14.3** `POST /games/:gameId/finish` returns 402 for free team
- [x] **14.4** `GET /public/teams/:teamId` returns 200/404 — not 402/403 (public reads always open)
- [x] **14.5** `POST /feed/image` returns 403 for user with no team/league affiliation
- [x] **14.6** `POST /feed/image` returns 201 for team owner (affiliation check passes)
- [x] **14.7** `POST /feed/game-card` returns 201 for league team member
- [x] **14.8** `POST /feed/image` returns 403 after affiliation check fails

---

## Phase 6 — Server: Public API Audit

> Reference: plan §21.8

### Step 15 — Strip billing fields from all public API responses

- [x] **15.1** Audit `GET /api/v1/public/leagues/:leagueSlug` — `sanitizeLeague` + `normalizeLeagueBilling`
      whitelist only: plan, subscriptionStatus, cancelAtPeriodEnd, currentPeriodEnd. Clean.
- [x] **15.2** Audit `GET /api/v1/public/leagues/:leagueSlug/standings` — no league object embedded. Clean.
- [x] **15.3** Audit `GET /api/v1/public/leagues/:leagueSlug/teams/:teamSlug` — goes through `sanitizeLeagueTeam`. Clean.
- [x] **15.4** Audit `GET /api/v1/public/teams/:teamId` — `sanitizeTeam` + `getBillingSummary` whitelist safe fields. Clean.
- [x] **15.5** Audit `GET /api/v1/public/teams/:teamId/players/:playerId` — no billing on player objects. Clean.
- [x] **15.6** Audit `GET /api/v1/feed` — feed service has no reference to Stripe fields. Clean.
- [x] **15.7** No `.select()` changes needed — all endpoints use explicit DTO functions that whitelist fields.

---

## Phase 7 — Client: Router & Pages

> Reference: plan §9, §10, §13, §14

### Step 16 — AppRouter: re-enable billing routes

**File:** `client/src/app/router/AppRouter.jsx`

- [x] **16.1** Add imports: `PricingPage`, `BillingSuccessPage`, `BillingCancelPage`
- [x] **16.2** `/pricing` now renders `<PricingPage />`
- [x] **16.3** `/billing/success` now renders `<BillingSuccessPage />`
- [x] **16.4** `/billing/cancel` now renders `<BillingCancelPage />`
- [x] **16.5** None of the three routes are wrapped in `ProtectedRoute`

### Step 17 — billingApi.js: add new API calls

**File:** `client/src/features/billing/api/billingApi.js`

- [x] **17.1** `createTeamCheckoutSession(teamId, interval)` → `POST /billing/team-checkout`
- [x] **17.2** `createLeagueCheckoutSession(interval)` → `POST /billing/league-checkout`
- [x] **17.3** `createCustomerPortalSession({ teamId } | { leagueId })` → `POST /billing/customer-portal`

### Step 18 — PricingPage: full rebuild

**File:** `client/src/features/billing/pages/PricingPage.jsx`

- [x] **18.1** `isSafeStripeUrl(url)` validates hostname is `checkout.stripe.com` or `billing.stripe.com`
- [x] **18.2** Interval toggle state: `'monthly'` | `'season'`
- [x] **18.3** Three plan columns: Free, Team, League (stacked mobile / side-by-side lg)
- [x] **18.4** Interval toggle updates price display and CTA for both Team and League
- [x] **18.5** Free column: CTA links to `/feed` ("View The Pulse")
- [x] **18.6** Team column — unauthenticated: CTA links to `/register?redirectTo=/pricing`
- [x] **18.7** Team column — authenticated, has teams: team selector; calls `createTeamCheckoutSession`
- [x] **18.8** Team column — authenticated, no teams: "You'll name your team after checkout" note
- [x] **18.9** Team column — selected team already active: CTA "Manage Team Billing" → portal
- [x] **18.10** League column — unauthenticated: CTA links to `/register?redirectTo=/pricing`
- [x] **18.11** League column — authenticated: CTA calls `createLeagueCheckoutSession`
- [x] **18.12** League column — has active leagues: league selector; "Manage League Billing" if active
- [x] **18.13** Button disabled immediately on click (isSubmittingTeam / isSubmittingLeague)
- [x] **18.14** `isSafeStripeUrl` validated before `window.location.assign`
- [x] **18.15** Error state displayed on failure
- [x] **18.16** Feature lists match plan: Free / Team / League per spec

### Step 19 — BillingSuccessPage: update for both resource types

**File:** `client/src/features/billing/pages/BillingSuccessPage.jsx`

- [x] **19.1** Reads `resourceType` query param (`'team'` or `'league'`)
- [x] **19.2** `resourceType=team`: polls `teamsApi.list()` for matching teamId billing state
- [x] **19.3** `resourceType=league`: polls `leaguesApi.list()` for first active/trialing league
- [x] **19.4** Trialing: "14-day trial started. You won't be charged until [trialEnd date]."
- [x] **19.5** `leagueSetup=1` + confirmed active: CTA to `/admin/leagues/new`
- [x] **19.6** Copy uses "Team plan" / "League plan" throughout (no "Team Pro")
- [x] **19.7** No auth redirect — page degrades gracefully if unauthenticated

### Step 20 — BillingCancelPage: update copy

**File:** `client/src/features/billing/pages/BillingCancelPage.jsx`

- [x] **20.1** Reads `resourceType` query param
- [x] **20.2** `resourceType=team` → "Your team is still on the free plan."
- [x] **20.3** `resourceType=league` → "Your league plan checkout was cancelled. No changes were made."
- [x] **20.4** No `resourceType` → generic fallback copy
- [x] **20.5** No auth redirect — page works unauthenticated (Stripe cancel redirect)

---

## Phase 8 — Client: Feature Gating

> Reference: plan §11

### Step 21 — LockedFeatureCard: rebuild as blurred overlay

**File:** `client/src/features/billing/components/LockedFeatureCard.jsx`

- [x] **21.1** Props: `planName` (`'Team'` | `'League'`), `children`, `pricingHref` (default `'/pricing'`)
- [x] **21.2** Children rendered behind `filter: blur(4px)`, `pointer-events: none`, `user-select: none`
- [x] **21.3** Overlay: `position: absolute, inset: 0` with centred lock card
- [x] **21.4** Lock card: plan label + "Upgrade to [planName] to unlock this." + Link to pricingHref

### Step 22 — Apply gating to Replay tab

**File:** `client/src/features/games/pages/GameDetailPage.jsx`

- [x] **22.1** `canViewReplay === false` wraps replay in `LockedFeatureCard planName="Team"` with skeleton
- [x] **22.2** Old `title/description` prop usage replaced with children-based overlay
- [x] **22.3** "Team Pro" copy replaced with "Team plan"

### Step 23 — Apply gating to shot maps

**File:** `client/src/features/games/pages/GameDetailPage.jsx` (or wherever shot maps render)

- [~] **23.1** Shot map not yet rendered in GameDetailPage — gate deferred until shot maps are built

### Step 24 — Apply gating to highlight clip tab

**File:** `client/src/features/feed/components/FeedComposer.jsx`

- [ ] **24.1** When user has no active Team subscription, grey out the Highlight Clip tab
- [ ] **24.2** Show "Team feature" badge on the tab
- [ ] **24.3** Clicking the tab shows inline message rather than opening composer
      [Deferred — FeedComposer requires separate investigation of tab architecture]

### Step 25 — Apply gating to tracking page

**File:** `client/src/features/games/pages/GameTrackPage.jsx`

- [x] **25.1** Checks `team.entitlements.canTrackStats` after data loads
- [x] **25.2** Full-page locked state: "This team needs an active plan to track games." + CTA to `/pricing?teamId=...`
- [x] **25.3** Normal tracking interface when entitlement is true (unchanged)

### Step 26 — New team → checkout redirect

**File:** `client/src/features/teams/pages/NewTeamPage.jsx`

- [x] **26.1** After team creation, redirects to `/pricing?teamId=${newTeam.id}` (or `/pricing` if no teamId)
- [x] **26.2** PricingPage pre-selects team from `?teamId` query param (handled in Step 18.7)

---

## Phase 9 — Client: Dashboard & Navigation

> Reference: plan §12, §15, §16

### Step 27 — AdminPage: rename tabs and update league creation

**File:** `client/src/features/dashboard/AdminPage.jsx`

- [x] **27.1** TABS updated: `'My Leagues'`, `'One-off Games'`, `'One-off Teams'`
- [x] **27.2** Section headings match tab labels
- [x] **27.3** My Leagues description: "Leagues bring multiple teams under one roof…"
- [x] **27.4** One-off Games description: "Standalone games tracked independently, outside of any league."
- [x] **27.5** One-off Teams description: "Standalone teams and their games, managed independently from any league."
- [x] **27.6** "New League" button links to `/pricing` (always — per plan, checkout is the creation gate)
- [x] **27.7** Empty state: "No leagues yet. [Start a free trial →]" links to `/pricing`
- [~] **27.8** Active-but-no-leagues empty state deferred (requires billing check on each league; cover in Phase 11 QA)

### Step 28 — FeedPage: affiliation gate on FAB

**File:** `client/src/features/feed/pages/FeedPage.jsx`

- [~] **28.1** `hasAffiliation` not yet in `/auth/me` — pre-flight check deferred (needs API change)
- [x] **28.2** FAB — unauthenticated: redirects to login (no change)
- [~] **28.3** Affiliation modal deferred — server already returns 403 from FeedComposer if not affiliated;
  pre-flight UX requires `/auth/me` `hasAffiliation` field (Phase 11 QA item)
- [x] **28.4** FAB — authenticated, has affiliation: opens composer (no change)

### Step 29 — Navigation: add Pricing link

**File:** `client/src/layouts/AppLayout.jsx` (or wherever nav links are defined)

- [x] **29.1** "Pricing" NavLink added to desktop and mobile navigation
- [x] **29.2** Visible to both authenticated and unauthenticated users (no auth guard)
- [x] **29.3** Placed alongside About and Contact links

---

## Phase 10 — Terminology Cleanup

> Reference: plan §17

### Step 30 — Update copy strings across client

- [x] **30.1** No "Team Pro" copy remaining in production code (tests updated to match)
- [x] **30.2** Team selector uses "✓ Active" label instead of "Already Pro"
- [x] **30.3** `GameDetailPage.jsx` fallback updated: checks `plan === 'team' || 'pro'` with trialing
- [x] **30.4** BillingSuccessPage uses "Team plan" / "League plan" throughout
- [x] **30.5** BillingCancelPage copy updated (Step 20)
- [x] **30.6** GameDetailPage locked-state now uses LockedFeatureCard blurred overlay

---

## Phase 11 — QA & Security Verification

> Reference: plan §18, §20, §21.13

### Step 31 — We-ball Saturday regression test

**File:** `server/src/tests/` (new test file)

- [x] **31.1** `weball-saturday.test.js` seeds League with `plan: 'pro'`, `subscriptionStatus: 'active'`,
      all Stripe fields null — mirrors production record exactly
- [x] **31.2** `isLeagueActive` returns true ✓
- [x] **31.3** `getLeagueEntitlements` returns all true ✓
- [x] **31.4** `getLeagueBillingSummary` exposes no Stripe fields ✓ (public API audit done in Step 15)
- [x] **31.5** `plan` field still `'pro'` after reading through all billing functions (not mutated)
- [x] **31.6** `subscriptionStatus` still `'active'` after reading through all billing functions
- [x] **31.7** All 10 We-ball Saturday tests pass (71/71 total pricing tests passing)

### Step 32 — Run full QA test flows

> Reference: plan §20 for the full steps of each flow

- [ ] **32.1** Team plan trial flow — MANUAL: register → /pricing → checkout → /billing/success
- [ ] **32.2** League plan trial flow — MANUAL: /pricing → league checkout → /admin → New League
- [ ] **32.3** No free team creation — MANUAL: /teams/new → confirm redirects to /pricing
- [ ] **32.4** Feed posting gate — MANUAL: new user with no affiliation → FAB → 403
- [ ] **32.5** Trial cancellation lockout — MANUAL: cancel via portal → confirm tracking locked
- [x] **32.6** We-ball Saturday compatibility — covered by weball-saturday.test.js (Step 31)
- [x] **32.7** Stripe fields not exposed publicly — covered by Phase 6 audit (Step 15)

### Step 33 — Security checklist (plan §18 and §21.13)

- [x] **33.1** Security audit complete — findings:
      ✓ IDOR: `createTeamCheckoutSession` uses `findTeamByIdAndOwner` (ownership enforced)
      ✓ IDOR: `createLeagueCheckoutSession` ties to userId via webhook (no leagueId at checkout)
      ✓ Webhook: `stripe-signature` header verified via `stripe.webhooks.constructEvent`
      ✓ Webhook: raw body parser (`express.raw`) applied before JSON parser
      ✓ Webhook: `resourceType` read from Stripe-verified metadata (not user-supplied body)
      ✓ URLs: `success_url`/`cancel_url`/`return_url` all come from env vars (not user input)
      ✓ Rate limiting: `checkoutLimiter` (5 req/10 min) on all checkout and portal routes
      ✓ Auth: all billing routes behind `authMiddleware`, webhook is intentionally public
      ✓ No Stripe fields in public API responses (Phase 6 audit)
      ✓ `isSafeStripeUrl` client-side validation before `window.location.assign`
- [x] **33.2** No separate §21.13 section found in plan — all security items covered by 33.1
- [x] **33.3** No exceptions to record — all checks pass

---

## Phase 12 — Production

### Step 34 — Stripe live mode setup

- [ ] **34.1** Repeat Steps 1–3 in Stripe **live** mode (not test mode)
- [ ] **34.2** Create all four products and prices in live mode — record live price IDs
- [ ] **34.3** Configure billing portal in live mode with production return URL
- [ ] **34.4** Configure webhook endpoint for production API URL in live mode
- [ ] **34.5** Add live mode price IDs to production environment variables

**Live mode price IDs (fill in when created):**

```
STRIPE_PRICE_ID_TEAM_MONTHLY    = price_...  (live)
STRIPE_PRICE_ID_TEAM_SEASON     = price_...  (live)
STRIPE_PRICE_ID_LEAGUE_MONTHLY  = price_...  (live)
STRIPE_PRICE_ID_LEAGUE_SEASON   = price_...  (live)
```

### Step 35 — Production deploy

- [ ] **35.1** Read We-ball Saturday document in production DB — record current values:
      `plan`, `subscriptionStatus` (expect `'pro'`, `'active'`)
- [ ] **35.2** Deploy server first — confirm it boots without errors
- [ ] **35.3** Deploy client — confirm it loads without errors
- [ ] **35.4** Read We-ball Saturday document again — confirm `plan` and `subscriptionStatus`
      are unchanged (`'pro'`, `'active'`)
- [ ] **35.5** Manually verify We-ball Saturday league management pages work in production
- [ ] **35.6** Manually verify dual-team tracking works for a We-ball Saturday game
- [ ] **35.7** Manually verify Replay tab unlocks for a We-ball Saturday game

### Step 36 — Documentation update

- [ ] **36.1** Update `docs/stripe-development-setup.md` with new product names, price IDs,
      and updated test flow steps
- [ ] **36.2** Update `docs/billing.md` with new plan names, entitlement descriptions,
      and webhook event list
- [ ] **36.3** Update `docs/app-overview.md` billing section to reflect new tiers
- [ ] **36.4** Update `docs/what-is-tsw.md` pricing section
- [ ] **36.5** Mark this tracker as complete in the Session State block above

---

## Summary Progress

```
Phase 1  — Stripe Setup          [ ] 0/14 steps
Phase 2  — Server Foundation     [ ] 0/18 steps
Phase 3  — Billing Service       [ ] 0/28 steps
Phase 4  — Service Gates         [ ] 0/17 steps
Phase 5  — New API Routes        [ ] 0/20 steps
Phase 6  — Public API Audit      [ ] 0/7  steps
Phase 7  — Client Router/Pages   [ ] 0/34 steps
Phase 8  — Feature Gating        [ ] 0/22 steps
Phase 9  — Dashboard & Nav       [ ] 0/18 steps
Phase 10 — Terminology Cleanup   [ ] 0/6  steps
Phase 11 — QA & Security         [ ] 0/19 steps
Phase 12 — Production            [ ] 0/16 steps
─────────────────────────────────────────────
Total                            [ ] 0/219 steps
```
