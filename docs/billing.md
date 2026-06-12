# Billing

## Plans

### Free

Free is the product's growth engine. It includes:

- team creation and roster management
- game setup
- live stat tracking
- box scores
- public team pages
- public player pages
- explore feed visibility

### Team Pro

Team Pro is billed monthly per team. It unlocks:

- replay
- shot maps on public game pages
- priority billing support

## Billing Scope

Billing is tied to a single team, not a user account.

Each team can have its own plan and subscription status. A user with multiple teams can mix free and Pro teams.

## Entitlements

Team entitlements are derived from billing state:

- `canViewReplay`
- `canViewShotMaps`

Entitlements must be enforced server-side for premium data and mirrored client-side for paywall rendering.

## Billing Architecture

- React pricing page at `/pricing`
- Stripe Checkout for subscription start
- Stripe Billing Portal for subscription management
- Express webhook endpoint for subscription lifecycle updates
- Team document stores billing state
- Team billing success page polls owner team data to confirm access after redirect
- Webhook replay protection is keyed by Stripe webhook `event.id` and stored on the team document as a bounded recent-event history (capped at 25 entries via `MAX_PROCESSED_WEBHOOK_EVENT_IDS`; oldest entries evicted when the cap is exceeded). Idempotency checks consult both a `processedWebhookEventIds` array and a `lastWebhookEventId` field on the team document.
- After every webhook mutation, `syncOwnerPlan` re-scans all teams owned by the affected user and sets their user plan to `pro` if any team has an active Pro subscription, or `free` otherwise. This means `user.plan` reflects whether the user owns _any_ Pro team, not just the one being updated.

## Source of Truth

Stripe webhooks are the source of truth for plan activation and cancellation. The client never promotes a team to Pro directly.

## Operational Notes

- Checkout success and cancel redirects include the relevant `teamId` so the client can return the user to the correct billing context.
- Pricing should only route a team to the billing portal when that team is already `pro` with an `active` or `trialing` subscription status.
- Non-active Pro-like states such as `past_due` should not be treated as fully upgraded access.
- Replay and public shot-map gating should always follow the backend entitlement result, not just client route assumptions.
