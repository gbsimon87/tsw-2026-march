# Stripe production launch runbook

Use this document to take the tested Stripe integration from `dev` to
production. Development setup and exhaustive sandbox testing are complete and
are intentionally not repeated here.

Start at Step 1. Complete the steps in order and stop whenever a check fails.

## Launch facts

| Product                   | Live Price to create | Trial   | Limit                     |
| ------------------------- | -------------------: | ------- | ------------------------- |
| First standalone Team     |                 Free | None    | One free Team per owner   |
| Each additional Team      |         £5 GBP/month | None    | One subscription per Team |
| League                    |        £29 GBP/month | 14 days | Up to 10 active teams     |
| League Plus               |        £49 GBP/month | 14 days | Up to 24 active teams     |
| More than 24 league teams |           Contact us | —       | No self-service price     |

All paid prices are recurring monthly prices in GBP. A League trial requires a
card and becomes the selected paid plan unless it is cancelled before the trial
ends. Upgrading a trialing League preserves its original trial end; upgrading an
already-paid League invoices the prorated difference. An eligible League Plus
downgrade starts at the next billing date.

Stripe Tax and automatic tax remain **off** for this launch. The owner confirmed
that the UK company is not VAT registered. Review the position regularly with an
accountant and enable tax collection only after the appropriate registration is
active. Stripe does not register the company with HMRC.

The three existing production Leagues must remain complimentary. The migration
marks every pre-launch League as `billingSource: 'comp'`; stop if its dry run
does not list exactly the expected three Leagues.

## Safety rules

- Never put a live restricted key or webhook signing secret in Git, chat,
  screenshots, email, or a client-side `VITE_...` variable. Keep secrets in a
  password manager until they are saved in the production API service.
- Confirm the Stripe Dashboard is in **live mode** before every live setup step.
  Sandbox objects and IDs do not work in live mode.
- Keep a private launch note containing timestamps, the tested Git SHA, the
  non-secret `price_...` and `bpc_...` IDs, the webhook destination name, and
  the verified backup filename.
- After the first live payment, never roll back by removing the API's Stripe
  values or disabling its webhook. Existing subscriptions still need lifecycle
  events processed. Roll back only the production client entry point.
- Do not announce paid self-service until Steps 1–9 all pass.

## Step 1: verify the merged development release

The Stripe work has been merged into `dev` and pushed. Before creating live
objects, close this final targeted development gate:

- [x] In Render, confirm both development services deployed the same current
      `dev` commit successfully. Record its SHA.
- [x] From the repository root, run
      `pnpm --filter server stripe:create-portal-config` with the development
      environment. Confirm the upgrade Portal uses `continue_trial`.
- [x] If the command prints a different
      `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID`, update it on the development API,
      redeploy, and confirm its health endpoint succeeds.
- [x] With a disposable trialing League, choose League Plus. Confirm the plan
      changes, the original trial end remains unchanged, no charge is taken now,
      and the first post-trial invoice will use £49.
- [x] On a narrow/mobile viewport, confirm blocked, scheduled,
      already-scheduled, and cancelled-downgrade messages appear beside the
      button that initiated the action.
- [x] Confirm the related webhook deliveries return HTTP `200`.
- [x] While signed out on a phone, open `/pricing`, `/terms`, `/privacy`, and
      `/contact`. Confirm the GBP pricing, trial conversion, cancellation terms,
      privacy information, and `contact@thesportyway.com` are visible.

## Step 2: finish the customer policy gate

- [x] Adopt the seven-day first-payment refund policy and add it to `/terms`.
- [x] Have the customer-facing terms reviewed before relying on them.
- [x] After deploying this change, confirm `/terms#billing` clearly covers the
      trial, automatic monthly renewal, cancellation timing, and refund policy.
- [x] Continue the existing monthly finance check of rolling 12-month taxable
      turnover and the UK VAT position. Recheck current
      [HMRC guidance](https://www.gov.uk/register-for-vat) rather than treating a
      threshold in this document as permanent.

The refund policy must be reviewed and published before the production client is
deployed in Step 8.

> **Current progress — Friday 11 September 2026, 11:51 BST:** Step 1 passed in
> the deployed development environment. Production setup is now on Step 3.

## Step 3: activate and secure the live Stripe account

- [x] Open the Stripe **live account**, not **TSW Development**, and confirm
      there is no sandbox/test banner.
- [x] Complete **Activate payments** and every outstanding identity, company,
      website, bank, or payout verification requested by Stripe.
- [x] Enable strong two-factor authentication for Dashboard users. Prefer a
      passkey, security key, or authenticator app.
- [x] Check the production payout bank account and choose a payout schedule.
- [x] Complete the public business name, website, support contact, logo, icon,
      and brand colours.
- [x] Use a recognisable statement descriptor such as `SPORTYWAY` and preview
      it. Keeping it to 10 characters lets Stripe append trial-ending text
      clearly.
- [x] Add these public URLs in Checkout/business settings and verify that each
      works while signed out:

| Setting             | Exact URL                                |
| ------------------- | ---------------------------------------- |
| Support/contact     | `https://thesportyway.com/contact`       |
| Privacy policy      | `https://thesportyway.com/privacy`       |
| Terms of service    | `https://thesportyway.com/terms`         |
| Cancellation policy | `https://thesportyway.com/terms#billing` |
| Refund policy       | `https://thesportyway.com/terms#billing` |

- [x] Confirm cards are enabled. Do not enable a delayed payment method until
      its success and failure flows have been tested in the sandbox.
- [x] In **Billing → Subscriptions and emails**, enable Stripe's free-trial
      reminder/messaging and set the cancellation-policy URL. TSW also sends its
      own three-day reminder, so receiving both is expected.
- [x] Enable receipts and the desired failed/expiring-payment emails. Send a test
      email and verify the business identity, amount, trial conversion date,
      cancellation link, and support details.
- [x] Enable account notifications for successful payments, failed payments,
      disputes, and payout failures.
- [x] Close every applicable item in Stripe's
      [account checklist](https://docs.stripe.com/get-started/account/checklist)
      and [website checklist](https://docs.stripe.com/get-started/checklist/website).

## Step 4: create the three live Products and Prices

Create three separate live Products. Each gets one active, recurring,
flat-rate, monthly GBP Price. Do not configure a trial on the Price; the app adds
the one-time 14-day League trial.

| Product name    | Suggested description                           | Price           | Environment variable              |
| --------------- | ----------------------------------------------- | --------------- | --------------------------------- |
| Additional Team | Manage one additional standalone team.          | £5 GBP monthly  | `STRIPE_PRICE_ID_ADDITIONAL_TEAM` |
| League          | Run a league with up to 10 active teams.        | £29 GBP monthly | `STRIPE_PRICE_ID_LEAGUE`          |
| League Plus     | Run a larger league with up to 24 active teams. | £49 GBP monthly | `STRIPE_PRICE_ID_LEAGUE_PLUS`     |

- [x] In **Product catalog**, create each Product and its Price.
- [x] Copy the `price_...` ID, not the `prod_...` ID, into the private launch
      note beside the matching variable.
- [x] Reopen all three Prices and confirm the Product, description, amount, GBP
      currency, monthly recurrence, and **Active** status.
- [x] Confirm the three Prices belong to three different Products.

Copying sandbox Products to live mode is acceptable, but the resulting live
`price_...` IDs are different. Never reuse a sandbox ID or repurpose a Price
that has subscription history.

## Step 5: create the restricted key and Portal configurations

Step 5 uses four places. Complete the sections in this order:

| Section | Platform                              | Purpose                                           |
| ------- | ------------------------------------- | ------------------------------------------------- |
| 5A      | Stripe Dashboard                      | Create the live restricted server key             |
| 5B      | Render Dashboard                      | Check the existing production origin only         |
| 5C–5D   | Local terminal and ignored local file | Create the two live Portal configurations         |
| 5E      | Stripe Dashboard                      | Inspect the two configurations the script created |
| 5F      | Password manager and local machine    | Store the IDs and remove the temporary file       |

Do not add the new Stripe values to Render during this step. Step 7 collects all
nine values, and Step 8 saves and deploys them together so the production API is
never started with only part of its Stripe configuration.

### 5A — Stripe Dashboard: create the restricted server key

The browser client needs no Stripe publishable or secret key.

- [x] In Stripe, select the real TSW account and confirm there is no sandbox/test
      banner.
- [x] Open **Workbench → API keys**. Alternatively, use the Dashboard search for
      **API keys** or open <https://dashboard.stripe.com/apikeys>.
- [x] In **Restricted keys**, click **Create restricted key**. Choose the option
      to configure the key manually if Stripe offers templates, and name it
      `TSW production Render API`.
- [x] On the permissions screen, give **Write** access to **Checkout Sessions**,
      **Customer Portal**, **Subscriptions**, and **Subscription Schedules** if
      Stripe lists schedules separately.
- [x] Give **Read** access to **Prices**. Leave unrelated permissions as
      **None**, then create the key.
- [x] Copy the `rk_live_...` value immediately. In the password manager, create
      or update the production TSW Stripe entry and store it under the field name
      `STRIPE_SECRET_KEY`. Do not put it in chat, source control, the browser
      client, or the Render client service. Stripe might show it only once.

If Stripe later returns `403`, inspect the rejected request in Workbench and add
only the permission it requires. Do not switch to an unrestricted key.

### 5B — Render Dashboard: confirm the production origin

- [x] Open the Render Dashboard and select the **production API web service**:
      `tsw-2026-march-api-prod`. Do not select
      `tsw-2026-march-client-prod` or either `-dev` service.
- [x] In that service's left navigation, open **Environment**. Under
      **Environment Variables**, find `CLIENT_ORIGIN` and reveal its value if
      necessary.
- [x] Confirm it is exactly `https://thesportyway.com`, with no trailing slash.
      Do not change or deploy anything if it is already correct.

Do not add `STRIPE_SECRET_KEY`, Price IDs, or Portal IDs to Render yet. That is
done as one controlled update in Steps 7–8.

### 5C — Local machine: prepare the ignored temporary file

The repository creates one locked-down billing-management Portal and one Portal
used only to confirm League Plus upgrades.

- [x] In a terminal, check out the exact tested `dev` release and change into the
      repository root—the directory containing `pnpm-workspace.yaml`.
- [x] From that directory, run:

```bash
git check-ignore env/server/.env.stripe-live.local
```

It must print `env/server/.env.stripe-live.local`. Stop if it prints nothing;
the file would not be protected from an accidental commit.

- [x] In your local editor, create
      `env/server/.env.stripe-live.local`. This is a temporary file on your
      computer—not a Stripe Dashboard or Render file. Add:

```text
APP_ENV=production
STRIPE_SECRET_KEY=rk_live_REPLACE_ME
STRIPE_PRICE_ID_ADDITIONAL_TEAM=price_REPLACE_ME
STRIPE_PRICE_ID_LEAGUE=price_REPLACE_ME
STRIPE_PRICE_ID_LEAGUE_PLUS=price_REPLACE_ME
STRIPE_SUCCESS_URL=https://thesportyway.com/billing/success
```

- [x] Replace `rk_live_REPLACE_ME` with the restricted key from the password
      manager. Replace the three `price_REPLACE_ME` values with the matching live
      Price IDs saved in Step 4. Do not use any sandbox `rk_test_...` or test
      `price_...` object.

### 5D — Local terminal: create and reuse the Portal configurations

- [x] From the same repository root, run:

```bash
ENV_FILE="$(pwd)/env/server/.env.stripe-live.local" pnpm --filter server stripe:create-portal-config
```

- [x] Stop if the command reports a test key, wrong amount/currency/interval, or
      reused Product.
- [x] The command prints two `bpc_...` IDs. Record which one is printed as
      `STRIPE_PORTAL_CONFIGURATION_ID` and which is printed as
      `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID`; do not swap them.
- [x] Run the command again and confirm it reuses the same two IDs.

### 5E — Stripe Dashboard: inspect both live Portal configurations

- [x] Return to the live Stripe account. Open
      **Settings → Billing → Customer portal**. If Stripe's navigation differs,
      search the Dashboard for **Customer portal**.
- [x] Open the configuration whose ID matches the printed
      `STRIPE_PORTAL_CONFIGURATION_ID`. It can be named **Default** if Stripe's
      existing default configuration already matched every required setting;
      otherwise, the script creates it as **TSW billing management**. Confirm:
  - It allows payment-method updates, invoice history, and end-of-period
    cancellation, with plan switching disabled.
- [x] Return to the configurations list, open
      **TSW League Plus upgrade**, and confirm:
  - The upgrade Portal contains only League and League Plus, immediately
    prorates paid upgrades, and continues an active trial.

The script either reuses an exact matching live configuration or creates it in
Stripe. Seeing **Default** and **TSW League Plus upgrade** is therefore valid.
Do not rename or manually recreate **Default**: the first `bpc_...` ID printed by
the script is the authoritative normal-Portal configuration. The script also
validates the exact Price restrictions and trial behaviour.

### 5F — Password manager and local machine: store and clean up

- [x] In the same production TSW Stripe password-manager entry, store the two
      printed IDs under `STRIPE_PORTAL_CONFIGURATION_ID` and
      `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID`.
- [x] Confirm the password manager now contains the restricted key, all three
      live Price IDs, and both Portal IDs needed for Step 7.
- [x] Delete the temporary local
      `env/server/.env.stripe-live.local` file. The permanent runtime copy of
      these values will be entered only in the production API service on Render
      during Steps 7–8.

## Step 6: create the production webhook

- [x] Confirm `https://api.thesportyway.com/api/v1/health` is healthy.
- [x] In the live account, open **Workbench → Webhooks**.
- [x] Check for an enabled destination already pointing to the URL below. Update
      it if appropriate instead of creating a duplicate; keep exactly one
      enabled production billing destination.
- [x] Create or verify a destination with:
  - Name: `TSW production billing webhook`
  - Endpoint: `https://api.thesportyway.com/api/v1/billing/webhooks`
  - Events from: **Your account**
  - Payload: **Snapshot**, not thin
  - API version: **2026-06-24.dahlia**
  - Events: exactly the 11 listed below

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

- [x] Confirm the destination is enabled and copy its new `whsec_...` signing
      secret into the password manager as `STRIPE_WEBHOOK_SECRET`.
- [x] Keep this secret separate from the sandbox destination and local Stripe
      CLI secrets.

No successful delivery is expected until the controlled live purchase in Step 9.

## Step 7: prepare the production API values

Prepare all nine values before saving any of them in Render:

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

- [x] Confirm there are no placeholders or quote marks.
- [x] Confirm the restricted key is `rk_live_...`, all three Prices and both
      Portals are live objects, and the signing secret belongs to the production
      webhook.
- [x] In `tsw-2026-march-api-prod`, confirm
      `APP_ENV=production`, `NODE_ENV=production`, and
      `CLIENT_ORIGIN=https://thesportyway.com`.
- [x] Keep these nine Stripe values out of the production client service.

The production API refuses to start with a partial Stripe configuration, mixed
test/live values, missing deployment identity, or unsafe return URLs.

## Step 8: deploy, back up, and migrate

Choose a quiet period when you can monitor Stripe and Render for at least an
hour. Keep the production client on its previous release until the API and data
are ready.

### Prepare the release

- [ ] From a clean checkout of the exact tested `dev` commit, run:

```bash
pnpm install --frozen-lockfile
pnpm check-env
pnpm check-secrets
pnpm format
pnpm lint
pnpm test
pnpm build
git status --short
```

- [x] Stop unless every command passes, the secret scan succeeds, and
      `git status --short` prints nothing.
- [x] Merge that `dev` commit into `main`, push `main`, and record the resulting
      commit SHA. Do not add launch-only changes directly to `main`.
- [x] Confirm the refund policy from Step 2 is published.

### Back up and deploy the API

- [x] Immediately before migration, create and verify the production MongoDB
      backup using [`mongodb-production-backup.md`](./mongodb-production-backup.md).
- [x] Restore the archive into a disposable database and verify its collection
      counts. A backup that has not been restored is not verified.
- [x] Add all nine Stripe values to `tsw-2026-march-api-prod` and choose
      **Save, rebuild, and deploy**.
- [x] Confirm the API deployed the recorded `main` SHA and that
      `https://api.thesportyway.com/api/v1/health` succeeds.
- [x] Confirm the public webhook route rejects a fake signature with HTTP `400`:

```bash
curl -i -X POST https://api.thesportyway.com/api/v1/billing/webhooks \
  -H 'Content-Type: application/json' \
  -H 'Stripe-Signature: definitely-not-valid' \
  --data '{}'
```

Stop on `200`, `404`, or any `5xx` response.

### Verify and migrate the production database

- [x] In the production API's Render Shell, print only its non-secret identity:

```bash
node -e "console.log({ APP_ENV: process.env.APP_ENV, MONGO_DB_NAME: process.env.MONGO_DB_NAME })"
```

- [x] Stop unless it prints `APP_ENV: 'production'` and
      `MONGO_DB_NAME: 'tsw_2026_prod'`.
- [x] Preview the migration:

```bash
pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --dry-run
```

- [x] Confirm it lists every owner and Team, makes only each owner's oldest Team
      `FREE`, makes their other standalone Teams `PAID`, and lists exactly the
      three expected pre-launch Leagues as `COMP LEAGUE`.
- [x] Stop if any record or count is unexpected, or if the script reports an
      existing Stripe-backed subscription.
- [x] Apply it once:

```bash
MIGRATION_CONFIRM_DB=tsw_2026_prod pnpm --filter server exec node src/scripts/migrate-capacity-pricing.js --apply
```

- [x] Verify the three old Leagues remain editable and complimentary, and each
      existing owner has exactly one manageable free standalone Team.
- [x] Do not run `--apply` a second time.

### Deploy the client

- [x] Manually deploy `tsw-2026-march-client-prod` at the same recorded `main`
      SHA as the API.
- [x] Open `https://thesportyway.com/pricing` while signed out and confirm all
      four options, GBP prices, trial terms, and policy/contact links.

If the paid entry point must be closed, redeploy the previous known-good client
commit. Leave the production API, Stripe values, webhook, and subscriptions
running so existing customers continue receiving billing updates.

> CONTINUE FROM HERE NEXT TIME: SEPT 11 4:19PM

## Step 9: production smoke checks and first genuine payments

Do **not** use your own card, ask someone else to make a pretend purchase, or
create a live charge solely to refund it. Stripe's
[testing guidance](https://docs.stripe.com/testing) says its Services Agreement
prohibits testing in live mode with real payment details. Test payment success,
failure, refunds, 3DS, trials, renewals, and webhook lifecycle behaviour in the
sandbox. In production, stop the pre-launch Checkout checks before entering any
payment details.

### No-payment production checks

- [ ] With a controlled production TSW user that owns an eligible additional
      Team, start the £5 monthly Checkout from the production Pricing page. Do
      not enter card or wallet details and do not complete payment.
- [ ] Confirm the live Checkout page shows the correct business identity,
      customer email, £5 GBP monthly recurrence, support and policy links, and
      no unexpected tax line. Close the page.
- [ ] In **Stripe live account → Workbench → Logs**, confirm the corresponding
      `POST /v1/checkout/sessions` request succeeded and used the live Additional
      Team Price. Confirm the abandoned Checkout granted no Team entitlement.
- [ ] Start the £29 monthly League Checkout in the same way, without entering
      payment details. Confirm it shows the 14-day trial, future £29 GBP monthly
      price, cancellation terms, and no immediate amount due; then close it.
- [ ] In Workbench, confirm this second Checkout Session used the live League
      Price and contains the expected League metadata. Confirm abandoning it
      granted no League entitlement.
- [ ] Confirm the production webhook destination remains enabled and Render has
      no Stripe permission errors, unknown-Price errors, or billing `5xx`
      responses from these Checkout Session requests.

Creating an incomplete Checkout Session without supplying payment details is an
acceptable configuration smoke check; it does not prove the paid webhook path.
That path is verified by monitoring the first bona fide customer purchase.

### Monitor the first genuine Additional Team purchase

- [ ] When a real customer genuinely chooses to buy an Additional Team, monitor
      the production webhook destination and Render logs. Confirm
      `checkout.session.completed`, the relevant `customer.subscription.*`
      event, and `invoice.paid` return HTTP `200`.
- [ ] Confirm only the purchased Team becomes manageable and its Stripe Customer,
      Subscription, Invoice, and metadata identify the correct Team and owner.
- [ ] Ask the customer to use **Manage billing** only if support is needed.
      Confirm payment-method updates, invoice history, and end-of-period
      cancellation work, while arbitrary plan switching remains unavailable.

### Monitor the first genuine League trial and upgrade

- [ ] When a real customer genuinely starts a League trial, confirm the signed
      webhook grants management to the exact League, no immediate charge is
      taken, and its 14-day trial end is correct.
- [ ] When a genuine trialing League first upgrades to League Plus, confirm its
      future price becomes £49, its original trial end remains unchanged, and no
      immediate charge is taken.
- [ ] Monitor the first genuine post-trial invoice and confirm the successful
      signed events update the correct League without errors.

### Launch and incident decision

- [ ] Announce paid self-service after the no-payment production checks and all
      preceding steps pass. Treat the first genuine transaction on each path as
      monitored production validation, not a manufactured test.
- [ ] If a genuine payment succeeds but access is not granted, close the paid
      client entry point, preserve Stripe and Render logs, help the affected
      customer without asking them to pay again, and reconcile the subscription
      before reopening the path.
- [ ] Issue refunds only for genuine customer-support or policy reasons. A refund
      does not cancel its subscription, so handle cancellation separately when
      appropriate.

## Step 10: clean up and monitor

- [ ] Confirm `env/server/.env.stripe-live.local` and other temporary copies of
      live secrets are gone.
- [ ] Run `pnpm check-secrets` before pushing any final documentation updates.
- [ ] For the first week, review webhook failures, failed invoices, disputes,
      subscriptions, and Render errors every day.
- [ ] Confirm the first payout targets the expected bank account and note its
      expected arrival date.
- [ ] Review the restricted key's request logs and remove unused permissions.
- [ ] Add ongoing monitoring for webhook failures and a periodic
      Stripe-to-database reconciliation.
- [ ] Keep the Stripe SDK and pinned API/webhook version under dependency review.

## Quick diagnosis

| Symptom                                     | First check                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| API will not start                          | Render logs for a missing/mixed Stripe value or incorrect `APP_ENV`         |
| Checkout returns `502`                      | Stripe Workbench request logs for a restricted-key `403` or invalid live ID |
| Payment succeeds but access stays locked    | Webhook delivery status, signing secret, metadata, then API logs            |
| `invoice.payment_failed` is not visible yet | The exact subscription/invoice and its delivery attempts, not only Events   |
| Portal offers an unsafe plan change         | The two configured `bpc_...` IDs and the Portal feature settings            |
| League trial upgrade tries to charge now    | Upgrade Portal `trial_update_behavior` must be `continue_trial`             |
| Migration preview contains unexpected data  | Stop; retain the backup and investigate before using `--apply`              |

## Official references

- [Stripe go-live checklist](https://docs.stripe.com/get-started/checklist/go-live)
- [Stripe website checklist](https://docs.stripe.com/get-started/checklist/website)
- [Subscription trials](https://docs.stripe.com/billing/subscriptions/trials)
- [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Customer Portal](https://docs.stripe.com/customer-management)
- [Event destinations](https://docs.stripe.com/event-destinations)
- [Restricted keys](https://docs.stripe.com/keys/restricted-api-keys)
- [Secret-key security](https://docs.stripe.com/keys-best-practices)
- [Products and Prices](https://docs.stripe.com/products-prices/manage-prices)
