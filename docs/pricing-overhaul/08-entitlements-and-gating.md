# 08 · Entitlements & Gating

> The resolver API in practice, and — the decisive part — **where each feature is
> enforced**: hard server 402, client-surfaced snapshot boolean, or content-shaping.
> Getting this table right is the heart of the overhaul.

## The one rule

> **Features never read `plan`. They call the resolver and read an entitlement
> boolean.** The only code that knows plan→entitlement mapping is `plan-catalog.js`.

## Resolver usage patterns

```js
// A team-scoped feature (e.g. CSV export of a team's data)
const { entitlements } = resolveForTeam(team);
if (!entitlements.canExportCsv) throw new ApiError(402, 'Team Pro required to export');

// A league-scoped gate (season create)
const { entitlements } = resolveForLeague(league);
if (!entitlements.canManageLeague) throw new ApiError(402, 'Active League subscription required');

// A cascade surface (league player profile) — needs a lookup, use the cache
const cache = createRequestCache();
const { entitlements } = await resolveForLeagueTeam(leagueTeam, { cache });
payload.richProfile = entitlements.canRichPlayerProfiles; // content-shaping, no throw
```

## Gate-type taxonomy

| Type                              | Meaning                                                            | Use when                                                             |
| --------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Free**                          | No check; available to all                                         | Core loop + anything that fuels growth                               |
| **Hard server 402**               | Server route refuses without entitlement                           | Data egress & write/admin actions that must not be bypassable        |
| **Snapshot + light server guard** | Client hides it _and_ the data endpoint checks the frozen snapshot | Premium _views_ of recorded data (scraper-resistant, downgrade-safe) |
| **Client-surfaced**               | Server returns an entitlement boolean; client renders locked state | Premium views where data omission already protects the payload       |
| **Content-shaping**               | Boolean toggles richness; never blocks the page                    | Public pages that must stay free but render richer when entitled     |

## Feature-by-feature enforcement

| Feature                                           | Entitlement             | Gate type                     | Where enforced                                                         | Change                                              |
| ------------------------------------------------- | ----------------------- | ----------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Live tracking (create game, append event)         | `canTrackStats`         | **Free**                      | —                                                                      | **Remove 402** at `games.service.js:1077,1400` (D2) |
| Box scores / recaps                               | `canViewBoxScore`       | Free                          | —                                                                      | none                                                |
| Public pages, following, sharing                  | _(always)_              | Free                          | —                                                                      | none                                                |
| Replay                                            | `canViewReplay`         | Snapshot + light guard        | `GameDetailPage` (client) + replay data endpoint reads frozen snapshot | Add server guard; keep client `LockedFeatureCard`   |
| Public shot maps                                  | `canViewShotMaps`       | Snapshot + light guard        | game payload includes/omits `recap.shotSnapshot` + snapshot check      | Read snapshot, not live plan                        |
| Highlight clips                                   | `canViewHighlightClips` | Client-surfaced (share gated) | `canShareHighlights` on payload                                        | none material                                       |
| Full history                                      | `canViewFullHistory`    | Client-surfaced (limit ○)     | history endpoints                                                      | limit enforcement is fast-follow                    |
| CSV export                                        | `canExportCsv`          | **Hard server 402**           | `server/src/modules/export/*`                                          | **New gate** — data egress                          |
| Rich player profiles                              | `canRichPlayerProfiles` | Content-shaping               | `PublicPlayerPage`/`PublicLeaguePlayerPage` payloads                   | Fast-follow (cascade)                               |
| Coach reports                                     | `canViewCoachReports`   | Content-shaping               | (feature unbuilt)                                                      | future                                              |
| League management (season create/config/add-team) | `canManageLeague`       | **Hard server 402**           | `leagues.service.js:433,556,809`                                       | Swap to resolver (same semantics)                   |

## The free-tracking flip (D2) — handle with care

- **Remove** `if (!isTeamActive(...)) throw ApiError(402, ...)` at
  `games.service.js:1077-1078` (create) and `:1400-1401` (append event).
- `assertTeamCreationAllowed` (`billing.service.js:522`) currently blocks a 2nd inactive
  team — **reframe** around the Starter `maxTeams` limit (config-driven), which is a
  fast-follow; until then, relax it so free users can track.
- This is the highest-value behavioral change and a **revenue decision** — it's locked
  (D2) but flag it in the PR and cover it with the `gates.test.js` updates (the existing
  "game tracking gate" test asserts the _old_ 402 and must be inverted).

## Snapshot freeze — rules

- **Write:** `entitlementsSnapshot` source becomes `resolveForTeam(team).entitlements`
  / `resolveForLeague(league).entitlements` (from `getTeamEntitlements` at
  `games.service.js:730`), carrying the full feature key set.
- **Read:** any consumer of a snapshot **must default absent keys** to the plan value
  at record time — old participants stored only `{canViewReplay, canViewShotMaps}`. Do
  this defensively; an optional idempotent backfill can warm old games but is not
  required.
- **Downgrade safety:** replay/shot-map server guards read the frozen snapshot, so a
  team that lapses never retroactively locks games it recorded while Pro.
- **League-game entitlements:** replace the hard-coded `plan:'pro'` /
  `{canViewReplay:true,canViewShotMaps:true}` fallbacks at
  `games.service.js:894-926,1029-1042` with `resolveForLeague(league).entitlements` so a
  lapsed/free league correctly loses premium views.

## `syncOwnerPlan` → resolver

Replace the `User.plan='pro'`-if-any-active logic (`billing.service.js:138`) with a
resolver-derived canonical value (`starter`/`team_pro`). `sanitizeUser` reads it;
analytics (`getSafeUserProperties`) continues to read `user.plan` — now a canonical
value.

## Client entitlement surface (unchanged shape, new values)

The client keeps learning entitlements the same way — `team.billing`/`league.billing`
in list responses and `data.teamEntitlements`/`data.canShareHighlights` on game
payloads — but the values are now resolver-derived and use canonical plan ids. The
`ACTIVE_STATUSES`/`['team','pro']` checks in `PricingPage.jsx`/`BillingSuccessPage.jsx`
migrate to canonical ids (with the legacy shim tolerating in-flight docs).

## Testing focus (see `14-testing-plan.md`)

- Invert the `gates.test.js` "game tracking gate" expectation (tracking now free).
- New: CSV-export 402 for non-entitled; 200 for entitled.
- New: resolver unit tests for every plan × status × billingSource combination.
- New: snapshot-default behavior for a game recorded with the old 2-key snapshot.
- Contract test: resolver exports + cross-module imports (the
  `follows.dependency-contract` pattern).
