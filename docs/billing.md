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

## Source of Truth

Stripe webhooks are the source of truth for plan activation and cancellation. The client never promotes a team to Pro directly.
