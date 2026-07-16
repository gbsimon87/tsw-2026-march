# 17 · Launch Checklist

> The **separate, gated go-live** (D5). Everything else can be built and merged to `dev`
> with `/pricing` still prod-gated; this checklist is the deliberate flip to production.
> Do not start until Phases 2–7 are complete and verified.

## Pre-flight (engineering complete)

- [ ] Phases 2–7 merged to `dev` and soak-tested.
- [ ] Server suite green (`pnpm --filter server test`); client diff explained vs the
      recorded baseline.
- [ ] `pnpm check-env && pnpm lint && pnpm test && pnpm build` all pass.
- [ ] Dependency-contract test (T-04) green.
- [ ] Stripe test-clock scenarios (T-27) pass in dev.

## Stripe (production)

- [ ] Create **live** products: Team Pro, League.
- [ ] Create **live** prices with correct amounts ($9/mo, $79/yr, $29/mo, $199/season)
      and `{planId, interval}` metadata.
- [ ] Enable **promotion codes** on Checkout; create launch coupons (`LAUNCH`,
      `NONPROFIT`/`SCHOOL`) if using.
- [ ] Configure the **Customer Portal** (update card, invoices, cancel-at-period-end,
      interval switch).
- [ ] Register the **live webhook endpoint** (`/api/v1/billing/webhooks`) for the
      handled events (checkout.session.completed, customer.subscription.\*, invoice.paid,
      invoice.payment_failed, customer.subscription.trial_will_end); copy the signing
      secret.

## Environment / infra

- [ ] Set prod Render env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the **four**
      TEAM/LEAGUE price IDs, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`.
- [ ] Confirm `render.yaml` `-api-prod` lists the four price IDs (T-07); `PRO_MONTHLY`
      removed.
- [ ] Verify `superRefine` fires if any price ID is missing (fail-fast, not silent 503).
- [ ] Confirm success/cancel URLs point at prod (`https://thesportyway.com/billing/...`).

## Data migration (production)

- [ ] **Fresh production DB backup** (`docs/mongodb-production-backup.md`).
- [ ] `migrate-unify-plan-enums.js --dry-run` → review parity report.
- [ ] `migrate-unify-plan-enums.js` (real run).
- [ ] `migrate-drop-user-league-fields.js --dry-run` → then real run.
- [ ] `migrate-league-stripe-customer-index.js --dry-run` (dedup check) → then real run.
- [ ] Deploy the enum-tightening code (schema canonical-only) **after** migration
      verified.
- [ ] Run post-migration validation checklist ([`13`](./13-migration-plan.md)).
- [ ] Spot-check a real subscriber + We-ball Saturday (comp) resolve correctly.

## The flip

- [ ] Remove the prod gate in `AppRouter.jsx:194-199` (T-30) — `/pricing` renders in
      production.
- [ ] Confirm all `/pricing` CTAs now reach a live page (no dead-ends).
- [ ] Add the nav "Plans/Upgrade" affordance (kept out until now).

## Smoke test (production, real card or Stripe live-test)

- [ ] Free signup → create team → **track a game with no paywall**.
- [ ] Team Pro checkout → trial → entitlements on (replay/shot maps/export).
- [ ] League checkout → league provisioned → member teams get bundled Team Pro.
- [ ] Customer Portal opens; cancel-at-period-end works.
- [ ] Webhook events land and update state (check logs / Stripe dashboard).
- [ ] CSV export gated correctly (402 free, 200 Pro).

## Communications

- [ ] Launch email / in-app announcement (new plans, free tracking, prices).
- [ ] Update marketing entry point to `/pricing`.
- [ ] Update `docs/billing.md` and `PROJECT-KNOWLEDGE.md` §6 to the new model.
- [ ] Note the launch in the README status board here (Phase 8 → ✅).

## Rollback plan

- [ ] **Fastest revert:** re-enable the `/pricing` prod gate (one line) — hides the new
      surface without touching data.
- [ ] Billing bug: disable checkout (env unset → 503) while investigating; existing
      subscriptions unaffected (Stripe is source of truth).
- [ ] Data issue: restore from the pre-migration backup; the tolerant resolver keeps
      the app functional against mixed data during recovery.
- [ ] Keep the backup for at least the first full billing cycle post-launch.

## Post-launch watch (first 2 weeks)

- [ ] Monitor webhook error rate + `past_due` transitions.
- [ ] Watch checkout conversion vs the pricing-page views (validate the $199/$9
      launch prices — see the A/B experiments in the strategy artifacts).
- [ ] Confirm no `plan==='x'` regressions slipped in (grep + code review).
- [ ] Schedule fast-follows F-01 (cascade) and F-02 (free-tier limits) per product
      priority.
