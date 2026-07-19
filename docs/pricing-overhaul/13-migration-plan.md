# 13 · Migration Plan

> Moving live data from the current 3-enum/denormalized state to the target, safely.
> **Idempotent, `--dry-run`, reversible** — following the
> `server/src/scripts/` conventions (parity checks, key-shape index matching).

## Guiding sequence (do not reorder)

```
Phase 2  Ship tolerant resolver + normalizePlanId   (app reads all current values)
   │                                                 NO schema change yet
Phase 4  Ship billingSource field (additive)         existing docs default 'stripe'
   │
Phase 6  Run data migrations (below)                 rewrite stored values
   │
Phase 6  Tighten schema enums to canonical-only      only after migration verifies clean
Phase 8  Launch flip                                  separate
```

**Why:** tightening the `plan` enum before the data is migrated makes Mongoose reject
existing `'free'/'pro'/'team'` docs on the next save. The tolerant resolver lets the
app run correctly against un-migrated data in the meantime.

## Scripts (all in `server/src/scripts/`)

### 1. `migrate-unify-plan-enums.js`

- **Does:** rewrites `Team.plan`, `League.plan`, `User.plan` to canonical ids; sets
  `billingSource` (`'stripe'` where a `stripeSubscriptionId` exists; `'comp'` for
  We-ball Saturday matched by slug/name).
- **Value map:** `free→starter`; team `pro|team→team_pro`; league `pro|league→league`;
  user `pro→team_pro`.
- **Self-healing:** for Stripe-backed docs, re-derive plan from
  `planForPriceId(stripePriceId)` rather than trusting the old `plan`.
- **Idempotent:** deterministic map; re-running is a no-op once canonical.
- **Reversible:** an inverse map (`--rollback`) restores prior values by scope.
- **`--dry-run`:** prints a per-doc before→after table + counts; no writes.

### 2. `migrate-drop-user-league-fields.js`

- **Does:** `$unset` the seven `User.league*` fields.
- **Idempotent:** `$unset` on an absent field is a no-op.
- **Reversible:** from backup only (data is seed-only garbage — flagged in the header).
- **`--dry-run`:** counts docs that still carry any of the fields.

### 3. `migrate-league-stripe-customer-index.js`

- **Step 1 — dedup check:** find Leagues sharing a non-null `stripeCustomerId`; if any,
  **abort with a report** for manual resolution (don't auto-merge billing data).
- **Step 2 — index:** create `{ stripeCustomerId: 1 }` **unique + sparse**. Match by
  **key-shape** (per `migrate-leaguestandings-season-index.js`); skip if an equivalent
  exists.
- **Reversible:** drop the index.
- **`--dry-run`:** reports would-be dupes and whether the index already exists.

## Reconciling existing billed data

At current scale there are very few real subscriptions, but the process is:

1. `migrate-unify-plan-enums.js` re-derives each Stripe-backed doc's plan from its
   actual `stripePriceId` via `planForPriceId` → corrects any mislabeled legacy `'pro'`.
2. Docs with no Stripe ids and no comp flag → `starter` (free).
3. We-ball Saturday → `plan:'league', subscriptionStatus:'active', billingSource:'comp'`.
4. Post-run validation (below) confirms consistency.

## Seed scripts

Update `seed.js` and `seed-demo-account.js` to write **canonical plan ids** and stop
writing `User.league*`. These aren't "migrations" but must land with Phase 6 so fresh
dev/demo data matches the new model.

## Run order (Phase 6, on a DB snapshot first)

```
# always dry-run first, on a copy/snapshot
ENV_FILE=../env/server/.env.development node src/scripts/migrate-unify-plan-enums.js --dry-run
ENV_FILE=../env/server/.env.development node src/scripts/migrate-unify-plan-enums.js
ENV_FILE=../env/server/.env.development node src/scripts/migrate-drop-user-league-fields.js --dry-run
ENV_FILE=../env/server/.env.development node src/scripts/migrate-drop-user-league-fields.js
ENV_FILE=../env/server/.env.development node src/scripts/migrate-league-stripe-customer-index.js --dry-run
ENV_FILE=../env/server/.env.development node src/scripts/migrate-league-stripe-customer-index.js
# then, in code: tighten schema enums to canonical-only and deploy
```

For **production** (launch), the same order runs against prod after a fresh backup
(`docs/mongodb-production-backup.md`), _before_ flipping the `/pricing` gate.

## Validation (post-migration)

- [ ] No `Team`/`League`/`User` doc has a non-canonical `plan`.
- [ ] Every Stripe-backed doc's `plan` == `planForPriceId(stripePriceId)`.
- [ ] We-ball Saturday resolves active (`billingSource:'comp'`).
- [ ] No `User` doc carries `league*` fields.
- [ ] `League.stripeCustomerId` unique index exists; zero duplicates.
- [ ] Resolver returns identical entitlements pre/post for a sampled set of real docs
      (parity check — the migration prints this).

## Rollback

- Enum migration: `--rollback` inverse map.
- Field drop: restore from backup (seed-only data — low stakes).
- Index: drop it.
- Schema enum tightening is a code revert (redeploy prior).
- Because the tolerant resolver stays in place, a partial rollback still leaves the app
  functional against mixed data.

## Risk register (migration-specific)

| Risk                                                     | Likelihood         | Mitigation                                                                  |
| -------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------- |
| Enum tightened before data migrated                      | Med (process slip) | This doc's sequence; CI check that enum PR references a completed migration |
| Duplicate `stripeCustomerId` blocks index                | Low (tiny base)    | Dedup check aborts with a report before index creation                      |
| Mislabeled legacy `'pro'` team as league (or vice-versa) | Low                | Re-derive from `stripePriceId`, not the stored plan                         |
| Prod migration without backup                            | Low                | Launch checklist gates on a fresh backup                                    |
