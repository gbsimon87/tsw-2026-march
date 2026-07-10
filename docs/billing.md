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

Team Pro is billed per team, **monthly ($12/mo) or per season ($89/season)**. It unlocks:

- replay
- shot maps on public game pages
- highlight clips
- priority billing support

### League Pro

League Pro is billed per league, **monthly ($49/mo) or per season ($299/season)**, and unlocks league management/creation. League billing state lives on the `League` document (the source of truth); a per-user `league*` entitlement mirror on the account also exists but the League record is authoritative.

> Display prices come from `client/src/features/billing/pages/PricingPage.jsx`; the actual amounts are set on the Stripe prices referenced by `STRIPE_PRICE_ID_TEAM_MONTHLY|SEASON` and `STRIPE_PRICE_ID_LEAGUE_MONTHLY|SEASON`.

> **Naming collision to know:** `League.billingInterval` (`'monthly' | 'season' | null`) is Stripe **billing cadence** — unrelated to the `Season` entity introduced by the League Seasons feature (`server/src/modules/leagues/seasons.repository.js`, see [`docs/league-seasons/`](./league-seasons/)). A League's billing interval can be `'season'` while the League has any number of `Season` documents — these are orthogonal concepts that happen to share a word. Season creation/completion does not read or modify billing fields at all; it only checks the existing `canManageLeague` entitlement.

## Billing Scope

Billing is **resource-scoped** — tied to a single Team or a single League, not a user account.

Each team/league has its own plan and subscription status. A user with multiple teams can mix free and Pro teams. Checkout supports a 14-day trial and both `monthly` and `season` intervals (`billing.validation.js`).

## Entitlements

Team entitlements are derived from billing state:

- `canViewReplay`
- `canViewShotMaps`

Entitlements must be enforced server-side for premium data and mirrored client-side for paywall rendering.

## Billing Architecture

- React pricing page at `/pricing` (**dev-only** — redirects to `/pulse` in production; billing is not yet publicly launched)
- Stripe **hosted** Checkout for subscription start (no client-side Stripe.js); returned URLs are validated with `isSafeStripeUrl()` before redirect
- Stripe Billing Portal for subscription management
- Stripe SDK pinned to `apiVersion: '2024-06-20'`
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
