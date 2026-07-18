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

## Phase 4 — Backend (Stripe dashboard)

- [ ] **Subscribe the webhook endpoint to the newly-handled events** in the Stripe
      dashboard (dev + prod): `invoice.paid` (renewal → extend period) and
      `customer.subscription.trial_will_end` (trial-ending email). Without these, the
      handlers added in T-16/T-18 never fire. The endpoint already receives
      `checkout.session.completed`, `customer.subscription.*`, and
      `invoice.payment_failed`.

## Phase 6 — Run the data migrations (per environment) — detail in [`13-migration-plan.md`](./13-migration-plan.md)

⚠️ **Deploy ordering:** the Phase-6 code tightened the `plan` enums to canonical-only
(`starter`/`team_pro`/`league`). Mongoose now **rejects legacy `free`/`pro`/`team`
writes**, so the migration must run against a database **before** this branch's code
serves traffic there. Run against **dev** before merging to `dev`; against **prod**
at launch (Phase 8), after a fresh backup.

Always `--dry-run` first. Order (from `server/`):

- [ ] `ENV_FILE=../env/server/.env.development node src/scripts/migrate-unify-plan-enums.js --dry-run` → then without `--dry-run`
- [ ] `… migrate-drop-user-league-fields.js --dry-run` → then without `--dry-run`
- [ ] `… migrate-league-stripe-customer-index.js --dry-run` → then without `--dry-run` (aborts if duplicate `stripeCustomerId`s exist — resolve by hand)
- [ ] Validate (see `13-migration-plan.md`): no non-canonical `plan`; We-ball resolves active via `billingSource:'comp'`; unique index present; no `User.league*` fields.
- [ ] Re-seed dev if desired (`pnpm seed` now writes canonical ids).

## Phase 7 — Run the live Stripe test-clock scenarios — detail in [`stripe-test-clock-runbook.md`](./stripe-test-clock-runbook.md)

The CI-runnable equivalent (`server/src/tests/unit/billing.lifecycle.test.js`) is green,
but the live wiring (real Stripe signature verification + event subscription + real
payloads) must be confirmed once in dev/test mode before launch.

- [ ] Run the four scenarios (trial→active, dunning, cancel, reactivate) + the comp-grant
      immunity check with `stripe listen --forward-to localhost:4000/api/v1/billing/webhooks`
      and test clocks, per the runbook. Depends on the four dev price IDs + their
      `{planId,interval}` metadata (Phase 3 items above) already being set.

## Audit follow-up — unbuilt features surfaced by the audit

- **Team-scoped CSV export (M10).** Team Pro's catalog + pricing copy advertise "CSV
  export", but the only export endpoints are **league-scoped** (standings + league
  player stats), gated on `resolveForLeague`. A `team_pro` team that isn't in a
  league therefore can't export anything. The misleading 402 copy was corrected to
  say "League"; the actual Team-Pro deliverable — a team's own season/box-score CSV,
  gated on `resolveForTeam().canExportCsv` — is a new endpoint still to be built
  (`export.*` + route/controller/validation + tests). Until it ships, either build it
  or drop "CSV export" from the Team Pro display in `plan-catalog.js`.
- **League games freeze-vs-live semantics (M17).** H7 made one-sided _standalone_
  games freeze their entitlements (matching dual-team standalone). _League_ games are
  still mixed: dual-team league games read the frozen participant snapshot while
  one-sided league games resolve live. Doc 08 wants league games **live**. Aligning
  them touches several read sites (`resolveGameTeamContext`, the T-14 recap/highlight
  gating, box-score) and flips deliberate T-14 frozen-snapshot tests, so it needs a
  dedicated change with the doc-08 semantics confirmed — deferred, not done in this pass.

## Audit follow-up — duplicate-purchase race (H2), needs live Stripe validation

The audit's H2 fix landed in part: team re-checkout now reuses the existing Stripe
customer, and `hasTrialed` (H1) closes the trial loop. The remaining piece — fully
closing the **concurrent two-tab create race** (two simultaneous league checkouts
each minting a new customer → two billed leagues) — requires the customer-reuse
refactor extended to the league path plus a webhook-side orphan-subscription cancel,
and must be validated against **live Stripe test-clocks** before it can be trusted.
Do this with the Phase 7 test-clock run (below) before launch. Until then the
per-owner active-subscription guard + the C3 unique partial index bound the blast
radius, but a true simultaneous double-submit is not yet fully prevented.

## Phase 8 — Launch (gated) — detail in [`17-launch-checklist.md`](./17-launch-checklist.md)

- [ ] Create **live** Stripe products + prices; set the 6 secrets + 2 URLs in the Render
      prod dashboard; register the live webhook endpoint + `STRIPE_WEBHOOK_SECRET`.
- [ ] Fresh prod DB backup before running migrations.
- [ ] Flip the dev-only `/pricing` gate (`AppRouter.jsx`) — the one-line go-live.
- [ ] Launch comms.

_Later phases will append their own manual items here as they land._
