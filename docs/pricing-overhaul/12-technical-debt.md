# 12 · Technical Debt

> Debt this project retires (or explicitly defers), with how each is addressed. Sourced
> from [`01-current-state-audit.md`](./01-current-state-audit.md).

## Retired by this project

| #   | Debt                                                           | Evidence                                                                                 | Fix                                                             | Phase |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- | :---: |
| T1  | **Three inconsistent plan enums**                              | User `['free','pro']`, Team `+'team'`, League `+'league'` (audit §4)                     | Canonical `starter`/`team_pro`/`league`; `normalizePlanId` shim |  2/6  |
| T2  | **Scattered `plan==='x'` / all-or-nothing entitlement checks** | `billing.service.js:62-95`, `games.service.js` fallbacks                                 | Central resolver; features read entitlements                    |  2/4  |
| T3  | **Parallel dead league-entitlement path**                      | `auth.service.js:78-87` checks `'pro'` only; reads seed-only fields                      | Delete; fold into `resolveForUser`                              |   4   |
| T4  | **Dead `User.league*` fields**                                 | `auth.repository.js:13-23`, written only by `seed.js`                                    | Drop + `$unset` migration                                       |   6   |
| T5  | **Hard-coded stale prices in client**                          | `PricingPage.jsx:27-30` (`$12/$89` vs agreed `$9/$79`)                                   | Served catalog; delete literals                                 |  2/5  |
| T6  | **Hard-coded plan/interval/trial literals**                    | `plan:'team'`, `trial:14`, interval strings across billing.service                       | Read from catalog                                               |   4   |
| T7  | **Legacy `STRIPE_PRICE_ID_PRO_MONTHLY`**                       | declared in `env.js:38` + `render.yaml`, never read                                      | Remove after migration                                          |  3/6  |
| T8  | **`render.yaml` missing real price IDs**                       | only `PRO_MONTHLY` present (audit §5)                                                    | Add 4 TEAM/LEAGUE IDs; align to env-matrix                      |   3   |
| T9  | **No server-side redirect-URL validation**                     | `isSafeStripeUrl` client-only; `appendQueryParam` unvalidated                            | `utils/stripeUrl.js` + apply to 4 session creators              |   4   |
| T10 | **We-ball Saturday magic `'pro'`**                             | synthetic non-persisted `plan:'pro'` (`leagues.service.js:2454`)                         | First-class `billingSource:'comp'`                              |  4/6  |
| T11 | **League create-webhook race**                                 | dedup by `stripeCustomerId`, no unique index (audit §1)                                  | Unique sparse index (after dedup)                               |   6   |
| T12 | **Dead `GameShotMap.jsx`**                                     | implemented, imported nowhere (audit §8)                                                 | Delete                                                          |   5   |
| T13 | **Backward-compat billing aliases**                            | `createCheckoutSession`/`createCustomerPortalSession`/`getBillingSummary` + legacy route | Remove after callers migrated                                   |  4/5  |
| T14 | **`invoice.paid` / `trial_will_end` are no-ops**               | `billing.service.js:511-514`                                                             | Handle: renewal confirm + trial-ending email                    |   4   |
| T15 | **Env allows partial Stripe config**                           | all Stripe vars `.optional()` → silent 503                                               | `superRefine`: secret set ⇒ price IDs required                  |   3   |

## Deliberately deferred (documented, not this project)

| #   | Item                                                               | Why deferred                                              | Where tracked              |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------- |
| D-a | **Free-tier limit enforcement** (1 team, history lock)             | Fast-follow per D4; free stays unlimited until then       | `02`, `08`                 |
| D-b | **Team Pro → player cascade build**                                | Fast-follow per D4; designed in `05` §3                   | `03`, `05`                 |
| D-c | **`Subscription` collection**                                      | Rejected at current scale (D8); revisit for audit/history | `05` rejected-alternatives |
| D-d | **Client data-fetch migration to TanStack Query** on billing pages | Optional; OPT-014b owns it                                | `PROJECT-KNOWLEDGE.md` §8  |
| D-e | **Scheduled emails (weekly reminders)**                            | No job queue; only per-event sends feasible now           | `ideas.md` Tier 3          |
| D-f | **`User.roles`** unused/unenforced                                 | Out of billing scope; noted for a future auth cleanup     | audit §8                   |

## Debt this project must be careful NOT to add

- **New `plan==='x'` checks** — banned; use the resolver. Enforce via code review + the
  dependency-contract test.
- **New hard-coded prices** anywhere but the catalog.
- **Half-migrated CTAs** — either all pricing CTAs reflect the new model or none (avoid
  a confusing mixed state during the gated period).
- **Snapshot shape assumptions** — always default absent snapshot keys; never assume a
  historical game has the full key set.
- **Doc drift** — update `billing.md` and `PROJECT-KNOWLEDGE.md` §6 at launch (Phase 8),
  or this folder itself becomes stale debt.
