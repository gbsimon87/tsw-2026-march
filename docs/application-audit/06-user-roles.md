# User Roles

> Part of the [Application Audit](./README.md) · July 2026

## Global roles

`User.roles: [String]`, default `['user']`
(`server/src/modules/auth/auth.repository.js`). No admin/staff role exists and
no code branches on this array today — it is a reserved extension point.
Practical "roles" in TSW are **contextual**, derived from ownership, league
membership, and billing plan.

## Contextual roles

| Role               | Source                                                                                          | Scope                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Team owner**     | `Team.ownerUserId`                                                                              | full control of team, its games, billing                                            |
| **League owner**   | `League.ownerUserId`                                                                            | full control incl. archiving, league managers                                       |
| **League manager** | `leaguemanagers` doc (status active)                                                            | manage teams, rosters, members, games — not league archive or manager list          |
| **Team manager**   | `leagueteammembers` role `manager`                                                              | manage one league team's roster/requests                                            |
| **Helper**         | `leagueteammembers` role `helper`                                                               | view-level membership                                                               |
| **Player**         | `leagueteammembers` role `player`, usually linked to a `leagueplayers` doc via `leaguePlayerId` | claims a roster identity ("my profiles" in the client — `GET /leagues/my-profiles`) |
| **Anonymous**      | —                                                                                               | public league/team/player/game pages, feed listing                                  |

Roles are granted via the **join-request flow** (any authed user requests
player/helper/team_manager on a team; approvers are owner/league manager/team
manager) or directly (owner adds league managers by email; managers add team
managers by email).

## Player claiming

A `LeaguePlayer` may be claimed (`claimedByUserId`), linking a real account to
a roster entry. Claiming powers: "isMe" highlighting on public player pages,
highlight-clip sharing rights (`feed.service.js:574-598`), avatar overlay on
leaderboards, and the My Sporty profile list. Unclaiming is a manager action
(`leagues.service.js:1447`).

## Plan-derived gating

`User.plan` (`free`/`pro`) is a **mirror** maintained by `syncOwnerPlan`
(`billing.service.js:152-156`) from team subscriptions; the source of truth is
per-resource (`Team.plan`, `League.plan`). Entitlement checks accept legacy
`'pro'` values. See [08-subscription-logic](./08-subscription-logic.md).

## Detailed permission mapping

See the matrix in [05-authorisation-permissions](./05-authorisation-permissions.md).
