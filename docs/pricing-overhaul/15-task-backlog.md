# 15 · Task Backlog

> Granular, independently-shippable tasks. Each is small enough to complete in one
> focused session. Effort: **S** ≤½ day · **M** ~1–2 days · **L** ~3–5 days. `Phase`
> maps to [`16-phased-roadmap.md`](./16-phased-roadmap.md). `Dep` = task ids that must
> land first.

## Legend for each task

Objective · Files · DB · API · UI · Tests · Acceptance · Dep · Effort.

## Progress tracker

> Kept in sync with the [`README.md`](./README.md) status board. `code ✅` = code +
> tests merged on `feature/pricing-overhaul`; **manual** = a by-hand infra/Stripe step
> remains (see [`OUTSTANDING-MANUAL-ACTIONS.md`](./OUTSTANDING-MANUAL-ACTIONS.md)).

| Task      | Status               | Notes                                                            |
| --------- | -------------------- | ---------------------------------------------------------------- |
| T-01      | code ✅              | plan-catalog.js                                                  |
| T-02      | code ✅              | entitlements.service.js                                          |
| T-03      | code ✅              | billing-service adapters delegate to resolver                    |
| T-04      | code ✅              | billing.dependency-contract.test.js                              |
| T-05      | code ✅              | GET /billing/catalog                                             |
| T-06      | code ✅              | checkout price/interval/trial from catalog                       |
| T-07      | code ✅ + **manual** | env superRefine + PRO_MONTHLY retired; render.yaml/.env by hand  |
| T-08      | **manual**           | Stripe price metadata `{planId, interval}` (dashboard/CLI)       |
| T-09      | code ✅              | stripeUrl.js on all 4 session URLs                               |
| T-10      | code ✅              | billingSource field on Team/League                               |
| T-11      | code ✅              | call sites migrated to resolver                                  |
| T-12      | code ✅              | free-tracking flip (⚠️ revenue change)                           |
| T-13      | code ✅              | resolver-derived snapshots + league downgrade safety             |
| T-14      | code ✅              | replay/shot-map server guard                                     |
| T-15      | code ✅              | CSV export gate (My Sporty stays free)                           |
| T-16      | code ✅ + **manual** | webhook plan-derivation/comp-skip/invoice.paid; subscribe events |
| T-17      | code ✅              | canonical User.plan via resolver                                 |
| T-18      | code ✅              | trial-ending & payment-failed emails                             |
| T-19      | code ✅              | PricingPage from served catalog (3 plans, new prices)            |
| T-20      | code ✅              | canonical plan values in paywall UX; replay LockedFeatureCard    |
| T-21      | code ✅              | removed tracking hard-block (tracking is free)                   |
| T-22      | code ✅              | BillingStatusPill on TeamsPage; CTA audit (copy already clean)   |
| T-23      | code ✅              | deleted GameShotMap.jsx + legacy billingApi alias                |
| T-24      | code ✅ + **run**    | migrate-unify-plan-enums.js + canonical seeds; must run per-env  |
| T-25      | code ✅ + **run**    | drop User.league\* fields/path; migrate-drop-user-league-fields  |
| T-26      | code ✅ + **run**    | league stripeCustomerId index + enums tightened to canonical     |
| T-27      | ✅ code + ⚠️ run     | lifecycle scenario tests + test-clock runbook (live run manual)  |
| T-28      | ✅ done              | baseline recorded (server 534/534; client 17 pre-existing)       |
| T-29…T-30 | ⬜ Phase 8           | launch (T-30 updates PROJECT-KNOWLEDGE §6)                       |

---

## Phase 2 — Config catalog + resolver

### T-01 · Plan catalog module

- **Objective:** single config source of truth for plans/prices/entitlements/limits.
- **Files:** `server/src/modules/billing/plan-catalog.js` (new).
- **DB/API/UI:** none.
- **Tests:** unit — `getPlan`, `entitlementsForPlan` (+bundles), `normalizePlanId` (all
  legacy values × scope), `resolvePriceId`, `planForPriceId` round-trip,
  `getDisplayCatalog` has no price IDs.
- **Acceptance:** all three plans + entitlement keys defined; legacy `'pro'/'team'/
'free'` normalize correctly; no literal $ amounts (env-referenced only).
- **Dep:** — · **Effort:** M

### T-02 · Entitlement resolver service

- **Objective:** central resolver replacing scattered checks.
- **Files:** `server/src/modules/billing/entitlements.service.js` (new).
- **API:** internal (`resolveEntitlements/resolveForTeam/resolveForLeague/
resolveForLeagueTeam/resolveForUser/createRequestCache`).
- **Tests:** unit — every `plan × status × billingSource`; starter fallback; comp
  always-active; league bundles team_pro.
- **Acceptance:** pure `resolveEntitlements` covered; `resolveForTeam/League` do zero
  extra queries; request cache memoizes lookups.
- **Dep:** T-01 · **Effort:** L

### T-03 · Billing-service adapters

- **Objective:** keep `isTeamActive/isLeagueActive/getTeamEntitlements/
getLeagueEntitlements` as one-line delegates so call sites migrate incrementally.
- **Files:** `billing.service.js`.
- **Tests:** existing `billing.service.test.js` still green.
- **Acceptance:** old signatures return resolver-derived results; no behavior change.
- **Dep:** T-02 · **Effort:** S

### T-04 · Dependency-contract test

- **Objective:** guard cross-module exports (the follows pattern).
- **Files:** `server/src/tests/unit/billing.dependency-contract.test.js` (new).
- **Acceptance:** unmocked assertions on resolver exports + consumer imports pass.
- **Dep:** T-02 · **Effort:** S

### T-05 · Served catalog endpoint

- **Objective:** client renders prices from the server.
- **Files:** `billing.controller.js`, `billing.routes.js`.
- **API:** `GET /api/v1/billing/catalog` (public) → `getDisplayCatalog()`.
- **Tests:** integration — returns catalog, no price IDs, no auth required.
- **Acceptance:** endpoint live; payload matches catalog display projection.
- **Dep:** T-01 · **Effort:** S

---

## Phase 3 — Stripe / env / render

### T-06 · Catalog price resolution + interval/trial from config

- **Objective:** checkout reads price/interval/trial from catalog.
- **Files:** `billing.service.js` (`resolveTeamPriceId`/`resolveLeaguePriceId` →
  `resolvePriceId`; trial via `trialDaysFor`).
- **Tests:** unit — correct price ID per plan×interval; trial days from config.
- **Acceptance:** no hard-coded `14` or price-var names outside the catalog.
- **Dep:** T-01 · **Effort:** S

### T-07 · Env schema + `render.yaml` alignment

- **Objective:** all 4 price IDs present everywhere; retire `PRO_MONTHLY`; fail-fast on
  partial config.
- **Files:** `server/src/config/env.js`, `render.yaml`, `env/server/.env.*`.
- **Tests:** env-validation unit / `pnpm check-env`.
- **Acceptance:** `render.yaml` `-api-dev`/`-api-prod` list the 4 TEAM/LEAGUE IDs;
  `superRefine` requires them when `STRIPE_SECRET_KEY` set; `PRO_MONTHLY` gone from
  code (data cleanup in Phase 6).
- **Dep:** T-01 · **Effort:** S

### T-08 · Stripe price metadata `{planId, interval}`

- **Objective:** enable robust `planForPriceId` reverse lookup.
- **Files:** none (Stripe dashboard/CLI); document in `06-stripe-architecture.md`.
- **Acceptance:** dev prices carry `planId`/`interval` metadata; `planForPriceId` maps
  them.
- **Dep:** T-01 · **Effort:** S

---

## Phase 4 — Backend implementation

### T-09 · `stripeUrl.js` + apply to session creators

- **Objective:** server-side redirect safety.
- **Files:** `server/src/utils/stripeUrl.js` (new); `billing.service.js` (4 creators).
- **Tests:** unit — accept/reject hosts; 502 on unsafe.
- **Acceptance:** all four returned URLs asserted safe before response.
- **Dep:** — · **Effort:** S

### T-10 · Add `billingSource` field

- **Objective:** first-class comp/manual grants.
- **Files:** `teams.repository.js`, `leagues.repository.js`.
- **DB:** additive enum field, default `'stripe'`.
- **Tests:** schema tests; resolver comp/manual cases (T-02).
- **Acceptance:** field present; defaults preserve behavior.
- **Dep:** — · **Effort:** S

### T-11 · Migrate call sites off old helpers

- **Objective:** consumers use the resolver directly.
- **Files:** `games.service.js`, `teams.service.js`, `leagues.service.js`,
  `export/*`, `auth.service.js`.
- **Tests:** existing service/integration suites stay green.
- **Acceptance:** no direct `plan==='x'` outside the catalog; resolver used at all ~10
  sites.
- **Dep:** T-02, T-03 · **Effort:** M

### T-12 · Free-tracking flip (D2)

- **Objective:** tracking is free.
- **Files:** `games.service.js:1077,1400`; `billing.service.js`
  `assertTeamCreationAllowed` relaxed.
- **Tests:** **invert** `gates.test.js` tracking gate; add "free team can create+track."
- **Acceptance:** free team creates a game and appends events with no 402.
- **Dep:** T-11 · **Effort:** M · ⚠️ revenue-behavior change — call out in PR.

### T-13 · Snapshot source + league-game entitlements

- **Objective:** entitlement snapshots come from the resolver; expand keys; kill
  hard-coded `'pro'` fallbacks.
- **Files:** `games.service.js` (`:730`, `:825-926`, `:1029-1042`).
- **Tests:** old 2-key snapshot resolves safely; lapsed league loses premium views.
- **Acceptance:** snapshots carry full key set; historical games unaffected.
- **Dep:** T-11 · **Effort:** M

### T-14 · Replay/shot-map light server guard

- **Objective:** premium view data checks the frozen snapshot server-side.
- **Files:** `games.service.js` (data read paths).
- **Tests:** non-entitled recorded-as-free game omits/blocks replay data; Pro-recorded
  game serves it post-downgrade.
- **Acceptance:** scraper can't pull replay/shot data the UI hides.
- **Dep:** T-13 · **Effort:** M

### T-15 · CSV export entitlement gate

- **Objective:** export requires `canExportCsv`.
- **Files:** `server/src/modules/export/*`.
- **Tests:** 402 without; 200 with; role gates still apply.
- **Acceptance:** free user cannot export; Team Pro/League can.
- **Dep:** T-11 · **Effort:** S

### T-16 · Webhook plan-derivation + billingSource skip + new events

- **Objective:** derive plan via `planForPriceId`; skip non-Stripe docs; handle
  `invoice.paid` + `trial_will_end`.
- **Files:** `billing.service.js` webhook handlers.
- **Tests:** plan from price; comp doc skipped; renewal extends period; idempotency
  intact.
- **Acceptance:** webhook writes canonical plan; comp grants immune to stray events.
- **Dep:** T-01, T-10 · **Effort:** M

### T-17 · `syncOwnerPlan` → resolver + canonical `User.plan`

- **Objective:** user plan cache is resolver-derived and canonical.
- **Files:** `billing.service.js`, `auth.service.js`.
- **Tests:** user with active team → `team_pro`; none → `starter`.
- **Acceptance:** `sanitizeUser`/analytics see canonical values.
- **Dep:** T-02 · **Effort:** S

### T-18 · Trial-ending & failed-payment emails

- **Objective:** per-event billing emails via Resend.
- **Files:** `billing.service.js` (webhook), `services/email`.
- **Tests:** handler triggers email on `trial_will_end`/`payment_failed` (mock Resend).
- **Acceptance:** emails fire per event (no scheduler needed).
- **Dep:** T-16 · **Effort:** M

---

## Phase 5 — Frontend

### T-19 · PricingPage from served catalog (3 plans, new prices)

- **Files:** `client/src/features/billing/pages/PricingPage.jsx`.
- **UI:** fetch `/billing/catalog`; 3 cards; monthly⇄season toggle; per-player line.
- **Tests:** rewrite `PricingPage.test.jsx` (mock catalog; assert $9/$79, $29/$199).
- **Acceptance:** no hard-coded prices; canonical plan checks; checkout/portal correct.
- **Dep:** T-05 · **Effort:** M

### T-20 · Paywall UX + canonical plan values

- **Files:** `LockedFeatureCard.jsx`, `GameDetailPage.jsx`, `BillingSuccessPage.jsx`.
- **Tests:** replay lock; success-poll on canonical ids.
- **Acceptance:** locks/labels use catalog plan names; legacy `pro` tolerated.
- **Dep:** T-19 · **Effort:** S

### T-21 · Remove tracking hard-block + soft upsell

- **Files:** `GameTrackPage.jsx:1338-1356`.
- **Tests:** free team reaches the tracker; premium upsell is dismissible.
- **Acceptance:** no full-page "needs a plan to track" block.
- **Dep:** T-12 · **Effort:** S

### T-22 · CTA audit + billing visibility

- **Files:** `AdminPage.jsx`, `LeaguesPage.jsx`, `NewTeamPage.jsx`,
  `AdminNewLeaguePage.jsx`; team/admin plan pill + "Manage billing".
- **Tests:** RTL smoke on the pill/link.
- **Acceptance:** consistent copy; a status pill + portal link exist; no half-migrated
  CTAs.
- **Dep:** T-19 · **Effort:** M

### T-23 · Delete dead `GameShotMap.jsx` + legacy client alias

- **Files:** delete `GameShotMap.jsx`; remove `billingApi.createCheckoutSession`.
- **Tests:** build passes; no dangling imports.
- **Acceptance:** dead code gone.
- **Dep:** — · **Effort:** S

---

## Phase 6 — Migration

### T-24 · `migrate-unify-plan-enums.js`

- **Files:** `server/src/scripts/migrate-unify-plan-enums.js` (new); `seed*.js` updated.
- **Tests:** unit on the pure value-map; dry-run on dev snapshot.
- **Acceptance:** idempotent, reversible (`--rollback`), `--dry-run` parity report;
  Stripe-backed docs re-derived from price.
- **Dep:** T-01, T-10 · **Effort:** M

### T-25 · `migrate-drop-user-league-fields.js` + schema removal

- **Files:** script (new); `auth.repository.js` (remove fields); `auth.service.js`
  (remove dead path).
- **Tests:** `$unset` idempotent; `resolveForUser` supplies league flags.
- **Acceptance:** no `User.league*`; `sanitizeUser` unchanged externally.
- **Dep:** T-02 · **Effort:** M

### T-26 · `migrate-league-stripe-customer-index.js` + tighten enums

- **Files:** script (new); tighten `plan` enums in repos after migration verified.
- **Tests:** dedup abort path; index by key-shape; enum rejects non-canonical post-migrate.
- **Acceptance:** unique sparse index exists; enums canonical-only; race closed.
- **Dep:** T-24 · **Effort:** M

---

## Phase 7 — Testing & hardening

### T-27 · Stripe test-clock scenarios

- **Objective:** exercise trial→active, dunning, cancel, reactivate.
- **Acceptance:** all four scenarios pass in dev with CLI webhook forwarding.
- **Dep:** T-16, T-18 · **Effort:** M

### T-28 · Regression + baseline

- **Objective:** green server suite; documented client baseline; parity on ~10 call
  sites.
- **Acceptance:** `pnpm test` green (server); client diff explained vs recorded
  baseline.
- **Dep:** T-11..T-23 · **Effort:** M

---

## Phase 8 — Launch (separate)

### T-29 · Prod Stripe + env + backup

- **Objective:** live products/prices; Render env; fresh DB backup.
- **Acceptance:** launch-checklist infra items green.
- **Dep:** all · **Effort:** M

### T-30 · Flip `/pricing` prod gate + comms + doc updates

- **Files:** `AppRouter.jsx:194-199`; `PROJECT-KNOWLEDGE.md` §6 (+ recreate a billing
  reference doc if wanted — old `billing.md` was removed with the overhaul).
- **Acceptance:** `/pricing` live in prod; docs reflect the new model; launch comms
  sent.
- **Dep:** T-29 · **Effort:** S

---

## Fast-follows (specced, post-overhaul)

### F-01 · Team Pro → player-profile cascade

- **Files:** `PublicPlayerPage`/`PublicLeaguePlayerPage` service paths;
  `resolveForLeagueTeam`.
- **Acceptance:** Pro team's players show rich profiles; league bundles to all member
  teams; derived, not stored. · **Effort:** M

### F-02 · Free-tier limit enforcement

- **Files:** `teams.service.js` (`maxTeams`), history endpoints (`historyWindow`).
- **Acceptance:** Starter limited to 1 team + recent history; older seasons
  visible-but-locked (preview, not wall). · **Effort:** M

## Coverage check

Every impact-assessment row ([`04`](./04-impact-assessment.md)) is covered by ≥1 task
above; every task maps to a phase in [`16`](./16-phased-roadmap.md).
