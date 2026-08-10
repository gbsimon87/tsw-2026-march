# 10 · Frontend Changes

> Client work: rebuild the pricing page from the served catalog, align paywall UX and
> CTAs, remove dead code, and add contextual upgrade prompts. React 18 + Vite,
> feature-based; billing pages are currently imperative (`useEffect`+`useState`).

## 1. `PricingPage.jsx` — render from the served catalog

- **Delete** the hard-coded `PRICES` (`:27-30`) and `FREE_/TEAM_/LEAGUE_FEATURES`
  (`:32-58`).
- Fetch `GET /api/v1/billing/catalog` and render the three plan cards from
  `getDisplayCatalog()` output (names, taglines, display prices, feature arrays). This
  permanently kills the client/server price drift (`$12/$89` was stale).
- Keep `isSafeStripeUrl` (`:15-25`) client-side as defense-in-depth (server now also
  validates).
- Update the `isActivePlan` checks (`:156-157`) to canonical ids (`team_pro`/`league`)
  with legacy `pro` still tolerated during migration.
- 3-plan layout (Starter / Team Pro / League); monthly⇄season toggle; per-player line on
  the League card.
- **Migration note:** consider moving to TanStack Query (`useQuery`) for the catalog +
  teams/leagues fetch — optional, aligns with the OPT-014b direction, but not required;
  imperative is acceptable to keep scope tight.

## 2. Paywall / entitlement UX

- `LockedFeatureCard.jsx` — align copy to plan names from the catalog (`planName` prop);
  no structural change.
- Replay lock (`GameDetailPage.jsx:592-609`) — unchanged behavior; entitlement value now
  resolver-derived. `canAccessReplay` (`:151-167`) accepts canonical ids.
- Highlight share gating (`canShareHighlights`) — unchanged.
- Tracking gate block (`GameTrackPage.jsx:1338-1356`) — **remove/repurpose**: tracking
  is now free (D2), so the "needs an active plan to track" full-page block should go.
  Replace with a soft, dismissible upsell to Team Pro for _premium_ features (replay/
  shot maps), not a hard block.

## 3. CTA audit

Many CTAs point at `/pricing`, which is prod-gated (audit §7): `AdminPage`
(`:269-287`), `LeaguesPage` (`:39-44`), `NewTeamPage` (`:237-239`),
`AdminNewLeaguePage` (`:34-38` 402 handler), `GameDetailPage`, `GameTrackPage`,
`LockedFeatureCard`.

- Keep them pointing at `/pricing`; they light up when the launch flip lands.
- Ensure copy is consistent with the new model (no "$12"/"Team Pro" mismatches).
- **Don't half-migrate** — either all CTAs reflect the new plans or none, to avoid
  confusing dead-ends during the gated period.

## 4. `BillingSuccessPage.jsx` / `BillingCancelPage.jsx`

- Poll checks (`:48,79`) accept canonical plan ids (`team_pro`/`league`) + legacy
  tolerance.
- Copy references the new plan names/prices (from catalog where practical).

## 5. Dead code removal

- **Delete `client/src/features/games/components/GameShotMap.jsx`** — implemented but
  imported nowhere; live rendering uses `RecapShotSnapshot`. Confirm no import before
  deleting.
- Remove `billingApi.createCheckoutSession` legacy alias once unused.

## 6. Contextual upgrade prompts (light, at value gates)

Replace the single dead `/pricing` redirect with prompts _at the moment of value_:

- Clicking a locked Replay tab → the existing `LockedFeatureCard` (already contextual).
- Attempting CSV export without entitlement → inline "Upgrade to Team Pro to export."
- Creating a 2nd team (once free-tier limits ship) → contextual, not a nag banner.
- **No** global nag banners. Prompts tie to an action the user just took.

## 7. Admin/dashboard billing visibility (cross-cutting)

Today there's no plan/billing display on team/admin pages (audit §7). Add a small,
read-only "Plan: Team Pro · Manage billing →" affordance on the relevant admin/team
surfaces so users can see status and reach the Customer Portal. Scope carefully — a
status pill + a portal link, not a billing dashboard.

## 8. Nav affordance (launch-time)

No pricing/upgrade link exists in `AppLayout` nav. Add a discoverable "Upgrade"/
"Plans" entry **at launch** (kept out while `/pricing` is prod-gated).

## Tests to update (Vitest)

- `PricingPage.test.jsx` — currently asserts `$12/mo`→`$89/season` toggle and 2 plans;
  rewrite for the served catalog + 3-plan layout + new prices. Mock the catalog fetch.
- `BillingSuccessPage.test.jsx` — canonical plan ids.
- `GameDetailPage.test.jsx` — entitlement permutations still valid; verify replay lock
  with resolver-shaped values.
- `GameTrackPage.test.jsx` — the tracking-block test must change (tracking now free).
- Establish a green baseline first — `OPT-026`'s "~20 pre-existing failures" is
  **unconfirmed** (grep found no marker); run `pnpm --filter client test` before
  editing to know the real baseline.

## What stays the same

- `apiClient` (cookie auth, CSRF, silent refresh) — unchanged.
- Hosted Checkout/Portal redirect flow — unchanged (still `window.location.assign`).
- `AuthContext` — unchanged except `user.plan` now carries a canonical value.
