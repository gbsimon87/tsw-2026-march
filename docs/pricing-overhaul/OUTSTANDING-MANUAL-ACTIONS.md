# Outstanding Manual Actions (owner: you)

> Running checklist of steps the pricing overhaul needs that **cannot be done from a
> code change** — infra edits gated by [`docs/security.md`](../security.md) (managed by
> hand via the Render dashboard) and Stripe dashboard/CLI work. The code side of each
> phase is committed on `feature/pricing-overhaul`; these are the human-in-the-loop
> pieces. Check them off as you go. Add new items here as later phases surface them.

## ⚠️ Before the next prod/dev deploy that carries a Stripe key

The Phase 3 `env.js` `superRefine` makes the API **fail to boot** if `STRIPE_SECRET_KEY`
is set but any of the four TEAM/LEAGUE price IDs are missing. Do the render.yaml +
dashboard items below before deploying, or the API won't start.

## Phase 3 — Stripe / env / render — detail in [`PHASE-3-MANUAL-ACTIONS.md`](./PHASE-3-MANUAL-ACTIONS.md)

- [ ] **`render.yaml`** — on both `-api-dev` and `-api-prod`: remove
      `STRIPE_PRICE_ID_PRO_MONTHLY`; add the four `STRIPE_PRICE_ID_{TEAM,LEAGUE}_{MONTHLY,SEASON}`
      entries (`sync: false`).
- [ ] **`env/server/.env.production`** — replace `STRIPE_PRICE_ID_PRO_MONTHLY=` with the
      four canonical `STRIPE_PRICE_ID_*` keys (empty values; filled at launch).
- [ ] **Render dashboard** — set the four `STRIPE_PRICE_ID_*` values on `-api-dev`
      (existing test-mode IDs) — and on `-api-prod` at launch.
- [ ] **Stripe (T-08)** — set `{ planId, interval }` metadata on each of the four
      dev/test-mode prices (mapping table in the detail doc); repeat on live prices at
      launch. Also set product metadata (`kind`, `planId`).
- [ ] _(Phase 6 / T-24 cleanup, not now)_ remove the leftover
      `STRIPE_PRICE_ID_PRO_MONTHLY=` line from `env/server/.env.development` together with
      the `seed.js` update.

## Phase 8 — Launch (gated) — detail in [`17-launch-checklist.md`](./17-launch-checklist.md)

- [ ] Create **live** Stripe products + prices; set the 6 secrets + 2 URLs in the Render
      prod dashboard; register the live webhook endpoint + `STRIPE_WEBHOOK_SECRET`.
- [ ] Fresh prod DB backup before running migrations.
- [ ] Flip the dev-only `/pricing` gate (`AppRouter.jsx`) — the one-line go-live.
- [ ] Launch comms.

_Later phases will append their own manual items here as they land._
