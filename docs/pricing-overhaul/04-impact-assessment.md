# 04 · Impact Assessment

> Every area of the application touched by the overhaul — not just the obvious billing
> code. For each: current implementation, why it must change, complexity (S/M/L),
> dependencies, risks, and suggested order. Complexity is engineering size, not
> importance.

## How to read the order column

`Order` = the phase from [`16-phased-roadmap.md`](./16-phased-roadmap.md) (1–8). Items
in the same phase can largely proceed in parallel unless a dependency says otherwise.

## A. Configuration & source-of-truth

| Area               | Current                                               | Why change                                         | Cx  | Depends on   | Risks                                                   | Order |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------- | :-: | ------------ | ------------------------------------------------------- | :---: |
| Plan catalog       | None — plans/prices scattered as literals             | Single config source; "add plan = edit file"       |  M  | —            | Getting the shape wrong forces rework of every consumer |   2   |
| Served catalog API | None — client hard-codes prices                       | Kill client/server drift (`$12/$89` stale)         |  S  | Plan catalog | Leaking price IDs to client                             |   2   |
| Env vars           | 4 real price IDs used but `PRO_MONTHLY` legacy unread | Retire legacy var; ensure all 4 present everywhere |  S  | Catalog      | —                                                       |   3   |
| `render.yaml`      | Missing the 4 real price IDs (only `PRO_MONTHLY`)     | Deploys can't resolve prices in prod               |  S  | Env          | Prod checkout 503s if missed                            |   3   |

## B. Entitlements & gating

| Area                            | Current                                                                 | Why change                                                | Cx  | Depends on              | Risks                                                           | Order |
| ------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- | :-: | ----------------------- | --------------------------------------------------------------- | :---: |
| Entitlement resolver            | Scattered `isTeamActive`/`isLeagueActive`; all-or-nothing flags         | Central, per-feature, catalog-driven                      |  L  | Catalog                 | Behavior drift across ~10 call sites                            |   2   |
| Dead `auth.service` league path | `getUserLeagueEntitlements` checks `'pro'` only; reads seed-only fields | Remove; fold into resolver                                |  M  | Resolver                | `sanitizeUser` shape change                                     |   4   |
| Free-tracking flip              | 402 on game create/append (`games.service.js:1077,1400`)                | D2: tracking is free                                      |  M  | Resolver                | **Revenue/product change** — sign-off required; test-heavy area |   4   |
| CSV export gate                 | Not payment-gated today                                                 | Data egress must be Pro (`canExportCsv`)                  |  S  | Resolver, export module | Locking out a user who expects it                               |   4   |
| League mgmt gates               | `isLeagueActive`/`canManageLeague` at 3 sites                           | Swap to resolver (semantics unchanged)                    |  S  | Resolver                | Regression in season/config/add-team                            |   4   |
| View-feature snapshots          | `getTeamEntitlements` written to `entitlementsSnapshot`; only 2 keys    | Source→resolver; expand keys; safe defaults for old games |  M  | Resolver                | Old snapshots missing keys → wrong lock state                   |   4   |
| Replay/shot-map server guard    | None (client-only)                                                      | Light guard reading frozen snapshot                       |  M  | Snapshots               | Over-gating historical games                                    |   4   |

## C. Billing service & Stripe

| Area                       | Current                                               | Why change                                        | Cx  | Depends on               | Risks                                  | Order |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------- | :-: | ------------------------ | -------------------------------------- | :---: |
| Checkout builders          | `plan:'team'`/`'league'` literals, `trial:14` literal | Read plan/interval/trial from catalog             |  M  | Catalog                  | Metadata mismatch breaks webhooks      |   4   |
| Webhook plan derivation    | Trusts `metadata.resourceType`/plan                   | Derive plan from `planForPriceId(stripePriceId)`  |  M  | Catalog                  | Mis-mapping a price → wrong plan       |   4   |
| `billingSource` handling   | None; We-ball Saturday is magic `'pro'`               | First-class comp grants; webhooks skip non-Stripe |  M  | Schema (`billingSource`) | Stray event clobbering a comp          |  4/6  |
| League create idempotency  | Dedup by `stripeCustomerId`, no unique index          | Add unique index; close race                      |  M  | Dedup migration          | Duplicate leagues block index creation |   6   |
| Server redirect-URL safety | None (client-only `isSafeStripeUrl`)                  | `assertSafeStripeUrl` on all 4 session URLs       |  S  | —                        | —                                      |   4   |
| `syncOwnerPlan`            | Sets `User.plan='pro'` if any team active             | Resolver-derived; canonical plan value            |  S  | Resolver                 | `User.plan` consumers (analytics)      |   4   |

## D. Database

| Area                            | Current                                    | Why change                              | Cx  | Depends on                | Risks                                        | Order |
| ------------------------------- | ------------------------------------------ | --------------------------------------- | :-: | ------------------------- | -------------------------------------------- | :---: |
| Plan enums (3, inconsistent)    | `['free','pro']` / `+'team'` / `+'league'` | Canonical `starter`/`team_pro`/`league` |  M  | Resolver (tolerant first) | Tightening before migration breaks live docs |   6   |
| `billingSource` field           | Absent                                     | Comp/manual grants                      |  S  | —                         | —                                            |   4   |
| `User.league*` fields           | Present, seed-only                         | Drop (`$unset`)                         |  S  | Resolver                  | Anything still reading them                  |   6   |
| `League.stripeCustomerId` index | None unique                                | Close create race                       |  S  | Dedup pass                | Existing dupes                               |   6   |

## E. Frontend

| Area                             | Current                                                    | Why change                                    | Cx  | Depends on        | Risks                                                    | Order |
| -------------------------------- | ---------------------------------------------------------- | --------------------------------------------- | :-: | ----------------- | -------------------------------------------------------- | :---: |
| `PricingPage.jsx`                | Hard-coded stale prices, 2 plans of copy, imperative fetch | Render from served catalog; 3-plan layout     |  M  | Served catalog    | Test rewrite (`PricingPage.test.jsx` asserts old prices) |   5   |
| `LockedFeatureCard` & paywall UX | Reads snapshot booleans                                    | Align to new entitlement keys/copy            |  S  | Resolver keys     | —                                                        |   5   |
| CTA audit                        | Many `/pricing` links dead in prod                         | Consistent messaging; keep gated until launch |  S  | —                 | Confusing dead-ends if half-changed                      |   5   |
| `BillingSuccessPage` poll        | 5-attempt poll on `['team','pro']`                         | Accept canonical plan values                  |  S  | Enum              | Poll never resolves if value mismatch                    |   5   |
| Dead `GameShotMap.jsx`           | Unused                                                     | Delete                                        |  S  | —                 | —                                                        |   5   |
| Signup / onboarding              | No trial/upgrade prompt; `/pricing` redirect prod-dead     | Contextual upgrade prompts at value gates     |  M  | Resolver, catalog | Nagging users; scope creep                               |   5   |

## F. Cross-cutting UX (often missed)

| Area                                  | Current                                        | Why change                                 | Cx  | Depends on       | Risks                         | Order |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------ | :-: | ---------------- | ----------------------------- | :---: |
| Admin/dashboard billing visibility    | No plan/billing display on team/admin pages    | Users need to see plan & manage it         |  M  | Resolver         | Scope creep                   |   5   |
| Nav upgrade affordance                | None                                           | A discoverable path to plans (post-launch) |  S  | —                | —                             |  5/8  |
| Email comms                           | None for trial-ending/dunning (webhook no-ops) | Trial-ending & failed-payment emails       |  M  | Webhooks, Resend | No job queue — per-event only |  4/8  |
| Marketing pages                       | No pricing copy (clean)                        | Add pricing entry point at launch          |  S  | Launch           | —                             |   8   |
| `PROJECT-KNOWLEDGE.md` / `billing.md` | Describe old model                             | Update to new model post-merge             |  S  | All              | Doc drift                     |   8   |

## G. Migration, testing, launch

| Area                       | Current                                    | Why change                             | Cx  | Depends on       | Risks                              | Order |
| -------------------------- | ------------------------------------------ | -------------------------------------- | :-: | ---------------- | ---------------------------------- | :---: |
| Enum-unify migration       | —                                          | Map live plan values to canonical      |  M  | Schema, resolver | Ordering (tolerant resolver first) |   6   |
| Drop-dead-fields migration | —                                          | `$unset` `User.league*`                |  S  | —                | Destructive (seed-only data)       |   6   |
| Data reconciliation        | —                                          | Re-derive plan from `stripePriceId`    |  M  | Catalog          | Mislabeled legacy docs             |   6   |
| Contract tests             | `follows.dependency-contract` pattern only | Guard new billing/entitlement exports  |  S  | Modules          | —                                  |   7   |
| Stripe test-clocks         | Not used                                   | trial→active, dunning, cancel, renewal |  M  | Stripe           | —                                  |   7   |
| Client suite baseline      | `OPT-026` unconfirmed                      | Establish green baseline before edits  |  S  | —                | Unknown failing count              |   7   |
| Launch flip                | `/pricing` prod-gated                      | Remove gate; go live                   |  S  | Everything       | The point of no return             |   8   |

## Blast-radius summary

- **Highest-risk change:** the free-tracking flip (D2) — touches the hottest path
  (`games.service.js`) and is a revenue decision. Heavily test-covered; do it in Phase
  4 with the resolver already proven.
- **Most call sites:** the entitlement resolver migration (~10 consumers across
  games/teams/leagues/auth). Mitigated by keeping old functions as adapters during
  transition.
- **Sequencing landmine:** tightening plan enums before the tolerant resolver + data
  migration ship will fail validation on live docs. Phase 2 (tolerant resolver) →
  Phase 6 (migrate) → then tighten.
- **Silent-failure risk:** `render.yaml` missing price IDs → prod checkout 503s.
  Explicit Phase 3 task + launch-checklist item.

Every row here maps to at least one task in
[`15-task-backlog.md`](./15-task-backlog.md).
