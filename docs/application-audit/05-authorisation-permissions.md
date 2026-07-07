# Authorisation & Permissions

> Part of the [Application Audit](./README.md) · July 2026

Authorization is enforced in the **service layer** through ownership and
role assertions — there is no permissions middleware, no RBAC library, and no
central policy module. Route middleware only decides _authenticated vs
anonymous_ (`authMiddleware` / `optionalAuthMiddleware`).

## Permission sources

1. **Ownership** — `ownerUserId` on Team, Game, League. Checked via
   `findTeamByIdAndOwner`, `assertTeamOwnership`, `assertGameAccess`
   (`server/src/modules/games/games.service.js:557-586`), league owner checks.
2. **League-scoped roles** — three collections:
   - `leaguemanagers` — league-wide managers (`{leagueId, userId, status}`)
   - `leagueteammembers` — per-team roles `manager | helper | player`
   - `leaguejoinrequests` — pending role grants
3. **Global user roles** — `User.roles: [String]` default `['user']`. **No code
   path currently branches on this** beyond the default; it is a reserved
   extension point.
4. **Billing entitlements** — plan/subscription state gates feature access
   (see [08-subscription-logic](./08-subscription-logic.md)).

## Key assertion helpers (all in `server/src/modules/leagues/leagues.service.js`)

| Helper                                | Grants                                                       |
| ------------------------------------- | ------------------------------------------------------------ |
| `assertLeagueManagerOrOwner` (`:286`) | league owner OR active LeagueManager                         |
| `assertLeagueViewer`                  | owner ∥ league manager ∥ any team membership                 |
| `getLeagueTeamAccess` (`:655` area)   | owner / league manager / team member, with `canManage` tiers |

Games: `assertGameAccess` allows owner, dual-game participant team owner, or
league manager; finishing/deleting league games additionally requires
`canFinalizeLeagueGame`/`canManageLeagueGame` (`games.service.js:1459-1480`).

## Effective permission matrix (league domain)

| Action                                             | Owner                                                                 | League manager                                                                       | Team manager                                                  | Helper | Player | Any user                                      |
| -------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------ | ------ | --------------------------------------------- |
| Edit league, archive league                        | ✅ / ✅                                                               | ✅ / ❌                                                                              | —                                                             | —      | —      | —                                             |
| Add/remove league managers                         | ✅                                                                    | ❌                                                                                   | —                                                             | —      | —      | —                                             |
| Create/edit league teams, logos                    | ✅                                                                    | ✅                                                                                   | ✅ (edit own team; archive blocked `leagues.service.js:1021`) | —      | —      | —                                             |
| Roster CRUD, unclaim players                       | ✅                                                                    | ✅                                                                                   | ✅                                                            | —      | —      | —                                             |
| Add team managers by email                         | ✅                                                                    | ✅ (`assertLeagueManagerOrOwner`, **not** team managers — `leagues.service.js:1213`) | ❌                                                            | —      | —      | —                                             |
| Approve/reject join requests                       | ✅                                                                    | ✅                                                                                   | ✅                                                            | —      | —      | —                                             |
| Remove members (managers only by owner/league mgr) | ✅                                                                    | ✅                                                                                   | partial                                                       | —      | —      | —                                             |
| Create join request                                | —                                                                     | —                                                                                    | —                                                             | —      | —      | ✅ (any authed user, league must be editable) |
| View league detail (authed route)                  | ✅                                                                    | ✅                                                                                   | ✅                                                            | ✅     | ✅     | ❌                                            |
| View public league pages                           | everyone (if `isPublic` + active)                                     |                                                                                      |                                                               |        |        |                                               |
| Track/finish league games                          | owner; league managers via `assertGameAccess`/`canFinalizeLeagueGame` |                                                                                      |                                                               |        |        |                                               |

Feed: any authenticated user with a team/league affiliation can post
(image/video gate = 3 parallel existence checks); deletion is creator-only.
Highlight-clip sharing requires game access or a claimed player snapshot
(`feed.service.js:574-598`).

## Client-side mirroring

The client derives UI permissions from server responses
(`viewerContext` on league payloads, `canManage*` flags, `canDelete` on posts,
`canShareHighlights` on games) rather than recomputing rules — good practice,
consistently applied. Note `canDelete` is always false on feed listing because
the route never populates `req.auth` (see [23-api-audit](./23-api-audit.md)).

## Observations

1. **Consistent but decentralised**: every service re-implements its checks;
   there is no single place to review policy. Fine at current size; a
   `permissions.js` helper module would reduce drift risk if roles grow.
2. `buildLeagueViewerContext` refetches memberships per league on list views
   (N+1) — a perf, not correctness, issue.
3. `getLeagueTeamRosterSnapshotForGame` hardcodes
   `plan:'pro', subscriptionStatus:'active'` (`leagues.service.js:1873-1874`)
   as a billing shim for the games module — a deliberate bypass worth
   documenting near billing code.
4. Public endpoints (`/public-leagues/*`, `/public/teams/*`, `GET /games/:id`)
   are open by design; the heavy leaders/standings recomputation on
   unauthenticated routes makes them the cheapest DoS surface (see
   [25-performance-audit](./25-performance-audit.md)).

Related: [06-user-roles](./06-user-roles.md).
