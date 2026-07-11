# Follow System — Implementation Tracker

> **Living document.** Update Status as work progresses. Statuses:
> `Not Started` · `In Progress` · `Blocked` · `Complete`.
> Owner is a placeholder (`TBD`) until assigned. Keep
> [`status-dashboard.md`](./status-dashboard.md) in sync.

Legend: deps reference task IDs in this file.

## Database

| ID   | Task                                                           | Status      | Owner | Dependencies | Notes                                                        |
| ---- | -------------------------------------------------------------- | ----------- | ----- | ------------ | ------------------------------------------------------------ |
| DB-1 | Define `Follow` schema inline in `follows.repository.js`       | Not Started | TBD   | —            | `{followerUserId, targetType:'user', targetId}` + timestamps |
| DB-2 | Unique compound index `{followerUserId, targetType, targetId}` | Not Started | TBD   | DB-1         | Dedupe guard                                                 |
| DB-3 | Listing index `{followerUserId, _id:-1}`                       | Not Started | TBD   | DB-1         | Keyset pagination                                            |
| DB-4 | Confirm no migration/backfill needed                           | Not Started | TBD   | DB-1         | Additive collection; document in decisions                   |

## Backend

| ID   | Task                                                                    | Status      | Owner | Dependencies | Notes                                                                                         |
| ---- | ----------------------------------------------------------------------- | ----------- | ----- | ------------ | --------------------------------------------------------------------------------------------- |
| BE-1 | Repository data-access fns                                              | Not Started | TBD   | DB-1         | `createFollow`, `deleteFollow`, `listFollowingByUser`, `findFollow`, `countFollowingStatuses` |
| BE-2 | Zod schemas in `follows.validation.js`                                  | Not Started | TBD   | —            | `followStatusQuerySchema`; reuse `paginationQuerySchema`                                      |
| BE-3 | Service: follow (idempotent upsert, self-follow 400, target-exists 404) | Not Started | TBD   | BE-1         | Reuse `findUserById`                                                                          |
| BE-4 | Service: unfollow (idempotent)                                          | Not Started | TBD   | BE-1         | —                                                                                             |
| BE-5 | Service: following list + hydration + `hasPublicProfile`                | Not Started | TBD   | BE-1         | `findUsersByIds`, `listLeaguePlayersByClaimedUser`                                            |
| BE-6 | Service: batch status                                                   | Not Started | TBD   | BE-1         | `countFollowingStatuses`                                                                      |
| BE-7 | Controller (`requireAuthUserId`, parse, shape)                          | Not Started | TBD   | BE-2..6      | Mirror `teams.controller.js`                                                                  |
| BE-8 | Routes (authed, `asyncHandler`)                                         | Not Started | TBD   | BE-7         | Export `{ followsRouter }`                                                                    |

## API

| ID    | Task                                               | Status      | Owner | Dependencies | Notes                                      |
| ----- | -------------------------------------------------- | ----------- | ----- | ------------ | ------------------------------------------ |
| API-1 | Mount `/follows` in `routes/index.js`              | Not Started | TBD   | BE-8         | `apiRouter.use('/follows', followsRouter)` |
| API-2 | Verify CSRF applies to POST/DELETE                 | Not Started | TBD   | API-1        | Global `csrfProtection`                    |
| API-3 | Confirm response shapes match `architecture.md` §3 | Not Started | TBD   | API-1        | —                                          |

## Frontend

| ID   | Task                                                                  | Status      | Owner | Dependencies | Notes                             |
| ---- | --------------------------------------------------------------------- | ----------- | ----- | ------------ | --------------------------------- |
| FE-1 | `followsApi.js` (follow/unfollow/listFollowing/getStatuses)           | Not Started | TBD   | API-1        | Wraps `apiClient`                 |
| FE-2 | `useFollowing.js` hook                                                | Not Started | TBD   | FE-1         | `queryKey: ['following']`         |
| FE-3 | `useFollowStatus.js` hook                                             | Not Started | TBD   | FE-1         | Batch status                      |
| FE-4 | `FollowButton.jsx` (auth gate, "Log in to follow", optimistic toggle) | Not Started | TBD   | FE-1         | `setQueryData`, no `useMutation`  |
| FE-5 | `FollowingPage.jsx` (DarkPageHeader + scoreboard shell + cards)       | Not Started | TBD   | FE-2, FE-4   | One-click profile links           |
| FE-6 | Route `/following` (protected) in `AppRouter.jsx`                     | Not Started | TBD   | FE-5         | Lazy import                       |
| FE-7 | Persistent "Following" nav link in `AppLayout.jsx`                    | Not Started | TBD   | FE-6         | Desktop + mobile, gated on `user` |
| FE-8 | Attach `FollowButton` to `PublicUserProfilePage.jsx`                  | Not Started | TBD   | FE-4         | Header, next to name              |
| FE-9 | Attach `FollowButton` to `DiscoverablePlayers.jsx`                    | Not Started | TBD   | FE-4, FE-3   | Per claimed result                |

## Testing

| ID  | Task                                                         | Status      | Owner | Dependencies | Notes                       |
| --- | ------------------------------------------------------------ | ----------- | ----- | ------------ | --------------------------- |
| T-1 | Server integration: auth 401 / CSRF 403                      | Not Started | TBD   | API-1        | Mirror `teams.auth.test.js` |
| T-2 | Server integration: follow/unfollow/self-follow/idempotency  | Not Started | TBD   | API-1        | —                           |
| T-3 | Server integration: following list pagination + status batch | Not Started | TBD   | API-1        | —                           |
| T-4 | Server unit: service authz/rules (repo mocked)               | Not Started | TBD   | BE-3..6      | —                           |
| T-5 | Server unit: repository schema/index                         | Not Started | TBD   | DB-1..3      | —                           |
| T-6 | Client: FollowButton toggle + gating                         | Not Started | TBD   | FE-4         | Logged-out / own-profile    |
| T-7 | Client: FollowingPage loading/empty/populated + unfollow     | Not Started | TBD   | FE-5         | Snapshot for card           |

## Documentation

| ID    | Task                                                | Status      | Owner | Dependencies | Notes                                     |
| ----- | --------------------------------------------------- | ----------- | ----- | ------------ | ----------------------------------------- |
| DOC-1 | `docs/follow-system/` set created                   | Complete    | TBD   | —            | Phase 0                                   |
| DOC-2 | Keep tracker + dashboard updated during dev         | In Progress | TBD   | —            | Living                                    |
| DOC-3 | Apply proposed PROJECT-KNOWLEDGE updates after ship | Not Started | TBD   | Phase 4      | Do NOT edit PROJECT-KNOWLEDGE before ship |

## Deployment

| ID    | Task                                                     | Status      | Owner | Dependencies | Notes |
| ----- | -------------------------------------------------------- | ----------- | ----- | ------------ | ----- |
| DEP-1 | Pre-PR gate green (`check-env && lint && test && build`) | Not Started | TBD   | Phase 3      | —     |
| DEP-2 | Merge feature → dev                                      | Not Started | TBD   | DEP-1        | —     |
| DEP-3 | Merge dev → main (manual deploy)                         | Not Started | TBD   | DEP-2        | —     |
| DEP-4 | Verify on staging/prod                                   | Not Started | TBD   | DEP-3        | —     |
