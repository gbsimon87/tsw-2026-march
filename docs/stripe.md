# Stripe setup and launch guide

This is the one Stripe guide for this project. If another document disagrees
with this file, this file wins.

Think of Stripe as the till in a shop. The app tells Stripe what the customer
wants to buy. Stripe takes the card payment. Stripe then sends the app a signed
message called a **webhook**. The app trusts that signed message, not the page
the customer sees after paying.

## The prices we chose

All prices are monthly and in US dollars.

| What the customer gets          |      Price |      Free trial | Important rule                                                                           |
| ------------------------------- | ---------: | --------------: | ---------------------------------------------------------------------------------------- |
| First standalone Team           |       Free | No trial needed | One free Team per owner                                                                  |
| Each additional standalone Team |   $5/month |              No | Each Team has its own subscription and may be in a completely different real-life league |
| League                          |  $29/month |         14 days | One TSW League with up to 10 active teams                                                |
| League Plus                     |  $49/month |         14 days | One TSW League with 11–24 active teams                                                   |
| More than 24 teams              | Contact us |               — | Do not promise a price in the app                                                        |

A Team and a TSW League are separate things:

- Paying $5 makes one additional standalone Team manageable.
- Paying for a League makes one TSW League manageable.
- A customer can own several TSW Leagues. Each League needs its own League
  subscription.
- Teams inside a paid League do not need separate $5 subscriptions.
- Every current Team feature is available to every Team. Payment buys extra
  management capacity, not extra feature buttons.
- If one standalone game uses two Teams owned by the same person, both Teams
  must have management capacity. The free Team cannot unlock the second Team.

When a League reaches 10 active teams, the owner must upgrade before adding
team 11. The upgrade happens now and Stripe calculates the part-month price.
League Plus stops at 24 teams. A League Plus owner can schedule a downgrade to
League only after archiving teams until 10 or fewer remain. The lower price
starts at the next billing date.

## What happens when payment stops

- Choosing **cancel** in Stripe keeps the subscription working until the end of
  the already-paid month.
- At the end of that month, the Team or League becomes read-only.
- Saved games, players, standings, pages, and exports stay visible.
- A failed renewal changes the resource to `past_due` and management stops.
- An expired, incomplete, or failed Checkout never grants management.
- Paying again restores management after Stripe sends a valid active
  subscription webhook.
- The owner can move their one free-Team slot to another Team, but only after
  that Team's old paid subscription has fully closed.

The three Leagues that already exist in production are special. The migration
in this guide marks every pre-launch League as complimentary (`billingSource:
'comp'`). They keep working and Stripe does not bill them. Stop the migration
if the dry run does not show exactly the production data you expect.

## Honest readiness status

Status checked on 24 August 2026.

| Place                        | Status            | Meaning                                                                                                                                                                                         |
| ---------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local development            | **Code ready**    | Without a Stripe key, local League creation is complimentary. With the complete sandbox configuration, local Team and League Checkout both use Stripe test mode.                                |
| Deployed development/testing | **Not ready yet** | You must create the three sandbox Prices, add the sandbox Render values, create the sandbox webhook, run the migration on the development database, and complete the test checklist below.      |
| Production                   | **Not ready**     | Live Products/Prices, live Render values, the live webhook, a production backup and migration, a controlled live purchase, and the deliberate production pricing-page launch are still missing. |

No real Stripe account or Render dashboard was changed by the code work. No
real payment has been made. That is why production is not yet ready for real
customers.

## The nine server environment variables

Add all nine together on Render. A half-finished deployed setup makes the API
refuse to start.

Local development is the one exception. `NODE_ENV=development` is allowed to
start while Stripe is missing or still has old Price variables. The first Team
and local complimentary Leagues still work, but paid Checkout says billing is
not configured until all nine current values below are present. Both Render
APIs use `NODE_ENV=production`, so this exception cannot weaken a deployment.

| Variable                                 | What to put in development                                                       | What to put in production                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                      | Test secret key beginning `sk_test_` or test restricted key beginning `rk_test_` | Live secret key beginning `sk_live_` or live restricted key beginning `rk_live_` |
| `STRIPE_WEBHOOK_SECRET`                  | Test endpoint secret beginning `whsec_`                                          | Live endpoint secret beginning `whsec_`                                          |
| `STRIPE_PRICE_ID_ADDITIONAL_TEAM`        | Test $5 Price ID beginning `price_`                                              | Live $5 Price ID beginning `price_`                                              |
| `STRIPE_PRICE_ID_LEAGUE`                 | Test $29 Price ID beginning `price_`                                             | Live $29 Price ID beginning `price_`                                             |
| `STRIPE_PRICE_ID_LEAGUE_PLUS`            | Test $49 Price ID beginning `price_`                                             | Live $49 Price ID beginning `price_`                                             |
| `STRIPE_PORTAL_CONFIGURATION_ID`         | Test portal configuration beginning `bpc_`                                       | Live portal configuration beginning `bpc_`                                       |
| `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID` | Test upgrade-only portal configuration beginning `bpc_`                          | Live upgrade-only portal configuration beginning `bpc_`                          |
| `STRIPE_SUCCESS_URL`                     | Development client URL plus `/billing/success`                                   | Production client URL plus `/billing/success`                                    |
| `STRIPE_CANCEL_URL`                      | Development client URL plus `/billing/cancel`                                    | Production client URL plus `/billing/cancel`                                     |

Examples of the URL shape only:

```text
https://YOUR-DEV-CLIENT.example.com/billing/success
https://YOUR-DEV-CLIENT.example.com/billing/cancel
```

Do not copy those example names. Use the real client address. The success and
cancel URLs must use the same origin as `CLIENT_ORIGIN`.

Never put a Stripe secret in the client, in a `VITE_...` variable, in Git, or in
a screenshot. Test and live values are different. Render development must use
test values. Render production must use live values. The API checks this using
`APP_ENV` and stops if the modes are mixed.

## Part 1: local development with a Stripe sandbox

### A. Make the sandbox Products and Prices

1. Sign in to the [Stripe Dashboard](https://dashboard.stripe.com/).
2. Click the account picker, then **Switch to sandbox**. Open your development
   sandbox. If you do not have one, click **Create sandbox**, name it **TSW
   Development**, choose **Create an account from scratch**, and click **Create
   sandbox**.
3. Check for the sandbox banner at the top. Do not continue unless you are in
   the sandbox.
4. Open **More → Product catalog**.
5. Create a Product called **Additional Team**.
6. Give it one recurring Price: **$5 USD every month**.
7. Create a separate Product called **League**.
8. Give it one recurring Price: **$29 USD every month**.
9. Create a separate Product called **League Plus**.
10. Give it one recurring Price: **$49 USD every month**.
11. Do not put a trial on the Prices. The app adds the 14-day League trial.
12. Copy each `price_...` ID into the matching environment variable.

Separate Products make the Billing Portal and receipts easier to understand.
Do not reuse an old Team Pro or season Price.

### B. Add the local values and make the safe Billing Portal

1. Open `env/server/.env.development`.
2. Add the sandbox restricted key, the three sandbox Price IDs, and the success
   and cancel URLs from the table above. The portal ID and local webhook secret
   are added in the next steps.
3. Delete retired variables such as `STRIPE_PRICE_ID_PRO_MONTHLY`,
   `STRIPE_PRICE_ID_TEAM_MONTHLY`, `STRIPE_PRICE_ID_TEAM_SEASON`,
   `STRIPE_PRICE_ID_LEAGUE_MONTHLY`, and `STRIPE_PRICE_ID_LEAGUE_SEASON`. The app
   ignores them, but removing them prevents copying an old ID by mistake.
4. For normal local work, use:

```text
STRIPE_SUCCESS_URL=http://localhost:5173/billing/success
STRIPE_CANCEL_URL=http://localhost:5173/billing/cancel
```

6. From the repository root, run:

```bash
pnpm --filter server stripe:create-portal-config
```

7. The command checks that the Prices really are $5, $29, and $49 USD monthly.
   It then prints two lines beginning `STRIPE_PORTAL_CONFIGURATION_ID=bpc_` and
   `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=bpc_`.
8. Copy both whole lines into `env/server/.env.development`.
9. Start the app with `pnpm dev`.

Your first standalone Team is free. Create a second Team to see the $5 test
Checkout. When no Stripe key exists, local League creation is complimentary so
ordinary development is not blocked. When the complete sandbox configuration
exists, local League Checkout uses Stripe test mode too.

## Part 2: test webhooks locally

You need the Stripe CLI for this part.

1. Install the Stripe CLI from Stripe's official instructions.
2. Run `stripe login`. In the browser Stripe opens, choose **TSW Development**
   and click **Allow access**.
3. Make sure the local API is running on port 4000.
4. In another terminal, run:

```bash
pnpm --filter server stripe-listen
```

5. The CLI prints a secret beginning `whsec_`.
6. Put that secret in `STRIPE_WEBHOOK_SECRET` in
   `env/server/.env.development`.
7. Restart the API.

The endpoint is:

```text
http://localhost:4000/api/v1/billing/webhooks
```

Listen for these events when creating a Dashboard endpoint:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.trial_will_end
invoice.paid
invoice.payment_failed
invoice.finalization_failed
```

The server verifies Stripe's signature against the untouched raw request body.
A missing, fake, or wrong signature is rejected. Repeated webhook deliveries
are safe and do not apply the same change twice.

## Part 3: set up the development deployment

Do this before touching live mode.

### A. Render development API

1. Open Render.
2. Open **tsw-2026-march-api-dev**.
3. Open **Environment**.
4. Confirm `APP_ENV=development` and `NODE_ENV=production`.
5. Add the nine Stripe variables.
6. Use only `sk_test_...`/`rk_test_...`, test `price_...` IDs, and a test
   `whsec_...`.
7. Set success and cancel URLs to the real development client address.
8. Save and redeploy the API.
9. Confirm `/api/v1/health` works.

### B. Stripe sandbox webhook for Render

1. In Stripe, open **TSW Development** and check for the sandbox banner.
2. Open **Workbench → Webhooks**.
3. Add this endpoint, using the real development API address:

```text
https://dev-api.thesportyway.com/api/v1/billing/webhooks
```

4. Click **Create new destination**, choose the latest API version, and choose
   **Events on your account**.
5. Search for and select exactly these 11 events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.trial_will_end
invoice.paid
invoice.payment_failed
invoice.finalization_failed
```

6. Check that Stripe says **11 events selected**, then click **Continue**. Do not
   select **All events**.
7. Select **Webhook** and enter the endpoint URL.
8. Use `TSW development billing webhook` as the destination name.
9. Use `Stripe sandbox billing events for dev-api.thesportyway.com` as the
   description, then click **Create destination**.
10. Reveal its signing secret.
11. In the development Render API, set the environment variable named
    `STRIPE_WEBHOOK_SECRET` to that destination's `whsec_...` value.
12. Redeploy again.
13. Open the destination's **Event deliveries** tab and confirm deliveries show
    **Delivered** with HTTP `200`.

A local CLI `whsec_...` is not the Render webhook secret. Every endpoint has
its own secret.

### C. Prepare the development database

Back it up first. The development API uses Render's Free instance type, which
does not include Shell access. Open the service's **Settings** page, find
**General → Instance Type**, click **Update**, select **Starter**, and click
**Save Changes**. Wait for the paid instance deploy to succeed, then open the
service's **Shell** page and run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --dry-run
```

Read every number. If it looks wrong, stop. If it looks right, run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js
```

The script stops if it finds an open Stripe-backed Team or League subscription.
That is protection, not a bug. Review those subscriptions by hand before doing
anything else. Render bills the temporary Starter instance for the time it is
active. After migration and testing, you may return to **Settings → General →
Instance Type**, select **Free**, and save again.

## Part 4: test a successful payment

Use the **TSW Development** Stripe sandbox only.

### Additional Team

1. Sign in as a normal test user.
2. Create the first Team. Confirm it is labelled **Free Team** and can be edited.
3. Create a second Team. Confirm its saved data is visible but management asks
   for the $5 subscription.
4. Open Pricing and choose the second Team.
5. Click the subscribe button.
6. In Stripe Checkout use card `4242 4242 4242 4242`, any future date, any CVC,
   and any postcode.
7. Finish Checkout.
8. Confirm the success page becomes active after the webhook arrives.
9. Edit the Team, add a player, create and track a game, view replay and shot
   maps, and export CSV.
10. In Stripe, confirm the customer, $5 subscription, invoice, and metadata all
    point to that exact Team.

### League and League Plus

1. On the deployed development site, choose **League**.
2. Complete Checkout with `4242 4242 4242 4242`.
3. Confirm Stripe shows a 14-day trial and a saved payment method.
4. Finish League setup.
5. Add 10 teams. Confirm all League and Team features work.
6. Try to add team 11. Confirm the app requires League Plus first.
7. Choose League Plus. Confirm Stripe shows an immediate prorated change before
   you approve it.
8. Approve it, wait for the webhook, and add team 11.
9. Continue to 24 teams. Confirm team 25 is blocked and tells you to contact us.
10. Start another TSW League and confirm it gets its own subscription. Its teams
    do not change the first League's count.

## Part 5: test cancellation, failure, and awkward cases

Do every item inside the **TSW Development** Stripe sandbox.

### Cancel at the end of the month

1. Open **Manage billing** in the app.
2. Cancel in Stripe's portal.
3. Confirm Stripe says it will cancel at the period end.
4. Confirm management still works before that date.
5. Use a Stripe test clock or end the test subscription in Stripe.
6. Confirm the webhook changes the subscription to `canceled`.
7. Confirm saved data and public pages still work.
8. Confirm edits, new games, roster changes, and League administration now get
   blocked.

### Failed payment

1. Use Stripe's test card `4000 0000 0000 0341` for a test renewal scenario.
2. Confirm Stripe sends `invoice.payment_failed`.
3. Confirm the app records `past_due`, emails the billing address when email is
   configured, and stops management.
4. Fix the payment method in the portal.
5. Pay the invoice.
6. Confirm `invoice.paid` and the subscription webhook restore management.

### Other important checks

1. Start Checkout and press Back or Cancel. Confirm no access is granted.
2. Let a Checkout Session expire. Confirm no access is granted.
3. Send an async-payment-failed event. Confirm no access is granted.
4. Send the same webhook twice. Confirm the second delivery changes nothing.
5. Send a webhook with a bad signature. Confirm the API rejects it.
6. Try a Price ID from the wrong Product. Confirm access fails closed.
7. Cancel a subscription, then send an older paid event. Confirm it does not
   reopen the canceled resource.
8. Try another League trial with an owner who already used one. Confirm there is
   no second trial.
9. Try moving the free-Team slot to an actively subscribed Team. Confirm the app
   says to cancel that subscription first.
10. Archive League Plus teams down to 10, request League, and confirm the
    downgrade is scheduled for the next billing date. Confirm League Plus works
    until then.

## Part 6: set up production in Stripe live mode

Do not start this until every development test above passes.

1. In the account picker, leave the sandbox and open the live account. Check
   that no sandbox banner is visible.
2. Open **More → Product catalog** and create three new live Products:
   **Additional Team**, **League**, and
   **League Plus**.
3. Create one live monthly Price for each: $5, $29, and $49.
4. Do not add trials to the Prices.
5. Copy the three new live `price_...` IDs. Test Price IDs do not work in live
   mode.
6. Create the locked-down live Customer Portal configuration with the setup
   command in the manual checklist below.
7. Keep the old Team Pro/season Prices archived when they are no longer needed.
   Do not delete or repurpose them while checking historical data.

## Part 7: configure the production webhook

1. Keep Stripe in live mode.
2. Open **Workbench → Webhooks**.
3. Add this endpoint using the real production API address:

```text
https://YOUR-PRODUCTION-API.example.com/api/v1/billing/webhooks
```

4. Click **Create new destination**, select the latest API version, choose
   **Events on your account**, and select the same 11 events listed earlier.
5. Select **Webhook**, enter the URL, and click **Create destination**.
6. Reveal and copy its live `whsec_...`.
7. Do not use the development webhook secret.

## Part 8: add production values in Render

1. Open **tsw-2026-march-api-prod** in Render.
2. Confirm `APP_ENV=production` and `NODE_ENV=production`.
3. Add all nine Stripe variables.
4. Use only the live secret/restricted key, live Price IDs, live webhook secret,
   and production client URLs.
5. Save the values.
6. Do not deploy the public pricing page yet.

## Part 9: protect and migrate production data

1. Make a verified MongoDB backup. Follow
   [`mongodb-production-backup.md`](./mongodb-production-backup.md).
2. Open a production Render Shell.
3. Run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --dry-run
```

4. Confirm it shows the expected Team owners and exactly the three existing
   production Leagues.
5. Confirm it finds no unexpected open Stripe subscriptions.
6. If anything is surprising, stop and do not run the real command.
7. If everything is right, run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js
```

8. Check all three old Leagues in the app. They must still be editable and show
   complimentary/grandfathered billing.
9. Check each existing owner has exactly one free standalone Team.

The script makes the oldest Team for each owner free. Other existing standalone
Teams become read-only paid-capacity Teams until subscribed. If that is wrong
for a particular owner, stop after the dry run and decide which Team should be
free before running the real migration.

## Part 10: make one controlled live payment

1. Deploy the production API with Stripe configured while `/pricing` is still
   hidden.
2. Use a controlled production account.
3. Temporarily reach the flow only in a deliberate private test deployment, or
   use the final pricing-page change immediately before this check.
4. Buy one $5 Additional Team with a real card.
5. Confirm Checkout, webhook delivery, database state, receipt, portal, and Team
   management all work.
6. Cancel the subscription, verify the end-of-period state, and refund the test
   charge if appropriate from Stripe.
7. Repeat with one League trial. Confirm the exact League gets access.
8. Only after both work should you remove the production redirect at
   `client/src/app/router/AppRouter.jsx` for `/pricing` and deploy the client.

Removing that redirect is a launch decision. It is intentionally not part of
this code change.

## Moving safely from a sandbox to live mode

Use this order:

1. Finish every sandbox check.
2. Create new live Products and Prices.
3. Create a new live webhook endpoint.
4. Put only live values in the production Render API.
5. Back up production.
6. Dry-run and run the production migration.
7. Deploy the API while Pricing is hidden.
8. Make controlled live purchases.
9. Check the three grandfathered Leagues.
10. Enable the production Pricing route.
11. Watch Stripe webhook failures, Render errors, payment-failure emails, and
    the first real subscriptions closely.

Never reuse a sandbox Price ID in live mode. Stripe can copy a sandbox Product
to live mode, but the copy is a separate live object with a new live Price ID.
Always copy the new live `price_...` ID.

## What the code now does

- Uses Stripe-hosted Checkout and Billing Portal pages.
- Uses monthly subscription Prices only.
- Gives a 14-day trial to League owners only, once per owner.
- Stores billing on the exact Team or League, not just on the user.
- Gets the plan from the real Stripe Price ID instead of trusting browser data.
- Uses signed raw-body webhooks as the authority for access.
- Handles completed, async, expired, created, updated, deleted, paid, failed,
  finalization-failed, and trial-ending events.
- Re-reads current Stripe subscription state for update events, so old webhook
  delivery cannot overwrite newer state.
- Makes webhook processing idempotent.
- Rejects unsafe Stripe redirect URLs and hides Stripe error details.
- Keeps complimentary/manual resources safe from Stripe events.
- Prevents two open Checkouts for the same resource.
- Lets cancellation run to the paid period end, then makes management read-only.
- Uses Stripe's confirmation flow for prorated League Plus upgrades.
- Uses a Subscription Schedule for next-period League downgrades.
- Enforces 10- and 24-team limits in the API, not only in the browser.
- Keeps every current Team feature available at every tier.

## Final checklist

### Already completed before this pricing change

- [x] Stripe-hosted Checkout and Billing Portal integration existed.
- [x] Webhooks used the raw request body and signature verification.
- [x] Billing lived on individual Team and League resources.
- [x] Subscription status, cancellation date, trial date, and Stripe IDs were
      stored.
- [x] Webhook replay protection and safe redirect validation existed.
- [x] Failed-payment and trial-ending email hooks existed.

### Completed during this task

- [x] Replaced Team Pro and season pricing with the four-part capacity model.
- [x] Made the first standalone Team free and each additional Team $5/month.
- [x] Removed the Team trial and kept a one-time 14-day League trial.
- [x] Added League $29 for 1–10 teams and League Plus $49 for 11–24 teams.
- [x] Added immediate confirmed upgrades and next-period downgrades.
- [x] Added a locked-down Portal configuration so the ordinary portal cannot
      bypass the app's downgrade rules.
- [x] Added API enforcement at teams 11 and 25.
- [x] Made canceled or unpaid paid-capacity resources read-only while preserving
      data and reads.
- [x] Removed all current Team feature gates.
- [x] Added the safe migration that grandfathers all pre-launch Leagues.
- [x] Updated Render's environment-variable contract.
- [x] Added and updated automated tests for price selection, trials, webhooks,
      access loss/restoration, upgrades, downgrades, free-Team movement, League
      limits, and the pricing UI.
- [x] Consolidated Stripe instructions into this file.

### Still requiring action from you

Follow these boxes from top to bottom. Do not skip ahead to live mode. Stripe's
Dashboard wording below was checked against Stripe's current documentation on
24 August 2026.

Stripe links normally open the account or sandbox you used most recently. Look
at the banner and account picker every time. A **sandbox** uses fake money. The
**live account** uses real money.

#### 1. Create and open the development sandbox

- [ ] Sign in at [dashboard.stripe.com](https://dashboard.stripe.com/).
- [ ] Click the account picker near the top-left of the Dashboard.
- [ ] Click **Switch to sandbox**.
- [ ] If **TSW Development** already exists, open it. Otherwise click **Create
      sandbox**.
- [ ] Enter `TSW Development` in **Name**.
- [ ] Choose **Create an account from scratch**. This keeps development changes
      away from the live account.
- [ ] Click **Create sandbox**.
- [ ] Check that Stripe shows a sandbox banner. Stop if it does not.

#### 2. Create the three sandbox Products and Prices

Do the next steps once for each row:

| Product name    | Price | Currency | Pricing model | Payment type | Billing period | Save this ID as                   |
| --------------- | ----: | -------- | ------------- | ------------ | -------------- | --------------------------------- |
| Additional Team |    $5 | USD      | Flat-rate     | Recurring    | Monthly        | `STRIPE_PRICE_ID_ADDITIONAL_TEAM` |
| League          |   $29 | USD      | Flat-rate     | Recurring    | Monthly        | `STRIPE_PRICE_ID_LEAGUE`          |
| League Plus     |   $49 | USD      | Flat-rate     | Recurring    | Monthly        | `STRIPE_PRICE_ID_LEAGUE_PLUS`     |

- [ ] While still inside **TSW Development**, click **More → Product catalog**.
- [ ] Click **+ Add product**.
- [ ] Enter the exact Product name from the table.
- [ ] A description is optional. Do not promise features or limits that are not
      in the price table at the top of this guide.
- [ ] Under pricing, choose **Flat-rate** and **Recurring**.
- [ ] Enter the amount from the table, choose **USD**, and choose **Monthly** as
      the billing period.
- [ ] Do not add a trial to the Price. The app adds the 14-day League trial.
- [ ] Leave tax settings at their current default for sandbox testing. Do not
      guess a Product tax code or turn on Stripe Tax as a production decision.
- [ ] Click **Add product**.
- [ ] Open the Product. In **Pricing**, click its monthly Price.
- [ ] Copy the ID beginning `price_`. Copy the **Price ID**, not the Product ID
      beginning `prod_`.
- [ ] Paste the ID into a temporary private password-manager note beside the
      matching variable name from the table.
- [ ] Repeat until Product catalog contains exactly these three new Products,
      each with one active monthly USD Price.

#### 3. Create the sandbox server key

Use a restricted key because it can do much less damage if it is ever exposed.

- [ ] Stay inside **TSW Development**.
- [ ] Open Stripe's [API keys page](https://dashboard.stripe.com/apikeys).
- [ ] Under **Restricted keys**, click **Create restricted key**.
- [ ] Choose to start with no permissions.
- [ ] Name it `TSW development Render API`.
- [ ] Give **Write** access to **Checkout Sessions**, **Customer Portal**, and
      **Subscriptions**. Stripe's current permission screen groups subscription
      schedule operations under **Subscriptions**; it does not show a separate
      **Subscription Schedules** row.
- [ ] Give **Read** access to **Prices**. The one-time setup command reads the
      Prices so it can catch a wrong amount.
- [ ] Leave unrelated permissions as **None**.
- [ ] Click **Create key** and complete Stripe's two-factor check.
- [ ] Copy the value beginning `rk_test_` immediately. Stripe might not show it
      again.
- [ ] Save it as `STRIPE_SECRET_KEY` in the same private note. Never put it in
      Git, client code, chat, email, analytics, or a screenshot.
- [ ] Later, if Stripe returns `403`, return to **API keys**, click the key's
      `⋯` menu, choose **View request logs**, and read which permission Stripe
      says is missing. Add only that permission and test again.

#### 4. Create the safe sandbox Customer Portal configuration

The app uses one locked-down configuration for normal Portal visits and a
separate upgrade-only configuration for the explicit League Plus confirmation
screen. This prevents the normal Portal from jumping around the app's team-count
and downgrade rules. The provided command makes both for you.

- [ ] On your computer, open `env/server/.env.development`.
- [ ] Put the sandbox `STRIPE_SECRET_KEY`, all three sandbox `price_...` values,
      and these local URLs in that file:

```text
STRIPE_SUCCESS_URL=http://localhost:5173/billing/success
STRIPE_CANCEL_URL=http://localhost:5173/billing/cancel
```

- [ ] Make sure `APP_ENV=development` is already in the file.
- [ ] From the repository root, run:

```bash
pnpm --filter server stripe:create-portal-config
```

- [ ] Stop if the command reports a wrong Price, currency, interval, Product, or
      key mode. Fix the Stripe Product or copied value; do not weaken the check.
- [ ] Copy both output lines, which look like this:

```text
STRIPE_PORTAL_CONFIGURATION_ID=bpc_REAL_SANDBOX_VALUE
STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=bpc_REAL_SANDBOX_UPGRADE_VALUE
```

- [ ] Paste both into `env/server/.env.development` and the private note holding
      your sandbox values.
- [ ] Run the command once more. Confirm it prints the same two `bpc_...` values
      instead of making more configurations.

This Portal lets customers update cards, see invoices, and cancel at the end of
the paid period. Its normal home page hides plan switching. The app can still
open Stripe's confirmation page for the one safe League Plus upgrade. The app
itself schedules a downgrade for the next billing date.

#### 5. Create the local webhook secret with Stripe CLI

This secret is only for your computer. Do not copy it to Render. The Render
webhook gets a different secret later.

- [ ] Install the Stripe CLI using Stripe's
      [official installation instructions](https://docs.stripe.com/stripe-cli).
- [ ] Open a terminal and run `stripe login`.
- [ ] When Stripe opens in your browser, choose **TSW Development**, check for
      the sandbox banner, and click **Allow access**.
- [ ] Return to the repository root in that terminal and run:

```bash
pnpm --filter server stripe-listen
```

- [ ] Leave that command running. It forwards Stripe sandbox events to:

```text
http://localhost:4000/api/v1/billing/webhooks
```

- [ ] Find the line that says **Your webhook signing secret is** and copy the
      value beginning `whsec_`.
- [ ] Open `env/server/.env.development` and add or replace this line:

```text
STRIPE_WEBHOOK_SECRET=whsec_REAL_VALUE_FROM_STRIPE_CLI
```

- [ ] Never reuse an older `whsec_...` value and never paste this secret into
      Git, chat, email, analytics, or a screenshot.
- [ ] Open a second terminal at the repository root and run `pnpm dev`. If the
      app was already running when you changed the environment file, restart it.
- [ ] Keep both `pnpm dev` and `stripe-listen` running while testing payments.
- [ ] If a later `stripe-listen` run prints a different secret, update
      `STRIPE_WEBHOOK_SECRET` and restart the app before testing again.

Do not complete a test Checkout without the listener. Stripe might accept the
test payment, but the app would not receive the signed event that grants or
removes access.

#### 6. Add the sandbox values to the development Render API

- [ ] Review and commit this branch, then merge it into the repository's `dev`
      branch so Render can deploy the new billing code.
- [ ] Wait for both development Render services to deploy successfully.
- [ ] Sign in to the [Render Dashboard](https://dashboard.render.com/).
- [ ] Open `tsw-2026-march-api-dev`. Be careful not to open the production API.
- [ ] Click **Environment** in the left pane.
- [ ] Confirm `APP_ENV` is `development` and `NODE_ENV` is `production`.
- [ ] Under **Environment Variables**, click **+ Add Environment Variable** for
      each of the eight rows below, or use **Add from .env**.

```text
STRIPE_SECRET_KEY=rk_test_VALUE_FROM_STEP_3
STRIPE_PRICE_ID_ADDITIONAL_TEAM=price_VALUE_FROM_ADDITIONAL_TEAM
STRIPE_PRICE_ID_LEAGUE=price_VALUE_FROM_LEAGUE
STRIPE_PRICE_ID_LEAGUE_PLUS=price_VALUE_FROM_LEAGUE_PLUS
STRIPE_PORTAL_CONFIGURATION_ID=bpc_VALUE_FROM_STEP_4
STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=bpc_UPGRADE_VALUE_FROM_STEP_4
STRIPE_SUCCESS_URL=https://YOUR-REAL-DEV-CLIENT/billing/success
STRIPE_CANCEL_URL=https://YOUR-REAL-DEV-CLIENT/billing/cancel
```

- [ ] Replace every example value. Do not include quote marks.
- [ ] Copy the development client origin from the existing `CLIENT_ORIGIN` value.
      Add `/billing/success` and `/billing/cancel` to make the two URLs.
- [ ] Do not save yet because the real development webhook secret is created in
      the next step. Keep Render open in a separate browser tab. The server
      requires all nine values together.

#### 7. Create the sandbox webhook for the development deployment

- [ ] Return to Stripe and make sure **TSW Development** and its sandbox banner
      are visible.
- [ ] Open **Workbench → Webhooks** or use Stripe's
      [Webhooks page](https://dashboard.stripe.com/webhooks).
- [ ] Click **Create new destination**.
- [ ] Select API version `2026-06-24.dahlia`, or a newer generally available
      version if Stripe clearly labels one as newer.
- [ ] Choose **Events on your account**. Do not choose connected-account events.
- [ ] Search for and select all 11 events below:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.trial_will_end
invoice.paid
invoice.payment_failed
invoice.finalization_failed
```

- [ ] Click **Continue**, choose **Webhook**, and click **Continue** again if
      Stripe shows a second page.
- [ ] Enter the real development API URL followed by the exact route:

```text
https://dev-api.thesportyway.com/api/v1/billing/webhooks
```

- [ ] Enter `TSW development billing webhook` as the destination name.
- [ ] Enter `Stripe sandbox billing events for dev-api.thesportyway.com` as the
      description.
- [ ] Click **Create destination**.
- [ ] Open the new destination, find **Signing secret**, and click **Reveal**.
- [ ] Copy the value beginning `whsec_`. This is not the API key and is not the
      local Stripe CLI secret.
- [ ] Return to Render and put this value in `STRIPE_WEBHOOK_SECRET`.
- [ ] Choose **Save, rebuild, and deploy** in Render.
- [ ] Wait for Render to show a successful deploy.
- [ ] Open `https://dev-api.thesportyway.com/api/v1/health` and confirm it
      responds.

#### 8. Verify the development webhook and database

- [ ] Back up the development database using
      [`mongodb-production-backup.md`](./mongodb-production-backup.md), but use
      the development `MONGO_URI` and `MONGO_DB_NAME` and name the archive
      `dev-...archive.gz`, not `prod-...archive.gz`.
- [ ] In Render, open `tsw-2026-march-api-dev`, click **Settings**, find
      **General → Instance Type**, and check its value.
- [ ] If it is **Free**, click **Update**, choose **Starter**, and click **Save
      Changes**. Render charges for the time the paid instance is active.
- [ ] Wait for that deploy to succeed. Render does not show **Shell** for Free web
      services.
- [ ] Open **Shell** and run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --dry-run
```

- [ ] Read every count. Stop if it shows an unexpected open Stripe subscription
      or unexpected Teams or Leagues.
- [ ] If the dry run is correct, run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js
```

- [ ] Make a sandbox Checkout from the deployed development app. This creates a
      real event shape without moving real money.
- [ ] In Stripe, open **Workbench → Webhooks**, open the development destination,
      and select **Event deliveries**.
- [ ] Confirm the Checkout and subscription deliveries show **Delivered** and
      HTTP `200`. If they show **Failed**, open the delivery and read the response
      before doing anything else.
- [ ] Complete every successful, canceled, failed, expired, duplicate-webhook,
      bad-signature, upgrade, downgrade, and access check in Parts 4 and 5.
- [ ] When migration and testing are finished, you may return to **Settings →
      General → Instance Type**, choose **Free**, and save. Wait for the downgrade
      deploy to succeed.
- [ ] Do not continue to live mode until every development check passes.

#### 9. Prepare the live Stripe account

- [ ] In Stripe's account picker, leave **TSW Development** and open the live
      account. Check that the sandbox banner has disappeared.
- [ ] If Stripe shows **Activate payments** or asks for account information,
      complete the business, owner, bank, customer-facing, and identity fields.
- [ ] Require two-factor authentication for Dashboard access. Prefer a passkey or
      authenticator app over SMS.
- [ ] Before taking real payments, decide with a qualified adviser whether and
      where you must register for sales tax, VAT, or GST. Do not turn on Stripe
      Tax until the needed registrations are active.

#### 10. Create the three live Products and Prices

- [ ] Open **More → Product catalog** in the live account.
- [ ] Create **Additional Team**, **League**, and **League Plus** again using the
      exact fields and amounts in step 2. You may instead open each sandbox
      Product and use **Copy to live mode** if Stripe shows that button.
- [ ] Do not add trials to the live Prices.
- [ ] Open each live Product and copy its new live `price_...` ID. Sandbox and
      live Price IDs are different even when Stripe copied the Product.
- [ ] Save the three new IDs beside their matching production variable names.
- [ ] Archive old Team Pro or season Products only after checking historical
      subscriptions. Do not delete or repurpose them.

#### 11. Create the live key and configure the live Customer Portal

- [ ] In the live account, open [API keys](https://dashboard.stripe.com/apikeys).
- [ ] Create a restricted key named `TSW production Render API` with the same
      permissions used in step 3.
- [ ] Complete two-factor verification and copy the `rk_live_...` value
      immediately.
- [ ] Store it as the production `STRIPE_SECRET_KEY`. Never paste it into the
      development Render service.
- [ ] On your computer, make a new ignored file named
      `env/server/.env.stripe-live.local`. Put only these real values in it:

```text
APP_ENV=production
STRIPE_SECRET_KEY=rk_live_REAL_VALUE
STRIPE_PRICE_ID_ADDITIONAL_TEAM=price_REAL_LIVE_VALUE
STRIPE_PRICE_ID_LEAGUE=price_REAL_LIVE_VALUE
STRIPE_PRICE_ID_LEAGUE_PLUS=price_REAL_LIVE_VALUE
STRIPE_SUCCESS_URL=https://YOUR-REAL-PRODUCTION-CLIENT/billing/success
```

- [ ] Replace every example. This file is ignored by Git, but still treat it as
      a secret and never share it.
- [ ] From the repository root, run:

```bash
ENV_FILE="$(pwd)/env/server/.env.stripe-live.local" pnpm --filter server stripe:create-portal-config
```

- [ ] Confirm the command validates the three live Prices and prints new live
      `STRIPE_PORTAL_CONFIGURATION_ID=bpc_...` and
      `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=bpc_...` values.
- [ ] Save both live `bpc_...` values privately. They are different from the
      sandbox configurations.
- [ ] Delete `env/server/.env.stripe-live.local` after you have safely added the
      live values to Render in step 13.

The sandbox Portal configurations do not work in live mode. This step creates
the matching locked-down and upgrade-only live configurations.

#### 12. Create the live production webhook

- [ ] Stay in the live account and open **Workbench → Webhooks**.
- [ ] Click **Create new destination**.
- [ ] Choose the same API version, **Events on your account**, and the same 11
      event types from step 7.
- [ ] Choose **Webhook**.
- [ ] Enter the real production API endpoint:

```text
https://YOUR-REAL-PRODUCTION-API/api/v1/billing/webhooks
```

- [ ] Name it `TSW production billing webhook` and click **Create destination**.
- [ ] Reveal and copy this destination's new `whsec_...` signing secret.
- [ ] Keep it separate from both the sandbox endpoint secret and the local CLI
      secret.

#### 13. Add the live values to the production Render API

- [ ] Merge the fully tested `dev` branch into `main`. Do not remove the
      production Pricing redirect yet.
- [ ] In Render, open `tsw-2026-march-api-prod`.
- [ ] Click **Environment**.
- [ ] Confirm `APP_ENV=production` and `NODE_ENV=production`.
- [ ] Set `STRIPE_SECRET_KEY` to the `rk_live_...` key.
- [ ] Put the three live `price_...` IDs in their three matching Price variables.
- [ ] Set `STRIPE_PORTAL_CONFIGURATION_ID` to the live `bpc_...` value from step 11. Do not use the sandbox `bpc_...` value.
- [ ] Set `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID` to the second live `bpc_...`
      value from step 11. Do not use the sandbox value.
- [ ] Set `STRIPE_WEBHOOK_SECRET` to the production destination's `whsec_...`
      signing secret.
- [ ] Set `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL` to the production client
      URLs.
- [ ] Recheck every value character by character. Never put `test`, `sandbox`, or
      a development hostname in a production Stripe value.
- [ ] Choose **Save, rebuild, and deploy**.
- [ ] Keep the production `/pricing` route hidden.
- [ ] Confirm the production API health endpoint responds after deployment.

#### 14. Protect and migrate production data

- [ ] Make and verify the MongoDB backup described in
      [`mongodb-production-backup.md`](./mongodb-production-backup.md).
- [ ] Open the production Render service's **Shell** and run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --dry-run
```

- [ ] Confirm the dry run shows exactly the three existing production Leagues
      you expect.
- [ ] Confirm it shows no unexpected open Stripe subscriptions.
- [ ] Confirm which existing Team becomes each owner's free Team.
- [ ] Stop if any name or count is surprising.
- [ ] Only when the dry run is correct, run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js
```

- [ ] Sign in to the app and open all three old Leagues.
- [ ] Confirm all three say complimentary/grandfathered and can still be edited.
- [ ] Confirm each existing owner has exactly one manageable free standalone
      Team.

#### 15. Prove the live path before opening Pricing

- [ ] Ask the developer to prepare either a private live-payment test path or the
      final one-line Pricing redirect removal. Do not create a Stripe Payment
      Link: it bypasses the app's Team/League metadata and is not a valid test of
      this integration.
- [ ] Use a controlled account and a real card to buy one $5 Additional Team.
- [ ] In Stripe, open **Workbench → Webhooks → production destination → Event
      deliveries** and confirm the live events are **Delivered** with HTTP `200`.
- [ ] In the app, confirm the exact paid Team becomes manageable. Check player
      edits, games, tracking, replay, shot maps, and CSV export.
- [ ] Open **Manage billing**, update the payment method, view the invoice, and
      schedule cancellation. Confirm access remains until the paid period ends.
- [ ] Refund the controlled charge from Stripe if appropriate, but remember that
      a refund does not automatically cancel a subscription.
- [ ] Repeat with one League. Confirm the 14-day trial appears and the exact
      League receives access.
- [ ] Test League to League Plus and confirm Stripe shows the prorated amount
      before approval.
- [ ] Test the ordinary Portal. Confirm it offers cards, invoices, and
      end-of-period cancellation, but does not offer plan switching. If plan
      switching appears, stop and leave production Pricing hidden.
- [ ] After every check passes, remove the production `/pricing` redirect in
      `client/src/app/router/AppRouter.jsx`, deploy the production client, and
      visit `/pricing` in a signed-out browser.
- [ ] Watch Stripe **Event deliveries**, Render logs, and the first real
      subscriptions closely after launch.

### Recommended improvements that are not launch blockers

- [ ] After successful live testing, review the restricted key's request logs,
      remove unused permissions, and add a Stripe access policy if Render has a
      suitable fixed egress address.
- [ ] Alert someone automatically when a production webhook returns an error.
- [ ] Add a scheduled Stripe-to-database reconciliation report.
- [ ] Automate a browser test against a Stripe sandbox in a protected test
      environment.
- [ ] Replace the hard-coded production Pricing redirect with a controlled
      launch feature flag.

## Final launch blockers

Stripe is **not ready for real customers yet**. The code is ready to be tested,
but these external blockers remain:

1. Sandbox Products, Prices, Portal, Render values, and webhook are not verified.
2. The development database migration and full manual sandbox checklist have
   not been completed.
3. Live Products, Prices, Portal, Render values, and webhook do not yet exist or
   have not been verified.
4. The production database has not been backed up and migrated to preserve the
   three current Leagues.
5. No controlled live payment has proved the complete real-money path.
6. The live tax and registration decision has not been recorded.
7. The production `/pricing` route is still deliberately hidden.

Do not market paid self-service until all seven blockers are closed.

## Official Stripe help

- [Build subscriptions with Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Test cards](https://docs.stripe.com/testing)
- [Customer Portal](https://docs.stripe.com/customer-management)
- [Subscription Schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules)
- [Stripe CLI](https://docs.stripe.com/cli)
- [Manage Stripe sandboxes](https://docs.stripe.com/sandboxes/dashboard/manage)
- [Manage Products and Prices](https://docs.stripe.com/products-prices/manage-prices)
- [Manage webhook destinations](https://docs.stripe.com/workbench/event-destinations)
- [Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)
- [Render environment variables](https://render.com/docs/configure-environment-variables)
- [Render Shell access](https://render.com/docs/ssh)
