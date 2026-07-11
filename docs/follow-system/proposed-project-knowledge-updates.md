# Proposed PROJECT-KNOWLEDGE.md Updates (apply AFTER ship)

> **Do NOT edit `docs/PROJECT-KNOWLEDGE.md` until the Follow System has fully
> shipped** (merged to `main`). This note stages the exact edits to fold in at
> Phase 4, mirroring how "Public Unified Player Profiles v1" was documented.

## §1 — What the app is

Add a bullet describing the Follow System:

> - **User Follow System v1 (users-only)**: signed-in users can follow/unfollow
>   other **user accounts** and view a private "Following" page (`/following`).
>   Follows are account-level (keyed by `User._id`), so following one person
>   covers all of their claimed player profiles at once. Follow buttons attach to
>   the public unified profile (`/players/:userId`) and homepage player
>   discovery. Backed by `GET/POST/DELETE /follows/*`
>   (`follows.*` module, auth-required). **v1 is users-only** — following
>   teams/leagues, public follower counts, a personalized feed, and notifications
>   are deferred (see `docs/follow-system/`).

## §3 — Routing

Add `/following` to the protected-routes description:

> - `/following` (protected) renders the private Following page listing the
>   current user's followed accounts.

## §4 — Authorization

Note the new module is auth-gated and self-scoped (no new league RBAC):

> The `follows` module is auth-gated; the follower identity always comes from
> `req.auth.userId` and a user can only read/modify their own follow set. Follows
> are orthogonal to league roles.

## §5 — Database structure

Add `Follow` to the collections table (collection count 16 → 17):

> | `Follow` | follows | user-to-user follow edges; polymorphic-ready
> (`{followerUserId, targetType:'user', targetId}`), unique compound index on
> `{followerUserId, targetType, targetId}` + listing index `{followerUserId, _id:-1}`. v1 `targetType` enum is `['user']` only. |

## §11 — Technical debt / limitations

Add a "Follow System v1" entry noting deferred work:

> **Follow System v1, users-only (`feature/follow-system`)**: shipped the private
> `/following` page + `/follows/*` API. Deferred: (1) following teams/leagues
> (`targetType` enum extension — additive, no migration); (2) public
> follower/following counts; (3) personalized "Following" feed on The Pulse; (4)
> notifications for followed users; (5) following standalone team-players (no
> user-claim mechanism yet); (6) no cascade on account deletion (list hydration
> tolerates missing users). Design + trackers: `docs/follow-system/`.

## §12 — Where to start (by question) table

Add a row:

> | Follow system (v1) | §1, §11 above, `docs/follow-system/` |

## Companion-docs list (top of file)

Add `docs/follow-system/` to the companion-docs paragraph alongside
`auto-feed-generation/` etc.

## Also consider

- `docs/api.md` — add the `/follows/*` endpoints.
- `docs/permissions.md` — note follows are self-scoped, auth-gated, no league role.
- `docs/app-overview.md` — add the `follows` module + `features/follows/` to the
  file-path map.
