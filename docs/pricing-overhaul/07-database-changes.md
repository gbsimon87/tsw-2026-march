# 07 · Database Changes

> All schema/index changes. Schemas are inline in `*.repository.js` (no `models/`
> dir). Follow the established conventions: additive-first, tolerant-resolver before
> enum-tightening, index migrations match **by key-shape not name**.

## Summary

| Change                                     | Collection         | Type                     | Phase | Reversible?                       |
| ------------------------------------------ | ------------------ | ------------------------ | :---: | --------------------------------- |
| Add `billingSource`                        | Team, League       | Additive field           |   4   | Yes (`$unset`)                    |
| Unify `plan` enum values                   | Team, League, User | Enum tighten + data map  |   6   | Yes (inverse map)                 |
| Drop `User.league*` (7 fields)             | User               | Field removal + `$unset` |   6   | From backup only (seed-only data) |
| Unique partial index on `stripeCustomerId` | League             | Index add (after dedup)  |   6   | Yes (drop index)                  |

## 1. `billingSource` (additive, Phase 4)

Add to Team (`teams.repository.js`) and League (`leagues.repository.js`):

```js
billingSource: { type: String, enum: ['stripe','manual','comp'], default: 'stripe' },
```

- Purely additive — existing docs default to `'stripe'`, preserving behavior.
- Enables comp/manual grants (see [`05-architecture.md`](./05-architecture.md) §4) and
  the webhook `billingSource !== 'stripe'` skip.
- No migration needed for the field itself; We-ball Saturday is set to `'comp'` by the
  data migration (Phase 6).

## 2. Plan-enum unification (Phase 6, tolerant-resolver-first)

**Target enums:**

| Collection  | From                      | To                                       |
| ----------- | ------------------------- | ---------------------------------------- |
| Team.plan   | `['free','pro','team']`   | `['starter','team_pro']`                 |
| League.plan | `['free','pro','league']` | `['starter','league']`                   |
| User.plan   | `['free','pro']`          | `['starter','team_pro']` (derived cache) |

**Sequencing (critical):**

1. Phase 2 ships `normalizePlanId` + resolver — the app tolerates _all_ current values
   at read time. **No schema change yet.**
2. Phase 6 runs `migrate-unify-plan-enums.js` to rewrite stored values.
3. **Only after** the migration confirms zero non-canonical values, tighten the schema
   `enum`s to canonical-only.

Tightening before step 2 would make Mongoose reject the existing `'free'/'pro'/'team'`
docs on save. This ordering is the single most important DB sequencing rule in the
project.

**Value mapping (idempotent, deterministic):**

```
Team:   free→starter,  pro|team→team_pro
League: free→starter,  pro|league→league
User:   free→starter,  pro→team_pro   (then recompute via resolver)
```

For Stripe-backed docs, the migration re-derives plan from
`planForPriceId(stripePriceId)` rather than trusting the old `plan` string
(self-healing). For `billingSource:'comp'` docs (We-ball Saturday), it sets
`plan:'league', subscriptionStatus:'active', billingSource:'comp'`.

## 3. Drop dead `User.league*` fields (Phase 6)

Remove from `auth.repository.js:13-23`:
`leaguePlan`, `leagueSubscriptionStatus`, `leagueCurrentPeriodEnd`,
`leagueCancelAtPeriodEnd`, `leagueStripeCustomerId`, `leagueStripeSubscriptionId`,
`leagueStripePriceId`.

- These are written only by `seed.js` and read only by the dead `auth.service` path
  (audit §2). Removing them + the reading code has no production impact.
- `migrate-drop-user-league-fields.js` `$unset`s them on existing docs.
- **Destructive** (fields gone), but the data is seed-only garbage — acceptable. Flag
  in the migration header; reversal is from backup only.
- Update `seed.js` to stop writing them.

## 4. `League.stripeCustomerId` unique partial index (Phase 6)

Closes the create-race (audit §1). Order:

1. **Dedup pass** — a script (or the migration's first step) finds Leagues sharing a
   **string** `stripeCustomerId`; resolve manually if any exist (unlikely at current
   scale).
2. Create `{ stripeCustomerId: 1 }` **unique, partial** with
   `partialFilterExpression: { stripeCustomerId: { $type: 'string' } }`.
   > **Audit C3 correction:** a _sparse_ index only skips docs where the field is
   > _missing_. The schema defaults `stripeCustomerId` to explicit `null`, so nearly
   > every league stores a null and a sparse unique index aborts with `E11000` on the
   > second null. A **partial** index on `{ $type: 'string' }` indexes only real
   > customer ids. The dedup pass matches the same predicate so it doesn't falsely
   > report "no duplicates" and then crash the build.
3. Follow the **key-shape-match** convention from
   `migrate-leaguestandings-season-index.js` (also comparing `partialFilterExpression`)
   — skip if an equivalent index already exists; never match by name.

## Fields intentionally unchanged

- All Stripe id/status/period/interval fields on Team & League stay as-is (denormalized
  billing is retained — D8, no `Subscription` collection).
- `Game.participant.entitlementsSnapshot` stays `Mixed`; only its _written content_
  expands (see [`08-entitlements-and-gating.md`](./08-entitlements-and-gating.md)). No
  schema change; readers default missing keys.
- `LeaguePlayer.claimedByUserId` unchanged — it's the cascade's league-side link, used
  as-is.

## Migration scripts (detailed in `13-migration-plan.md`)

All idempotent, `--dry-run`, parity-checked, in `server/src/scripts/`:

- `migrate-unify-plan-enums.js`
- `migrate-drop-user-league-fields.js`
- `migrate-league-stripe-customer-index.js` (dedup check + index)

## Validation after migration

- No Team/League/User doc has a non-canonical `plan` value.
- Every Stripe-backed doc's `plan` matches `planForPriceId(stripePriceId)`.
- We-ball Saturday resolves active via `billingSource:'comp'`.
- The `stripeCustomerId` unique **partial** index exists and no duplicates remain.
- `User` docs no longer carry `league*` fields.
