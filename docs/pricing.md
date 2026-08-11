# Pricing And Billing

`server/src/modules/billing/plan-catalog.js` is the source of truth for display
pricing, Stripe price keys, and entitlements. Stripe price objects are the
authority for charged amounts.

| Plan       | Scope  | Display price            | Main grants                                                |
| ---------- | ------ | ------------------------ | ---------------------------------------------------------- |
| `starter`  | Team   | Free                     | Tracking and box scores                                    |
| `team_pro` | Team   | $9/month or $79/year     | Replay, shot maps, highlights, history, CSV, rich profiles |
| `league`   | League | $29/month or $199/season | League management and Team Pro for league teams            |

Feature code should consume `entitlements.service.js`; do not add direct plan
comparisons outside the catalog and resolver boundary.

When `STRIPE_SECRET_KEY` is configured, the server also requires the webhook
secret, success/cancel URLs, and all four price IDs:

```text
STRIPE_PRICE_ID_TEAM_MONTHLY
STRIPE_PRICE_ID_TEAM_SEASON
STRIPE_PRICE_ID_LEAGUE_MONTHLY
STRIPE_PRICE_ID_LEAGUE_SEASON
```

Checkout uses Stripe-hosted pages. Webhooks own activation, renewal, failure,
and cancellation state. Comped resources are isolated with
`billingSource: 'comp'`. The production `/pricing` route is currently disabled.

Launch work: [`pricing-manual-actions.md`](./pricing-manual-actions.md).
Lifecycle checks: [`stripe-test-clock-runbook.md`](./stripe-test-clock-runbook.md).
