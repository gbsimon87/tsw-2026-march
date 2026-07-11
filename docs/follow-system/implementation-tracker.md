# Follow System — Implementation Tracker

> **Living document.** Statuses: `Not Started` · `In Progress` · `Blocked` ·
> `Complete`. Owner is a placeholder (`TBD`) until assigned. Keep
> [`status-dashboard.md`](./status-dashboard.md) in sync.

**v1 implementation landed on `feature/follow-system` (2026-07-11).** Remaining
open items are deployment (merge feature → dev → main) and the post-ship
PROJECT-KNOWLEDGE sync.

## Database

| ID   | Task                                                           | Status   | Owner | Dependencies | Notes                                                        |
| ---- | -------------------------------------------------------------- | -------- | ----- | ------------ | ------------------------------------------------------------ |
| DB-1 | Define `Follow` schema inline in `follows.repository.js`       | Complete | TBD   | —            | `{followerUserId, targetType:'user', targetId}` + timestamps |
| DB-2 | Unique compound index `{followerUserId, targetType, targetId}` | Complete | TBD   | DB-1         | Dedupe guard (makes follow idempotent via upsert)            |
| DB-3 | Listing index `{followerUserId, _id:-1}`                       | Complete | TBD   | DB-1         | Keyset pagination                                            |
| DB-4 | Confirm no migration/backfill needed                           | Complete | TBD   | DB-1         | Additive collection; no backfill                             |

## Backend

| ID   | Task                                                                    | Status   | Owner | Dependencies | Notes                                                                                                 |
| ---- | ----------------------------------------------------------------------- | -------- | ----- | ------------ | ----------------------------------------------------------------------------------------------------- |
| BE-1 | Repository data-access fns                                              | Complete | TBD   | DB-1         | `createFollow` (upsert), `deleteFollow`, `findFollow`, `listFollowingByUser`, `findFollowedTargetIds` |
| BE-2 | Zod schemas in `follows.validation.js`                                  | Complete | TBD   | —            | `followingQuerySchema`, `followStatusQuerySchema`                                                     |
| BE-3 | Service: follow (idempotent upsert, self-follow 400, target-exists 404) | Complete | TBD   | BE-1         | Reuses `findUserById`                                                                                 |
| BE-4 | Service: unfollow (idempotent)                                          | Complete | TBD   | BE-1         | —                                                                                                     |
| BE-5 | Service: following list + hydration + `hasPublicProfile`                | Complete | TBD   | BE-1         | `findUsersByIds` + `assembleLeagueProfilesForUser`                                                    |
| BE-6 | Service: batch status                                                   | Complete | TBD   | BE-1         | `findFollowedTargetIds`                                                                               |
| BE-7 | Controller (`requireAuthUserId`, parse, shape)                          | Complete | TBD   | BE-2..6      | Mirrors `teams.controller.js`                                                                         |
| BE-8 | Routes (authed, `asyncHandler`)                                         | Complete | TBD   | BE-7         | Exports `{ followsRouter }`                                                                           |

## API

| ID    | Task                                               | Status   | Owner | Dependencies | Notes                                      |
| ----- | -------------------------------------------------- | -------- | ----- | ------------ | ------------------------------------------ |
| API-1 | Mount `/follows` in `routes/index.js`              | Complete | TBD   | BE-8         | `apiRouter.use('/follows', followsRouter)` |
| API-2 | Verify CSRF applies to POST/DELETE                 | Complete | TBD   | API-1        | Confirmed by integration tests (403)       |
| API-3 | Confirm response shapes match `architecture.md` §3 | Complete | TBD   | API-1        | Verified end-to-end vs live dev server     |

## Frontend

| ID   | Task                                                                  | Status   | Owner | Dependencies | Notes                             |
| ---- | --------------------------------------------------------------------- | -------- | ----- | ------------ | --------------------------------- |
| FE-1 | `followsApi.js` (follow/unfollow/listFollowing/getStatuses)           | Complete | TBD   | API-1        | Wraps `apiClient`                 |
| FE-2 | `useFollowing.js` hook                                                | Complete | TBD   | FE-1         | `queryKey: ['following']`         |
| FE-3 | `useFollowStatus.js` hook                                             | Complete | TBD   | FE-1         | Batch status, disabled logged-out |
| FE-4 | `FollowButton.jsx` (auth gate, "Log in to follow", optimistic toggle) | Complete | TBD   | FE-1         | `setQueryData`, no `useMutation`  |
| FE-5 | `FollowingPage.jsx` (DarkPageHeader + scoreboard shell + cards)       | Complete | TBD   | FE-2, FE-4   | One-click profile links           |
| FE-6 | Route `/following` (protected) in `AppRouter.jsx`                     | Complete | TBD   | FE-5         | Lazy import                       |
| FE-7 | Persistent "Following" nav link in `AppLayout.jsx`                    | Complete | TBD   | FE-6         | Desktop + mobile, gated on `user` |
| FE-8 | Attach `FollowButton` to `PublicUserProfilePage.jsx`                  | Complete | TBD   | FE-4         | Header, next to name              |
| FE-9 | Attach `FollowButton` to `DiscoverablePlayers.jsx`                    | Complete | TBD   | FE-4, FE-3   | Per claimed result                |

## Testing

| ID  | Task                                                         | Status   | Owner | Dependencies | Notes                                                  |
| --- | ------------------------------------------------------------ | -------- | ----- | ------------ | ------------------------------------------------------ |
| T-1 | Server integration: auth 401 / CSRF 403                      | Complete | TBD   | API-1        | `follows.test.js`                                      |
| T-2 | Server integration: follow/unfollow/self-follow/idempotency  | Complete | TBD   | API-1        | `follows.test.js`                                      |
| T-3 | Server integration: following list pagination + status batch | Complete | TBD   | API-1        | `follows.test.js`                                      |
| T-4 | Server unit: service authz/rules (repo mocked)               | Complete | TBD   | BE-3..6      | `follows.service.test.js`                              |
| T-5 | Server unit: repository schema/index                         | Complete | TBD   | DB-1..3      | `follows.repository.schema.test.js`                    |
| T-6 | Client: FollowButton toggle + gating                         | Complete | TBD   | FE-4         | `FollowButton.test.jsx` (5 tests)                      |
| T-7 | Client: FollowingPage loading/empty/populated + unfollow     | Complete | TBD   | FE-5         | `FollowingPage.test.jsx` (4 tests)                     |
| T-8 | End-to-end verification vs live dev server                   | Complete | TBD   | API-1        | Full follow→status→list→unfollow flow, self-follow 400 |

## Documentation

| ID    | Task                                                | Status   | Owner | Dependencies | Notes                                                   |
| ----- | --------------------------------------------------- | -------- | ----- | ------------ | ------------------------------------------------------- |
| DOC-1 | `docs/follow-system/` set created                   | Complete | TBD   | —            | Phase 0                                                 |
| DOC-2 | Keep tracker + dashboard updated during dev         | Complete | TBD   | —            | Living                                                  |
| DOC-3 | Apply proposed PROJECT-KNOWLEDGE updates after ship | Complete | TBD   | Phase 4      | Applied 2026-07-11 (see PROJECT-KNOWLEDGE §1/§3/§5/§11) |

## Deployment

| ID    | Task                                                     | Status      | Owner | Dependencies | Notes                                    |
| ----- | -------------------------------------------------------- | ----------- | ----- | ------------ | ---------------------------------------- |
| DEP-1 | Pre-PR gate green (`check-env && lint && test && build`) | Complete    | TBD   | Phase 3      | Server 388/388; client no new failures   |
| DEP-2 | Merge feature → dev                                      | Not Started | TBD   | DEP-1        | Awaiting review / PR                     |
| DEP-3 | Merge dev → main (manual deploy)                         | Not Started | TBD   | DEP-2        | —                                        |
| DEP-4 | Verify on staging/prod                                   | Not Started | TBD   | DEP-3        | Indexes auto-build on model registration |
