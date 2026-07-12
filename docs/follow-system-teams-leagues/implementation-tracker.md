# Follow System v1.5 — Implementation Tracker

> **Living document.** Statuses: `Not Started` · `In Progress` · `Blocked` ·
> `Complete`. Keep [`status-dashboard.md`](./status-dashboard.md) in sync.

**Branch:** `feature/follow-teams-leagues` (off `dev`). Code-complete + verified
2026-07-12; awaiting merge.

## Database

| ID   | Task                                                              | Status   | Dependencies | Notes                                           |
| ---- | ----------------------------------------------------------------- | -------- | ------------ | ----------------------------------------------- |
| DB-1 | Widen `Follow.targetType` enum → `['user','league','leagueTeam']` | Complete | —            | Additive; no migration                          |
| DB-2 | Confirm existing indexes work across new `targetType` values      | Complete | DB-1         | Unique + listing index unchanged; schema test ✓ |

## Backend

| ID    | Task                                                                           | Status   | Dependencies | Notes                                        |
| ----- | ------------------------------------------------------------------------------ | -------- | ------------ | -------------------------------------------- |
| BE-1  | Confirm repository `targetType` plumbing (no change)                           | Complete | DB-1         | Already parameterized                        |
| BE-2  | `TARGET_HANDLERS` dispatch map + `TARGET_TYPES`                                | Complete | BE-1         | `assertFollowable`/`hydrateMany` per type    |
| BE-3  | `followTarget` / `unfollowTarget` (+ `followUser`/`unfollowUser` wrappers)     | Complete | BE-2         | Unfollow does NOT re-check visibility        |
| BE-4  | Generalize `listFollowing` (per-type pagination + hydration)                   | Complete | BE-2         | Tags entries with `targetType`               |
| BE-5  | Generalize `getFollowStatuses(userId, targetType, ids)`                        | Complete | BE-2         | 400 on unknown type                          |
| BE-6  | `assertFollowable` reuses `assertLeagueVisible` (league + parent for team)     | Complete | BE-2         | D8 / PROJECT-KNOWLEDGE §4; security review ✓ |
| BE-7  | `hydrateMany` per type (batched, D8 profileHref+slug nulling)                  | Complete | BE-2         | `listLeaguesByIds`, parent-league `Map`      |
| BE-8  | Controller: type-aware params + list/status `targetType`                       | Complete | BE-3..5      | —                                            |
| BE-9  | Routes: generic `:targetType/:targetId` + `/users/:userId` alias               | Complete | BE-8         | Alias registered before generic              |
| BE-10 | Validation: `targetTypeSchema`, `targetType` on queries, `userIds`→`targetIds` | Complete | —            | API contract change                          |

## API

| ID    | Task                                              | Status   | Dependencies | Notes                                                                 |
| ----- | ------------------------------------------------- | -------- | ------------ | --------------------------------------------------------------------- |
| API-1 | Run `api-contract-changes` checklist              | Complete | BE-10        | Param rename + response shape; all client callers updated in lockstep |
| API-2 | Verify response shapes match `architecture.md` §3 | Complete | BE-8         | Integration tests assert shapes                                       |

## Frontend

| ID   | Task                                                             | Status   | Dependencies | Notes                                              |
| ---- | ---------------------------------------------------------------- | -------- | ------------ | -------------------------------------------------- |
| FE-1 | `followsApi.js` type-aware methods                               | Complete | API-2        | `follow(targetType,id)` etc.                       |
| FE-2 | `useFollowStatus` / `useFollowing` targetType-aware keys         | Complete | FE-1         | Keys namespaced by type                            |
| FE-3 | `FollowButton` `targetType` prop (default `'user'`) + `targetId` | Complete | FE-1         | user-only `isOwnAccount` guard; 3 mounts unchanged |
| FE-4 | `FollowingPage` sectioned (Players/Leagues/Teams) + shared card  | Complete | FE-2, FE-3   | 3 parallel `useFollowing(type)`                    |
| FE-5 | Attach `FollowButton` to `PublicLeaguePage.jsx`                  | Complete | FE-3         | header, gated on `league.isPublic`                 |
| FE-6 | Attach `FollowButton` to `PublicLeagueTeamPage.jsx`              | Complete | FE-3         | header, gated on `league.isPublic`                 |

## Testing

| ID  | Task                                                                  | Status   | Dependencies | Notes                                 |
| --- | --------------------------------------------------------------------- | -------- | ------------ | ------------------------------------- |
| T-1 | Update `follows.repository.schema.test.js` enum assertion             | Complete | DB-1         | → 3-value array                       |
| T-2 | Parametrize service/integration suites (`describe.each`)              | Complete | BE-3..9      | shared-shape cases across all 3 types |
| T-3 | D8 gating tests (private-league 404, member success, hydrate degrade) | Complete | BE-6, BE-7   | In service + integration suites       |
| T-4 | Client: `FollowButton` league/leagueTeam cases                        | Complete | FE-3         | default `'user'` unchanged; 9 tests   |
| T-5 | Client: `FollowingPage` sectioned layout + per-section empty states   | Complete | FE-4         | 7 tests                               |

## Documentation

| ID    | Task                                            | Status   | Dependencies | Notes                                                              |
| ----- | ----------------------------------------------- | -------- | ------------ | ------------------------------------------------------------------ |
| DOC-1 | `docs/follow-system-teams-leagues/` set created | Complete | —            | Phase 0                                                            |
| DOC-2 | Keep tracker + dashboard updated during dev     | Complete | —            | Living                                                             |
| DOC-3 | Apply PROJECT-KNOWLEDGE updates                 | Complete | Phase 4      | §1/§5/§11/§12 applied 2026-07-12 (ahead of merge, at user request) |

## Deployment

| ID     | Task                                                      | Status      | Dependencies | Notes                                                                                                                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------- | ----------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEP-1  | Pre-PR gate (`check-env && lint && server test && build`) | Complete    | Phase 3      | check-env ✓, lint ✓, server 416/416 ✓, build ✓; client has only the pre-existing OPT-026 failures                                                                                                                                                                                                                                         |
| DEP-2  | Security review passed                                    | Complete    | Phase 3      | Whole-diff review — no actionable findings; D8 model verified                                                                                                                                                                                                                                                                             |
| DEP-2b | Live-DB verification of follow/list/status/unfollow       | Complete    | Phase 3      | Ran follow→list→status→unfollow against the running dev DB for both `league` and `leagueTeam`. **Found + fixed a real 500**: `assertLeagueVisible` was not exported from `leagues.service.js` (mocked tests couldn't catch it) — see decisions.md. Added `follows.dependency-contract.test.js` regression guard; server suite now 418/418 |
| DEP-3  | Merge feature → dev                                       | Not Started | DEP-1, DEP-2 | Awaiting review / PR                                                                                                                                                                                                                                                                                                                      |
| DEP-4  | Merge dev → main (manual deploy)                          | Not Started | DEP-3        | Indexes unchanged; no migration                                                                                                                                                                                                                                                                                                           |
