# Payment Webhooks

> Part of the [Application Audit](./README.md) · July 2026

Endpoint: `POST /api/v1/billing/webhooks`. Mounted in `server/src/app.js:34-38`
with `express.raw({type:'application/json'})` **before** `express.json`,
CSRF, and rate limiting — required for Stripe signature verification
(`stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`,
`billing.service.js:492`).

## Event handling (`handleWebhookEvent`, `billing.service.js:487-534`)

Dispatch keys off `metadata.resourceType` (`team` | `league`):

| Event                                                          | Team path                                                                   | League path                                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`                                   | `markTeamFromCheckoutSession` (`:373-387`) — stores customerId/billingEmail | `createLeagueFromCheckoutSession` (`:421-447`) — **creates the placeholder League** ("My League", random slug, plan free), keyed by `stripeCustomerId` uniqueness |
| `customer.subscription.created/updated/deleted`                | `updateTeamFromSubscription` (`:389-401`, lookup by `metadata.teamId`)      | `updateLeagueFromSubscription` (`:449-463`, lookup by `stripeCustomerId`)                                                                                         |
| `invoice.payment_failed`                                       | `markTeamInvoiceFailure` → `past_due`                                       | `markLeagueInvoiceFailure` → `past_due`                                                                                                                           |
| `invoice.paid`, `customer.subscription.trial_will_end`, others | ignored (`:527-530`)                                                        |

After team events, `syncOwnerPlan` recomputes the owner's `User.plan` from all
their teams.

## Idempotency

Per-resource ring buffer: `processedWebhookEventIds[]` capped at 25
(`MAX_PROCESSED_WEBHOOK_EVENT_IDS`, `billing.service.js:22,125-148`) +
`lastWebhookEventId`, stored on the Team/League doc.

Limitations:

1. **Not atomic** — read-modify-save; two concurrent deliveries of the same
   event can both pass the check. Low practical risk (Stripe retries are
   spaced), but an atomic `$addToSet` + `$slice` update, or a dedicated
   `webhook_events` collection with a unique index on event id, would close it.
2. Ring of 25 means a very delayed retry (>25 events later) reprocesses — the
   handlers are effectively idempotent upserts, so impact is low.
3. No global dedupe across resources (events are resource-scoped anyway).

## Ordering & consistency notes

- League creation from webhook + later claim by literal name `'My League'`
  (`leagues.service.js:398-401`) is the most fragile link in the chain — if a
  user renames the placeholder or owns another league with that name, claiming
  misbehaves.
- `subscription.current_period_end` read at top level; deprecated in newer
  Stripe API versions and the client is initialised without a pinned
  `apiVersion` — pin it.
- Webhook processing is synchronous but cheap (single doc update + owner-teams
  load); no queue needed at current scale.

## Local development

`pnpm stripe-listen` forwards events (see `docs/stripe-development-setup.md`
and `docs/qa-billing-dev.md`).
