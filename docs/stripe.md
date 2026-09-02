# Stripe setup and launch guide

This is the one Stripe guide for this project. If another document disagrees
with this file, this file wins.

Think of Stripe as the till in a shop. The app tells Stripe what the customer
wants to buy. Stripe takes the card payment. Stripe then sends the app a signed
message called a **webhook**. The app trusts that signed message, not the page
the customer sees after paying.

## The prices we chose

All prices are monthly and in pounds sterling (GBP).

| What the customer gets          |      Price |      Free trial | Important rule                                                                           |
| ------------------------------- | ---------: | --------------: | ---------------------------------------------------------------------------------------- |
| First standalone Team           |       Free | No trial needed | One free Team per owner                                                                  |
| Each additional standalone Team |   £5/month |              No | Each Team has its own subscription and may be in a completely different real-life league |
| League                          |  £29/month |         14 days | One TSW League with up to 10 active teams                                                |
| League Plus                     |  £49/month |         14 days | One TSW League with 11–24 active teams                                                   |
| More than 24 teams              | Contact us |               — | Do not promise a price in the app                                                        |

A Team and a TSW League are separate things:

- Paying £5 makes one additional standalone Team manageable.
- Paying for a League makes one TSW League manageable.
- A customer can own several TSW Leagues. Each League needs its own League
  subscription.
- Teams inside a paid League do not need separate £5 subscriptions.
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

Status checked on 2 September 2026.

| Place                        | Status              | Meaning                                                                                                                                                                      |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local development            | **Code ready**      | The code now requires GBP. The sandbox Price IDs and Portal configuration must be updated from USD to GBP before the next paid test.                                         |
| Deployed development/testing | **Update required** | Replace the three sandbox USD Price IDs with new GBP Price IDs, regenerate the Portal configuration, deploy, and repeat the final development gate.                          |
| Production                   | **Not ready**       | The GBP and no-VAT-launch decisions are recorded. Live Products/Prices, live Render values, the live webhook, a production backup and migration, and a live purchase remain. |

The owner has configured the development Stripe sandbox and development Render
service. Its existing Prices were created under the earlier USD plan and must be
replaced with GBP Prices. No live Stripe configuration or verified real payment
has been completed. That is why production is not yet ready for real customers.

## Production setup: start here

This is the short, beginner-friendly path from the working development setup to
real payments. Complete the boxes in order. Parts 1–5 later in this document are
the detailed development and troubleshooting reference; you do not need to
repeat them if the final development gate below passes.

You will work in three places:

- **Stripe live account**: creates the things that take real money.
- **Render production API**: holds the private live values used by the server.
- **This repository**: stays on `dev` until the controlled launch. Production
  Render deploys `main` and development Render deploys `dev`.

Never paste a real `rk_live_...`, `sk_live_...`, or `whsec_...` value into this
document, Git, a screenshot, chat, email, or any client-side `VITE_...`
variable. Store them in a password manager until they are in Render. If a secret
is ever exposed, roll it immediately in Stripe and replace it in Render.

### Step 0: record the two business decisions

#### A. Charging currency: decided

On 2 September 2026, the owner chose **British pounds sterling (GBP)** for the
primarily UK customer base. The app, UI, tests, and setup command now require:

| Product         | Current live price to create |
| --------------- | ---------------------------: |
| Additional Team |                 £5 GBP/month |
| League          |                £29 GBP/month |
| League Plus     |                £49 GBP/month |

- [x] Charge customers in GBP and show the pound sign (`£`) in the app.
- [x] Keep the same numeric prices: £5, £29, and £49 per month.

Do not create USD Prices for this launch. Stripe Price currencies cannot be
edited after creation, so an accidental USD Price must be replaced by a new GBP
Price ID. See Stripe's guide to
[managing Prices](https://docs.stripe.com/products-prices/manage-prices).

#### B. Tax/VAT launch setting: decided

Company registration and VAT registration are different. The current Checkout
code does **not** enable Stripe Tax and therefore does not automatically add or
collect VAT, sales tax, or GST.

- [x] On 2 September 2026, the owner confirmed that this is a new UK company,
      it is not VAT registered, and its turnover is below the thresholds stated
      in its government registration email.
- [x] Launch with Stripe Tax and automatic tax **off** because the business has
      no active VAT or other indirect-tax registration to record in Stripe.
- [ ] Monitor taxable turnover and review the VAT position regularly, before
      approaching a threshold, and before materially expanding sales outside the
      UK. Ask an accountant or tax adviser when the position changes.

The current UK registration threshold and special cases remain governed by
[HMRC's VAT guidance](https://www.gov.uk/register-for-vat), not this document.
If the company later becomes VAT registered, stop before the effective date and
request the tax integration change. Adding a
[Stripe Tax registration](https://docs.stripe.com/tax/registering) records a
registration you already have; it does not register the company with HMRC.

### Step 1: do one final development gate

Stripe does not let you edit the currency of an existing Price. Update the
working sandbox from USD to GBP, then prove its essential path still works
before copying the pattern to live mode.

- [ ] In the **TSW Development** sandbox, open each of the existing Products:
      **Additional Team**, **League**, and **League Plus**.
- [ ] Add one new recurring, flat-rate, monthly GBP Price to each Product: £5,
      £29, and £49 respectively. Do not add a trial to the Prices.
- [ ] Copy the three new `price_...` IDs into the matching variables in
      `env/server/.env.development`.
- [ ] Run `pnpm --filter server stripe:create-portal-config` from the repository
      root. The command must accept all three GBP Prices and print two
      `bpc_...` Portal configuration IDs.
- [ ] Put the three new Price IDs and both printed Portal IDs into the
      development Render API. Keep its existing test key, webhook secret, and
      development success/cancel URLs unchanged.
- [ ] Save and redeploy the development API, then confirm its health endpoint.
- [ ] In `https://dev.thesportyway.com`, confirm Pricing displays £5, £29, and
      £49 rather than dollar prices.
- [ ] In `https://dev.thesportyway.com`, complete one sandbox Checkout with card
      `4242 4242 4242 4242`.
- [ ] Before confirming payment, check that Stripe Checkout says **GBP** and the
      amount is correct. Confirm no tax is being added.
- [ ] Confirm the exact Team or League becomes manageable.
- [ ] In the Stripe **TSW Development** sandbox, confirm the relevant webhook
      deliveries say **Delivered** and HTTP `200`.
- [ ] Open **Manage billing** and confirm the sandbox Customer Portal opens.
- [ ] Confirm the development tests in Parts 4 and 5 have no unresolved launch
      blocker. If you are not sure whether they were completed, run them before
      continuing.
- [ ] After the GBP flow passes, archive the old USD sandbox Prices so nobody
      copies them into Render later. Do not delete the Products.

### Step 2: activate and secure the Stripe live account

These are Dashboard actions that only you, as the business owner, can complete.
Stripe might use slightly different button wording as its Dashboard evolves.

- [ ] Sign in to [Stripe](https://dashboard.stripe.com/) and use the account
      picker to open the **live account**, not **TSW Development**.
- [ ] Check that there is no sandbox/test banner.
- [ ] If Stripe shows **Activate payments**, open it and complete every requested
      item. Use the UK company's exact Companies House details.
- [ ] Be ready to provide the registered company name and number, registered and
      trading addresses, business activity and website, directors/owners and
      their identity details, support contact details, and a company bank account
      for payouts. Only provide the subset Stripe asks for.
- [ ] Wait until the Dashboard no longer shows an activation or verification
      requirement that blocks payments or payouts. Respond to any verification
      request before launch.
- [ ] In **Settings → Team and security**, enable two-factor authentication.
      Prefer a passkey, security key, or authenticator app; avoid SMS when
      possible.
- [ ] In public business details, enter the customer-facing business name,
      website, support email, and support phone/address you are comfortable
      customers seeing.
- [ ] Set a recognisable statement descriptor, for example a short form of
      `THE SPORTY WAY`. Stripe requires 5–22 characters and has character rules.
      A recognisable name helps prevent customer disputes.
- [ ] Add and double-check the production payout bank account. A wrong account
      number can send payouts to the wrong place.
- [ ] Choose a payout schedule you understand. Daily automatic payouts are the
      simplest default; changing the schedule does not make funds settle faster.
- [ ] In **Settings → Branding**, add the real logo/icon and brand colours.
- [ ] In Checkout/public settings, add the production support, privacy-policy,
      terms, cancellation, and refund links. Confirm those pages are publicly
      reachable.
- [ ] In the live **Payment methods** settings, confirm cards are enabled. The
      app lets Stripe choose eligible methods dynamically. Do not enable an
      unfamiliar delayed payment method for launch until its success and failure
      flow has passed in the sandbox.
- [ ] In **Customer emails**, enable receipts for successful payments and the
      Billing emails you want customers to receive for failed or expiring
      payments. Send yourself a test email and check the business name, support
      details, and links.
- [ ] In your notification preferences, turn on at least successful-payment,
      failed-payment, dispute, and payout-failure notifications.
- [ ] Review Stripe's own
      [account checklist](https://docs.stripe.com/get-started/account/checklist).

### Step 3: create the three live Products and Prices

Remain in the live account and confirm there is still no sandbox banner.

For each row below, create one Product with one recurring, flat-rate, monthly
Price. Do not put a trial on the Price; the app adds the one-time 14-day League
trial itself.

| Product name    | Price           | Copy the `price_...` ID into      |
| --------------- | --------------- | --------------------------------- |
| Additional Team | £5 GBP monthly  | `STRIPE_PRICE_ID_ADDITIONAL_TEAM` |
| League          | £29 GBP monthly | `STRIPE_PRICE_ID_LEAGUE`          |
| League Plus     | £49 GBP monthly | `STRIPE_PRICE_ID_LEAGUE_PLUS`     |

- [ ] Open **More → Product catalog**.
- [ ] Click **+ Add product** and enter the exact first Product name.
- [ ] Choose **Recurring**, **Flat-rate**, **GBP**, and **Monthly**.
- [ ] Enter the matching amount and leave trials off.
- [ ] Save the Product, open its Price, and copy the ID beginning `price_`.
      Do not copy the Product ID beginning `prod_`.
- [ ] Save the ID beside the matching variable name in a private password-manager
      note.
- [ ] Repeat for all three rows.
- [ ] Reopen all three live Prices and verify the name, amount, GBP currency,
      monthly recurrence, and **Active** status.

You may use Stripe's **Copy to live mode** action on the sandbox Products, but
you must still copy the newly created live `price_...` IDs. Sandbox IDs cannot
be used in live mode. Do not delete or repurpose old Prices with subscription
history; archive them only after checking that history.

### Step 4: create the live restricted server key

This app uses Stripe-hosted Checkout, so it needs only a private server key. It
does **not** need a `pk_live_...` publishable key in the client.

- [ ] Open the live [API keys page](https://dashboard.stripe.com/apikeys).
- [ ] Under **Restricted keys**, choose **Create restricted key** and start with
      no permissions.
- [ ] Name it `TSW production Render API`.
- [ ] Give **Write** access to **Checkout Sessions**, **Customer Portal**, and
      **Subscriptions**.
- [ ] Give **Read** access to **Prices**.
- [ ] Leave unrelated permissions as **None**.
- [ ] Create the key, complete Stripe's security check, and immediately copy the
      value beginning `rk_live_` into the private note as
      `STRIPE_SECRET_KEY`. Stripe might not show it again.
- [ ] If the app later receives a Stripe `403`, inspect this key's request logs
      and add only the permission Stripe identifies. Do not replace it with the
      unrestricted account secret as a shortcut.

### Step 5: let the repository create the two safe live Portals

The script validates the live key and all three Prices, then makes one normal
Portal and one League-Plus-upgrade Portal. Run it from the current `dev` branch;
do not merge to `main` yet.

- [ ] In Render, open `tsw-2026-march-api-prod` and copy its existing
      `CLIENT_ORIGIN`. This is the production website origin, with no path.
- [ ] On your computer, create the ignored file
      `env/server/.env.stripe-live.local` with these lines, replacing every
      example value:

```text
APP_ENV=production
STRIPE_SECRET_KEY=rk_live_REPLACE_ME
STRIPE_PRICE_ID_ADDITIONAL_TEAM=price_REPLACE_ME
STRIPE_PRICE_ID_LEAGUE=price_REPLACE_ME
STRIPE_PRICE_ID_LEAGUE_PLUS=price_REPLACE_ME
STRIPE_SUCCESS_URL=https://YOUR-PRODUCTION-WEBSITE/billing/success
```

- [ ] Confirm the production website in `STRIPE_SUCCESS_URL` exactly matches one
      of the origins in production `CLIENT_ORIGIN`.
- [ ] From the repository root, run:

```bash
ENV_FILE="$(pwd)/env/server/.env.stripe-live.local" pnpm --filter server stripe:create-portal-config
```

- [ ] Stop and fix the copied value if the command reports a test key, wrong
      amount, wrong currency, non-monthly Price, reused Product, or other error.
- [ ] Copy the two printed lines into the private note:

```text
STRIPE_PORTAL_CONFIGURATION_ID=bpc_REPLACE_ME
STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=bpc_REPLACE_ME
```

- [ ] Run the same command once more and confirm it prints the same two IDs.
      That proves the safe configurations are being reused.
- [ ] Keep the temporary file only until the values are safely in Render. It is
      ignored by Git, but it still contains a real key.

The normal Portal allows payment-method updates, invoice history, and
end-of-period cancellation. It deliberately hides arbitrary plan switching so a
customer cannot bypass the app's Team-count rules. Do not replace it with a
manually configured general-purpose Portal.

### Step 6: create the live webhook destination

A webhook is Stripe's signed message to the production API. Without it, a card
can be charged while the app never grants access.

- [ ] In Render, open `tsw-2026-march-api-prod`, copy its public service URL, and
      confirm `/api/v1/health` works. This is the **API URL**, not the website
      `CLIENT_ORIGIN`.
- [ ] In Stripe, confirm once more that you are in the live account.
- [ ] Open **Workbench → Webhooks** and click **Create new destination**.
- [ ] Select API version **2026-06-24.dahlia**. Do not choose a newer version for
      this endpoint until the code has been tested against it.
- [ ] Choose **Events on your account**, not connected-account events and not
      **All events**.
- [ ] Select exactly these 11 events:

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

- [ ] Choose **Webhook** and enter the production API URL plus the exact path:

```text
https://YOUR-PRODUCTION-API/api/v1/billing/webhooks
```

- [ ] Name it `TSW production billing webhook` and create it.
- [ ] Open the destination, reveal its signing secret, and copy the new
      `whsec_...` value into the private note as `STRIPE_WEBHOOK_SECRET`.
- [ ] Keep it separate from both the development webhook secret and the local
      Stripe CLI secret.

It is normal for this destination to have no successful live deliveries yet.
The controlled real purchase in Step 9 proves it.

### Step 7: prepare the nine production Render values

Do not save a half-complete set. Prepare all nine values in the private note
first:

```text
STRIPE_SECRET_KEY=rk_live_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PRICE_ID_ADDITIONAL_TEAM=price_REPLACE_ME
STRIPE_PRICE_ID_LEAGUE=price_REPLACE_ME
STRIPE_PRICE_ID_LEAGUE_PLUS=price_REPLACE_ME
STRIPE_PORTAL_CONFIGURATION_ID=bpc_REPLACE_ME
STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=bpc_REPLACE_ME
STRIPE_SUCCESS_URL=https://YOUR-PRODUCTION-WEBSITE/billing/success
STRIPE_CANCEL_URL=https://YOUR-PRODUCTION-WEBSITE/billing/cancel
```

- [ ] Confirm every placeholder has been replaced and there are no quote marks.
- [ ] Confirm `STRIPE_SECRET_KEY` begins `rk_live_`, not `rk_test_` or `sk_test_`.
- [ ] Confirm all three `price_...` IDs came from the live Product catalog.
- [ ] Confirm both `bpc_...` IDs came from the live portal command.
- [ ] Confirm `STRIPE_WEBHOOK_SECRET` came from the live production destination.
- [ ] Confirm both URLs use an origin already present in production
      `CLIENT_ORIGIN`.
- [ ] In production Render, confirm `APP_ENV=production` and
      `NODE_ENV=production`.

Do not add a Stripe key to the production client service. All nine values belong
only to `tsw-2026-march-api-prod`.

### Step 8: controlled deploy, backup, and migration

Choose a quiet time when you can watch Stripe and Render for at least an hour.
Do not market or announce paid self-service yet.

- [ ] Run the repository secret scan:

```bash
pnpm check-secrets
```

- [ ] Confirm it says `Secret scan passed` before continuing.
- [ ] Review and commit the documentation/code on `dev` and let the development
      deployment complete.
- [ ] Merge the fully tested `dev` branch into `main`. Do not commit directly to
      `main`.
- [ ] Immediately before the migration, create and verify the production MongoDB
      backup in [`mongodb-production-backup.md`](./mongodb-production-backup.md).
- [ ] In the **production API** Render service, add all nine prepared values and
      choose **Save, rebuild, and deploy**.
- [ ] Wait for the API deployment to succeed and open its `/api/v1/health`
      endpoint. Stop if the service fails to start; the environment validation
      usually names the missing or mixed-mode value.
- [ ] Do **not** deploy the production client yet. This leaves the public paid
      entry point closed while the database is prepared.
- [ ] Open the production API's Render **Shell** and run the dry run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --dry-run
```

- [ ] Confirm it shows the expected Team owners, exactly the three known
      pre-launch production Leagues, the expected free Team for each owner, and
      no unexpected open Stripe subscriptions.
- [ ] If any name or count is surprising, **stop**. Save the output and do not
      run the real migration.
- [ ] If every line is correct, run the real migration once:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js
```

- [ ] In the production app, verify all three old Leagues are still editable and
      show complimentary/grandfathered billing.
- [ ] Confirm each existing owner has exactly one manageable free standalone
      Team.
- [ ] Now manually deploy `tsw-2026-march-client-prod` from `main`.
- [ ] Open `/pricing` while signed out and verify the four displayed options and
      GBP prices before proceeding.

The API must be deployed before the migration because the migration script is
part of that server release. The client is deliberately deployed afterward so
customers cannot start Checkout during the migration.

### Step 9: prove the real-money path

Do not use a Payment Link and do not use a Stripe test card. This must exercise
the app's live Checkout metadata and webhook flow.

- [ ] Use a controlled production account and a real card you are authorised to
      use.
- [ ] Create/select an Additional Team and buy the £5 GBP monthly subscription.
- [ ] Keep Stripe's live webhook destination and Render logs open while paying.
- [ ] In Stripe, confirm the relevant webhook deliveries say **Delivered** with
      HTTP `200`.
- [ ] In the app, confirm the exact Team becomes manageable and no other Team's
      access changes.
- [ ] Check that the Stripe Customer, Subscription, Invoice, and metadata all
      refer to that Team and owner.
- [ ] Open **Manage billing** and confirm payment-method update, invoice history,
      and end-of-period cancellation are available, but arbitrary plan switching
      is not.
- [ ] Schedule cancellation and confirm the Team remains manageable until the
      paid period ends. A refund does not cancel a subscription.
- [ ] Refund the controlled charge in Stripe if appropriate.
- [ ] Repeat with one League and confirm Checkout shows the 14-day trial, the
      exact League receives access, and a League-to-League-Plus upgrade shows the
      prorated amount before approval.
- [ ] If any charge succeeds but access is not granted, immediately stop the paid
      launch, hide or roll back the production Pricing client, preserve all logs,
      and do not ask the customer to pay again.

### Step 10: finish and monitor

- [ ] Delete the local `env/server/.env.stripe-live.local` file after confirming
      the values are safely stored in Render and the password manager.
- [ ] Run `pnpm check-secrets` again before pushing any final documentation
      updates.
- [ ] For the first week, check live webhook failures, disputes, failed invoices,
      Render errors, and subscriptions every day.
- [ ] Confirm the first payout appears in Stripe with the expected bank account
      and expected arrival date. New accounts can have a longer first-payout
      wait; the Dashboard is the source of truth.
- [ ] After successful live testing, inspect the restricted key's request logs
      and remove any permission that was not used.
- [ ] Subscribe the account owner to Stripe API/security announcements and keep
      the Stripe SDK and pinned webhook/API version under normal dependency
      review.

Production is ready for customers only when every box in Steps 0–9 is complete
and there is no unresolved tax, currency, account-verification, webhook,
migration, or live-purchase issue. Step 10 is the immediate post-launch routine.

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
| `STRIPE_PRICE_ID_ADDITIONAL_TEAM`        | Test £5 GBP Price ID beginning `price_`                                          | Live £5 GBP Price ID beginning `price_`                                          |
| `STRIPE_PRICE_ID_LEAGUE`                 | Test £29 GBP Price ID beginning `price_`                                         | Live £29 GBP Price ID beginning `price_`                                         |
| `STRIPE_PRICE_ID_LEAGUE_PLUS`            | Test £49 GBP Price ID beginning `price_`                                         | Live £49 GBP Price ID beginning `price_`                                         |
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
6. Give it one recurring Price: **£5 GBP every month**.
7. Create a separate Product called **League**.
8. Give it one recurring Price: **£29 GBP every month**.
9. Create a separate Product called **League Plus**.
10. Give it one recurring Price: **£49 GBP every month**.
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

7. The command checks that the Prices really are £5, £29, and £49 GBP monthly.
   It then prints two lines beginning `STRIPE_PORTAL_CONFIGURATION_ID=bpc_` and
   `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=bpc_`.
8. Copy both whole lines into `env/server/.env.development`.
9. Start the app with `pnpm dev`.

Your first standalone Team is free. Create a second Team to see the £5 test
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

Do these tests on **https://dev.thesportyway.com**, not on localhost. Sign in
with a normal development test account that does not own a paid Team or League.
If you reset the seeded development database, use the seeded normal user from
the development seed instructions. Otherwise, register a new test-only account
with an email address you control. Never use a real customer's account for these
tests.

### Additional Team

1. Sign in with that normal development test account.
2. Create the first Team. Confirm it is labelled **Free Team** and can be edited.
3. Create a second Team. Confirm its saved data is visible but management asks
   for the £5 subscription.
4. Open Pricing and choose the second Team.
5. Click the subscribe button.
6. In Stripe Checkout use card `4242 4242 4242 4242`, any future date, any CVC,
   and any postcode.
7. Finish Checkout.
8. Confirm the success page becomes active after the webhook arrives.
9. Edit the Team, add a player, create and track a game, view replay and shot
   maps, and export CSV.
10. In Stripe, confirm the customer, £5 subscription, invoice, and metadata all
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

This test checks a **renewal payment**, not merely a card being rejected on the
Checkout screen. Use a brand-new development user who has never started a
League trial. That is important because an owner gets only one League trial.

Stripe's card `4000 0000 0000 0341` can be saved to a customer, but Stripe
rejects any attempt to charge it. That makes it suitable for this test.

#### A. Start a League trial with a card that will fail later

1. Open **https://dev.thesportyway.com**.
2. Register or sign in with a fresh test-only user. Use an email address you
   control if you also want to check the payment-failed email.
3. Open **Pricing**.
4. Under **League**, click **Start 14-day trial**.
5. On Stripe Checkout, enter:
   - Card number: `4000 0000 0000 0341`
   - Expiry: any future date, such as `12/34`
   - CVC: any three digits
   - Postcode: any valid postcode
6. Complete Checkout. It should succeed because Stripe saves the card now but
   does not charge it until the trial ends.
7. Finish creating the League in TSW.
8. Confirm the League can be managed while its status is `trialing`.

#### B. Find the exact test subscription in Stripe

1. Open the Stripe Dashboard.
2. Use the account picker to open **TSW Development**.
3. Check that the sandbox/test banner is visible. Stop if you are in live mode.
4. In the left menu, open **Billing → Subscriptions**.
5. Search for the test user's email address.
6. Open the new League subscription.
7. Confirm all of these before continuing:
   - Status is **Trialing**.
   - The Product is **League**.
   - The amount after the trial is **£29 monthly**.
   - Metadata contains `resourceType=league`.
   - Metadata contains the expected `ownerUserId`.
   - For a purchase made for an existing League, metadata also contains its
     `leagueId`. A brand-new League purchase can leave `leagueId` empty because
     TSW creates that League after Checkout.
8. Copy the subscription ID beginning `sub_...`. Do not copy the customer ID
   beginning `cus_...`.

#### C. End the trial now so Stripe attempts payment

Do this in Stripe's browser-based Workbench. You do not need to paste an API key.

1. In Stripe, open **Workbench → Shell**.
2. Check again that **TSW Development** is the selected sandbox.
3. Replace `sub_REPLACE_ME` below with the subscription ID you just copied:

```bash
stripe subscriptions update sub_REPLACE_ME -d trial_end=now
```

4. Run the command once.
5. Return to **Billing → Subscriptions** and reopen the subscription.
6. Stripe may take up to about one hour to finalise the new invoice and attempt
   payment. Refresh the page until the invoice is open and its payment has
   failed. Do not run the command again.
7. Open **Workbench → Webhooks**.
8. Select the development destination named **TSW Development API**.
9. Open **Event deliveries** and refresh it.
10. Find `invoice.payment_failed`. Open it and confirm the delivery says
    **Delivered** with HTTP `200`.
11. Also find the related `customer.subscription.updated` delivery and confirm
    HTTP `200`.

#### D. Confirm TSW removes management access

1. Return to TSW and refresh the Pricing page.
2. In Stripe, confirm the subscription status is **Past due**. TSW does not need
   to display Stripe's raw status word, so the management check below is the
   important app test.
3. Open that League's Admin page.
4. Confirm its saved games, teams, standings, and public pages can still be
   viewed. A payment problem must not delete data.
5. Try a management action, such as adding a League team or creating a League
   game.
6. Confirm TSW blocks the action because the paid League is not active.
7. If `RESEND_API_KEY` is configured on the development API and the test user's
   email is deliverable, check that the payment-failed email arrives. If email
   is not configured, write down **email check blocked by development email
   setup**; do not mistake that for a Stripe webhook failure.

#### E. Fix the card and restore access

1. In TSW, open **Pricing** and select the failed League.
2. Click **Manage billing**. While payment needs attention, both League plan
   cards can show this button; either one opens the same customer portal.
3. In Stripe's Customer Portal, choose the option to update the payment method.
4. Replace the failing card with:
   - Card number: `4242 4242 4242 4242`
   - Expiry: any future date
   - CVC: any three digits
   - Postcode: any valid postcode
5. Save the new card and return to TSW.
6. In the Stripe Dashboard, open **Billing → Invoices**.
7. Open the failed invoice for this exact League and customer.
8. Click **Charge customer**. If Stripe instead labels the button **Retry
   payment**, use that button. Do not choose **Mark as paid**; that bypasses the
   card payment being tested.
9. Confirm the invoice becomes **Paid**.
10. In **Workbench → Webhooks → TSW Development API → Event deliveries**, confirm
    `invoice.paid` and the related `customer.subscription.updated` delivery both
    receive HTTP `200`.
11. Return to TSW and refresh Pricing. The page also refreshes billing state in
    the background for a few seconds after returning from Stripe.
12. Confirm the League is active again and the management action blocked in the
    previous section now works.

This test passes only if access is available before the failure, removed after
`invoice.payment_failed`, and restored after the real test invoice is paid.

### Other important checks

Do these one at a time. Use a clearly named test Team or League so you always
know which resource you are checking.

#### 1. Leave Checkout without paying

1. In TSW, create a new second Team that does not have a subscription.
2. Open Pricing, select that Team, and click **Subscribe for this team**.
3. When Stripe Checkout opens, do not enter a card.
4. Use Stripe's back link to return to TSW. If Stripe does not show one, use the
   browser Back button.
5. If TSW shows its cancellation page, confirm it says no payment was taken. If
   the browser returns directly to Pricing, continue with the access check below.
6. Open that Team's Admin page and try to edit it.
7. Confirm paid management was not granted.
8. In **Workbench → Events**, confirm there is no
   `checkout.session.completed` event for that Checkout Session.

#### 2. Expire an unfinished Checkout Session

Stripe normally leaves an unfinished Checkout Session open for 24 hours. This
test expires it immediately.

1. Start Checkout again for the same unpaid Team and leave the Checkout tab open.
2. In Stripe, open **Workbench → Logs** and click **Refresh logs**.
3. Open the newest successful `POST /v1/checkout/sessions` request.
4. In its response, copy the `id` beginning `cs_test_...`.
5. Open **Workbench → Shell**.
6. Replace `cs_test_REPLACE_ME` below with that ID and run the command once:

```bash
stripe checkout sessions expire cs_test_REPLACE_ME
```

7. Return to the Stripe Checkout tab and refresh it. Stripe should say the
   session expired and must not accept payment.
8. Open **Workbench → Webhooks → TSW Development API → Event deliveries**.
9. Confirm `checkout.session.expired` was delivered with HTTP `200`.
10. Return to TSW and confirm the Team is still unpaid and cannot be managed as
    an additional Team.

#### 3. Make a card fail on the Checkout screen

This is different from the failed-renewal test above.

1. Start Additional Team Checkout again.
2. Enter card `4000 0000 0000 0002`, any future date, any CVC, and any postcode.
3. Click the payment button.
4. Confirm Checkout displays a decline and does not show the TSW success page.
5. Return to TSW and confirm the Team still has no paid access.
6. Confirm there is no successful `checkout.session.completed` event for this
   attempt.

#### 4. Deliver the same real webhook twice

1. Complete one successful sandbox payment first.
2. In Stripe, open **Workbench → Events**.
3. Filter for `invoice.paid` and open the event for that exact Team or League.
4. Note the resource's current plan and access in TSW.
5. In the event's successful delivery attempt, click **Resend**. If you are
   looking at the destination's **Event deliveries** view, the equivalent button
   can be labelled **Retry now**.
6. Confirm the repeated delivery also returns HTTP `200`.
7. Refresh TSW and confirm nothing was duplicated: one subscription, one plan,
   and unchanged access. Stripe reuses the same event ID, so TSW ignores the
   already-processed change.

#### 5. Prove a fake webhook signature is rejected

Run this command in your computer's normal Terminal, not Stripe Workbench:

```bash
curl -i -X POST https://dev-api.thesportyway.com/api/v1/billing/webhooks \
  -H 'Content-Type: application/json' \
  -H 'Stripe-Signature: definitely-not-valid' \
  --data '{}'
```

The response must be HTTP `400`. HTTP `200` would be a launch blocker. This
request contains no secret and must not change any Team or League.

#### 6. Confirm an owner cannot receive a second League trial

1. Use the same development user who already completed a League trial Checkout.
2. Cancel that test subscription if it is still open.
3. In TSW, start another new League purchase.
4. Continue to Stripe Checkout.
5. Confirm Stripe asks for the first £29 or £49 payment now and does **not** show
   another 14-day trial.
6. You do not need to finish this payment. Return to TSW and confirm no new
   League access was granted.

#### 7. Confirm an active paid Team cannot become the free Team

1. Use an account with one free Team and one active £5 Additional Team.
2. Open Pricing and select the active Additional Team.
3. Click **Make this my free team**.
4. Confirm TSW refuses and tells you to cancel that Team's subscription first.
5. Confirm the original free Team is still free and the Additional Team still
   has exactly one subscription.

#### 8. Test the League Plus downgrade rule

1. Use a League Plus test League with 11 active teams.
2. Open Pricing, select that exact League, and click **Change to League**.
3. Confirm TSW blocks the downgrade and shows a link to manage/archive teams.
4. Follow the link to the League's **Teams** tab.
5. Archive one team. Confirm archived records remain saved and only 10 teams now
   count toward capacity.
6. Return to Pricing and click **Change to League** again.
7. Confirm the downgrade is scheduled for the next billing date rather than
   happening immediately.
8. Confirm League Plus remains active until that date.
9. In Stripe, open the subscription and confirm its schedule contains the League
   Price for the next phase.

#### 9. Checks you should not perform by deliberately breaking Render

Do **not** temporarily put a wrong Price ID or webhook secret into Render. That
can damage the shared development test state and does not imitate customer
behaviour.

Instead, verify each development Price safely:

1. In Render, copy one `STRIPE_PRICE_ID_...` value without changing it.
2. In the **TSW Development** Stripe sandbox, paste it into the Dashboard search.
3. Open the Price and confirm it is active, recurring monthly, and belongs to
   the expected Product:
   - Additional Team: £5 GBP
   - League: £29 GBP
   - League Plus: £49 GBP
4. Repeat for all three values.

Unknown Prices, repeated event IDs, bad signatures, and old paid events arriving
after cancellation are also covered by the automated billing tests. Those
malformed/out-of-order cases are safer and more accurate to test in code than by
editing a real Render service.

`checkout.session.async_payment_failed` only occurs for a delayed payment method,
such as a bank debit. A card decline does not produce that event. If Checkout
currently offers only cards, mark that one manual check **not applicable** and
leave the webhook event selected for future payment methods. Do not enable a new
payment method merely to complete this checklist.

Official references: [Stripe Billing failure testing](https://docs.stripe.com/billing/testing),
[Stripe test cards](https://docs.stripe.com/testing),
[Workbench events and retries](https://docs.stripe.com/workbench/overview), and
[expiring a Checkout Session](https://docs.stripe.com/api/checkout/sessions/expire).

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

## Recommended post-launch improvements

- [ ] After successful live testing, review the restricted key's request logs,
      remove unused permissions, and add a Stripe access policy if Render has a
      suitable fixed egress address.
- [ ] Alert someone automatically when a production webhook returns an error.
- [ ] Add a scheduled Stripe-to-database reconciliation report.
- [ ] Automate a browser test against a Stripe sandbox in a protected test
      environment.
- [ ] Add a controlled Pricing emergency-disable feature flag for faster rollback.

## Final launch blockers

Stripe is **not ready for real customers yet**. The code is ready to be tested,
but these external blockers remain:

1. The sandbox GBP Price/Portal update and final development gate in Step 1 have
   not been completed.
2. The live Stripe account, Products, Prices, restricted key, Portals, webhook,
   and nine Render values do not yet exist or have not been verified.
3. The production database has not been backed up and migrated to preserve the
   three current Leagues.
4. No controlled live payment has proved the complete real-money path.

Do not market paid self-service until all four blockers are closed.

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
