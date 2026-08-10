# 16 · Phased Roadmap

> Eight phases, why each sits where it does, and which tasks
> ([`15-task-backlog.md`](./15-task-backlog.md)) belong to it. The ordering encodes hard
> dependencies — deviating risks the sequencing landmines called out in `04`/`13`.

## At a glance

| Phase | Theme                     | Tasks         | Gate to next                                  |
| :---: | ------------------------- | ------------- | --------------------------------------------- |
|   1   | Discovery & architecture  | (this folder) | Sign-off on `05`                              |
|   2   | Config catalog + resolver | T-01..T-05    | Resolver green + adapters preserve behavior   |
|   3   | Stripe / env / render     | T-06..T-08    | All 4 price IDs resolve in dev & render.yaml  |
|   4   | Backend implementation    | T-09..T-18    | Gates via resolver; free-tracking flip tested |
|   5   | Frontend                  | T-19..T-23    | Pricing page from catalog; no dead code       |
|   6   | Data migration            | T-24..T-26    | Migrations verified; enums tightened          |
|   7   | Testing & hardening       | T-27..T-28    | Suites green; test-clocks pass                |
|   8   | Launch (gated)            | T-29..T-30    | Separate go-live decision                     |

Fast-follows (F-01, F-02) run after Phase 8.

## Why this order

### Phase 1 — Discovery & architecture _(complete)_

Everything downstream depends on the **entitlement contract** (catalog shape + resolver
API). Nailing it first prevents rework across ~10 consumers. Output: this folder;
`05-architecture.md` is the thing to sign off.

### Phase 2 — Config catalog + resolver

The **foundation**. Must land before anything else because every later phase consumes
the resolver. Critically, it ships **legacy-tolerant** (`normalizePlanId`) and
**behavior-preserving** (old billing functions become adapters) — so it can merge with
zero user-visible change and de-risk the rest. **Must precede any enum tightening**
(Phase 6) or live docs fail validation.

### Phase 3 — Stripe / env / render

The backend can't resolve prices without the real price IDs wired everywhere. Small but
a **silent-failure landmine** (missing `render.yaml` IDs → prod 503). Done early so
Phase 4 checkout work has real IDs to hit. Independent of Phase 2 except needing the
catalog's env-var names (T-01).

### Phase 4 — Backend implementation

The substance: migrate call sites to the resolver, the **free-tracking flip** (D2),
snapshot source change + server guards, CSV gate, webhook plan-derivation + comp-safety

- new events, and server URL safety. **Enforcement must be correct before the UI
  exposes it** (Phase 5) — otherwise the client could show entitlements the server
  doesn't honor. The riskiest single change (free-tracking flip, T-12) lives here, done
  with the resolver already proven.

### Phase 5 — Frontend

Consumes the finalized backend contract: pricing page from the served catalog, paywall
UX on canonical values, CTA audit, dead-code removal. After Phase 4 so the client never
renders against a contract still in flux.

### Phase 6 — Data migration

Only now — with the tolerant resolver stable and the schema's new field
(`billingSource`) in place — do we rewrite stored data and **then** tighten enums.
Doing this earlier would break live docs; doing it later would leave legacy values
lingering into launch. Includes dropping dead fields and the `stripeCustomerId` index.

### Phase 7 — Testing & hardening

Contract tests, Stripe test-clock scenarios, and regression against a recorded baseline
(the `OPT-026` count is unconfirmed — establish it here). Concentrated after the code +
data are stable so tests assert the final behavior, not a moving target.

### Phase 8 — Launch (separate, gated)

Per D5, a **deliberate** go-live: prod Stripe products/prices, Render env, a fresh DB
backup, run migrations against prod, then the one-line `/pricing` gate flip, comms, and
doc updates. Kept separate so engineering can be proven in dev first and launch is a
decision, not a side effect.

## Dependency graph (condensed)

```
T-01 catalog ─┬─ T-02 resolver ─ T-03 adapters ─ T-04 contract
              ├─ T-05 catalog API
              ├─ T-06 price/interval/trial
              ├─ T-07 env/render
              └─ T-08 price metadata
T-02 ─ T-11 migrate call sites ─┬─ T-12 free-tracking flip ─ T-21 remove UI block
                                ├─ T-13 snapshot source ─ T-14 server guard
                                └─ T-15 CSV gate
T-10 billingSource ─ T-16 webhooks ─ T-18 emails
T-05 ─ T-19 pricing page ─┬─ T-20 paywall UX
                          └─ T-22 CTA + visibility
T-01,T-10 ─ T-24 enum migration ─ T-26 index + tighten
T-02 ─ T-25 drop league fields
(all) ─ T-29 prod infra ─ T-30 gate flip + comms
```

## Parallelization notes

- Within a phase, tasks without a listed `Dep` can run in parallel.
- Phase 3 (Stripe/env) can overlap Phase 2 once T-01 exists.
- Phase 5 frontend can start against a mocked catalog before Phase 4 fully lands, but
  must not merge until the backend contract is final.
- Fast-follows (F-01 cascade, F-02 limits) are independent of launch and can be
  scheduled whenever product prioritizes them.

## Rough sizing

Summing task efforts: Phases 2–7 are roughly **3–5 focused weeks** for one engineer
(most tasks S/M; two L: the resolver and the call-site migration). Phase 8 is a
half-day of execution plus the go-live decision. This is a _repackage + refactor +
harden_, not a rebuild — most sellable features already exist.
