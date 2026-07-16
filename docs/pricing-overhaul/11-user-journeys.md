# 11 · User Journeys

> The experience the overhaul must deliver, end to end. Each journey notes what's
> **built**, **changed**, or **fast-follow**.

## J1 · New coach → free tracking → upgrade

1. **Sign up** (email or Google) — no card. _(built)_
2. Create a team, set roster. _(built)_
3. **Track a real game — free.** No paywall. _(changed: D2 removes the 402)_
4. View box score, recap, share a card to The Pulse. _(built, free)_
5. Hit a premium gate — open the **Replay** tab or try **CSV export** → contextual
   `LockedFeatureCard` / inline upsell. _(changed: resolver-driven; export now hard-gated)_
6. Click **Start 14-day trial** → hosted Checkout (card required) → `trialing`. _(built)_
7. Trial → `active` on first successful charge; day-11 **trial-ending email**.
   _(changed: `trial_will_end` now handled)_

**Key change:** the value ladder inverts correctly — you experience the core product
free, and pay for depth once you want it. Previously step 3 was blocked.

## J2 · League organizer → run a league

1. Sign up; land on Admin. _(built)_
2. Click **Create League** / **New League** → `/pricing`. _(built; prod-gated until launch)_
3. Choose **League** plan → hosted Checkout (card, 14-day trial). _(built)_
4. Webhook provisions the League doc (`billingSource:'stripe'`), sets `plan:'league'`,
   `subscriptionStatus:'trialing'`. _(changed: canonical plan id; plan derived via
   `planForPriceId`)_
5. `BillingSuccessPage` polls until active → **"Set up your league"** → configure teams,
   rosters, schedule. _(built)_
6. Every team in the league gets **Team Pro entitlements bundled** — replay, shot maps,
   highlights across all league games. _(changed: bundle via resolver)_
7. Season ends → renewal reminder (14 & 3 days) → auto-renew or one-click pause.
   _(changed: `invoice.paid` handled; reminders are a comms fast-follow)_

## J3 · Player / parent / fan (always free)

1. Discover a public team/league/player page (no account needed). _(built)_
2. Sign in and **follow** any public team, league, or league-team. _(built — Follow v1.5)_
3. See followed activity, view box scores, share cards. _(built, free)_
4. On a Team Pro team, the player's public profile shows **rich sections** (shot maps,
   advanced stats) at no cost to them. _(fast-follow: the cascade)_

**No paywall ever touches this journey** — it's the growth engine.

## J4 · Billing lifecycle (management)

- **Manage:** Admin/team page shows "Plan · Manage billing →" → hosted **Customer
  Portal** (card, invoices, cancel, interval switch). _(changed: add visibility;
  portal built)_
- **Upgrade:** immediate, prorated (Stripe).
- **Downgrade / cancel:** effective at period end; access retained until then; honest
  cancel flow (reason, offer pause). _(portal built; in-app cancel UX polish is
  fast-follow)_
- **Failed payment:** `past_due` grace period + dunning email; downgrade to Starter if
  unresolved. Data is **never deleted**. _(changed: `invoice.payment_failed` → email)_
- **Reactivation:** re-subscribe restores the prior plan; data was never gone. _(built
  via Checkout)_

## J5 · Comp grant (support/partners, e.g. We-ball Saturday)

1. Support sets a League to `billingSource:'comp'`, `plan:'league'`,
   `subscriptionStatus:'active'`. _(changed: first-class, replaces magic `'pro'`)_
2. Resolver treats it active regardless of Stripe fields.
3. Stripe webhooks **skip** the doc (`billingSource !== 'stripe'`) — no event can reset
   the grant.

## J6 · Downgrade & historical data (freeze safety)

1. A Team Pro team lapses to Starter.
2. New games lose replay/shot-map entitlements going forward.
3. **Games recorded while Pro keep replay/shot maps** — the frozen
   `entitlementsSnapshot` governs, not the live plan. _(changed: guard reads snapshot)_

## Cross-journey guarantees

- **Free is genuinely free** for tracking, viewing, following, sharing.
- **Data is never destroyed** on downgrade/cancel — access may lock, data persists.
- **No global nags** — upgrade prompts are contextual to an attempted action.
- **`/pricing` stays prod-gated** until launch; all upgrade journeys are testable in dev
  and behind the gate in prod until the flip.
