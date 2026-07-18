# Manual Actions to Finish the Pricing Overhaul

> **This is the only checklist you need.** All the code is written and committed on
> the `feature/pricing-overhaul` branch. What's left are the things a code change
> **can't** do for you: editing infrastructure config (Render), setting up Stripe,
> and running the database migrations. Do the steps **in order, top to bottom**.
>
> There are two "rounds":
>
> - **Rounds A–D** get the branch ready to merge into `dev` (test environment).
> - **Round E** is the real go-live (production) — a separate, later decision.
>
> Why by hand? `render.yaml` and `env/server/.env.*` are secret-bearing and are
> managed via the Render dashboard by policy ([`docs/security.md`](../security.md)),
> and Stripe setup needs your logged-in Stripe account. Nothing here is done from code.

---

## Before you start — what you'll need open

- The **Render dashboard** (https://dashboard.render.com) — for env vars.
- The **Stripe dashboard** (https://dashboard.stripe.com) in **Test mode** for now.
- The **Stripe CLI** installed (`stripe --version`), logged in (`stripe login`).
- A terminal in the repo root, on the `feature/pricing-overhaul` branch.

> ℹ️ **Important safety note:** once a Stripe secret key is set on a server, the API
> will **refuse to start** unless all four price IDs _and_ the webhook secret _and_
> the success/cancel URLs are also set. This is deliberate (it prevents charging
> customers you can't provision). It means: **finish Round A before you deploy.**

---

## ROUND A — Stripe + Render setup (test/dev)

### A1. Create the four subscription prices in Stripe (Test mode)

In the Stripe dashboard (Test mode), under **Products**, make sure you have these
four recurring prices (create the products/prices if they don't exist):

| What it's for      | Amount   | Billing period |
| ------------------ | -------- | -------------- |
| Team Pro – monthly | $9 / mo  | monthly        |
| Team Pro – yearly  | $79 / yr | yearly         |
| League – monthly   | $29 / mo | monthly        |
| League – season    | $199     | yearly/season  |

Copy each price's ID (looks like `price_1AbC...`). You'll paste them in step A3.

- [ ] Four test-mode prices exist and their IDs are copied.

### A2. Add metadata to each Stripe price

On **each** of the four prices, open it in Stripe and add two **metadata** fields:

| Price              | metadata `planId` | metadata `interval` |
| ------------------ | ----------------- | ------------------- |
| Team Pro – monthly | `team_pro`        | `monthly`           |
| Team Pro – yearly  | `team_pro`        | `season`            |
| League – monthly   | `league`          | `monthly`           |
| League – season    | `league`          | `season`            |

CLI alternative for each price:

```
stripe prices update <price_id> --metadata[planId]=team_pro --metadata[interval]=monthly
```

- [ ] All four prices have `planId` + `interval` metadata.

### A3. Put the price IDs into Render (the `-api-dev` service)

Two parts:

**(a) `render.yaml`** — edit the file, on the `-api-dev` service's `envVars`:

- **Delete** this line:
  ```yaml
  - key: STRIPE_PRICE_ID_PRO_MONTHLY
    sync: false
  ```
- **Add** these four (put them after `STRIPE_WEBHOOK_SECRET`):
  ```yaml
  - key: STRIPE_PRICE_ID_TEAM_MONTHLY
    sync: false
  - key: STRIPE_PRICE_ID_TEAM_SEASON
    sync: false
  - key: STRIPE_PRICE_ID_LEAGUE_MONTHLY
    sync: false
  - key: STRIPE_PRICE_ID_LEAGUE_SEASON
    sync: false
  ```
  (`sync: false` just means "the actual value is typed into the Render dashboard,
  not stored in this file.")

**(b) Render dashboard** → `-api-dev` service → **Environment** → set the values of
those four keys to the four **test-mode** price IDs you copied in A1.

- [ ] `render.yaml` updated for `-api-dev`.
- [ ] The four price ID values are set in the Render dashboard for `-api-dev`.

### A4. Update the env template files (housekeeping)

In **`env/server/.env.production`**, replace the empty line
`STRIPE_PRICE_ID_PRO_MONTHLY=` with these four empty keys (values stay blank — they
get filled at real launch, Round E):

```
STRIPE_PRICE_ID_TEAM_MONTHLY=
STRIPE_PRICE_ID_TEAM_SEASON=
STRIPE_PRICE_ID_LEAGUE_MONTHLY=
STRIPE_PRICE_ID_LEAGUE_SEASON=
```

> `env/server/.env.development` already has the four test-mode IDs. Leave its leftover
> `STRIPE_PRICE_ID_PRO_MONTHLY=` line alone — it's removed later with the seed cleanup.

- [ ] `.env.production` template updated.

### A5. Subscribe the Stripe webhook to the new events

In Stripe dashboard → **Developers → Webhooks** → your endpoint, make sure it's
subscribed to **all** of these events (the first three likely already are):

- `checkout.session.completed`
- `customer.subscription.created` / `.updated` / `.deleted`
- `invoice.payment_failed`
- `invoice.paid` ← **new** (renewals)
- `customer.subscription.trial_will_end` ← **new** (trial-ending email)

Without the two new ones, renewals and trial-ending emails silently never fire.

- [ ] Webhook is subscribed to all six event types (dev).

---

## ROUND B — Run the database migrations (dev)

⚠️ **This must happen before the branch's code serves traffic on dev.** The new code
only accepts the new plan values (`starter` / `team_pro` / `league`); the migrations
convert your existing data to those values. If code runs first, old records break.

Run from the **`server/`** folder. **Always run with `--dry-run` first** (it only
prints what it _would_ do), read the output, then run the same command **without**
`--dry-run` to apply it.

```
# 1. Convert plan names to the new values
ENV_FILE=../env/server/.env.development node src/scripts/migrate-unify-plan-enums.js --dry-run
ENV_FILE=../env/server/.env.development node src/scripts/migrate-unify-plan-enums.js

# 2. Remove dead user league-billing fields
ENV_FILE=../env/server/.env.development node src/scripts/migrate-drop-user-league-fields.js --dry-run
ENV_FILE=../env/server/.env.development node src/scripts/migrate-drop-user-league-fields.js

# 3. Add the unique index on league Stripe customer IDs
ENV_FILE=../env/server/.env.development node src/scripts/migrate-league-stripe-customer-index.js --dry-run
ENV_FILE=../env/server/.env.development node src/scripts/migrate-league-stripe-customer-index.js
```

> Script 3 will **stop and tell you** if two leagues share a Stripe customer ID —
> if that happens, fix those records by hand before re-running.

Then check it worked:

- [ ] No plan value is anything other than `starter` / `team_pro` / `league`.
- [ ] "We-ball Saturday" league still shows as active (via `billingSource: comp`).
- [ ] No user records still have `league*` fields.
- [ ] (Optional) re-seed dev with `pnpm seed` — it now writes the new plan values.

---

## ROUND C — Test the live Stripe wiring (dev)

Follow [`stripe-test-clock-runbook.md`](./stripe-test-clock-runbook.md). In short:
in one terminal run

```
stripe listen --forward-to localhost:4000/api/v1/billing/webhooks
```

then walk each scenario using a Stripe **test clock**:

- [ ] **Trial → active:** start a subscription with trial, advance the clock past the
      trial, confirm the paid invoice keeps access on.
- [ ] **Dunning:** force a failed renewal, confirm the resource goes `past_due` then
      downgrades, and the "payment failed" email fires.
- [ ] **Cancel:** cancel, confirm access lasts until period end, then downgrades.
- [ ] **Reactivate:** re-subscribe, confirm the plan is restored.
- [ ] **Comp grant immunity:** a Stripe event aimed at the We-ball (comp) league is
      ignored.
- [ ] **Duplicate purchase (from the audit, H2):** open checkout in two tabs and
      complete both — confirm you don't end up with two billed leagues / orphaned
      subscriptions. If you do, that's the remaining H2 work — tell the dev team
      before launch.

---

## ROUND D — Merge to `dev`

Only after Rounds A–C pass:

- [ ] Merge `feature/pricing-overhaul` → `dev`.
- [ ] Deploy dev and smoke-test: sign up, create a team, view the pricing page.

That completes the test-environment rollout. **Production is Round E, a separate
go-live decision.**

---

## ROUND E — Production launch (do this later, deliberately)

Repeat the same setup against **live** Stripe + the **prod** database:

- [ ] In Stripe **Live mode**: create the four live prices, add the same
      `planId` / `interval` metadata (Round A1–A2, live).
- [ ] Register the **live** webhook endpoint + its `STRIPE_WEBHOOK_SECRET`, subscribed
      to all six events (Round A5, live).
- [ ] In the Render dashboard for **`-api-prod`**: set the four live price IDs, the
      live secret key, the webhook secret, and the success/cancel URLs.
- [ ] Update `render.yaml` for `-api-prod` the same way as A3(a).
- [ ] **Back up the production database.**
- [ ] Run the three migrations against **prod** (Round B, with the prod `ENV_FILE`),
      `--dry-run` first.
- [ ] Flip the `/pricing` page from dev-only to live — the one-line change in
      `client/src/app/router/AppRouter.jsx`.
- [ ] Send launch comms.

---

## Known follow-ups (not blocking the merge — for the dev team)

These were found in the audit ([`18-audit-findings.md`](./18-audit-findings.md)) and
are **deferred on purpose**; noted here so they aren't forgotten:

- **Duplicate-purchase race (H2):** team re-checkout now reuses the Stripe customer
  and trial farming is closed, but fully preventing two _simultaneous_ league
  checkouts needs the live test-clock validation in Round C before launch.
- **League game freeze semantics (M17):** one-sided standalone games now freeze
  entitlements correctly; aligning league games to "live" is a separate change.
- **Team CSV export (M10):** "CSV export" is advertised for Team Pro but only
  league-scoped export exists today. Either build a team export or drop the claim
  from the pricing copy before launch.
- **Price-drift guard (M15) & PROJECT-KNOWLEDGE §6 (D1):** a CI check that catalog
  prices match Stripe, and the §6 doc rewrite, are to be done around the merge.
