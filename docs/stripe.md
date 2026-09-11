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
team 11. The upgrade applies now. During a trial, the original trial end stays
unchanged and the first payment uses League Plus; after a paid period has
started, Stripe invoices the prorated difference. League Plus stops at 24 teams.
A League Plus owner can schedule a downgrade to League only after archiving
teams until 10 or fewer remain. The lower price starts at the next billing date.

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

Status checked on 11 September 2026.

| Place                        | Status                           | Meaning                                                                                                                                                                              |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local development            | **Production changes ready**     | The production audit added stricter environment checks, an exact migration preview, explicit trial-preserving upgrades, and mobile-visible billing feedback. Automated checks pass.  |
| Deployed development/testing | **Billing behavior passed**      | GBP Checkout, Portal management, webhooks, failure/recovery, cancellation, duplicate/signature handling, capacity limits, and all nine additional checks passed against the sandbox. |
| Production                   | **Ready to configure, not live** | No live Products/Prices, live restricted key, live Portals, live webhook, nine Render values, verified migration, or controlled real payment has been completed yet.                 |

The development Stripe behavior is accepted. Because the production audit made
the remaining-trial behavior explicit and improved mobile feedback after those
tests, Step 1 contains one small deploy-and-smoke gate for the current branch.
After that, do not repeat the full development checklist unless this gate fails.

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

### Today's route

Follow only Steps 0–10 in this section. Parts 1–5 later in the document are the
completed development evidence and troubleshooting reference, not work to repeat
today.

| Gate | What you finish                                                                             | Safe result                                                       |
| ---- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 0–1  | Business/policy decisions and the small development recheck                                 | No production changes yet                                         |
| 2–7  | Live Stripe account, Products, key, Portals, webhook, and nine prepared Render values       | Live objects exist, but the ordinary production UI remains closed |
| 8    | Tested commit, restorable backup, production API, guarded migration, then production client | Pricing becomes available only after the data and API are ready   |
| 9    | One controlled £5 purchase and one controlled League trial                                  | The complete real-money and trial paths are proved                |
| 10   | Remove temporary secrets and monitor                                                        | Launch remains supervised                                         |

Keep a private launch note with timestamps, the tested Git commit, non-secret
`price_...`/`bpc_...` IDs, webhook destination name, backup filename, and each
completed checkbox. Never put the restricted key or webhook signing secret in
that note unless it is an approved password-manager secure note.

At any **stop** instruction, leave the production API, webhook destination, and
existing subscriptions intact; fix the problem before continuing. After the
first live payment, never remove the server's Stripe values or disable its
webhook as a rollback. Existing customers still need lifecycle events processed.

### Step 0: finish the launch decisions and disclosures

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
- [ ] Create a recurring monthly finance reminder. At each check, record rolling
      12-month taxable turnover and review the VAT position before materially
      expanding sales outside the UK. As checked on 11 September 2026, HMRC
      requires registration when taxable turnover goes over £90,000 in the
      previous 12 months or is expected to exceed £90,000 in the next 30 days.
      Recheck HMRC rather than treating that figure as permanent, and ask an
      accountant or tax adviser when the position changes.

The current UK registration threshold and special cases remain governed by
[HMRC's VAT guidance](https://www.gov.uk/register-for-vat), not this document.
If the company later becomes VAT registered, stop before the effective date and
request the tax integration change. Adding a
[Stripe Tax registration](https://docs.stripe.com/tax/registering) records a
registration you already have; it does not register the company with HMRC.

#### C. Customer-facing billing disclosures: one owner decision remains

Stripe's website and trial rules require the currency, trial conversion,
cancellation, refund, privacy, and direct support information to be clear before
customers pay.

- [x] The current branch explicitly says paid prices are monthly and charged in
      GBP, explains that a 14-day League trial requires a card and converts to the
      chosen monthly plan unless cancelled, and publishes
      `contact@thesportyway.com` alongside the contact form.
- [x] `/terms` explains automatic renewal, end-of-period cancellation, data
      retention, and that Stripe handles card details.
- [ ] Decide the refund policy with the business owner, add it plainly to
      `/terms`, and have the customer-facing terms reviewed before relying on
      them. Do not invent a policy while filling in Stripe's settings.
- [ ] After the development deploy in Step 1, open `/pricing`, `/terms`,
      `/privacy`, and `/contact` while signed out on a phone. Confirm every page
      is reachable over HTTPS and the wording above is visible.

The refund-policy decision does not prevent you creating live Stripe objects,
but it must be complete before the production client deploy in Step 8. Use
[Stripe's website checklist](https://docs.stripe.com/get-started/checklist/website)
as the final comparison.

### Step 1: close the targeted development gate from this audit

The full development gate is complete. It proved all of the following in the
**TSW Development** sandbox:

- [x] £5, £29, and £49 GBP monthly Prices and the two locked-down Portal
      configurations are deployed to the development API.
- [x] Successful Team and League Checkout, correct metadata, webhook delivery,
      and resource-specific access work.
- [x] Trial reminders, end-of-period cancellation, failed renewal, payment
      recovery, abandoned/expired/declined Checkout, duplicate delivery, and
      bad-signature rejection work.
- [x] One-trial-per-owner, free-Team reassignment protection, the 10/24 League
      limits, and the League Plus downgrade schedule work.
- [x] With 11 teams the downgrade is blocked; with 10 it is scheduled, and
      Stripe's upcoming invoice uses the £29 League Price rather than £49 League
      Plus.

This audit intentionally changed a few details after that gate: plan-change
feedback now stays visible beside the tapped card on mobile, a
League-to-League-Plus change explicitly preserves the remainder of an active
14-day trial, and the public pages now state the currency, trial conversion, and
direct support email. The migration also gained a command-line safety guard,
which is covered by automated tests. Complete only this targeted recheck before
creating live objects:

- [ ] Commit the release candidate, merge it into `dev`, and push `dev`. Do not
      point Render at the feature branch: both development services already
      track `dev` and deploy it automatically.
- [ ] In Render, confirm both development services deployed the same `dev`
      commit successfully. Record that commit SHA in the launch note.
- [ ] From the repository root, rerun
      `pnpm --filter server stripe:create-portal-config` with the development
      env. It must print a new or reusable upgrade Portal whose trial behavior
      is `continue_trial`.
- [ ] Put the printed `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID` into the
      development Render API, redeploy it, and confirm `/api/v1/health`.
- [ ] With a disposable trialing League, choose League Plus and confirm the plan
      changes but the original trial end remains unchanged. Confirm Stripe does
      not charge immediately and the first post-trial invoice will use £49.
- [ ] On a narrow/mobile viewport, confirm blocked, scheduled, already-scheduled,
      and canceled-downgrade messages appear beside the button that was tapped.
- [ ] Confirm the related webhook deliveries return HTTP `200`. If all seven
      checks pass, production setup may begin.

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
- [ ] Set a recognisable statement descriptor. Prefer `SPORTYWAY` or another
      recognisable value no longer than 10 characters so Stripe can append its
      trial-ending text without making the descriptor confusing. Preview the
      final descriptor in Stripe before saving it.
- [ ] Add and double-check the production payout bank account. A wrong account
      number can send payouts to the wrong place.
- [ ] Choose a payout schedule you understand. Daily automatic payouts are the
      simplest default; changing the schedule does not make funds settle faster.
- [ ] In **Settings → Branding**, add the real logo/icon and brand colours.
- [ ] In Checkout/public settings, use these production pages and confirm each is
      reachable while signed out:

      | Setting | Exact URL |
      | ------- | --------- |
      | Support/contact | `https://thesportyway.com/contact` |
      | Privacy policy | `https://thesportyway.com/privacy` |
      | Terms of service | `https://thesportyway.com/terms` |
      | Cancellation policy | `https://thesportyway.com/terms#billing` |
      | Refund policy | `https://thesportyway.com/terms#billing`, but only after the refund wording from Step 0C is published |

- [ ] In the live **Payment methods** settings, confirm cards are enabled. The
      app lets Stripe choose eligible methods dynamically. Do not enable an
      unfamiliar delayed payment method for launch until its success and failure
      flow has passed in the sandbox.
- [ ] In **Billing → Subscriptions and emails**, enable Stripe's free-trial
      messaging/reminder and set its cancellation-policy URL. This supports card
      network trial requirements. TSW also sends its own three-day reminder;
      receiving both reminders is expected.
- [ ] In **Customer emails**, enable receipts for successful payments and the
      Billing emails you want customers to receive for failed or expiring
      payments. Send yourself a test email and check the business name, trial
      conversion date/amount, cancellation link, support details, and links.
- [ ] In your notification preferences, turn on at least successful-payment,
      failed-payment, dispute, and payout-failure notifications.
- [ ] Review Stripe's own
      [account checklist](https://docs.stripe.com/get-started/account/checklist).
- [ ] Review Stripe's
      [website checklist](https://docs.stripe.com/get-started/checklist/website)
      and close every applicable item before deploying the production client.

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
- [ ] Click **+ Add product**, enter the exact first Product name, and add a
      short customer-facing description matching the table at the top of this
      guide. This description can appear in Checkout, invoices, and receipts.
- [ ] Choose **Recurring**, **Flat-rate**, **GBP**, and **Monthly**.
- [ ] Enter the matching amount and leave trials off.
- [ ] Save the Product, open its Price, and copy the ID beginning `price_`.
      Do not copy the Product ID beginning `prod_`.
- [ ] Save the ID beside the matching variable name in a private password-manager
      note.
- [ ] Repeat for all three rows.
- [ ] Reopen all three live Products and Prices. Verify the name, description,
      amount, GBP currency, monthly recurrence, **Active** status, and that each
      Price belongs to a different Product.

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
      **Subscriptions**. The app creates and retrieves Checkout Sessions, creates
      Portal sessions, retrieves Subscriptions, and creates, updates, or releases
      Subscription Schedules. If Stripe shows **Subscription Schedules** as a
      separate permission, give that **Write** access too.
- [ ] Give **Read** access to **Prices**. The Portal setup command retrieves each
      Price before it creates any configuration.
- [ ] Leave unrelated permissions as **None**.
- [ ] Create the key, complete Stripe's security check, and immediately copy the
      value beginning `rk_live_` into the private note as
      `STRIPE_SECRET_KEY`. Stripe might not show it again.
- [ ] If the app later receives a Stripe `403`, inspect this key's request logs
      and the rejected API path, then add only the permission that path requires.
      Do not replace it with the unrestricted account secret as a shortcut.

### Step 5: let the repository create and verify the two safe live Portals

The script validates the live key and all three Prices, then makes one normal
Portal and one League-Plus-upgrade Portal. Run it from the tested release branch;
do not merge to `main` yet.

- [ ] In Render, open `tsw-2026-march-api-prod` and confirm its existing
      `CLIENT_ORIGIN` is exactly `https://thesportyway.com`.
- [ ] From the repository root, run
      `git check-ignore env/server/.env.stripe-live.local`. It must print that
      path. Stop if it prints nothing; do not create a live-key file that Git can
      track.
- [ ] On your computer, create the ignored file
      `env/server/.env.stripe-live.local` with these lines, replacing every
      example value:

```text
APP_ENV=production
STRIPE_SECRET_KEY=rk_live_REPLACE_ME
STRIPE_PRICE_ID_ADDITIONAL_TEAM=price_REPLACE_ME
STRIPE_PRICE_ID_LEAGUE=price_REPLACE_ME
STRIPE_PRICE_ID_LEAGUE_PLUS=price_REPLACE_ME
STRIPE_SUCCESS_URL=https://thesportyway.com/billing/success
```

- [ ] Confirm `STRIPE_SUCCESS_URL` uses the same
      `https://thesportyway.com` origin as production `CLIENT_ORIGIN`.
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
- [ ] In **Settings → Billing → Customer portal**, open both configurations and
      verify their names and live-mode status. The ordinary Portal must allow
      payment-method updates, invoice history, and cancellation at period end,
      with subscription switching off. The upgrade Portal must allow only the
      League and League Plus live Prices, use immediate proration for paid
      subscriptions, and show **continue the trial** for trialing subscriptions.
- [ ] Delete `env/server/.env.stripe-live.local` as soon as the two Portal IDs and
      live key are safely stored in the password manager. The file is ignored by
      Git, but leaving a live key on a laptop is still unnecessary risk.

The normal Portal allows payment-method updates, invoice history, and
end-of-period cancellation. It deliberately hides arbitrary plan switching so a
customer cannot bypass the app's Team-count rules. Do not replace it with a
manually configured general-purpose Portal. The upgrade Portal preserves any
remaining League trial because both League tiers promise the same 14 days.

### Step 6: create the live webhook destination

A webhook is Stripe's signed message to the production API. Without it, a card
can be charged while the app never grants access.

- [ ] Confirm
      `https://api.thesportyway.com/api/v1/health` returns a healthy response.
      This is the API host; `https://thesportyway.com` is the website host.
- [ ] In Stripe, confirm once more that you are in the live account.
- [ ] Open **Workbench → Webhooks** and click **Create new destination**.
- [ ] First check that no existing enabled live destination already points to
      `https://api.thesportyway.com/api/v1/billing/webhooks`. If one exists,
      compare its payload type, version, and events instead of creating a
      duplicate. Keep exactly one enabled TSW production billing destination.
- [ ] Select API version **2026-06-24.dahlia**. Do not choose a newer version for
      this endpoint until the code has been tested against it.
- [ ] Choose **snapshot events**, not thin events. The current handler verifies
      and processes the complete API v1 event object; a thin-event destination
      requires a different handler and route.
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
https://api.thesportyway.com/api/v1/billing/webhooks
```

- [ ] Name it `TSW production billing webhook` and create it.
- [ ] Reopen it and verify the destination is **Enabled**, uses snapshot payloads,
      shows API version `2026-06-24.dahlia`, listens to exactly 11 events, and
      points exactly to the URL above.
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
STRIPE_SUCCESS_URL=https://thesportyway.com/billing/success
STRIPE_CANCEL_URL=https://thesportyway.com/billing/cancel
```

- [ ] Confirm every placeholder has been replaced and there are no quote marks.
- [ ] Confirm `STRIPE_SECRET_KEY` begins `rk_live_`, not `rk_test_` or `sk_test_`.
- [ ] Confirm all three `price_...` IDs came from the live Product catalog.
- [ ] Confirm both `bpc_...` IDs came from the live portal command.
- [ ] Confirm `STRIPE_WEBHOOK_SECRET` came from the live production destination.
- [ ] Confirm the two URLs exactly match the values above and production
      `CLIENT_ORIGIN` is exactly `https://thesportyway.com`.
- [ ] In production Render, confirm `APP_ENV=production` and
      `NODE_ENV=production`.

Do not add a Stripe key to the production client service. All nine values belong
only to `tsw-2026-march-api-prod`. The server now refuses to start if any Stripe
setting is present without the complete set, if `APP_ENV` is missing, or if a
redirect URL is insecure or malformed.

### Step 8: controlled deploy, backup, and migration

Choose a quiet time when you can watch Stripe and Render for at least an hour.
Do not market or announce paid self-service yet.

#### A. Freeze and verify the release

- [ ] From a clean checkout of the exact `dev` commit that passed Step 1, run:

```bash
pnpm install --frozen-lockfile
pnpm check-env
pnpm check-secrets
pnpm format
pnpm lint
pnpm test
pnpm build
```

- [ ] Confirm every command passes and the secret scan says `Secret scan passed`.
      Stop on a test, build, environment-contract, or secret-scan failure.
- [ ] Confirm `git status --short` prints nothing. Do not launch from a working
      tree with uncommitted files.
- [ ] Confirm the checked-out `dev` commit is the same SHA recorded in Step 1.
- [ ] Merge the fully tested `dev` branch into `main` and push `main`. Do not add
      launch-only changes directly to `main`.
- [ ] Record the exact `main` commit SHA in the launch notes so the API, client,
      migration, and any rollback all refer to the same release.
- [ ] Confirm the refund policy from Step 0C is published. This is the final
      customer-policy gate before the production client becomes available.

#### B. Back up and deploy the production API

- [ ] Immediately before the migration, create and verify the production MongoDB
      backup in [`mongodb-production-backup.md`](./mongodb-production-backup.md).
- [ ] Restore that archive into a disposable database and verify its collection
      counts. A file that exists but cannot be restored is not a verified backup.
- [ ] In the **production API** Render service, add all nine prepared values and
      choose **Save, rebuild, and deploy**.
- [ ] Confirm that Render deployed the recorded `main` commit. Wait for it to
      succeed, then open `https://api.thesportyway.com/api/v1/health`. Stop if the
      service fails to start; environment validation usually names the missing
      or mixed-mode value.
- [ ] Do **not** deploy the production client yet. This leaves the public paid
      entry point closed while the database is prepared.
- [ ] Before changing data, prove the public production webhook route rejects a
      fake signature with HTTP `400`:

```bash
curl -i -X POST https://api.thesportyway.com/api/v1/billing/webhooks \
  -H 'Content-Type: application/json' \
  -H 'Stripe-Signature: definitely-not-valid' \
  --data '{}'
```

      Stop if it returns `200`, `404`, or a `5xx`; do not continue to a live
      charge until the route is reachable and signature verification is active.

#### C. Verify the target, migrate once, then deploy the client

- [ ] Open the production API's Render **Shell** and print only the non-secret
      deployment identity:

```bash
node -e "console.log({ APP_ENV: process.env.APP_ENV, MONGO_DB_NAME: process.env.MONGO_DB_NAME })"
```

- [ ] Stop unless it prints `APP_ENV: 'production'` and
      `MONGO_DB_NAME: 'tsw_2026_prod'`.
- [ ] Run the dry run:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --dry-run
```

- [ ] Confirm the preview lists every owner and Team, marks only the oldest Team
      for each owner as `FREE`, marks the others `PAID`, lists exactly the three
      known pre-launch Leagues as `COMP LEAGUE`, and reports no unexpected open
      Stripe subscriptions.
- [ ] If any name or count is surprising, **stop**. Save the output and do not
      run the real migration.
- [ ] If every line is correct, run the real migration once:

```bash
MIGRATION_CONFIRM_DB=tsw_2026_prod pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --apply
```

      The script refuses a bare command, a missing `--apply`, or a confirmation
      that differs from `MONGO_DB_NAME`.

- [ ] In the production app, verify all three old Leagues are still editable and
      show complimentary/grandfathered billing.
- [ ] Confirm each existing owner has exactly one manageable free standalone
      Team.
- [ ] Run the migration dry run once more. Its proposed records must match the
      state just verified; do not run the apply command a second time.
- [ ] Now manually deploy `tsw-2026-march-client-prod` and confirm Render uses
      the same recorded `main` commit as the API.
- [ ] Open `/pricing` while signed out and verify the four displayed options and
      GBP prices before proceeding.

The API must be deployed before the migration because the migration script is
part of that server release. The client is deliberately deployed afterward so
customers cannot start Checkout during the migration.

If the client must be rolled back after a live payment, redeploy its previous
known-good commit to close the paid entry point. Leave the production API,
Stripe values, webhook destination, and existing subscriptions running so paid
customers continue receiving lifecycle updates.

### Step 9: prove the real-money path

Do not use a Payment Link and do not use a Stripe test card. This must exercise
the app's live Checkout metadata and webhook flow.

- [ ] Use a controlled production account and a real card you are authorised to
      use.
- [ ] Create/select an Additional Team and buy the £5 GBP monthly subscription.
- [ ] Before paying, confirm Checkout shows the expected business identity,
      **£5 GBP**, monthly recurrence, the correct customer email, and no VAT or
      other tax line. Stop before payment if any detail is wrong.
- [ ] Keep Stripe's live webhook destination and Render logs open while paying.
- [ ] In Stripe, confirm `checkout.session.completed`, the relevant
      `customer.subscription.*` event, and `invoice.paid` are delivered to **TSW
      production billing webhook** with HTTP `200`.
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
- [ ] Repeat with one League. Confirm Checkout shows **£29 GBP monthly after a
      14-day trial**, saves the real card, charges nothing immediately, and the
      exact League becomes manageable after the signed webhook.
- [ ] During that trial, choose League Plus. Confirm the Portal shows the £49
      future monthly price, the change applies to the exact League, the original
      trial end remains unchanged, and no immediate charge is created. For an
      already-paid subscription, the same upgrade flow instead shows and invoices
      the prorated difference before approval.
- [ ] Cancel the controlled League subscription at period end when the check is
      complete. Archive or clearly label the production test resources so they
      cannot be mistaken for customers.
- [ ] Refresh Workbench and Render logs. Confirm there are no failed live webhook
      deliveries, Stripe permission errors, unknown-Price errors, or `5xx`
      billing responses before announcing availability.
- [ ] If any charge succeeds but access is not granted, immediately stop the paid
      launch, hide or roll back the production Pricing client, preserve all logs,
      and do not ask the customer to pay again.

### Step 10: finish and monitor

- [ ] Confirm no local `env/server/.env.stripe-live.local` file or copied live
      secret remains after the Portal setup.
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

5. From the repository root, run:

```bash
pnpm --filter server stripe:create-portal-config
```

6. The command checks that the Prices really are £5, £29, and £49 GBP monthly.
   It then prints two lines beginning `STRIPE_PORTAL_CONFIGURATION_ID=bpc_` and
   `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID=bpc_`.
7. Copy both whole lines into `env/server/.env.development`.
8. Start the app with `pnpm dev`.

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

4. Click **Create new destination**, choose API version
   **2026-06-24.dahlia**, choose **snapshot events**, and choose **Events on your
   account**. Do not select thin events for the current handler.
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
MIGRATION_CONFIRM_DB=tsw_2026_dev pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --apply
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
After resetting the seeded development database, sign in with this normal test
account:

```text
Email: user2@user2.com
Password: password
```

It already owns **Harbor Knights**, which is its first free Team. Use that Team
for the first-Team check below, then create a new second Team for the £5 Checkout
test. Do not use `user1@user1.com`; that account owns the seeded League and
complimentary resources. If the database was not reset, you can instead register
a new test-only account with an email address you control. Never use a real
customer's account for these tests.

Resetting MongoDB does not cancel subscriptions in the Stripe sandbox. Cancel
old sandbox subscriptions separately before changing or archiving their Price
IDs.

### Additional Team

1. Sign in with that normal development test account.
2. Open its existing first Team, or create one for a newly registered account.
   Confirm it is labelled **Free Team** and can be edited.
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
7. Choose League Plus. During a trial, confirm Stripe keeps the original trial
   end, changes the future monthly price to £49, and does not charge immediately.
   For an already-paid subscription, confirm Stripe shows the immediate prorated
   amount before approval.
8. Approve it, wait for the webhook, and add team 11.
9. Continue to 24 teams. Confirm team 25 is blocked and tells you to contact us.
10. Start another TSW League and confirm it gets its own subscription. Its teams
    do not change the first League's count.

## Part 5: test cancellation, failure, and awkward cases

Do every item inside the **TSW Development** Stripe sandbox.

### Trial-ending reminder email

Use a disposable development League subscription for this test. Ending the trial immediately also
starts sandbox billing, so the subscription will leave `trialing` and this cannot be undone. A
Dashboard **Send test event** or `stripe trigger customer.subscription.trial_will_end` is not an
end-to-end substitute: Stripe gives those events fake customer/subscription data that does not map
to a League in the TSW database.

1. Register a fresh user on `https://dev.thesportyway.com` with an email address you control.
2. Start a League trial through TSW and complete Checkout with test card `4242 4242 4242 4242`.
3. Finish League setup so the development database has the Stripe customer mapping and billing
   email from Checkout.
4. In the **TSW Development** Stripe sandbox, open **Billing → Subscriptions**, find that email, and
   open the trialing League subscription.
5. Confirm its metadata includes `resourceType=league` and the expected `ownerUserId`, then copy the
   `sub_...` subscription ID.
6. Open **Workbench → Shell** and run this once with that ID:

```bash
stripe subscriptions update sub_REPLACE_ME -d trial_end=now
```

7. Open **Workbench → Webhooks → TSW development billing webhook → Event deliveries**. Find the
   resulting `customer.subscription.trial_will_end` event and confirm delivery returned HTTP `200`.
8. In Resend, confirm a send with subject **Your free trial is ending soon** was accepted for the
   same address. Then confirm it arrives in Gmail and names the expected League.
9. In Gmail's **Show original**, confirm `SPF: PASS`, `DKIM: PASS` with domain
   `thesportyway.com`, and `DMARC: PASS`.
10. With the `4242` test card, the trial should then convert to an active sandbox subscription. This
    is expected; delete or cancel the disposable subscription after the test if it is no longer
    needed.

Stripe sends `customer.subscription.trial_will_end` three days before an ordinary trial ends and
also when a trial is ended immediately with `trial_end=now`. Using the real disposable subscription
preserves the customer ID and metadata that TSW uses to route the reminder to the League.

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
stripe subscriptions update sub_REPLACE_ME \
  -d trial_end=now \
  -d payment_behavior=allow_incomplete
```

4. Run the command once. `payment_behavior=allow_incomplete` is required for
   this test: it lets the failed charge leave the subscription as `past_due`.
   Without it, Stripe Workbench can return a `card_declined` error and leave the
   subscription trialing, which does not complete the failed-renewal test.
5. Return to **Billing → Subscriptions** and reopen the subscription.
6. Confirm the response or subscription now shows **Past due**, its trial ended
   at approximately the current time, and its latest invoice is open with a
   failed payment. Event creation and delivery can take a few seconds. If the
   subscription remains **Trialing**, stop and inspect the command response; do
   not repeat the command blindly.
7. Open **Workbench → Webhooks**.
8. Select the development destination named **TSW development billing
   webhook**.
9. Open **Event deliveries** and refresh it. In some Dashboard layouts this tab
   is labelled **Events**. Confirm you are inside the destination by opening an
   event and finding its delivery status or **Delivery attempts**; the
   account-wide Workbench **Events** page does not prove delivery to TSW.
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

#### 7. Confirm an active paid Team is not offered the free-Team action

1. Use an account with one free Team and one active £5 Additional Team.
2. Open Pricing and select the active Additional Team.
3. Confirm the main button says **Manage team billing**.
4. Confirm there is no **Make this my free team** button while the subscription
   is active or scheduled to cancel at the period end.
5. Optionally open **Manage team billing** and confirm it opens the Customer
   Portal for that exact Team, then return without changing the subscription.
6. Confirm the original free Team is still free and the Additional Team still
   has exactly one subscription.

The free-Team action becomes available only after the paid subscription is
fully closed and its status is `canceled`, not merely scheduled to cancel. The
server also rejects a direct reassignment request while the subscription is
open; the UI prevents that invalid request from being offered in the first
place.

#### 8. Test the League Plus downgrade rule

1. Use a League Plus test League with 11 active teams.
2. Open Pricing, select that exact League, and click **Change to League**.
3. Confirm TSW blocks the downgrade and shows a link to manage/archive teams in
   the same League card. On mobile, the message must scroll into view beside the
   button rather than appearing unnoticed at the top of the page.
4. Follow the link to the League's **Teams** tab.
5. Archive one team. Confirm archived records remain saved and only 10 teams now
   count toward capacity.
6. Return to Pricing and click **Change to League** again.
7. Confirm the downgrade is scheduled for the next billing date rather than
   happening immediately. The success message must appear in the same League
   card and remain visible on mobile.
8. Confirm League Plus remains active until that date.
9. In Stripe, open the subscription and confirm its schedule contains the League
   Price for the next phase and its upcoming invoice uses £29 rather than £49.
10. Click **Keep League Plus** and confirm the cancellation message appears in
    the League Plus card. If Stripe already has a schedule that TSW cannot safely
    replace, confirm that error also appears beside the tapped plan-change button.

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
- Uses Stripe's confirmation flow for prorated paid League Plus upgrades.
- Preserves the remainder of a League trial when changing between the two League
  tiers.
- Uses a Subscription Schedule for next-period League downgrades.
- Enforces 10- and 24-team limits in the API, not only in the browser.
- Keeps every current Team feature available at every tier.
- Keeps plan-change errors and confirmations beside the originating pricing card
  and scrolls them into view when necessary on mobile.
- Refuses partial deployed Stripe configuration, mixed test/live keys, missing
  deployment identity, and unsafe or malformed billing return URLs.
- Prints the exact Teams and Leagues affected before the capacity-pricing
  migration writes anything.

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

Stripe is **not ready for real customers yet**. Development billing behavior has
passed, but these production blockers remain:

1. Deploy the audit changes and close the small targeted development gate in
   Step 1.
2. Decide and publish the refund policy, verify all customer-facing billing
   disclosures, and configure Stripe's trial messaging.
3. Activate and verify the live Stripe account, Products, Prices, restricted
   key, Portals, snapshot webhook destination, and nine production Render values.
4. Back up and test-restore the production database, review the exact migration
   preview, and migrate the pre-launch records using the explicit apply guard.
5. Complete the controlled £5 live purchase and live League trial in Step 9 with
   clean webhook, Stripe, and Render logs.

Do not market paid self-service until all five blockers are closed.

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
- [Stripe go-live checklist](https://docs.stripe.com/get-started/checklist/go-live)
- [Snapshot and thin event destinations](https://docs.stripe.com/event-destinations)
- [Customer Portal trial behavior](https://docs.stripe.com/api/customer_portal/configurations/object)
- [Secret-key security](https://docs.stripe.com/keys-best-practices)
- [HMRC VAT registration threshold](https://www.gov.uk/register-for-vat/when-register-for-vat)
- [Render environment variables](https://render.com/docs/configure-environment-variables)
- [Render Shell access](https://render.com/docs/ssh)
