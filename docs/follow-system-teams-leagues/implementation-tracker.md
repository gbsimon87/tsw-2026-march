# Follow System v1.5 — Implementation Tracker

> **Living document.** Statuses: `Not Started` · `In Progress` · `Blocked` ·
> `Complete`. Keep [`status-dashboard.md`](./status-dashboard.md) in sync.

**Branch:** `feature/follow-teams-leagues` (off `dev`).

## Database

| ID   | Task                                                              | Status      | Dependencies | Notes                  |
| ---- | ----------------------------------------------------------------- | ----------- | ------------ | ---------------------- |
| DB-1 | Widen `Follow.targetType` enum → `['user','league','leagueTeam']` | Not Started | —            | Additive; no migration |
| DB-2 | Confirm existing indexes work across new `targetType` values      | Not Started | DB-1         | No new index needed    |

## Backend

| ID    | Task                                                                           | Status      | Dependencies | Notes                                                    |
| ----- | ------------------------------------------------------------------------------ | ----------- | ------------ | -------------------------------------------------------- |
| BE-1  | Confirm repository `targetType` plumbing (no change)                           | Not Started | DB-1         | `createFollow`/`deleteFollow`/`listFollowingByUser`/etc. |
| BE-2  | `TARGET_HANDLERS` dispatch map + `TARGET_TYPES`                                | Not Started | BE-1         | `validateId`/`assertFollowable`/`hydrateMany` per type   |
| BE-3  | `followTarget` / `unfollowTarget` (+ `followUser`/`unfollowUser` wrappers)     | Not Started | BE-2         | Unfollow does NOT re-check visibility                    |
| BE-4  | Generalize `listFollowing` (per-type pagination + hydration)                   | Not Started | BE-2         | Tag entries with `targetType`                            |
| BE-5  | Generalize `getFollowStatuses(userId, targetType, ids)`                        | Not Started | BE-2         | —                                                        |
| BE-6  | `assertFollowable` reuses `assertLeagueVisible` (league + parent for team)     | Not Started | BE-2         | D8 / PROJECT-KNOWLEDGE §4                                |
| BE-7  | `hydrateMany` per type (batched, D8 profileHref nulling)                       | Not Started | BE-2         | `listLeaguesByIds`, parent-league `Map`                  |
| BE-8  | Controller: type-aware params + list/status `targetType`                       | Not Started | BE-3..5      | —                                                        |
| BE-9  | Routes: generic `:targetType/:targetId` + `/users/:userId` alias               | Not Started | BE-8         | —                                                        |
| BE-10 | Validation: `targetTypeSchema`, `targetType` on queries, `userIds`→`targetIds` | Not Started | —            | API contract change                                      |

## API

| ID    | Task                                              | Status      | Dependencies | Notes                         |
| ----- | ------------------------------------------------- | ----------- | ------------ | ----------------------------- |
| API-1 | Run `api-contract-changes` checklist              | Not Started | BE-10        | Param rename + response shape |
| API-2 | Verify response shapes match `architecture.md` §3 | Not Started | BE-8         | curl/manual                   |

## Frontend

| ID   | Task                                                             | Status      | Dependencies | Notes                                          |
| ---- | ---------------------------------------------------------------- | ----------- | ------------ | ---------------------------------------------- |
| FE-1 | `followsApi.js` type-aware methods                               | Not Started | API-2        | `follow(targetType,id)` etc.                   |
| FE-2 | `useFollowStatus` / `useFollowing` targetType-aware keys         | Not Started | FE-1         | `['followStatus',targetType,ids]`              |
| FE-3 | `FollowButton` `targetType` prop (default `'user'`) + `targetId` | Not Started | FE-1         | user-only `isOwnAccount` guard                 |
| FE-4 | `FollowingPage` sectioned (Players/Leagues/Teams) + new cards    | Not Started | FE-2, FE-3   | 3 parallel `useFollowing(type)`                |
| FE-5 | Attach `FollowButton` to `PublicLeaguePage.jsx`                  | Not Started | FE-3         | header, `targetType="league"`                  |
| FE-6 | Attach `FollowButton` to `PublicLeagueTeamPage.jsx`              | Not Started | FE-3         | header, `targetType="leagueTeam"` (new import) |

## Testing

| ID  | Task                                                                  | Status      | Dependencies | Notes                                          |
| --- | --------------------------------------------------------------------- | ----------- | ------------ | ---------------------------------------------- |
| T-1 | Update `follows.repository.schema.test.js` enum assertion             | Not Started | DB-1         | → 3-value array                                |
| T-2 | Parametrize service/integration suites (`describe.each`)              | Not Started | BE-3..9      | shared-shape cases                             |
| T-3 | D8 gating tests (private-league 404, member success, hydrate degrade) | Not Started | BE-6, BE-7   | `follows.visibility.test.js` or in integration |
| T-4 | Client: `FollowButton` league/leagueTeam cases                        | Not Started | FE-3         | default `'user'` unchanged                     |
| T-5 | Client: `FollowingPage` sectioned layout + per-section empty states   | Not Started | FE-4         | —                                              |

## Documentation

| ID    | Task                                            | Status      | Dependencies | Notes     |
| ----- | ----------------------------------------------- | ----------- | ------------ | --------- |
| DOC-1 | `docs/follow-system-teams-leagues/` set created | In Progress | —            | Phase 0   |
| DOC-2 | Keep tracker + dashboard updated during dev     | In Progress | —            | Living    |
| DOC-3 | Apply PROJECT-KNOWLEDGE updates after ship      | Not Started | Phase 4      | §1/§5/§11 |

## Deployment

| ID    | Task                                                     | Status      | Dependencies | Notes                           |
| ----- | -------------------------------------------------------- | ----------- | ------------ | ------------------------------- |
| DEP-1 | Pre-PR gate green (`check-env && lint && test && build`) | Not Started | Phase 3      | —                               |
| DEP-2 | Security review passed                                   | Not Started | Phase 3      | `/security-review`              |
| DEP-3 | Merge feature → dev                                      | Not Started | DEP-1, DEP-2 | Awaiting review / PR            |
| DEP-4 | Merge dev → main (manual deploy)                         | Not Started | DEP-3        | Indexes unchanged; no migration |
