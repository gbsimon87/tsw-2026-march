# 18 · Pre-Merge Audit Findings

> End-to-end security/correctness audit of the pricing overhaul, run on
> `feature/pricing-overhaul` (`e5210d8..HEAD`) on 2026-07-17. Method: five parallel
> specialist reviewers (payment-path security, entitlement gating, migrations/DB,
> frontend, cross-cutting consistency/perf) + a first-hand trace of the billing core.
> Findings below were verified against the code; the two enum Criticals were also
> reproduced against the repo's own Mongoose 8.23 schemas.
>
> **Bottom line: the branch cannot merge or deploy as-is.** Two shipped code paths
> write the legacy value `'free'` into schemas that T-26 tightened to canonical
> enums — this breaks user registration and paid-league provisioning outright, and
> the current 534-test suite is blind to both because every relevant test mocks the
> models. Fixes are cheap; the danger is the false green.

## Severity summary

| #      | Severity                       | Title                                                                                                                      | File                                                   |
| ------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| C1     | 🔴 Critical                    | Registration writes `plan:'free'` → User enum rejects → every signup 500s                                                  | auth.service.js:123                                    |
| C2     | 🔴 Critical                    | League checkout writes `plan:'free'` → League enum rejects → paid league never provisions                                  | billing.service.js:491                                 |
| C3     | 🔴 Critical                    | `stripeCustomerId` unique+sparse index cannot build (schema defaults field to `null`)                                      | migrate-league-stripe-customer-index.js:37,78          |
| C4     | 🔴 Critical (migration-safety) | `doc.save()` runs full validation → any out-of-enum legacy field aborts the migration mid-collection; dry-run can't see it | migrate-unify-plan-enums.js:77-91                      |
| H1     | 🟠 High                        | Trial farming: unconditional 14-day trial, new customer per checkout, no has-trialed guard                                 | billing.service.js:221,267                             |
| H2     | 🟠 High                        | Duplicate-purchase race → two live subs / two league docs, orphaned & unmanageable                                         | billing.service.js:189-191,469-501                     |
| H3     | 🟠 High                        | Webhook claims event **before** applying state → a mid-apply throw loses the event forever                                 | billing.service.js:392→399 (+all handlers)             |
| H4     | 🟠 High                        | `--rollback` guaranteed to crash under tightened enum; user rollback writes never-valid `'team'`                           | migrate-unify-plan-enums.js:56,106                     |
| H5     | 🟠 High                        | All 3 migration scripts hang forever on failure (no `disconnectDb` in catch)                                               | migrate-\*.js catch blocks                             |
| H6     | 🟠 High                        | `canViewHighlightClips` enforced **nowhere**; clips leak on public player profiles                                         | leagues.service.js:1258,1282; teams.service.js:631,645 |
| H7     | 🟠 High                        | One-sided games never freeze an entitlement snapshot → lapse retroactively locks recorded games                            | games.service.js:935-949                               |
| H8     | 🟠 High                        | Synthetic league-team object hard-codes `plan:'pro',status:'active'` (always-active footgun)                               | leagues.service.js:2454-2455                           |
| H9     | 🟠 High                        | No integration coverage for the canonical-enum write paths (why C1/C2 shipped green)                                       | server/src/tests/integration/                          |
| M1     | 🟡 Medium                      | `markTeamFromCheckoutSession` skips `isStripeManaged` and force-sets `billingSource:'stripe'` → converts a comp team       | billing.service.js:387-401                             |
| M2     | 🟡 Medium                      | Env fail-fast omits `STRIPE_WEBHOOK_SECRET` + success/cancel URLs                                                          | env.js:77-95                                           |
| M3     | 🟡 Medium                      | 4xx Stripe SDK errors return raw message (leaks live price IDs) to client                                                  | error.middleware.js + billing.service.js               |
| M4     | 🟡 Medium                      | `updateLeagueFromSubscription` missing `if(!customerId) return` → undefined filter can match arbitrary league              | billing.service.js:504-511                             |
| M5     | 🟡 Medium                      | `$unset` of non-schema paths may be silently stripped by strict mode → drop-migration no-ops                               | migrate-drop-user-league-fields.js:48                  |
| M6     | 🟡 Medium                      | Self-heal `planForPriceId` silently falls back when env price IDs differ → can downgrade a payer                           | planMigration.js:25-31                                 |
| M7     | 🟡 Medium                      | Client reads dropped `user.leagueBilling` → analytics report every user `leaguePlan:'free'`                                | PostHogRouteTracker.jsx:59-60                          |
| M8     | 🟡 Medium                      | `BillingStatusPill` hangs on "Opening…" and swallows all errors; past_due shows "Upgrade" not portal                       | BillingStatusPill.jsx:38-50,34-35                      |
| M9     | 🟡 Medium                      | In prod today every billing CTA silently dumps users on `/pulse` (pill added a prod-visible dead end)                      | AppRouter.jsx:194-199 + CTAs                           |
| M10    | 🟡 Medium                      | CSV export gate is league-only → advertised Team-Pro CSV export is unpurchasable                                           | export.service.js:10-14,298-327                        |
| M11    | 🟡 Medium                      | Legacy `getTeam/LeagueEntitlements` maps say `canTrackStats:false` for starter (contradicts T-12)                          | billing.service.js:81-100                              |
| M12    | 🟡 Medium                      | `GET /billing/catalog` uncached + imperatively fetched (static config)                                                     | billing.controller.js:11-13 + PricingPage.jsx:103      |
| M13    | 🟡 Medium                      | League `stripeCustomerId` unindexed — collection scan per league webhook                                                   | leagues.repository.js:49                               |
| M14    | 🟡 Medium                      | Billing emails interpolate `team.name`/`league.name` into HTML unescaped                                                   | email.service.js:102,119                               |
| M15    | 🟡 Medium                      | No catalog-display-vs-Stripe-price drift guard                                                                             | plan-catalog.js:87-122                                 |
| M16    | 🟡 Medium                      | Trial length hard-coded in Success/Admin/Cancel pages → drifts from catalog                                                | BillingSuccessPage.jsx:135 + others                    |
| M17    | 🟡 Medium                      | League vs team games use inconsistent freeze semantics (frozen dual-team vs live one-sided)                                | games.service.js:871-932                               |
| M18    | 🟡 Medium                      | Billing summaries emit legacy `'free'`; checkout metadata stamps `'team'`/`'league'`                                       | billing.service.js:106,117,226,271                     |
| L1–L14 | ⚪ Low                         | See "Low findings" below                                                                                                   | —                                                      |
| D1     | 📘 Docs                        | PROJECT-KNOWLEDGE.md §6 stale (wrong prices + wrong location); permissions.md silent on 402 gates                          | docs/                                                  |

---

## Critical

### C1 · Registration writes `plan:'free'` → every signup 500s

- **File:** [auth.service.js:123](../../server/src/modules/auth/auth.service.js#L123) vs enum at [auth.repository.js:15](../../server/src/modules/auth/auth.repository.js#L15) (`['starter','team_pro']`).
- **Why:** `register()` → `createUser({ ..., plan:'free' })` → `User.create` runs full validation → `ValidationError: 'free' is not a valid enum value`. Reproduced against the repo's Mongoose.
- **Trigger:** any local email/password registration after this code deploys. (Google OAuth survives — it doesn't set `plan`, so the `'starter'` default applies.)
- **Fix:** delete the `plan:'free'` line (let the schema default apply), or write `'starter'`.
- **Also review:** every other `createUser`/`User.create` call for stray legacy fields.

### C2 · League checkout writes `plan:'free'` → paid league never provisions

- **File:** [billing.service.js:491](../../server/src/modules/billing/billing.service.js#L491) vs enum at [leagues.repository.js:39](../../server/src/modules/leagues/leagues.repository.js#L39) (`['starter','league']`).
- **Why:** `createLeagueFromCheckoutSession` → `League.create({ ..., plan:'free' })` throws inside `handleWebhookEvent` → webhook 500s → Stripe retries fail identically → **the league is never created after a successful payment**. The follow-on `customer.subscription.*` events resolve by `stripeCustomerId`, find no doc, and silently no-op. Customer is charged, gets nothing.
- **Trigger:** first `checkout.session.completed` for any league.
- **Fix:** `plan:'starter'` (or omit for the default).
- **Also review:** the whole `createLeagueFromCheckoutSession` create object against the current League schema.

### C3 · `stripeCustomerId` unique+sparse index cannot build

- **File:** [migrate-league-stripe-customer-index.js:37,78](../../server/src/scripts/migrate-league-stripe-customer-index.js#L37) + schema default at [leagues.repository.js:49](../../server/src/modules/leagues/leagues.repository.js#L49) (`stripeCustomerId: { type:String, default:null }`).
- **Why:** Mongoose persists defaults on create, so nearly every League doc stores an **explicit** `stripeCustomerId: null`. A MongoDB _sparse_ index skips only docs where the field is **missing** — an explicit `null` **is** indexed. Two null-valued leagues → `createIndex` aborts with `E11000 duplicate key {stripeCustomerId: null}`. Worse, the script's dedup precheck filters `{ stripeCustomerId: { $ne: null } }`, so it reports "no duplicates" and then the build throws. (Doc [07-database-changes.md](./07-database-changes.md) encodes the same misconception.)
- **Trigger:** running the migration against any DB with ≥2 leagues.
- **Fix:** use a **partial** index `{ partialFilterExpression: { stripeCustomerId: { $type: 'string' } } }` (and update the dedup check + doc 07 accordingly), or `$unset` null values first.

### C4 · Migration `save()` runs full validation → aborts mid-collection; dry-run blind

- **File:** [migrate-unify-plan-enums.js:77-91](../../server/src/scripts/migrate-unify-plan-enums.js#L77).
- **Why:** the script hydrates each doc and calls `doc.save()`, which validates the **entire** document, not just `plan`. Proven against the real schemas: a doc with `subscriptionStatus:'unpaid'` (a real Stripe status **not** in the tightened 5-value enum) or a legacy `players[].position` throws and aborts the loop. Dry-run skips `save()` entirely, so a dataset that dry-runs clean can still crash the real run — breaking the "always dry-run first" safety story.
- **Trigger:** any legacy/edited doc with one out-of-enum field; partial migration on abort (Teams half-done, Leagues/Users untouched).
- **Fix:** `doc.save({ validateModifiedOnly: true })` (proven to pass) or targeted `updateOne` with `$set`; and in dry-run call `await doc.validate()` after assigning so validation failures surface before the real run.
- **Mitigant:** both current and pre-overhaul webhook code funnel status writes through `normalizeSubscriptionStatus` (collapses to the 5-value enum), so out-of-enum statuses can exist only from manual edits or pre-`e5210d8` data — prevalence unknown; treat as unbounded until a prod snapshot is checked.

---

## High

### H1 · Trial farming — unlimited free trials

- **File:** [billing.service.js:221,267](../../server/src/modules/billing/billing.service.js#L221); trial days [plan-catalog.js:198-200](../../server/src/modules/billing/plan-catalog.js#L198).
- **Why:** `trialDaysFor` returns 14 unconditionally, and each checkout passes only `customer_email` (no `customer`), so Stripe mints a **new** customer every time and its per-customer trial dedup never applies. The only gate is `isTeamActive` (false once lapsed). Cancel-during-trial → re-checkout → fresh 14 days, forever, per team and per league.
- **Fix:** persist `hasTrialed`/`trialUsedAt` on Team/League and set `trial_period_days` conditionally, or reuse one Stripe customer per resource and let Stripe suppress repeat trials.

### H2 · Duplicate-purchase race

- **File:** [billing.service.js:189-191](../../server/src/modules/billing/billing.service.js#L189) (check) vs 387-414 (apply); league 243-245 vs 469-501.
- **Why:** the "already active" check is check-then-act with a window spanning the whole hosted-checkout session (minutes). Two tabs both pass, both complete. Team: last webhook wins `stripeSubscriptionId`, orphaning the first sub — it keeps billing but the portal (keyed to the surviving customer) can never cancel it. League is worse: each checkout mints its own customer, and `existingByCustomer` only dedupes the **same** customer, so two completions create **two** leagues, both billed.
- **Fix:** on webhook, if the resource already has a different active `stripeSubscriptionId`, cancel the incoming sub via the API; add the unique index (see C3, done correctly); reuse one Stripe customer per resource.
- **Related:** C3, H1.

### H3 · Webhook event claimed before state applied → lost on mid-apply throw

- **File:** [webhookIdempotency.js:26-38](../../server/src/utils/webhookIdempotency.js#L26) + every handler (e.g. [billing.service.js:392→399](../../server/src/modules/billing/billing.service.js#L392)).
- **Why:** `claim*WebhookEvent` atomically records the event id, **then** the handler mutates and `save()`s. If `save()` throws (transient DB error — or the C2 ValidationError, which makes this concrete), the route 500s and Stripe retries, but the retry's claim returns `null` (id already recorded) so the effect is never applied. A paid sub silently never activates, or a cancel never downgrades. `syncOwnerPlan` after `save()` has the same exposure.
- **Fix:** apply state and record the claim in one atomic `findOneAndUpdate`; or record the claim only after a successful apply (idempotent `$set` tolerates the rare double-apply); or unclaim on failure.

### H4 · `--rollback` crashes under the tightened enum

- **File:** [migrate-unify-plan-enums.js:56,106](../../server/src/scripts/migrate-unify-plan-enums.js#L56) + [planMigration.js:49-54](../../server/src/scripts/lib/planMigration.js#L49).
- **Why:** rollback writes `'free'/'pro'/'team'` through the same hydrate+save loop while the tightened schemas are loaded → throws on the first doc. The header says rollback "requires the pre-tightening enum deployed first" but nothing enforces it. Separately, `rollbackPlan('team', ...)` returns `'team'` for a `team_pro` user — but the pre-tightening **User** enum was `['free','pro']`, so `'team'` was never valid for a user; user rollback throws even with the old code deployed. The unit test never exercises the user rollback path.
- **Fix:** assert at startup that the loaded schema enums include the legacy values; add a user-specific inverse (`team_pro → 'pro'`).

### H5 · Migration scripts hang forever on failure

- **File:** catch blocks in [migrate-unify-plan-enums.js:133](../../server/src/scripts/migrate-unify-plan-enums.js#L133), migrate-drop-user-league-fields.js:56, migrate-league-stripe-customer-index.js:84.
- **Why:** `main().catch` sets `process.exitCode = 1` but never calls `disconnectDb()`; the open connection keeps the event loop alive, so the process never exits — stalling a deploy pipeline instead of failing it.
- **Fix:** `finally { await disconnectDb(); }` (or disconnect in the catch) in all three.

### H6 · `canViewHighlightClips` enforced nowhere; clips leak publicly

- **File:** public profiles [leagues.service.js:1258,1282](../../server/src/modules/leagues/leagues.service.js#L1258); [teams.service.js:631,645](../../server/src/modules/teams/teams.service.js#L631). Sharing/auto-feed [feed.service.js:1004-1028,1206-1216](../../server/src/modules/feed/feed.service.js#L1004).
- **Why:** both public player-profile endpoints return `highlights` (eventId, statType, `videoTimestamp`, `videoUrl`) with **no** entitlement check; clip sharing and auto-feed publish check authorization only. `canViewHighlightClips` — a headline Team Pro feature — has **zero** server enforcement.
- **Fix:** gate `highlights` on `resolveForTeam`/`resolveForLeagueTeam().canViewHighlightClips`, or descope clips to free and remove them from the paid feature list + catalog.

### H7 · One-sided games never freeze a snapshot → lapse retroactively locks

- **File:** [games.service.js:935-949](../../server/src/modules/games/games.service.js#L935) (read, live resolve) vs snapshot write only on dual-team create (l.730).
- **Why:** the one-sided standalone create path writes **no** `entitlementsSnapshot` and the read path uses **live** `resolveForTeam(team).entitlements`. One-sided is the most common mode. Doc 08's freeze rule ("a lapsed team never retroactively locks games it recorded while Pro") is therefore violated for the common case: lapse → old games lose replay/shot maps.
- **Fix:** write `entitlementsSnapshot` on one-sided create (or at finish) and read it in the final branch of `resolveGameTeamContext`.
- **Related:** M17 (league games use frozen-vs-live inconsistently by tracking mode).

### H8 · Synthetic league-team hard-codes `plan:'pro', status:'active'`

- **File:** [leagues.service.js:2454-2455](../../server/src/modules/leagues/leagues.service.js#L2454).
- **Why:** `getLeagueTeamRosterSnapshotForGame` returns a fabricated always-active legacy object. Response-inert today (the caller uses the resolver), but it's also returned as `teamDoc` — any future consumer resolving entitlements from `teamDoc` gets always-active premium, re-opening exactly the bypass T-13 removed.
- **Fix:** drop the two fields from the synthetic object.
- **Also review:** the `teamDoc` consumers at games.service.js:930 (needs-verification they never resolve entitlements from it).

### H9 · No integration coverage for the enum write paths

- **File:** server/src/tests/integration/ — `billing.routes.test.js:14` mocks the entire billing service; every webhook unit test mocks `leagues.repository`; no test hits `/auth/register` with a real model.
- **Why:** this is _why_ C1 and C2 shipped through a green 534-test suite. The enum-tightening (T-26) has no regression net on write paths.
- **Fix:** add integration tests that exercise `User.create` (register route) and `createLeagueFromCheckoutSession` against a real/in-memory Mongo.

---

## Medium

- **M1 · `markTeamFromCheckoutSession` skips comp-guard + force-sets `billingSource:'stripe'`** — [billing.service.js:387-401](../../server/src/modules/billing/billing.service.js#L387). Every other handler checks `isStripeManaged`; this one doesn't, and it unconditionally sets `billingSource='stripe'`, converting a comp/manual grant into a Stripe-managed doc (reachable when a comp team has `plan:'starter'`, since checkout isn't blocked). **Fix:** add `if (!isStripeManaged(team)) return;` after the claim; decide checkout-vs-comp policy explicitly.
- **M2 · Env fail-fast gap** — [env.js:77-95](../../server/src/config/env.js#L77). `superRefine` requires the 4 price IDs but not `STRIPE_WEBHOOK_SECRET`/`STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL`. With the secret set but webhook secret unset, boot succeeds, checkout works, and every webhook fails signature verification — customers charged, never provisioned. **Fix:** add the three to the refinement.
- **M3 · Stripe 4xx messages leak to client** — `errorMiddleware` masks only ≥500; a `StripeInvalidRequestError` (statusCode 400, e.g. `No such price: price_1ABC…`) is returned verbatim, leaking live price IDs that `getDisplayCatalog` deliberately hides. **Fix:** catch Stripe errors in the service and rethrow `ApiError(502, 'Billing provider error')`.
- **M4 · `updateLeagueFromSubscription` missing `if(!customerId) return`** — [billing.service.js:504-511](../../server/src/modules/billing/billing.service.js#L504). Sibling handlers all guard; without it an undefined `customerId` becomes filter `{}` and claims the first league in the collection. Not attacker-reachable (events are signature-verified and Stripe always sends `customer`), defensive-depth. **Fix:** add the guard.
- **M5 · `$unset` may be stripped by strict mode** — [migrate-drop-user-league-fields.js:48](../../server/src/scripts/migrate-drop-user-league-fields.js#L48). The 7 fields were removed from the schema, so Mongoose strict update-casting may drop the `$unset` paths → fields remain while the script prints success. **Fix:** `{ strict: false }` on the `updateMany` (or use the raw collection). _needs-verification with one scratch-DB run._
- **M6 · Self-heal silent downgrade** — [planMigration.js:25-31](../../server/src/scripts/lib/planMigration.js#L25). `resolveTargetPlan` uses `planForPriceId(stripePriceId)`, which reads env price IDs at runtime; if the ENV_FILE's IDs differ from the data's, it silently falls back to `normalizePlanId` and can downgrade a paying customer, indistinguishably in dry-run. **Fix:** when `stripePriceId` is set but unrecognized, log loudly / abort.
- **M7 · Client reads dropped `user.leagueBilling`** — [PostHogRouteTracker.jsx:59-60](../../client/src/features/analytics/PostHogRouteTracker.jsx#L59). Server no longer serializes `leagueBilling`, so every event reports `leaguePlan:'free'`. Line 55 also uses legacy `'free'` fallback while the server now sends `'starter'`. **Fix:** drop the two props or derive from real data; normalize the fallback.
- **M8 · `BillingStatusPill` UX failures** — [BillingStatusPill.jsx:38-50](../../client/src/features/billing/components/BillingStatusPill.jsx#L38). `manageBilling` only clears `busy` in the catch and only assigns on a safe URL → button hangs on "Opening…" with no error surfaced when the portal call fails or returns an unexpected body. Separately, a `past_due`/`canceled` team shows "Upgrade →" (to /pricing) instead of the portal — hiding the one action that fixes it. **Fix:** `finally { setBusy(false) }` + error text; treat `past_due` with a `stripeCustomerId` as portal-eligible.
- **M9 · Prod billing CTAs dump users on `/pulse`** — [AppRouter.jsx:194-199](../../client/src/app/router/AppRouter.jsx#L194) gates `/pricing` to non-prod (documented pre-launch state), but T-22 added a prod-visible "Upgrade →" pill plus paywall/creation CTAs that all navigate to the gated route → silent redirect to the feed. **Fix:** hide upgrade CTAs behind the same `appEnv` flag until launch, or accept as known pre-launch (the gate flip is the documented one-liner).
- **M10 · Advertised Team-Pro CSV export doesn't exist** — [export.service.js:10-14](../../server/src/modules/export/export.service.js#L10). `assertCanExportCsv` resolves the **league** only; there is no team-scoped export endpoint, and a `team_pro` plan never satisfies `resolveForLeague`. The 402 copy promises "Team Pro or League". **Fix:** add a team-scoped export gated on `resolveForTeam`, or fix the plan/copy.
- **M11 · Legacy entitlement maps contradict T-12** — [billing.service.js:81-100](../../server/src/modules/billing/billing.service.js#L81). `getTeam/LeagueEntitlements` return `canTrackStats: active`, so a starter team resolves `canTrackStats:false` (tracking is supposed to be free), and they omit `canExportCsv`/`canViewFullHistory`. Only reachable via `getTeam/LeagueBillingForOwner`, which are exported but **unrouted** — dead but loaded footguns. **Fix:** delete or reimplement on the resolver.
- **M12 · `/billing/catalog` uncached + imperative fetch** — [billing.controller.js:11-13](../../server/src/modules/billing/billing.controller.js#L11) sets no `Cache-Control` on static config; PricingPage fetches it in a bare `useEffect` (against the TanStack-Query convention for new pages). **Fix:** `public, max-age=300` + `useQuery` with a generous `staleTime`.
- **M13 · League `stripeCustomerId` unindexed** — [leagues.repository.js:49](../../server/src/modules/leagues/leagues.repository.js#L49). Every league webhook (`findOne`/`claimLeagueWebhookEvent` by `stripeCustomerId`) is a collection scan. **Fix:** add an index now (unique deferred per the OPT-020 note / C3).
- **M14 · Unescaped names in billing emails** — [email.service.js:102,119](../../server/src/services/email.service.js#L102). `team.name`/`league.name` are interpolated into HTML email bodies unescaped (HTML-injection / phishing vector in-email). **Fix:** escape interpolations.
- **M15 · No catalog-vs-Stripe price drift guard** — [plan-catalog.js:87-122](../../server/src/modules/billing/plan-catalog.js#L87). Display strings are copy-only; nothing compares them to the real Stripe `unit_amount`, so a Dashboard price edit silently makes the page lie. **Fix:** a boot/CI check via `stripe.prices.retrieve`.
- **M16 · Trial length hard-coded off-catalog** — [BillingSuccessPage.jsx:135](../../client/src/features/billing/pages/BillingSuccessPage.jsx#L135), AdminPage.jsx:286, BillingCancelPage.jsx. "14-day trial" copy will lie if `trialDays` changes. **Fix:** derive from the catalog or soften copy.
- **M17 · League games: frozen (dual-team) vs live (one-sided) freeze semantics** — [games.service.js:871-932](../../server/src/modules/games/games.service.js#L871). The two modes disagree on whether a lapsed league locks old league games. **Fix:** pick one semantic (doc 08 wants live for league games) and apply it consistently; update the doc. **Related:** H7.
- **M18 · Legacy plan strings in outputs/metadata** — billing summaries default `plan: x.plan || 'free'` ([billing.service.js:106,117](../../server/src/modules/billing/billing.service.js#L106)); checkout metadata stamps `plan:'team'`/`'league'` (l.226,271). Harmless today (webhooks derive plan from price ID) but forces permanent legacy tolerance client-side and shows retired vocab in the Stripe Dashboard. **Fix:** default `'starter'` (or `normalizePlanId`); write canonical ids into metadata.

---

## Low findings

- **L1** `invoice.paid` force-sets `subscriptionStatus:'active'` without matching the invoice to the current sub — a $0 trial invoice flips `trialing`→`active` early, and a stale invoice can re-activate a canceled sub (plan already `starter`, so entitlements safe). [billing.service.js:460,571]
- **L2** `$slice:-25` on `processedWebhookEventIds` re-opens dedup for events evicted during a >25-event storm (Stripe retries ~3 days). Last-write-wins `$set` limits impact to stale-state overwrite. [webhookIdempotency.js:17]
- **L3** Comp/manual resolves `active` regardless of `subscriptionStatus`/plan, with no expiry (`currentPeriodEnd` ignored). Matches documented intent; note only. [entitlements.service.js:21]
- **L4** Hard-coded `plan:'pro'`/`{canViewReplay:true,…}` fallbacks in teamDoc builders — inert (feed only roster/box-score) but the class T-13 removed. [games.service.js:825-826]
- **L5** Snapshot readers default absent keys to **false**, not the record-time plan value (doc 08 says otherwise). Safe today (old 2-key snapshots carry both consumed keys) but any future key read from an old snapshot silently reads false. [games.service.js:895-897]
- **L6** Feed game-card snapshot freezes `recap` (incl. shotSnapshot) at share time and serves it anonymously on `/feed` — consistent with team freeze, inconsistent with live-league; mostly moot while H6/the event leak exists. [feed.service.js:166-188]
- **L7** `resolveForUser` ignores league ownership for `User.plan` (`hasActiveLeague` computed but unused; league webhooks never call `syncOwnerPlan`) → league-only organizers show `plan:'starter'` in analytics. [entitlements.service.js:92]
- **L8** Dead backward-compat service aliases `createCheckoutSession`/`createCustomerPortalSession` — zero callers (the legacy route/controller call the new fns directly). [billing.service.js:287-289,322-324]
- **L9** `resolveForLeagueTeam` + `createRequestCache` have no production callers (also why the feared N+1 can't occur). Delete or wire in. [entitlements.service.js:54-73]
- **L10** Duplicated `ACTIVE_STATUSES` in billing.service.js:25 and entitlements.service.js:13 — a second place deciding "active" outside the resolver. Export one and import it.
- **L11** Billing emails never pass `manageUrl`, so the templates' "update payment method" CTA never renders. [billing.service.js:429,444,537,552]
- **L12** `STRIPE_PRICE_ID_TEAM_SEASON` + `season` interval key drives a `/yr` display — an operator could wire a season-length (not yearly) price. Documented-deliberate; add an env-template note. [env.js:39 + plan-catalog.js:90-93]
- **L13** Client keeps one raw `plan === 'x'` fallback (documented tolerance) in `canAccessReplay`. [GameDetailPage.jsx:168]
- **L14** Client test fixtures assert mostly legacy plan values; add canonical-value cases so the legacy fallback can eventually be deleted with confidence.
- **L15** Soft dismissible Team-Pro upsell (doc 10 §2) was never implemented in GameTrackPage (hard block correctly removed). Implement or descope in the doc.

---

## Docs drift (D1)

- **PROJECT-KNOWLEDGE.md §6** ([lines 344-360](../PROJECT-KNOWLEDGE.md)) is stale now that the overhaul has shipped on-branch: it cites **Team $12/mo·$89/season, League $49/mo·$299/season "in PricingPage.jsx"** — wrong prices _and_ wrong location (served catalog since T-19); no mention of the catalog/resolver/`billingSource`/canonical enums/`/billing/catalog`. A banner points to `docs/pricing-overhaul/` as direction-of-truth, so it's contained — but it **must** be updated when the branch merges (this is T-30), not after.
- **permissions.md** has no coverage of the new entitlement (402) gates — it predates resource-entitlement gating. Add an "entitlements (billing) vs permissions (roles)" section. (402-vs-403 exact codes confirmed by the gating reviewer: CSV export, season create, league configure, add-team all 402.)

---

## Cross-cutting VERIFIED OK (what the audit cleared)

- **IDOR:** all four checkout/portal paths use owner-scoped finders (`findTeamByIdAndOwner`/`findLeagueByIdAndOwner`); `findTeamById` is never used in the billing module. Cross-tenant CSV export is impossible (role check precedes the entitlement check).
- **Webhook signature** is verified before any processing on every path; plan/interval are derived from the real Stripe price ID (`planForPriceId`), never trusted from metadata.
- **`stripeUrl.js`** resists userinfo/subdomain/protocol-relative/case bypasses (WHATWG `URL` + exact `hostname` allowlist); applied to all four session URLs.
- **`GET /catalog`** exposes no price IDs (display projection only).
- **Comp-immunity** holds in all handlers **except** `markTeamFromCheckoutSession` (M1).
- **`syncOwnerPlan` multi-team safety:** a cancel on team B leaves `User.plan='team_pro'` while team A is active (`resolveForUser` aggregates).
- **Period-end unit handling:** every Stripe epoch-seconds field is ×1000 before `new Date`.
- **Performance:** the entitlement work added **no** new DB roundtrips to `getGameForUser`/game-context paths (resolves from already-loaded docs); no N+1; `syncOwnerPlan` runs once per team webhook on indexed queries.
- **T-12 free-tracking flip** is clean: exactly the two 402 gates removed, ownership/role checks intact.
- **Pricing values:** catalog matches [02-pricing-model.md](./02-pricing-model.md) exactly; no hard-coded prices in client code (only tests asserting catalog values); stale $12/$89/$49/$299 survive only in historical docs.
- **No OPT-### comments were deleted** in the diff.
- **Event-coordinate exposure (`x`/`y`/`videoTimestamp` on the anonymous game endpoint) is PRE-EXISTING** — `sanitizeEvent` exposed these at `e5210d8`. T-14's shot-map/highlight strip is cosmetic against a pre-existing public exposure, **not** a regression this branch introduced. Still worth fixing (see H6 / recommended follow-up) but it does not block _this_ merge on regression grounds.

---

## Recommended fix order

**Gate 1 — before ANY deploy of this branch (blocks merge):**

1. C1 (`plan:'free'` → `'starter'` in register)
2. C2 (`plan:'free'` → `'starter'` in league create)
3. H9 (add the two integration tests that would have caught C1/C2 — TDD the fixes)

**Gate 2 — before running the migrations on any environment:** 4. C3 (partial index, not sparse; fix dedup check + doc 07) 5. C4 (`validateModifiedOnly` + validate-in-dry-run) 6. H4 (rollback enum guard + user-scope inverse), H5 (finally-disconnect), M5 (`strict:false` on `$unset`), M6 (loud self-heal warning)

**Gate 3 — before launch (Phase 8), payment-integrity:** 7. H3 (webhook claim/apply ordering — most important correctness fix) 8. H1 (trial farming), H2 (duplicate-purchase / reuse customer + cancel-orphan), M1 (comp-guard on checkout), M2 (env fail-fast), M3 (Stripe-error masking), M4 (customerId guard)

**Gate 4 — entitlement correctness (before or with launch):** 9. H6 (highlight-clip enforcement / descope decision), H7 + M17 (snapshot freeze consistency), M10 (team CSV export or copy fix), M11 (delete dead legacy maps), H8 + L4 (drop hard-coded plan fields)

**Gate 5 — polish / can trail launch:** 10. Frontend: M7, M8, M9, M16; Perf/quality: M12, M13, M14, M15; all Low; D1 (docs — M-level, do with the T-30 merge).

_Fixes to be implemented after this report is reviewed and the priorities confirmed — no code has been changed._
