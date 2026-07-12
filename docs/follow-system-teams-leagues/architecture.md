# Follow System v1.5 — Architecture

> Companion to [`README.md`](./README.md). Describes the leagues/league-teams
> extension of the users-only v1 ([`../follow-system/architecture.md`](../follow-system/architecture.md)).
> Decisions in [`decisions.md`](./decisions.md).

## 1. Design principle: type-aware dispatch over a polymorphic edge

The `Follow` edge was already polymorphic-ready (`{ followerUserId, targetType,
targetId }`). This iteration adds two `targetType` values (`league`,
`leagueTeam`) and introduces a **dispatch map** in the service layer so each type
supplies its own id validation, followability/visibility gate, and list
hydration — while follow/unfollow/list/status stay single, type-generic
functions. Adding a 4th type later is a one-entry change, not new
functions + routes + controller actions.

## 2. Data model

**No new collection.** The existing `Follow` collection
(`server/src/modules/follows/follows.repository.js`) only widens its `targetType`
enum:

```js
targetType: { type: String, enum: ['user', 'league', 'leagueTeam'], required: true, default: 'user' },
```

- `'leagueTeam'` (not `'team'`) — matches the `LeagueTeam` model name and avoids
  ambiguity with the standalone `Team` model that may become followable later.
- `targetId` is already an untyped `ObjectId` (no `ref`, polymorphic) — no change.
- Both existing indexes (`{followerUserId, targetType, targetId}` unique;
  `{followerUserId, _id:-1}` listing) already work across multiple `targetType`
  values with no change.

**Migration: none.** Additive enum widen; existing `user` rows are untouched.
Reversible by narrowing the enum (no rows to clean up while the feature is new).

## 3. API surface (`/api/v1/follows`, all behind `authMiddleware`)

Generic routes replace the hardcoded `/users/:userId` shape; the old path is kept
as a thin back-compat alias during rollout.

| Method   | Path                             | Purpose                 | Query/Body                            | Response                                                      |
| -------- | -------------------------------- | ----------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `POST`   | `/follows/:targetType/:targetId` | Follow a target         | —                                     | `201 { follow: { targetType, targetId, isFollowing: true } }` |
| `DELETE` | `/follows/:targetType/:targetId` | Unfollow a target       | —                                     | `200 { targetType, targetId, isFollowing: false }`            |
| `GET`    | `/follows/following`             | My following list       | `?targetType&limit&cursor`            | `200 { following: [FollowingCard], nextCursor }`              |
| `GET`    | `/follows/status`                | Batch "am I following?" | `?targetType=…&targetIds=a,b,c` (≤50) | `200 { statuses: { [targetId]: boolean } }`                   |
| `POST`   | `/follows/users/:userId`         | Back-compat alias       | —                                     | (delegates to the generic follow with `targetType='user'`)    |
| `DELETE` | `/follows/users/:userId`         | Back-compat alias       | —                                     | (delegates to the generic unfollow)                           |

`targetType` is validated at the boundary (`z.enum(['user','league','leagueTeam'])`);
an unknown type is a `400`. `GET /follows/following` with no `targetType` is
allowed but the client fires three per-type queries (see §5) — per-type
pagination, no merged cross-type cursor.

**`FollowingCard`** is type-tagged. Common fields plus per-type shape:

- `user`: `{ targetType:'user', userId, name, avatarUrl, hasPublicProfile, profileHref }`
- `league`: `{ targetType:'league', leagueId, name, logo, slug, profileHref }`
- `leagueTeam`: `{ targetType:'leagueTeam', leagueTeamId, name, logo, teamSlug, leagueSlug, profileHref }`

`profileHref` is `/players/:userId` · `/league/:slug` · `/league/:leagueSlug/teams/:teamSlug`
respectively, or `null` when the target is not currently visible to the viewer.

### Service rules (`follows.service.js`, throws `ApiError`)

- `TARGET_HANDLERS[targetType]` supplies `validateId`, `assertFollowable`,
  `hydrateMany`; an unknown `targetType` → `400`.
- **Follow** validates the id, runs the type's `assertFollowable` gate (§4), then
  idempotent upsert (already-following = success).
- **Unfollow** validates id + known type only — **no visibility re-check** so a
  league going private cannot trap a follower into it; idempotent delete.
- **Following list** paginates per-type via `listFollowingByUser(userId,
{targetType,...})`, batch-hydrates through the type handler (no N+1), tags each
  entry with `targetType`.
- **Batch status** takes an explicit `targetType`, delegates to
  `findFollowedTargetIds`.

### Validation (`follows.validation.js`)

- `targetTypeSchema = z.enum(['user','league','leagueTeam'])`.
- `followingQuerySchema`: `...paginationQueryShape` + optional `targetType`.
- `followStatusQuerySchema`: required `targetType` + `targetIds` csv → array,
  `max(50)`, each a 24-hex ObjectId. **Param renamed `userIds` → `targetIds`**
  (API contract change — run `api-contract-changes` checklist).

## 4. Permissions, privacy & visibility gating (D8 pattern)

**Mandatory reuse of `assertLeagueVisible`** (`leagues.service.js`) — never a
re-implemented `isPublic` check (`PROJECT-KNOWLEDGE.md` §4; the
`assertFeedPostingAllowed` bug came from exactly that mistake).

- **Follow a league:** `assertLeagueVisible(leagueId, { viewerUserId })` (id
  mode). Its 404 (missing _or_ private-not-member) propagates as-is — no
  403-vs-404 side channel that would leak a private league's existence.
- **Follow a league team:** `findLeagueTeamById` (404 if missing), then
  `assertLeagueVisible(leagueTeam.leagueId, { viewerUserId })` on the **parent**.
  This is the concrete fix for "`LeagueTeam` has no own `isPublic`": visibility is
  delegated entirely to the parent, through the canonical helper.
- **Hydration (`GET /follows/following`):** re-check each league/leagueTeam
  target's current visibility at hydrate time (`assertLeagueVisible` in a
  try/catch — a thrown 404 means "not currently visible" for that one entry, not
  a whole-list failure). When not visible, **null `profileHref` server-side** and
  do not return the `slug` (which could reconstruct a URL). The follow row stays
  (durable, per v1 D5). Do **not** hand the client an `isPublic` flag and let it
  decide — that is the D8 mistake.
- **Batch status:** no visibility gate (matches v1 user behavior; the caller must
  already hold the id, and the answer reveals nothing about the target).
- **Self-follow:** blocked for `user` only (inside the `user` handler). Following
  your own league/team is legitimate (see [`decisions.md`](./decisions.md) DL3).
- All routes require auth; follower id always from `req.auth.userId`.

## 5. Frontend

Extends `client/src/features/follows/`:

- `api/followsApi.js` — `follow(targetType, id)`, `unfollow(targetType, id)`,
  `listFollowing(targetType)`, `getStatuses(targetType, ids)`.
- `hooks/useFollowStatus.js` — `useFollowStatus(ids, { targetType='user', enabled })`;
  key `['followStatus', targetType, sortedIds]`.
- `hooks/useFollowing.js` — `useFollowing(targetType)`; key `['following', targetType]`.
- `components/FollowButton.jsx` — new `targetType='user'` prop (defaults preserve
  all 3 existing mounts) + generic `targetId` (with `targetUserId` back-compat
  alias). `isOwnAccount` guard stays user-only. Toggle still plain async +
  `setQueryData` (no `useMutation`).
- `pages/FollowingPage.jsx` — **sectioned by type**: three `<section>`s (Players /
  Leagues / Teams), each driven by its own `useFollowing(type)` query with its own
  loading/empty/error state. New `FollowingLeagueCard` / `FollowingLeagueTeamCard`
  beside the existing `FollowingCard`.

**New attach points:**

- `PublicLeaguePage.jsx` (`/league/:leagueSlug`) — `<FollowButton
targetType="league" targetId={league._id} />` in the header.
- `PublicLeagueTeamPage.jsx` (`/league/:leagueSlug/teams/:teamSlug`) —
  `<FollowButton targetType="leagueTeam" targetId={leagueTeam._id} />` in the team
  header (new import).

Both are `assertLeagueVisible`-gated public routes, so anonymous visitors get the
existing "Log in to follow" CTA. `purgePrivateCache` already clears
`['following', *]` / `['followStatus', *]` between users.

## 6. Edge cases

| Case                                             | Behavior                                           |
| ------------------------------------------------ | -------------------------------------------------- |
| Follow private league you're not a member of     | `404` (same as missing — anti-enumeration)         |
| Follow private league you ARE a member of        | Success (visible to you)                           |
| Follow leagueTeam whose parent league is private | `404` unless you're a parent-league member         |
| Duplicate follow / unfollow when not following   | Idempotent success                                 |
| Unknown `targetType`                             | `400`                                              |
| Followed league later goes private               | Row kept; `profileHref: null`, no leaked slug (D8) |
| Following your own league/team                   | Allowed (no self-follow block for these types)     |
| Logged-out visitor on a league/team page         | FollowButton → "Log in to follow" CTA              |

## 7. Performance

- No new indexes: both hot paths remain index-covered across `targetType` values.
- Per-type hydration is batched (`listLeaguesByIds`; parent-league `Map` for
  league teams — same discipline as v1's `findUsersByIds`). No N+1.
- The re-visibility check on hydration is the one added per-entry cost; it reuses
  the already-cached-per-request league lookups where possible and stays batched.

## 8. Migration plan

**None.** Additive enum widen on an existing collection; no backfill, no changes
to existing documents. Reversible.
