# Stripe Lifecycle Checks

Run only in Stripe test mode against a disposable database. Automated coverage
is in `server/src/tests/unit/billing.lifecycle.test.js`; this checklist verifies
the real Stripe webhook path.

## Setup

```bash
pnpm --filter server stripe-listen
```

Use the listener's signing secret as the local `STRIPE_WEBHOOK_SECRET`, then
restart the API. Start subscriptions through the app's Checkout flow so Stripe
receives the resource metadata used by webhook handlers.

A subscription created directly in the Stripe Dashboard is not sufficient: it
will not update TSW unless its customer and metadata map to a real Team or
League. A clocked Team test requires linking the clock customer to the test
Team before app Checkout. A clocked League test needs a developer fixture
because the League record is created only after Checkout.

Useful Stripe test cards:

| Card                  | Behavior                               |
| --------------------- | -------------------------------------- |
| `4242 4242 4242 4242` | Successful payment and renewal         |
| `4000 0000 0000 0341` | Initial success, later renewal failure |

## Scenarios

| Scenario           | Action                                                 | Expected app state                                                    |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Trial to active    | Start a 14-day trial; advance beyond trial end         | Trial access remains enabled; `invoice.paid` changes status to active |
| Failed renewal     | Advance a subscription using the renewal-failure card  | Status becomes past due and paid entitlements lock; data remains      |
| Cancellation       | Cancel at period end; advance beyond it                | Access remains until period end, then resource returns to Starter     |
| Reactivation       | Start a new subscription for the same resource         | Paid plan and entitlements return                                     |
| Comp immunity      | Send subscription events referencing a comped resource | Plan, status, and entitlements remain unchanged                       |
| Duplicate checkout | Complete two checkout sessions for one resource        | No duplicate billed resource or orphaned subscription                 |

For every scenario, confirm the event reaches the listener, the webhook returns
2xx, the resource fields change once, and the UI reflects resolved
entitlements. Record unexpected event type, resource ID, request ID, and Stripe
event ID.
