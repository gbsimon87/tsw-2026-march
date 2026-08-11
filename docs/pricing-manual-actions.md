# Billing Launch Checklist

Use this checklist only for environment work that cannot be completed in code.
Verify existing Stripe, Render, and database state before changing it.

## Development

- [ ] In one Stripe test environment, create the four recurring prices shown in
      [`pricing.md`](./pricing.md).
- [ ] Set the matching test price IDs, `STRIPE_SECRET_KEY`, webhook secret, and
      success/cancel URLs on `tsw-2026-march-api-dev`.
- [ ] Register the dev webhook at `/api/v1/billing/webhooks` for:
      `checkout.session.completed`, `customer.subscription.created`,
      `.updated`, `.deleted`, `invoice.payment_failed`, `invoice.paid`, and
      `customer.subscription.trial_will_end`.
- [ ] Confirm the Stripe secret, prices, and webhook belong to the same Stripe
      test environment.

If legacy records may remain, inspect each migration with `--dry-run`, then run
it without the flag:

```bash
cd server
ENV_FILE=../env/server/.env.development node src/scripts/migrate-unify-plan-enums.js --dry-run
ENV_FILE=../env/server/.env.development node src/scripts/migrate-drop-user-league-fields.js --dry-run
ENV_FILE=../env/server/.env.development node src/scripts/migrate-league-stripe-customer-index.js --dry-run
```

- [ ] Confirm plans are `starter`, `team_pro`, or `league`.
- [ ] Confirm comped resources still use `billingSource: 'comp'` and remain
      active.
- [ ] Run the lifecycle checks in
      [`stripe-test-clock-runbook.md`](./stripe-test-clock-runbook.md).
- [ ] Smoke-test team checkout, league checkout, portal return, entitlement
      changes, and duplicate checkout attempts.

## Production

- [ ] Back up MongoDB using
      [`mongodb-production-backup.md`](./mongodb-production-backup.md).
- [ ] Create live prices and a live webhook with the same event set.
- [ ] Set production-only Stripe values on `tsw-2026-march-api-prod`.
- [ ] Dry-run and, if needed, apply the three migrations against production.
- [ ] Test checkout and webhook delivery with a controlled live purchase.
- [ ] Enable `/pricing` in `AppRouter.jsx` only after billing is approved for
      launch.

## Known Launch Gaps

- Team Pro advertises CSV export, but current CSV routes cover claimed league
  profiles, leagues, and league teams, not standalone teams.
- Simultaneous duplicate league checkouts need live integration validation.
- Catalog display prices have no automated drift check against Stripe.
