# Stripe Test-Clock Runbook (T-27)

> This is a checklist you follow **by clicking things in the Stripe website**. No
> commands to type, no code to write. Just follow the numbered steps in order.

Everything happens in two windows, kept open side by side the whole time:

- **Window 1:** the Stripe Dashboard (in your browser), in **test mode**.
- **Window 2:** a terminal running `stripe listen` (someone already set this up
  for you — see "Before you start" below).

---

## Before you start (one time only)

1. Ask whoever runs the dev server to confirm it's running (`localhost:4000`).
2. Open a terminal and run:
   ```bash
   stripe listen --forward-to localhost:4000/api/v1/billing/webhooks
   ```
   Leave this terminal open for your **entire session** — don't close it between
   scenarios. Every time something happens in Stripe, a line will print here. This
   is how you know "it worked."
3. Open [dashboard.stripe.com](https://dashboard.stripe.com) in your browser. Make
   sure the toggle in the top-right says **Test mode** (it's usually an
   orange/black switch — if it says "Live mode," click it to switch).

You only need to do this once, not once per scenario.

---

## The one tool you'll use for every scenario: Test Clocks

A **Test Clock** is a pretend calendar Stripe gives you. Instead of waiting real
weeks for a trial to end or a subscription to renew, you tell the clock to "jump
forward 15 days" and Stripe instantly pretends that much time passed.

### How to create a Test Clock (do this at the start of every scenario)

1. In the Stripe Dashboard, click the **search bar** at the top (or press
   `Cmd+K` on Mac / `Ctrl+K` on Windows).
2. Type `test clocks` and click the **Test clocks** result that appears.
   - (It's not in the regular Workbench sidebar menu — search is the easiest way
     to find it. You can also go directly to
     `https://dashboard.stripe.com/test/test-clocks` in your browser.)
3. Click **+ New clock** (top right).
4. Give it a name you'll remember, like `scenario-1`. Leave the starting time as
   "now."
5. Click **Create clock**.
6. You'll land on the clock's page. **Keep this browser tab open** — you'll come
   back to it to add a customer and later to jump time forward.

### How to add a customer + subscription to your clock

1. On the test clock's page, click **+ Add customer and subscription** (or
   similar — the exact wording may say "Add customer").
2. Fill in:
   - **Email:** anything, e.g. `scenario1@example.com`
   - **Name:** anything, e.g. `Scenario 1 Test`
3. Click through to **add a subscription** for that customer:
   - Pick the product/price you want (e.g. "Team Pro Monthly"). If you're not
     sure which price ID is which, check
     [OUTSTANDING-MANUAL-ACTIONS.md](./OUTSTANDING-MANUAL-ACTIONS.md), Round A.
   - If the scenario says "with a trial," set a trial length (use 14 days unless
     told otherwise).
   - For payment method, use one of the **test card numbers** below.
4. Click **Create** / **Add subscription**.
5. Watch your `stripe listen` terminal — a line should print within a few
   seconds, like `checkout.session.completed` or `customer.subscription.created`.
   That's Stripe telling your dev app "this happened."

### Test card numbers (use these — they're not real cards)

| Card number           | What it does                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `4242 4242 4242 4242` | Always works. Use this for "everything succeeds" scenarios.                                  |
| `4000 0000 0000 0341` | Works the first time, then **fails every renewal after**. Use this for the Dunning scenario. |

For expiry date and CVC, use any future date (e.g. `12/34`) and any 3 digits
(e.g. `123`). Zip code, if asked, can be any 5 digits (e.g. `12345`).

### How to jump the clock forward in time

1. Go back to the test clock's page (search `test clocks` again, or use your
   browser's back button, then click your clock's name).
2. Click **Advance clock** (or the clock/forward icon).
3. Enter a date/time in the future — you'll be told exactly how far to jump in
   each scenario step below (e.g. "13 days from now").
4. Click **Advance**.
5. Wait — the clock will show a status like "Advancing..." then flip to
   "Ready." This can take 10–30 seconds. Don't move to the next step until it
   says **Ready**.
6. Watch your `stripe listen` terminal for the new event line(s).

### How to check the result landed in the app

After each step below, do ONE of these (whichever is easiest for you):

- **Easiest:** log into the app in your browser as the test team's owner, and
  look at the team's billing page / a game's replay button. If it says "locked"
  or shows an upgrade prompt, the team is not active. If replay plays normally,
  the team is active.
- Or ask a developer to check the billing summary for you.

---

## Scenario 1 · Trial → Active

**Goal:** a new subscriber starts a free trial, gets a reminder near the end, then
gets billed and becomes a paying active customer.

1. **Create a test clock** named `scenario-1` (see "How to create a Test Clock"
   above).
2. **Add a customer + subscription** to it:
   - Price: **Team Pro Monthly**
   - Trial: **Yes, 14 days**
   - Card: `4242 4242 4242 4242`
3. ✅ Check your `stripe listen` terminal. You should see:
   - `checkout.session.completed`
   - `customer.subscription.created`
4. ✅ Check the app: the team should show plan **Team Pro**, and replay should be
   **unlocked**.
5. **Advance the clock forward 13 days.**
6. ✅ Check your `stripe listen` terminal. You should see:
   - `customer.subscription.trial_will_end`
   - (This means Stripe just warned that the trial is ending soon — a reminder
     email should be sent to the team owner.)
7. **Advance the clock forward 2 more days** (15 total from the start).
8. ✅ Check your `stripe listen` terminal. You should see:
   - `invoice.paid`
   - `customer.subscription.updated`
9. ✅ Check the app: the team should now show status **active** (no longer
   trialing), and replay should still be **unlocked**.

**Scenario 1 done when:** all 4 checkmarks above happened in order.

---

## Scenario 2 · Dunning (a payment fails)

**Goal:** an active paying customer's card fails at renewal time, gets locked out
of premium features (but keeps their existing data), then eventually gets fully
canceled if the card is never fixed.

1. **Create a test clock** named `scenario-2`.
2. **Add a customer + subscription** to it:
   - Price: **Team Pro Monthly**
   - Trial: **No** (skip the trial this time — go straight to active)
   - Card: `4000 0000 0000 0341` (this card works once, then fails every time
     after)
3. ✅ Check the app: team should be **Team Pro**, replay **unlocked**.
4. **Advance the clock forward 31 days** (past the first renewal date).
5. ✅ Check your `stripe listen` terminal. You should see:
   - `invoice.payment_failed`
6. ✅ Check the app:
   - The team should now show status **past due**.
   - Replay should be **locked**.
   - **Important:** existing game data and live tracking should still work
     normally — only the premium replay/shot-map features lock.
7. **Advance the clock forward another 30 days** (to let Stripe give up retrying
   the failed card).
8. ✅ Check your `stripe listen` terminal. You should see:
   - `customer.subscription.updated` (status will be `canceled` or `unpaid`)
9. ✅ Check the app: team should now show plan **Starter** (the free plan),
   premium features locked, but old game data still there.

**Scenario 2 done when:** all 4 checkmarks above happened in order.

---

## Scenario 3 · Cancel

**Goal:** a customer cancels — but keeps access until the time they already paid
for runs out.

1. **Create a test clock** named `scenario-3`.
2. **Add a customer + subscription** to it:
   - Price: **Team Pro Monthly**
   - Trial: **No**
   - Card: `4242 4242 4242 4242`
3. ✅ Check the app: team is **Team Pro**, replay **unlocked**.
4. **Cancel the subscription "at period end":**
   - On the test clock's page, find the subscription you just created and open
     it.
   - Click **Cancel subscription**.
   - Choose the option that says **"Cancel at end of billing period"** (NOT
     "Cancel immediately").
   - Confirm.
5. ✅ Check your `stripe listen` terminal. You should see:
   - `customer.subscription.updated`
6. ✅ Check the app: team should **still show Team Pro, still unlocked** — they
   paid for this period, so they keep access until it ends. (There may be a
   small note saying "cancels on [date].")
7. **Advance the clock forward 31 days** (past the period they already paid
   for).
8. ✅ Check your `stripe listen` terminal. You should see:
   - `customer.subscription.deleted`
9. ✅ Check the app: team should now show **Starter**, replay **locked**.

**Scenario 3 done when:** all 3 checkmarks above happened in order.

---

## Scenario 4 · Reactivate

**Goal:** someone who canceled comes back and re-subscribes.

1. **Reuse the same team/customer from Scenario 3** (the one that's now on
   Starter).
2. **Add a brand new subscription** for that same customer:
   - On the test clock's page (still `scenario-3` clock is fine), click **+ Add
     subscription** for the existing customer.
   - Price: **Team Pro Monthly**
   - Trial: **No**
   - Card: `4242 4242 4242 4242`
3. ✅ Check your `stripe listen` terminal. You should see:
   - `checkout.session.completed` and/or `customer.subscription.updated` (or
     `.created`)
4. ✅ Check the app: team should show **Team Pro** again, replay **unlocked**.

**Scenario 4 done when:** both checkmarks above happened.

---

## Scenario 5 · Comp-grant immunity (bonus, no test clock needed)

**Goal:** prove that teams/leagues we manually gave free access to (not through
Stripe) can't accidentally get locked out by a stray Stripe event.

This one is a bit different — it needs a developer to flip one field in the
database first, so **ask a developer to help set this scenario up**:

1. Ask a developer to set `billingSource = 'comp'` on a test league in the dev
   database.
2. In the Stripe Dashboard, go to **Developers → Webhooks** (or **Workbench →
   Webhooks**) → find your local endpoint → **Send test webhook**.
3. Choose the event type `customer.subscription.deleted` and send it.
4. ✅ Check your `stripe listen` terminal — it should show the event was
   received.
5. ✅ Check the app/database: the league's plan and status should be
   **completely unchanged** — still active, nothing reset. This proves comp
   (manually-granted) access can't be knocked out by an unrelated Stripe event.

**Scenario 5 done when:** the league is confirmed unchanged after the event.

---

## When you're all done

- You can leave the `stripe listen` terminal running or close it — it's safe to
  stop at any point.
- Test clocks don't need cleanup, but if you want to tidy up: search `test
clocks` again, open each clock you made, and click **Delete clock**. This
  removes the clock and all its fake customers/subscriptions — it does **not**
  affect anything real.
- Tell a developer which scenarios you completed and whether every checkmark (✅)
  matched what's written above. If anything didn't match, tell them exactly
  which step and what you saw instead — that's the useful bug report.

## Checklist (tick these off as you go)

- [ ] Scenario 1 · Trial → Active — all 4 checkmarks passed
- [ ] Scenario 2 · Dunning — all 4 checkmarks passed
- [ ] Scenario 3 · Cancel — all 3 checkmarks passed
- [ ] Scenario 4 · Reactivate — both checkmarks passed
- [ ] Scenario 5 · Comp-grant immunity — league stayed unchanged
