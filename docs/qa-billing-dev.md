# Billing QA — Dev Environment Test Guide

Manual test flows for every billing feature shipped in the pricing redesign.
Run these after the server, client, and Stripe CLI are all running.

---

## Prerequisites

### 1. Environment variables

Confirm `server/.env` has all of these set:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   ← from Stripe CLI, not the dashboard
STRIPE_PRICE_ID_TEAM_MONTHLY=price_1TiskTJq1kpleYU7f3n8tTGx
STRIPE_PRICE_ID_TEAM_SEASON=price_1TiskzJq1kpleYU7OPsK8bA8
STRIPE_PRICE_ID_LEAGUE_MONTHLY=price_1TislNJq1kpleYU7xctpDG9x
STRIPE_PRICE_ID_LEAGUE_SEASON=price_1TislyJq1kpleYU7Eh0BgLMX
STRIPE_SUCCESS_URL=http://localhost:5173/billing/success
STRIPE_CANCEL_URL=http://localhost:5173/billing/cancel
```

### 2. Start everything — three terminals

**Terminal 1 — Server:**

```bash
cd server && npm run dev
```

**Terminal 2 — Client:**

```bash
cd client && npm run dev
```

**Terminal 3 — Stripe webhook forwarder:**

```bash
npm run stripe-listen
# or: stripe listen --forward-to localhost:4000/api/v1/billing/webhooks
```

The Stripe CLI will print a `whsec_...` secret each time it starts.
Copy it into `server/.env` as `STRIPE_WEBHOOK_SECRET` and restart the server.

### 3. Stripe test card

Use `4242 4242 4242 4242`, any future expiry, any CVC, any postal code.
This card succeeds immediately and starts the trial.

---

## Flow 1 — Team Plan Trial (new user, no teams)

**What this tests:** New user registers → creates a team → lands on Pricing →
starts a trial → webhook fires → success page confirms active state.

**Steps:**

1. Open `http://localhost:5173/register` and create a fresh account.

2. After registration you should be on `/feed`.

3. Go to `/teams/new`. Fill in a team name (e.g. "Test Rockets") and click **Create Team**.

4. **Expected:** You are redirected to `/pricing?teamId=<id>` with the new team
   pre-selected in the Team column dropdown.

5. On the Pricing page, confirm:
   - Three columns are visible: **Free**, **Team**, **League**.
   - The Team column shows **$12/mo** (monthly toggle active by default).
   - Your new team is selected in the dropdown.
   - The team status shows `free · inactive` below the selector.
   - The button reads **Start 14-day Trial**.

6. Click the **Season** toggle. Confirm the price changes to **$89/season**.
   Switch back to **Monthly**.

7. Click **Start 14-day Trial**. The button should briefly show **Redirecting…**
   then the browser navigates to Stripe Checkout.

8. On Stripe Checkout, confirm:
   - Product name shows your Team plan.
   - A 14-day trial is shown with the charge date.
   - Card is required upfront.

9. Enter card `4242 4242 4242 4242`, any future date, any CVC.
   Click **Start trial**.

10. **Expected redirect:** `/billing/success?resourceType=team&teamId=<id>&checkout=success`

11. On the success page:
    - You should see **"Billing Updating"** briefly (polling in progress).
    - Within ~5 seconds it should update to **"Billing Updated"** with
      the team name: _"Test Rockets is now on the Team plan."_
    - A trial note should appear: _"14-day trial started. You won't be charged until [date]."_
    - **Back to Pricing** and **Go to Dashboard** links are shown.

12. Click **Back to Pricing**. Confirm:
    - The Team column now shows **✓ Active** next to the team name in the dropdown.
    - The button reads **Manage Team Billing** (not "Start 14-day Trial").
    - Status below the selector shows `team · trialing`.

---

## Flow 2 — Team Plan — Manage Billing (existing active team)

**What this tests:** Authenticated user with an active team opens the billing portal.

**Steps:**

1. Log in as the user from Flow 1 (or any user with an active team).

2. Go to `/pricing`. The Team column should show the active team with
   **Manage Team Billing** button.

3. Click **Manage Team Billing**.

4. **Expected:** Browser navigates to `billing.stripe.com/...` (the Stripe Customer Portal).

5. In the portal, confirm you can see the subscription details, card, and a cancel option.

6. Click the browser back button to return. No errors expected.

---

## Flow 3 — Team Plan — Tracking Gate

**What this tests:** A free (unsubscribed) team cannot track games.

**Steps:**

1. Create a second fresh account (or log out, register a new one).

2. Go to `/teams/new` and create a team named "Locked Rockets".
   You will land on `/pricing?teamId=<id>`. **Do not subscribe.**

3. Go to `/admin`. You should see "Locked Rockets" under **One-off Teams**.
   Click any existing game for this team (or create one via `/games/new`).

4. Navigate to the tracking URL: `/games/<gameId>/track`.

5. **Expected:** Instead of the tracking interface, you see a full-page locked screen:
   - _"Team feature"_ label at the top.
   - Heading: _"This team needs an active plan to track games."_
   - Body: _"Subscribe to the Team plan to unlock full game tracking, replay, and shot maps."_
   - A **Start free trial →** link pointing to `/pricing?teamId=<id>`.

6. Click **Start free trial →** and confirm you land on Pricing with the correct team pre-selected.

---

## Flow 4 — Team Plan — Replay Gate

**What this tests:** Replay tab is locked for free teams, unlocked for active teams.

**Steps (free team):**

1. Using the free team from Flow 3, open any completed game at `/games/<gameId>`.

2. Click the **Replay** tab.

3. **Expected:** Instead of the replay player, you see a blurred overlay with a lock card:
   - _"Team feature"_ label.
   - _"Upgrade to the Team plan to unlock this."_
   - **View Pricing** link.

**Steps (active team):**

4. Log back in as the user from Flow 1 (active team).

5. Open a completed game for that team. Click the **Replay** tab.

6. **Expected:** The replay player loads normally. No lock overlay.

---

## Flow 5 — League Plan Trial

**What this tests:** User starts a league subscription → webhook creates a stub league →
success page detects active state → user is prompted to configure the league.

**Steps:**

1. Log in as a user with no active league (can use Flow 1 user or a fresh account).

2. Go to `/pricing`. The League column should show:
   - _"You'll set up your league after checkout."_ (if no leagues exist).
   - Price: **$49/mo**.
   - Button: **Start 14-day Trial**.

3. Click **Start 14-day Trial**.

4. Complete Stripe Checkout with `4242 4242 4242 4242`.

5. **Expected redirect:** `/billing/success?resourceType=league&checkout=success`

6. On the success page:
   - Brief **"Billing Updating"** while polling.
   - Within ~5 seconds: **"Billing Active"** with heading _"Your league plan is active. Let's set up your league."_
   - Trial note: _"14-day trial started. You won't be charged until [date]."_
   - CTA button: **Set up your league** pointing to `/admin/leagues/new`.

7. Click **Set up your league**. On the New League form:
   - Fill in a league name (e.g. "Test League 5").
   - Submit.
   - **Expected:** League is created and you land on the admin league page.

8. Go to `/admin`. Under **My Leagues** you should see "Test League 5" listed.

---

## Flow 6 — League Plan — Manage Billing (existing active league)

**What this tests:** Active league owner can open the billing portal for their league.

**Steps:**

1. Log in as the user from Flow 5 (active league).

2. Go to `/pricing`. The League column should now show the league name in the dropdown
   with **✓ Active**, and the button should read **Manage League Billing**.

3. Click **Manage League Billing**.

4. **Expected:** Browser navigates to the Stripe Customer Portal for the league subscription.

---

## Flow 7 — League Plan — Mutation Gate (add teams)

**What this tests:** A free/inactive league cannot add teams to itself.

**Steps:**

1. Create a fresh account with no active league.

2. If needed, manually insert a test league document in MongoDB with
   `plan: 'free'`, `subscriptionStatus: 'inactive'` and your userId as `ownerUserId`.

3. Make a POST request to `POST /api/v1/leagues/<leagueId>/teams` as that user
   (use the browser devtools Network tab, Postman, or curl).

4. **Expected:** `402 Payment Required` with message
   _"An active League subscription is required to add teams."_

---

## Flow 8 — Dashboard — League Tab

**What this tests:** Admin page shows the correct leagues section and CTA.

**Steps:**

1. Log in as a user with no leagues.

2. Go to `/admin`. The **My Leagues** tab should be active by default.

3. **Expected (no leagues):**
   - Section heading: _"My Leagues"_
   - Description about leagues.
   - **New League** button in the header linking to `/pricing`.
   - Empty state: _"No leagues yet. Start a free trial →"_ — the link goes to `/pricing`.

4. Log in as a user with leagues. Go to `/admin`.

5. **Expected (has leagues):**
   - Each league is listed with its name, season label, and role badge.
   - Clicking a league navigates to `/admin/leagues/<id>`.
   - **New League** button still links to `/pricing`.

---

## Flow 9 — New Team Creation Redirect

**What this tests:** Creating a new team always drops you on Pricing with the team pre-selected.

**Steps:**

1. Log in as any user.

2. Go to `/teams/new`.

3. Create a team called "Redirect Test".

4. **Expected:** After creation, you land on `/pricing?teamId=<newTeamId>`.
   The Team column dropdown shows "Redirect Test" pre-selected.

---

## Flow 10 — Checkout Cancellation

**What this tests:** Cancelling Stripe Checkout returns to a friendly cancel page.

**Steps (Team cancel):**

1. Go to `/pricing`. Click **Start 14-day Trial** on the Team column.

2. On Stripe Checkout, click **← Back** or the cancel/close option.

3. **Expected redirect:** `/billing/cancel?resourceType=team&teamId=<id>&checkout=canceled`

4. On the cancel page:
   - Eyebrow: _"Checkout Canceled"_
   - Heading: _"Your team is still on the free plan."_
   - Description: _"No billing changes were applied. Return to pricing to start a free trial."_
   - **Return to Pricing** links back to `/pricing?teamId=<id>`.
   - **Back to Dashboard** links to `/dashboard`.

**Steps (League cancel):**

5. Go to `/pricing`. Click **Start 14-day Trial** on the League column.

6. Cancel at Stripe Checkout.

7. **Expected:** Heading reads _"Your league plan checkout was cancelled."_

---

## Flow 11 — Pricing Page — Unauthenticated

**What this tests:** Logged-out users see sign-up CTAs, not checkout buttons.

**Steps:**

1. Log out completely.

2. Go to `/pricing`.

3. **Expected:**
   - Free column: **View The Pulse** → `/feed`.
   - Team column: **Start 14-day Trial** → `/register?redirectTo=/pricing`.
   - League column: **Start 14-day Trial** → `/register?redirectTo=/pricing`.
   - No team or league selectors are shown.
   - No billing API calls are made (open Network tab and confirm).

4. Click **Start 14-day Trial** in the Team column.
   You should land on `/register?redirectTo=/pricing`.
   Register a new account. After registration you should return to `/pricing`.

---

## Flow 12 — Feed Posting Gate

**What this tests:** A user with no team or league affiliation cannot post to the Feed.

**Steps:**

1. Create a brand new account. Do not create any teams or join any leagues.

2. Go to `/feed`.

3. Try to open the post composer (tap the FAB or compose button).

4. Attempt to post any content type.

5. **Expected:** The server returns `403 Forbidden` with message
   _"You must be part of a team or league to post."_
   The client should show this as an error.

6. As a sanity check: log in as a user who **owns a team** (even a free plan team)
   and confirm they **can** open the composer and post successfully.

---

## Flow 13 — Navigation: Pricing Link

**What this tests:** The Pricing link is visible in the nav for all users.

**Steps:**

1. Log out. Open the app. Confirm **Pricing** is visible in the desktop nav
   and in the mobile hamburger menu.

2. Log in. Confirm **Pricing** is still visible in both nav locations.

3. Click it from both states and confirm it lands on `/pricing`.

---

## Flow 14 — Interval Toggle

**What this tests:** The billing interval toggle switches both Team and League prices.

**Steps:**

1. Go to `/pricing`.

2. Default state: toggle shows **Monthly**.
   - Team price: **$12/mo**
   - League price: **$49/mo**

3. Click **Season**.
   - Team price: **$89/season**
   - League price: **$299/season**
   - A green _"Save ~40%"_ badge appears next to the toggle.

4. Click **Monthly** again. Prices revert.

5. Click **Start 14-day Trial** on the Team column with **Season** selected.
   Complete checkout and verify on the Stripe dashboard that the season price ID
   (`price_1TiskzJq1kpleYU7OPsK8bA8`) is attached to the subscription — not the monthly one.

---

## Flow 15 — We-ball Saturday Backward Compatibility

**What this tests:** The existing production league (manually provisioned, no Stripe)
continues to work with all features unlocked.

**Steps:**

1. Log in as the We-ball Saturday league owner.

2. Go to `/admin`. Confirm the league appears under **My Leagues**.

3. Navigate to the league management page (`/admin/leagues/<id>`).
   Confirm all management features load without errors.

4. Open any We-ball Saturday game. Navigate to the **Replay** tab.
   **Expected:** Replay loads normally. No lock overlay appears.

5. Go to `/pricing`. The League column should show the We-ball Saturday league
   with **✓ Active** status and **Manage League Billing** button.

6. Click **Manage League Billing**.
   **Expected:** You receive a `400` error (_"No billing customer exists for this league"_)
   — this is correct behaviour. The league has no Stripe customer because it was manually provisioned.
   The error should be shown to the user as a message, not a crash.

---

## Flow 16 — Duplicate Subscription Guard

**What this tests:** A user with an already-active league cannot start a second league checkout.

**Steps:**

1. Log in as the user from Flow 5 (active league).

2. Open browser devtools → Network tab.

3. Go to `/pricing`. The League column should show **Manage League Billing**.

4. Directly POST to `POST /api/v1/billing/league-checkout` with `interval: 'monthly'`
   (use the Network tab to replay the request, or curl with your auth cookie).

5. **Expected:** `400 Bad Request` — _"You already have an active League subscription."_

---

## Flow 17 — Rate Limiting

**What this tests:** The checkout rate limiter (5 requests per 10 min per IP) works.

> Only run this if you want to verify the limiter — it will lock you out for 10 minutes.

**Steps:**

1. Using curl or a script, send 6 rapid POST requests to `/api/v1/billing/team-checkout`
   with a valid auth token and `teamId`.

2. **Expected:** The first 5 return `400` or `200` (depending on state).
   The 6th returns `429 Too Many Requests` with:
   ```json
   { "error": { "message": "Too many checkout attempts, try again later." } }
   ```

---

## Quick Smoke Checks

Run these any time after a code change to confirm nothing regressed:

| URL                                              | Logged out                          | Logged in (free team)        | Logged in (active team)         |
| ------------------------------------------------ | ----------------------------------- | ---------------------------- | ------------------------------- |
| `/pricing`                                       | Shows 3 columns, register CTAs      | Shows selectors, Start trial | Shows selectors, Manage Billing |
| `/billing/success?resourceType=team&teamId=<id>` | Polling starts, resolves to pending | Same                         | Same                            |
| `/billing/cancel?resourceType=team`              | Cancel page, correct copy           | Same                         | Same                            |
| `/admin`                                         | Redirected to `/login`              | My Leagues tab visible       | Same                            |
| `/games/<id>/track`                              | Redirected to `/login`              | Locked screen (if free)      | Tracking interface              |
| `/games/<id>` → Replay tab                       | Unlocked (public read)              | Locked overlay (if free)     | Replay loads                    |

---

## Stripe Test Cards Reference

| Card                  | Behaviour                                                   |
| --------------------- | ----------------------------------------------------------- |
| `4242 4242 4242 4242` | Succeeds — trial starts immediately                         |
| `4000 0000 0000 3220` | Requires 3D Secure authentication                           |
| `4000 0000 0000 9995` | Charge fails — use to test `invoice.payment_failed` webhook |

Use any future expiry date, any 3-digit CVC, any postal code.

---

## Webhook Events — What to Watch

When you complete a checkout in Stripe, the Stripe CLI terminal should show
these events firing in order. If any are missing or show errors, something is wrong.

```
2026-xx-xx  checkout.session.completed         --> 200 OK
2026-xx-xx  customer.subscription.created      --> 200 OK
2026-xx-xx  invoice.paid                       --> 200 OK (ignored, no handler)
```

For a league checkout, additionally:

```
2026-xx-xx  checkout.session.completed         --> 200 OK  (stub league created)
2026-xx-xx  customer.subscription.created      --> 200 OK  (league plan set to 'league', status: 'trialing')
```

If a webhook returns anything other than 200, Stripe will retry.
Watch the CLI output for retry attempts as a sign of an error.
