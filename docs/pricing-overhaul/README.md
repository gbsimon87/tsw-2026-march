# Pricing & Billing Overhaul

> **Single source of truth** for TSW's pricing/billing redesign. This folder is the
> complete planning blueprint — read it before touching any billing, entitlement,
> or pricing code. Planning was completed 2026-07-16; implementation is **in progress
> on `feature/pricing-overhaul`** — see the status board below for the current phase.

## What this initiative is

Replace TSW's incrementally-built, never-launched billing with a clean,
config-driven commercial model:

- **Starter (Free)** — per team. Live tracking, box scores, public pages,
  following, sharing. **Free, no card.**
- **Team Pro** — per team, **$9/mo · $79/yr**. Replay, shot maps, highlight clips,
  full history, CSV export (+ rich player profiles, coach reports as fast-follows).
- **League** — per league, **$29/mo · $199/season**. League management + Team Pro
  bundled for every team + priority support.

The redesign is as much an **architecture** effort as a pricing one: introduce a
config-driven **plan catalog** and a central **entitlement resolver**, retire the
three inconsistent plan enums and dead code, and make "change a plan" a config edit
rather than a code hunt.

## How to use this folder

1. New to the project? Read `00-overview.md` → `01-current-state-audit.md` →
   `02-pricing-model.md`.
2. Implementing? Work from `16-phased-roadmap.md` and `15-task-backlog.md`; consult
   the architecture/design docs (`05`–`10`) per task.
3. Migrating data or launching? `13-migration-plan.md` and `17-launch-checklist.md`.

## Document index

| #   | Doc                                                              | What it answers                                                        |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| —   | [README.md](./README.md)                                         | This index                                                             |
| 00  | [00-overview.md](./00-overview.md)                               | Why, goals/non-goals, **decision log**, glossary                       |
| 01  | [01-current-state-audit.md](./01-current-state-audit.md)         | What the code actually does today (with `file:line`)                   |
| 02  | [02-pricing-model.md](./02-pricing-model.md)                     | The 3-plan model, prices, billing units                                |
| 03  | [03-feature-packaging.md](./03-feature-packaging.md)             | Feature → plan matrix + entitlement keys                               |
| 04  | [04-impact-assessment.md](./04-impact-assessment.md)             | Every affected area, complexity, risk, order                           |
| 05  | [05-architecture.md](./05-architecture.md)                       | Plan catalog, entitlement resolver, cascade                            |
| 06  | [06-stripe-architecture.md](./06-stripe-architecture.md)         | Products/prices/webhooks/env/render.yaml                               |
| 07  | [07-database-changes.md](./07-database-changes.md)               | Schema diffs, indexes, dropped fields                                  |
| 08  | [08-entitlements-and-gating.md](./08-entitlements-and-gating.md) | Resolver API + where each feature is gated                             |
| 09  | [09-backend-changes.md](./09-backend-changes.md)                 | Module-by-module backend changes                                       |
| 10  | [10-frontend-changes.md](./10-frontend-changes.md)               | Pricing page, paywalls, CTAs, dead code                                |
| 11  | [11-user-journeys.md](./11-user-journeys.md)                     | Signup → track → upgrade → renew → cancel                              |
| 12  | [12-technical-debt.md](./12-technical-debt.md)                   | Debt retired by this project                                           |
| 13  | [13-migration-plan.md](./13-migration-plan.md)                   | Ordered, idempotent, reversible migration                              |
| 14  | [14-testing-plan.md](./14-testing-plan.md)                       | Unit/integration/contract + Stripe test-clocks                         |
| 15  | [15-task-backlog.md](./15-task-backlog.md)                       | Granular, independently-shippable tasks                                |
| 16  | [16-phased-roadmap.md](./16-phased-roadmap.md)                   | 8 phases, ordering rationale                                           |
| 17  | [17-launch-checklist.md](./17-launch-checklist.md)               | Separate, gated go-live                                                |
| —   | [OUTSTANDING-MANUAL-ACTIONS.md](./OUTSTANDING-MANUAL-ACTIONS.md) | **Running checklist of human/infra actions you need to take**          |
| —   | [PHASE-3-MANUAL-ACTIONS.md](./PHASE-3-MANUAL-ACTIONS.md)         | Phase 3 by-hand infra/Stripe steps (render.yaml, .env, price metadata) |

## Status board

| Phase                        | Status         | Notes                                                                                                                      |
| ---------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- | --- |
| 0 · Planning (this folder)   | ✅ Complete    | 2026-07-16                                                                                                                 |
| 1 · Discovery & architecture | ✅ Complete    | Captured in `05`                                                                                                           |
| 2 · Catalog + resolver       | ✅ Complete    | T-01…T-05 done 2026-07-16; server suite 483/483                                                                            |
| 3 · Stripe/env/render        | 🟩 Code done   | T-06 + T-07 code done 2026-07-16; suite 492/492. Infra/Stripe = [`PHASE-3-MANUAL-ACTIONS.md`](./PHASE-3-MANUAL-ACTIONS.md) |
| 4 · Backend                  | 🟩 Code done   | T-09…T-18 done 2026-07-17; server suite 521/521. Stripe webhook-event subscription = manual action                         |     |
| 5 · Frontend                 | ⬜ Not started |                                                                                                                            |
| 6 · Migration                | ⬜ Not started |                                                                                                                            |
| 7 · Testing & hardening      | ⬜ Not started |                                                                                                                            |
| 8 · Launch (gated)           | ⬜ Not started | Separate go-live decision                                                                                                  |

## Ground rules

- **Branch:** all work on `feature/pricing-overhaul` (cut from `dev`). Flow:
  `feature/pricing-overhaul → dev → main`.
- **No `plan === 'x'` checks** anywhere outside the plan catalog. Features consume
  the entitlement resolver.
- **Config over code:** plans/prices/entitlements live in `plan-catalog.js`.
- **`/pricing` stays prod-gated** until the launch checklist is executed.
- Keep this README's status board current as phases complete.

## Related existing docs

[`render-env-matrix.md`](../render-env-matrix.md) ·
[`PROJECT-KNOWLEDGE.md`](../PROJECT-KNOWLEDGE.md) §6 ·
[`deployment-render.md`](../deployment-render.md).

> The old `billing.md`, `qa-billing-dev.md`, and `stripe-development-setup.md`
> described the pre-overhaul model and were **removed** (2026-07-16) to avoid
> confusion — their factual content is captured in
> [`01-current-state-audit.md`](./01-current-state-audit.md), and the target design
> lives in [`06-stripe-architecture.md`](./06-stripe-architecture.md). A fresh
> Stripe-setup and QA guide will be written during implementation (Phases 3–7).
