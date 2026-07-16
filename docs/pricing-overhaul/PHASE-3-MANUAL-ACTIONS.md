# Phase 3 — Manual actions (infra & Stripe)

> The code parts of Phase 3 (T-06, and the T-07 env schema) are **done and merged on
> `feature/pricing-overhaul`**. The items below are the parts that **cannot** be done
> from a code edit — `render.yaml` and `env/server/.env.*` are managed by hand via the
> Render dashboard ([`docs/security.md`](../security.md) §Secret Management), and Stripe
> price metadata lives in the Stripe dashboard. Do these before Phase 4 checkout work is
> exercised against real Stripe, and again for prod at launch (Phase 8).

## What already landed in code

- **T-06** — `billing.service.js` resolves price IDs via `resolvePriceId(planId, interval)`
  and trial length via `trialDaysFor(planId, interval)` from `plan-catalog.js`. No env-var
  names or hard-coded `14` remain in the checkout path.
- **T-07 (code)** — `env.js` retired `STRIPE_PRICE_ID_PRO_MONTHLY` and added a
  `superRefine`: once `STRIPE_SECRET_KEY` is set, all four TEAM/LEAGUE price IDs are
  **required** (fail-fast at boot instead of a silent checkout 503). `envSchema` is now
  exported and unit-tested (`env.schema.test.js`).

## T-07 · `render.yaml` (by hand — both `-api-dev` and `-api-prod`)

**Remove** from each service's `envVars`:

```yaml
- key: STRIPE_PRICE_ID_PRO_MONTHLY
  sync: false
```

**Add** (after `STRIPE_WEBHOOK_SECRET`):

```yaml
- key: STRIPE_PRICE_ID_TEAM_MONTHLY
  sync: false
- key: STRIPE_PRICE_ID_TEAM_SEASON
  sync: false
- key: STRIPE_PRICE_ID_LEAGUE_MONTHLY
  sync: false
- key: STRIPE_PRICE_ID_LEAGUE_SEASON
  sync: false
```

`sync: false` means the value is set in the Render dashboard, not the file.

## T-07 · `env/server/.env.production` template (by hand)

Replace the empty `STRIPE_PRICE_ID_PRO_MONTHLY=` line with the four canonical keys
(values stay empty in the template; real prod values are created at launch — Phase 8 /
T-29):

```
STRIPE_PRICE_ID_TEAM_MONTHLY=
STRIPE_PRICE_ID_TEAM_SEASON=
STRIPE_PRICE_ID_LEAGUE_MONTHLY=
STRIPE_PRICE_ID_LEAGUE_SEASON=
```

`env/server/.env.development` already carries the four **test-mode** price IDs. Its
leftover `STRIPE_PRICE_ID_PRO_MONTHLY=` line is still read by `seed.js` (with a fake
fallback) and is removed together with the seed cleanup in **Phase 6 / T-24** — leave it
for now.

## T-07 · Render dashboard values

On **both** `-api-dev` and `-api-prod`, set the four `STRIPE_PRICE_ID_*` env vars:

- **Dev:** the existing test-mode price IDs (already in `env/server/.env.development`).
- **Prod:** created at launch (Phase 8 / T-29).

Because of the new `superRefine`, an instance that has `STRIPE_SECRET_KEY` but is missing
any of the four price IDs will now **fail to boot** — intended.

## T-08 · Stripe price metadata `{ planId, interval }`

On each subscription price, set price **metadata** so `planForPriceId` can reverse a
subscription's real price to a plan without trusting client-supplied metadata (see
[`06-stripe-architecture.md`](./06-stripe-architecture.md) §Price metadata):

| Price env var                    | `planId`   | `interval` |
| -------------------------------- | ---------- | ---------- |
| `STRIPE_PRICE_ID_TEAM_MONTHLY`   | `team_pro` | `monthly`  |
| `STRIPE_PRICE_ID_TEAM_SEASON`    | `team_pro` | `season`   |
| `STRIPE_PRICE_ID_LEAGUE_MONTHLY` | `league`   | `monthly`  |
| `STRIPE_PRICE_ID_LEAGUE_SEASON`  | `league`   | `season`   |

Set on the **dev/test-mode** prices now; repeat on the **live** prices at launch. Also set
each product's metadata (`kind`, `planId`) per the same doc. `planForPriceId` today matches
by env-configured price ID, so this metadata is robustness + future-proofing, not a hard
dependency yet.

> Stripe was not reachable from the implementation session (MCP unauthenticated), so T-08
> is left for a human/CLI run: `stripe prices update <price_id> --metadata[planId]=… --metadata[interval]=…`.
