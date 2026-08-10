# 00 · Overview

## Why we're doing this

TSW's billing was built up feature-by-feature (Team Pro, then League Pro, then
follow-on fixes) and **never publicly launched** — `/pricing` redirects to `/pulse`
in production. That "not yet live" status is an asset: we can redesign the
commercial model cleanly, without a painful in-flight migration of paying customers
(the user base is tiny today).

Three problems make the current implementation unfit to launch as-is:

1. **The model is wrong for the product.** Earlier strategy work established that TSW
   is a two-sided network — a supply side that _creates_ stats (teams, leagues) and a
   demand side that _consumes_ them (players, fans). We should monetize the supply
   side and keep the demand side free. The current code instead gates core value
   (game tracking) behind payment while giving away nothing that scales.
2. **The implementation can't absorb pricing change.** Prices and plan names are
   hard-coded across the client and server; entitlements are scattered all-or-nothing
   booleans; three plan enums disagree; a parallel league-entitlement path is
   effectively dead. Changing a plan today means hunting through code.
3. **There is accumulated debt** that will make every future pricing change harder
   (see [`12-technical-debt.md`](./12-technical-debt.md)).

This initiative fixes all three: it repackages/reprices to the agreed model **and**
introduces a config-driven architecture so the model can evolve cheaply.

## Goals

- Ship the agreed **3-plan model** (Starter / Team Pro / League) with the agreed
  launch prices ($9/$79, $29/$199).
- Make pricing **config-driven**: one plan catalog is the single source of truth for
  plans, prices, and entitlements, consumed by both server and client.
- Introduce a **central entitlement resolver**; eliminate scattered `plan === 'x'`
  checks and the parallel dead path.
- **Free the core:** live tracking + box scores require no payment.
- Reconcile the **three plan enums**, remove dead fields/components, and add
  **server-side redirect-URL safety**.
- Provide a **safe, idempotent, reversible migration** and a **separate, gated
  launch**.

## Non-goals (this phase)

- **Team Pro → player-profile cascade** — designed here, built as a fast-follow.
- **Free-tier limit enforcement** (1 team, history lock) — designed here, built as a
  fast-follow. Free stays effectively unlimited until then.
- **Consumer / Club / Tournament / Enterprise tiers** — explicitly cut from the model.
- **Going live in production** — all engineering happens on a branch; `/pricing`
  stays prod-gated. Go-live is a separate decision (see
  [`17-launch-checklist.md`](./17-launch-checklist.md)).
- **A `Subscription` collection / normalized billing store** — evaluated and
  rejected for now (see decision log).
- **New premium features** (coach reports, season trends, sponsor toolkit, analytics)
  — they belong to the product roadmap, not this billing overhaul, though the catalog
  reserves their entitlement keys.

## Decision log

| #   | Decision                                                                                                                  | Rationale                                                                                                                                                                                                                                         | Status      |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| D1  | **3 plans only** (Starter/Team Pro/League); cut consumer/club/tournament/enterprise                                       | Fits the two-sided network; matches what's actually built; avoids selling unbuilt tiers                                                                                                                                                           | Locked      |
| D2  | **Free includes live tracking + box scores** (remove the 402 paywalls at `games.service.js:1077,1400`)                    | Free is the acquisition engine; monetize depth, not the core loop                                                                                                                                                                                 | Locked      |
| D3  | **Launch prices $9/$79 (Team Pro), $29/$199 (League)** — explicit launch pricing, raise later; grandfather early adopters | Low friction while base is small; per-player framing makes $199 an easy yes                                                                                                                                                                       | Locked      |
| D4  | **Architecture-first scope**; cascade + free-tier limits are specced now, built as fast-follows                           | Smallest blast radius; get the pricing/entitlement spine right first                                                                                                                                                                              | Locked      |
| D5  | **Build on a branch, launch separately**; `/pricing` stays prod-gated                                                     | De-risk; prove in dev; go-live is a deliberate 1-line flip + checklist                                                                                                                                                                            | Locked      |
| D6  | **Config-driven plan catalog** is the single source of truth; served to the client via an API                             | Kills client/server price drift; "add a plan = edit one file"                                                                                                                                                                                     | Recommended |
| D7  | **Central entitlement resolver**; no `plan === 'x'` outside the catalog                                                   | Removes scattered, inconsistent checks; per-feature granularity                                                                                                                                                                                   | Recommended |
| D8  | **No `Subscription` collection** — keep denormalized billing on Team/League                                               | At this scale it adds a join + a second source of truth for no in-scope benefit; denormalized state already has atomic idempotency + zero-extra-query resolves. **Revisit when:** billing history/audit needed, or one payer funds many resources | Recommended |
| D9  | **`billingSource` field** (`stripe`/`manual`/`comp`) to make comp grants first-class; webhooks skip non-Stripe docs       | Replaces the We-ball Saturday magic-`'pro'` hack safely                                                                                                                                                                                           | Recommended |
| D10 | **Canonical plan ids** `starter`/`team_pro`/`league`; legacy `'pro'` tolerated only via `normalizePlanId` shim            | One vocabulary; migration-safe                                                                                                                                                                                                                    | Recommended |

_"Locked" = confirmed by the product owner. "Recommended" = architect's call, open to
review during Phase 1 sign-off._

## The two-sided model (one-paragraph recap)

Monetize the **supply side** (teams buy Team Pro; leagues buy League). Keep the
**demand side free forever** (players, parents, fans follow, view, and share at no
cost) because free consumers are the growth engine, not a revenue line. The (future)
Team Pro → player-profile cascade is the bridge: a paid team's subscription lights up
its players' public profiles for free, which they then share, pulling new teams and
leagues in. Full rationale in the commercial-strategy artifacts that preceded this
folder; the authoritative model is [`02-pricing-model.md`](./02-pricing-model.md).

## Glossary

- **Plan** — a purchasable tier: `starter`, `team_pro`, `league`.
- **Entitlement** — a boolean capability (e.g. `canViewReplay`) derived from a plan +
  subscription status. Features check entitlements, never plans.
- **Plan catalog** — the config module that maps plans → prices + entitlements +
  limits. Single source of truth.
- **Entitlement resolver** — the service that turns a resource (team/league/user) into
  its current entitlement set.
- **Billing source** — how a resource is entitled: `stripe` (real subscription),
  `comp` (free grant), `manual` (hand-set).
- **Cascade** — Team Pro entitlements flowing to that team's player profiles (and
  League bundling Team Pro to all member teams). Fast-follow.
- **Snapshot / freeze** — entitlements recorded onto a `Game` at event time so a later
  downgrade never retroactively locks historical data.
- **Resource-scoped billing** — subscriptions attach to a Team or a League, not a user
  account.
