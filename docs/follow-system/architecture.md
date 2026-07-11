# Follow System — Architecture

> Companion to [`README.md`](./README.md). Describes the v1 design (users-only,
> polymorphic-ready, private). Decisions in [`decisions.md`](./decisions.md).

## 1. Design principle: follow the account, not the profile

TSW people can hold many `LeaguePlayer` profiles (`claimedByUserId`). The unified
profile at `GET /public/players/:userId`
(`leagues.service.js#getPublicUserProfiles` → `assembleLeagueProfilesForUser`)
already aggregates them into one identity. Follows are therefore keyed by
`User._id`: **one follow = one person = all their profiles.**

## 2. Data model

New collection **`Follow`**, schema defined inline in
`server/src/modules/follows/follows.repository.js` (guarded with
`mongoose.models.Follow || mongoose.model(...)`, per repo convention — there is
no `models/` directory).

```js
const followSchema = new mongoose.Schema(
  {
    followerUserId: { type: ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: ['user'], required: true, default: 'user' },
    targetId: { type: ObjectId, required: true }, // v1: always a User._id
  },
  { timestamps: true }
);

followSchema.index({ followerUserId: 1, targetType: 1, targetId: 1 }, { unique: true }); // dedupe guard: one follow per (follower, target)
followSchema.index({ followerUserId: 1, _id: -1 }); // keyset listing of my follows
```

**Polymorphic-ready:** `targetType` is an enum starting at `['user']`. Adding
`'team'` / `'league'` later is an additive enum change — no migration, no field
rename. `targetId` intentionally has no `ref` (it's polymorphic).

**No changes to any existing schema** (`User`, `LeaguePlayer`, etc.). No
denormalized follower/following counts in v1 (privacy = private; counts deferred).

## 3. API surface (`/api/v1/follows`, all behind `authMiddleware`)

Mounted in `server/src/routes/index.js`: `apiRouter.use('/follows', followsRouter)`.
POST/DELETE require the global CSRF token (`csrfProtection` applies app-wide).

| Method   | Path                     | Purpose                 | Query/Body             | Response                                              |
| -------- | ------------------------ | ----------------------- | ---------------------- | ----------------------------------------------------- |
| `POST`   | `/follows/users/:userId` | Follow a user           | —                      | `201 { follow: { targetUserId, isFollowing: true } }` |
| `DELETE` | `/follows/users/:userId` | Unfollow a user         | —                      | `200 { targetUserId, isFollowing: false }`            |
| `GET`    | `/follows/following`     | My following list       | `?limit&cursor`        | `200 { following: [FollowingCard], nextCursor }`      |
| `GET`    | `/follows/status`        | Batch "am I following?" | `?userIds=a,b,c` (≤50) | `200 { statuses: { [userId]: boolean } }`             |

**`FollowingCard`**: `{ userId, name, avatarUrl, hasPublicProfile, profileHref }`.
`profileHref` = `/players/:userId` when `hasPublicProfile`, else `null`.

### Service rules (`follows.service.js`, throws `ApiError`)

- Validate `:userId` is a valid ObjectId (else 404) and the target user exists
  (`findUserById`, else 404).
- Reject self-follow → `400 'You cannot follow yourself'`.
- **Idempotent follow:** upsert (or catch duplicate-key) → already-following is a
  success, not an error.
- **Idempotent unfollow:** deleting a non-existent follow is a success.
- **List hydration:** `findUsersByIds` (`auth.repository.js`) batch `$in` — no
  N+1. `hasPublicProfile` computed per user via
  `listLeaguePlayersByClaimedUser` filtered to public leagues (mirrors the check
  in `getPublicUserProfiles`).

### Validation (`follows.validation.js`)

- `followStatusQuerySchema`: `userIds` csv → array, `max(50)`, each a 24-hex
  ObjectId.
- Reuse `paginationQuerySchema` (`modules/shared/pagination.validation.js`) for
  the following list.

### API contract note

The `/follows/*` endpoints are purely additive. The public profile response
(`GET /public/players/:userId`) stays unchanged and cacheable; button state comes
from the separate `/follows/status` endpoint, not baked into the profile payload.

**One additive change to an existing endpoint** (2026-07-11): `sanitizeLeaguePlayer`
now also returns `claimedUserId` (the claiming account's id, or `null`), so the
FollowButton on `PublicLeaguePlayerPage` knows whom to follow. This is a
low-risk optional-field addition — all existing consumers ignore it, and it
reveals nothing new (the public unified profile already exposes the same claim
linkage). It affects every caller of `sanitizeLeaguePlayer` (roster, team, and
player public endpoints) additively.

## 4. Backend layering

New module `server/src/modules/follows/` mirroring the canonical `teams` module:

- `follows.routes.js` — `Router()`, `.use(authMiddleware)`, `asyncHandler` wraps,
  exports `{ followsRouter }`.
- `follows.controller.js` — local `requireAuthUserId(req)` helper, `schema.parse`,
  thin delegation, JSON shaping.
- `follows.service.js` — authz + rules; sanitizes to plain objects (`_id`→string).
- `follows.repository.js` — inline schema + indexes; `createFollow`,
  `deleteFollow`, `listFollowingByUser(userId, {limit,cursor})`, `findFollow`,
  `countFollowingStatuses(userId, targetIds)`.
- `follows.validation.js` — Zod schemas.

Pagination follows the teams pattern: repo sorts `{ _id: -1 }`, over-fetches
`limit + 1` via `applyIdCursor`; service finishes with `buildCursorPage`
(`utils/pagination.js`).

## 5. Frontend layering

New feature `client/src/features/follows/`:

- `api/followsApi.js` — `follow`, `unfollow`, `listFollowing`, `getStatuses`
  (wraps `apiClient`; CSRF + silent refresh handled automatically).
- `hooks/useFollowing.js` — `useQuery({ queryKey: ['following'], … })`.
- `hooks/useFollowStatus.js` — batch status keyed `['followStatus', sortedIds]`.
- `components/FollowButton.jsx` — gates on `useAuth().user`; hidden on your own
  id; **"Log in to follow"** CTA when logged out. Toggle = plain async
  `followsApi.follow/unfollow` + manual `queryClient.setQueryData` (mirrors
  `FeedPage#onDelete`; **no `useMutation`/`invalidateQueries`** per repo
  convention).
- `pages/FollowingPage.jsx` — protected page using `DarkPageHeader` + the
  scoreboard shell (`bg-[#F7F5F0]`, white `rounded-2xl` sections, card grid).
  Each card: avatar, name, unfollow button, one-click "View profile" link when
  `hasPublicProfile`. `SportsLoader` + empty-state guards like `MySportyPage`.

**Attach points:**

- `PublicUserProfilePage.jsx` (`/players/:userId`) — `<FollowButton>` in the header.
- `DiscoverablePlayers.jsx` — compact `<FollowButton>` per result with
  `claimedByUserId` (batch status via `/follows/status`).
- `PublicLeaguePlayerPage.jsx` (`/league/:slug/teams/:team/players/:id`) —
  compact `<FollowButton variant="onDark">` in the dark hero header, shown only
  when the league player is claimed (`player.claimedUserId` present). This
  required exposing `claimedUserId` on the public league-player response — see
  the API-contract note below.

`FollowButton` takes a `variant="onDark"` for use on dark headers (orange fill
instead of ink) and self-guards the own-account and logged-out cases, so it can
be dropped onto any surface that has a target user id.

**Routing** (`app/router/AppRouter.jsx`): lazy-import `FollowingPage`; add
`<Route path="/following" element={<ProtectedRoute><FollowingPage/></ProtectedRoute>} />`
near `/my-sporty`. Add a persistent `<NavLink to="/following">Following</NavLink>`
in `layouts/AppLayout.jsx` (desktop + mobile, gated on `user`).

**Cache hygiene:** `AuthContext#purgePrivateCache` already evicts everything
except `['auth','me']` on auth transitions, so `['following']` / follow-status
caches clear between users automatically.

## 6. Permissions & privacy

- All `/follows/*` routes require auth. The follower id always comes from
  `req.auth.userId` — never from the client.
- A user can only read/modify their own follow set.
- No public follower/following data. `/follows/status` only answers about the
  _current_ user.
- Orthogonal to league RBAC — no new role logic.

## 7. Edge cases

| Case                                    | Behavior                                                                |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Self-follow                             | `400`                                                                   |
| Duplicate follow                        | Idempotent success                                                      |
| Unfollow when not following             | Idempotent success                                                      |
| Invalid / non-existent target userId    | `404`                                                                   |
| Followed user has no public profile now | Minimal card, `profileHref: null`                                       |
| Followed user account deleted           | No cascade in v1; list hydration skips missing users (`findUsersByIds`) |
| Logged-out visitor                      | FollowButton → "Log in to follow" CTA                                   |
| Viewing your own profile                | FollowButton hidden                                                     |

## 8. Performance

- Both hot paths are index-covered (unique compound for writes/dedupe;
  `{followerUserId,_id:-1}` for listing). Keyset pagination (no `skip`).
- List hydration is a single `$in` (`findUsersByIds`).
- `hasPublicProfile` is the one heavier per-user check — batched, and the first
  thing to denormalize (cached flag/count) if lists grow large.
- Dataset is tiny today; no caching layer needed (consistent with
  `PROJECT-KNOWLEDGE.md` §11).

## 9. Database migration plan

**None required.** `Follow` is a new, additive collection created lazily on first
write; indexes build on model registration. No backfill, no changes to existing
documents. Reversible by removing the routes and dropping the empty collection.
