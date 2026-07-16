# 14 · Testing Plan

> What to test and how. Server = **Jest + Supertest** (`pnpm --filter server test`,
> `--runInBand`); client = **Vitest + RTL** (`pnpm --filter client test`). Never Jest on
> the client or Vitest on the server.

## Establish a baseline first

`PROJECT-KNOWLEDGE.md` cites "~20 pre-existing client failures (OPT-026)" — but the
`OPT-026` marker **isn't in the code** (audit §11). Before editing anything:

```
pnpm --filter server test    # expect green
pnpm --filter client test    # record the real failing set — this is the baseline
```

Don't attribute new failures to pre-existing drift without this baseline.

## Server — unit

| Target                        | Cases                                                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan-catalog.js`             | `getPlan`, `entitlementsForPlan` (incl. `bundles` expansion), `normalizePlanId` for every legacy value per scope, `resolvePriceId`, `planForPriceId` round-trip, `getDisplayCatalog` carries **no** price IDs                                                  |
| `entitlements.service.js`     | `resolveEntitlements` for **every** `plan × subscriptionStatus × billingSource` combination; `starter` fallback when inactive; comp/manual always-active; league `team_pro` bundle present; `resolveForUser` derives from owned resources not `league*` fields |
| Snapshot defaults             | a game with an **old 2-key** `entitlementsSnapshot` resolves replay/shot-map correctly (missing keys default safely)                                                                                                                                           |
| `utils/stripeUrl.js`          | accepts `checkout.`/`billing.stripe.com` https; rejects other host/scheme; `assertSafeStripeUrl` throws 502                                                                                                                                                    |
| `billing.service.js` webhooks | plan derived via `planForPriceId`; `billingSource!=='stripe'` docs skipped; `invoice.paid` extends period; idempotency via `claimWebhookEvent` (keep existing tests)                                                                                           |

## Server — integration (Supertest)

| Target                   | Cases                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `gates.test.js`          | **Invert** the "game tracking gate": tracking is now **free** (create + append succeed without a subscription). Keep the feed-affiliation gate. |
| CSV export               | 402 without `canExportCsv`; 200 with; role gates still apply                                                                                    |
| League mgmt              | season create / league config / add-team still 402 without `canManageLeague`                                                                    |
| `billing.routes.test.js` | team/league checkout, portal, webhook wiring; **new** `GET /catalog` returns display catalog, no price IDs, no auth required                    |
| Comp grant               | a `billingSource:'comp'` league resolves active; a Stripe event targeting it is ignored                                                         |

## Server — contract

`tests/unit/billing.dependency-contract.test.js` (**unmocked**, mirroring
`follows.dependency-contract.test.js`): asserts `entitlements.service` exports
`resolveForTeam/resolveForLeague/resolveForLeagueTeam/resolveForUser/
resolveEntitlements/createRequestCache`, and that `games.service`/`leagues.service`/
`teams.service`/`export` import real symbols. Prevents the "mock hides a missing export
→ runtime 500" failure mode.

## Client — Vitest

| Target                        | Cases                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PricingPage.test.jsx`        | **Rewrite:** mock `GET /billing/catalog`; assert 3 plan cards render from it; monthly⇄season toggle shows new prices ($9/$79, $29/$199); free→checkout, active→portal; unauth→register link |
| `BillingSuccessPage.test.jsx` | poll resolves on canonical `team_pro`/`league`; attention on `past_due`/`canceled`                                                                                                          |
| `GameDetailPage.test.jsx`     | replay locked/unlocked per resolver-shaped entitlements; shot snapshot present/absent                                                                                                       |
| `GameTrackPage.test.jsx`      | **Change:** the "needs active plan to track" block is gone; tracking renders for a free team                                                                                                |
| `LockedFeatureCard`           | renders plan name + pricing link                                                                                                                                                            |

## Stripe test-clock scenarios (manual/scripted, dev)

Using Stripe test clocks + CLI webhook forwarding (`docs/stripe-development-setup.md`):

1. **Trial → active:** checkout with trial → advance clock past trial → `invoice.paid` →
   entitlements stay on; `trial_will_end` fired the email trigger.
2. **Dunning:** fail the renewal → `invoice.payment_failed` → `past_due` (grace) →
   eventual downgrade to `starter`; data intact.
3. **Cancel:** cancel at period end → access until `currentPeriodEnd` → downgrade.
4. **Reactivate:** re-subscribe → prior plan restored.
5. **Cascade on/off** (when built): league active → member-team players show rich
   profiles; league lapses → profiles revert; **already-recorded games keep** their
   frozen entitlements.

## Regression focus

- The **~10 resolver call sites** (games/teams/leagues/auth/export) — verify each
  returns the same entitlements pre/post via the parity output of the migration + unit
  coverage.
- **Legacy tolerance:** un-migrated `'pro'`/`'team'`/`'free'` docs still resolve
  correctly (tested via `normalizePlanId` unit cases + an integration test seeding a
  legacy-valued doc).

## Pre-PR gate (per CONTRIBUTING)

```
pnpm check-env && pnpm lint && pnpm test && pnpm build
```

## Coverage targets

- New modules (`plan-catalog.js`, `entitlements.service.js`, `stripeUrl.js`): aim for
  near-complete branch coverage — they're pure and cheap to test, and they're the spine
  of the system.
- Migration scripts: unit-test the pure value-map function; dry-run against a dev
  snapshot for the I/O path.
