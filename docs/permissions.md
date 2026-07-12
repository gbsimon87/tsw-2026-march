# League & Team Permission Boundaries

This document defines the permission model for leagues, teams, and games. Enforced server-side — client-side checks are UX only.

## Role Hierarchy

| Role               | Scope                      | How assigned                                                                           |
| ------------------ | -------------------------- | -------------------------------------------------------------------------------------- |
| **Owner**          | League + all teams         | Creates the league                                                                     |
| **League Manager** | League + all teams         | Owner assigns via email (`POST /leagues/:id/managers`)                                 |
| **Team Manager**   | One or more specific teams | Owner or league manager assigns via email (`POST /leagues/:id/teams/:teamId/managers`) |
| **Helper**         | Single team, read/assist   | Joins via request, approved by team manager or above                                   |
| **Player**         | Single team, self only     | Joins via request, claims a roster slot                                                |

## Permission Matrix

| Action                                          | Owner | League Manager | Team Manager          | Helper/Player |
| ----------------------------------------------- | ----- | -------------- | --------------------- | ------------- |
| **League**                                      |       |                |                       |               |
| Archive / delete league                         | ✅    | ❌             | ❌                    | ❌            |
| Update league settings (name, visibility, logo) | ✅    | ✅             | ❌                    | ❌            |
| Add league managers                             | ✅    | ❌             | ❌                    | ❌            |
| Remove league managers                          | ✅    | ❌             | ❌                    | ❌            |
| View league (admin)                             | ✅    | ✅             | ✅                    | ✅            |
| **Teams**                                       |       |                |                       |               |
| Create teams                                    | ✅    | ✅             | ❌                    | ❌            |
| Archive / delete a team                         | ✅    | ✅             | ❌                    | ❌            |
| Update team settings (name, logo, colors)       | ✅    | ✅             | ✅ (own team)         | ❌            |
| **Roster**                                      |       |                |                       |               |
| Add / edit / deactivate players                 | ✅    | ✅             | ✅ (own team)         | ❌            |
| Unclaim a player slot                           | ✅    | ✅             | ✅ (own team)         | ❌            |
| **Members**                                     |       |                |                       |               |
| Add team managers                               | ✅    | ✅             | ❌                    | ❌            |
| Remove team managers                            | ✅    | ✅             | ❌                    | ❌            |
| Remove helpers / players                        | ✅    | ✅             | ✅ (own team)         | ❌            |
| Approve / reject join requests                  | ✅    | ✅             | ✅ (own team)         | ❌            |
| **Games**                                       |       |                |                       |               |
| Schedule a game (any matchup)                   | ✅    | ✅             | ❌                    | ❌            |
| Schedule a game (own team vs opponent)          | ✅    | ✅             | ✅                    | ❌            |
| Track / append events to game                   | ✅    | ✅             | ✅ (managed team)     | ❌            |
| Track button visible in league game list        | ✅    | ✅             | ✅ (own team's games) | ❌            |
| Finalize (complete) a game                      | ✅    | ✅             | ✅ (if game creator)  | ❌            |

## UI Behaviour Notes

- **Track button** on `AdminLeaguePage` is disabled/greyed for team managers on games that don't involve their team. Computed client-side from `league.viewerContext.managedTeamIds`.
- **Schedule Game form** (`AdminNewLeagueGamePage`) shows a reduced UI for team managers: their team is pre-set (read-only), they pick Home or Away, and choose an opponent. Full home/away/tracking selects are shown to owners and league managers only.
- **League Managers section** on `AdminLeaguePage` is visible to owners, league managers, and team managers (`canViewManagers = canEditLeague || viewerRole === 'team_manager'`). The Remove and Add-manager controls within it are restricted to the league owner only.

## Key Enforcement Points (server)

- `assertLeagueOwner` — owner-only actions (archive league, add/remove league managers)
- `assertLeagueManagerOrOwner` — owner or league manager (update league settings, create team, upload league logo, add/update team members)
- `assertTeamManagerOrOwner` — owner, league manager, or team manager (roster/member ops, team logo, join requests); returns `role` so callers can add further restrictions
- `archiveLeagueTeamForLeague` — calls `assertTeamManagerOrOwner` then explicitly rejects `role === 'manager'`
- `finishGameForUser` — calls `canFinalizeLeagueGame` (owner/league manager only) for any league game the requester didn't originally create
- `canManageLeagueGame` — called by `assertGameAccess`, `appendEventForUser`, and `deleteGameForUser`; returns true for the league owner, any active league manager, or a team manager of _either_ the home or away team. This is the runtime gate for event tracking and game deletion — distinct from the stricter tracked-team check in `getLeagueContextForGame`.
- `canEditCompletedLeagueGame` — guards edits to already-completed league games; checks owner, active league manager, or team manager of the home, away, or tracked team.
- `getLeagueContextForGame` — owners and league managers bypass both the `allowManager` gate and the per-team manager check; team managers must be the manager of the tracked team
- `buildLeagueViewerContext` — attached to every `GET /leagues/:id` response as `viewerContext: { viewerRole, managedTeamIds }`; drives all client-side permission UI

## Automated Feed Content (Auto Feed Generation)

See [`auto-feed-generation/000-TRACKER.md`](./auto-feed-generation/000-TRACKER.md)
for the full feature. Permission-relevant points:

- Auto-generated `game_card`/`highlight_clip` posts are authored by a reserved
  **system User** (`authProvider: 'system'`), never a real account.
  `auth.service.js#login` explicitly rejects this account (it also has no
  `passwordHash`, so it's unauthenticatable by construction, not just by the
  explicit check).
- The public-league restriction is enforced in exactly one place:
  `feed.service.js#autoPublishForFinalizedGame` calls the same
  `isLeaguePublic()` gate used by manual share endpoints. Standalone games and
  games in private/archived leagues are never auto-published.
- When an owner/league manager flips a league from public to private via
  `PATCH /leagues/:id`, `updateLeagueForUser` fires a best-effort post-response
  call to `reverseAutoPostsForLeague`, which deletes only the system-authored
  auto posts for that league's games — any user's manually-shared cards/clips
  for the same games are left untouched.
