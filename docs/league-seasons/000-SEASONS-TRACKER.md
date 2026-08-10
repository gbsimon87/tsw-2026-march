# League Seasons — Project Dashboard

> Living tracker for the League Seasons feature. Single source of truth —
> update this file after every completed milestone so work can pause/resume
> without losing context. Full design rationale lives in the approved plan;
> see git history of this file / `docs/PROJECT-KNOWLEDGE.md` for architecture
> context.

---

## 1. Project overview

Introduces `Season` as a first-class sub-resource of `League`. League owners
can mark the current season **Complete** (freezes standings/stats as a
permanent historical record, locks new games/joins) and **Start a New Season**
(teams/rosters carry over automatically; standings/stats/fixtures reset to
zero). Public league pages gain a season selector.

Full plan: see the plan approved 2026-07-10 (`/Users/simoncordova/.claude/plans/feature-planning-league-sequential-allen.md` on the authoring machine — copy relevant sections here if that path isn't durable/shared).

## 2. Current status

**Stage:** All three stages implemented, tested, and verified end-to-end against the dev DB. Ready for review / merge to `dev`.
**Last updated:** 2026-07-10

## 3. Progress tracker

| Milestone                                                           | Status                                   |
| ------------------------------------------------------------------- | ---------------------------------------- |
| Project dashboard created                                           | Complete                                 |
| Stage 1 — Schema + backfill migration                               | Complete (migrations run against dev DB) |
| Stage 2 — Backend API (service/routes/controller/validation)        | Complete                                 |
| Stage 3 — Frontend (AdminLeaguePage settings tab + public selector) | Complete                                 |
| Docs: billingInterval/Season naming-collision callout               | Complete                                 |
| Full verification (tests + manual walkthrough)                      | Complete                                 |

**Verification evidence (2026-07-10):** Server suite 35 suites / 333 tests green;
client suite improved from 20→19 pre-existing failures (added 4 Season UI tests +
repaired 1 unrelated OPT-026 drift test, zero new failures); server+client lint
clean; client build clean. Drove the full lifecycle via HTTP against the dev DB
on Demo League: completed "2026 Demo Season" (standings froze), new-game creation
correctly blocked with 400 "Season is completed", created "2026 Fall Season"
(all 5 teams carried over, standings reset to 0-0), old season's frozen standings
still readable via `?seasonId=`, new game correctly stamped with the new seasonId.
Edge probes passed: double-complete → 400, duplicate active season → 400, empty
label → 400 validation. One gap found & fixed during verification: `sanitizeGame`
did not expose `seasonId` in the API response (persistence was correct; added the
field to the sanitizer).

## 4. Milestones

1. **Stage 1 — Schema + backfill** (additive, zero behavior change)
   - `Season` model (`server/src/modules/leagues/seasons.repository.js`)
   - `League.currentSeasonId` (nullable)
   - `Game.seasonId` (nullable)
   - `LeagueStandings.seasonId` / `LeaguePlayerStats.seasonId` (nullable, index not yet unique)
   - `server/src/scripts/backfill-league-seasons.js` (new, `--dry-run` support)
   - `server/src/scripts/migrate-leaguestandings-season-index.js` (new, index swap, runs after backfill)
2. **Stage 2 — Backend API**
   - `createSeasonForLeague`, `completeSeasonForUser`, `listSeasonsForLeague`, `getActiveSeasonForLeague`, `ensureSeasonEditable` in `leagues.service.js`
   - `seasonId` threaded through `listLeagueGamesByLeagueId`, `computeLeagueStandings`, `computeLeaguePlayerStats`, `getLeagueStandings`, `getLeaguePlayerStats`, `recomputeLeagueAggregates`, `scheduleLeagueAggregateRecompute`
   - `getLeagueContextForGame` / `createGameForUser` stamp `seasonId` on new league games
   - New routes: `POST/GET /leagues/:leagueId/seasons`, `GET .../seasons/:seasonId`, `POST .../seasons/:seasonId/complete`
   - `?seasonId=` param on `GET /leagues/:leagueId/standings|games` and public equivalents
   - Server tests (Jest + Supertest)
3. **Stage 3 — Frontend**
   - `leaguesApi.js`: `listSeasons`, `createSeason`, `completeSeason`
   - `AdminLeaguePage.jsx` Settings tab: season status block, Complete Season button + confirm modal, Start New Season form, season history list
   - Public league pages: season selector (`PublicLeagueStandingsPage.jsx`, `PublicLeagueGamesPage.jsx`, leaders view)
   - Client tests (Vitest + RTL)
4. **Docs**
   - `billingInterval` vs `Season` naming-collision comment in `leagues.repository.js`

## 5. Task checklist

See the live TodoWrite list in the active session for granular in-progress tracking. Mirrored here at a milestone level (update as stages complete):

- [ ] Season schema + League/Game/Standings/PlayerStats field additions
- [ ] `backfill-league-seasons.js` written, dry-run tested
- [ ] `migrate-leaguestandings-season-index.js` written, dry-run tested
- [ ] Migrations run against dev DB for real
- [ ] Season service functions + `ensureSeasonEditable` guard
- [ ] `seasonId` threaded through standings/stats/games functions
- [ ] Season routes/controller/validation
- [ ] `?seasonId=` param on standings/games endpoints (auth + public)
- [ ] Server tests written and passing
- [ ] `leaguesApi.js` season functions
- [ ] `AdminLeaguePage.jsx` Settings tab UI
- [ ] Public league page season selector
- [ ] Client tests written and passing
- [ ] Naming-collision doc callout added
- [ ] Full `pnpm test` (server + client) passing
- [ ] Manual dev walkthrough completed (create → complete → new season → public selector)

## 6. Known issues

- **Not yet run against production.** Migrations (`backfill-league-seasons.js`,
  `migrate-leaguestandings-season-index.js`) have only been run against dev.
  Production rollout must follow the staged sequence in §10 of the plan
  (additive schema deploy → backfill → index swap → contract).
- **`billingInterval` naming collision** with the `Season` entity is documented
  (code comment in `leagues.repository.js`) but remains an inherent naming overlap.
- Client test suite still carries ~19 pre-existing OPT-026 drift failures in
  unrelated files (feed/games/court) — untouched by this feature.

## 7. Technical decisions

(Full rationale in the approved plan; summarized here for quick reference.)

1. `Season` is a first-class entity, one League has many Seasons.
2. `League.billingInterval` (Stripe cadence) is unrelated to `Season` — no billing changes for season creation.
3. Season creation requires only existing `canManageLeague` League Pro entitlement — no cap, no new billing fields.
4. Rosters (`LeagueTeam`/`LeaguePlayer`/`LeagueTeamMember`/`LeagueManager`) carry over automatically, stay season-agnostic, remain editable after season completion.
5. New season resets standings/stats to zero; incomplete fixtures do NOT carry over.
6. Only League Owner can complete/create seasons (not League Manager).
7. Seasons live inside the existing `leagues` module — no new top-level module.
8. All season UI consolidates into `AdminLeaguePage.jsx`'s existing Settings tab — no new tab.
9. Public season selector ships now, not deferred.

## 8. Open questions

- None outstanding — all product decisions were resolved before implementation began (see §7).

## 9. Risks

- **Index migration ordering**: `migrate-leaguestandings-season-index.js` must run strictly after `backfill-league-seasons.js` completes for all leagues, or two pre-migration leagues could collide on `{leagueId, seasonId: null}` before the unique compound index exists to catch it. Mitigate by verifying zero leagues remain with `currentSeasonId: null` before running the index swap.
- **`listLeagueGamesByLeagueId` call site coverage**: multiple call sites in `leagues.service.js` must all be updated to pass `seasonId` — missing one silently reverts that code path to all-time aggregation. Mitigate with the standings-scoping test case (§9 of plan) asserting no cross-season leakage.
- **Public API behavior change risk**: adding `?seasonId=` to public endpoints must default to current-season behavior identical to pre-migration output, or public pages regress for existing leagues at launch.

## 10. Next steps

1. Code review + merge feature branch → `dev` (run `pnpm check-env && pnpm lint && pnpm test && pnpm build` per repo convention; note the ~19 pre-existing client failures are OPT-026 drift, not regressions).
2. **Production rollout** (staged, per plan §10): deploy additive schema first →
   run `backfill-league-seasons.js --dry-run` then for real against prod →
   run `migrate-leaguestandings-season-index.js` → deploy Stage 2/3 code.
3. Fast-follow (optional, deferred): manual highlight curation per season; richer
   public season-history UX beyond the current dropdown.
