# 02 · Pricing Model (authoritative)

> This is the definitive statement of the commercial model. Where the strategy
> artifacts and this file differ, **this file wins**. Prices are **launch prices** —
> intentionally low while the base is small, raise later, grandfather early adopters.

## The three plans

|                    | **Starter**             | **Team Pro**                   | **League**                      |
| ------------------ | ----------------------- | ------------------------------ | ------------------------------- |
| Buyer              | Any coach with one team | Competitive / club / AAU teams | League organizers               |
| Billing unit       | per team                | per team                       | per league                      |
| Monthly            | **Free**                | **$9/mo**                      | **$29/mo**                      |
| Annual / Season    | —                       | **$79/yr**                     | **$199/season**                 |
| Per-player framing | —                       | —                              | **~$2/player** (12-team league) |
| Card required      | No                      | Yes (14-day trial)             | Yes (14-day trial)              |

### Starter (Free) — the acquisition engine

Live tracking, box scores, public team/player pages, following any public team/league,
shareable cards + The Pulse. **No card, no trial.** Proposed limits (1 team, recent
history) are _not enforced yet_ (fast-follow). This is deliberately generous: free
users create the data and the shareable content that pull in paying buyers.

### Team Pro — depth for serious teams

Everything in Starter **plus** replay, public shot maps, highlight clips, full
historical stats, CSV export, priority support. **Fast-follows:** rich player profiles
(the cascade), post-game coach reports, season trends.

### League — run the whole competition

Everything a league needs: standings, rosters, join requests, scheduling, public
league homepage, dual-team tracking, **plus Team Pro bundled for every team in the
league**, plus priority support. The bundle is the key value lever — a 12-team league
gets what would be $79×12 of team features folded into one $199 season price.

## Billing model (why these units)

Full analysis in [`08-entitlements-and-gating.md`](./08-entitlements-and-gating.md);
the short version:

- **Bill the entity with budget:** a team (owner pays) or a league (organizer pays
  from registration fees). ✅ primary units.
- **Never meter the axis you want maximized:** games, players, admins. ❌ Per-game
  taxes tracking (the exact behavior the network needs); per-player creates
  roster-churn proration disputes; per-admin punishes recruiting volunteers.
- **Per-player is a _framing_ device, not a billing unit** — show "~$2/player" on the
  League card to pre-write the organizer's justification to their board; still bill one
  flat per-league price.
- **Season-aligned billing** for League matches the sport's cycle and de-risks the
  "am I paying in the off-season?" objection. Annual for Team Pro.

## What's deliberately NOT in the model

- **No consumer / fan / player-family paid tier.** Fans, parents, and players are the
  free demand side — the growth engine. Monetizing them would starve the funnel, and
  TSW's YouTube-linked video has no native-streaming hook to sell anyway.
- **No Club, Tournament, or Enterprise tier.** Club overlapped League; Tournament and
  Enterprise depend on unbuilt features (brackets, white-label, API). A single
  _"Running a school program or multiple leagues? Get in touch"_ contact line covers
  the rare large prospect, promising only what exists (multiple leagues, onboarding,
  priority support).

## Legacy / special cases

- **Legacy `'pro'` plan value** is retired from the vocabulary but tolerated at read
  time via `normalizePlanId` so un-migrated docs resolve correctly (see
  [`05-architecture.md`](./05-architecture.md)).
- **We-ball Saturday** (a league on a manual `'pro'` grant, no Stripe subscription)
  becomes a first-class **comp grant** via `billingSource: 'comp'` rather than a magic
  plan string.

## Pricing evolution (design-for-change)

The model _will_ change. The architecture makes that cheap:

- **Raising prices:** edit `plan-catalog.js`; grandfather existing subscribers (their
  Stripe price is unchanged; only new checkouts use the new price ID).
- **Adding a plan** (e.g. a future _League Pro_ once analytics/sponsor tools ship): add
  a catalog entry + Stripe product/price + entitlement keys. No feature-code changes if
  the features already check entitlements.
- **Moving a feature between plans:** change its entitlement assignment in the catalog.

See [`03-feature-packaging.md`](./03-feature-packaging.md) for the feature→plan matrix
and reserved future entitlement keys.
