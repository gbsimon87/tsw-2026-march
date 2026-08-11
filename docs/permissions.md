# League And Team Permissions

Server services enforce permissions; client checks only control presentation.
League ownership is separate from `LeagueManager` membership.

| Action                                | Owner | League manager | Team manager        | Helper/player |
| ------------------------------------- | ----- | -------------- | ------------------- | ------------- |
| Archive league                        | Yes   | No             | No                  | No            |
| Edit league or league logo            | Yes   | Yes            | No                  | No            |
| Add/remove league managers            | Yes   | No             | No                  | No            |
| Create or archive league teams        | Yes   | Yes            | No                  | No            |
| Edit team, logo, or roster            | Yes   | Yes            | Own team            | No            |
| Add/remove team managers              | Yes   | Yes            | No                  | No            |
| Manage join requests and members      | Yes   | Yes            | Own team            | No            |
| Schedule any matchup or bulk schedule | Yes   | Yes            | No                  | No            |
| Schedule own-team matchup             | Yes   | Yes            | Yes                 | No            |
| Track game events                     | Yes   | Yes            | Managed team's game | No            |
| Finalize game created by someone else | Yes   | Yes            | No                  | No            |
| Dismiss data-health issues            | Yes   | Yes            | No                  | No            |
| Export league data                    | Yes   | Yes            | No                  | No            |
| Export team data                      | Yes   | Yes            | Own team            | No            |

Primary gates in `server/src/modules/leagues/leagues.service.js`:

- `assertLeagueOwner`
- `assertLeagueManagerOrOwner`
- `assertTeamManagerOrOwner`
- `canManageLeagueGame`
- `canFinalizeLeagueGame`
- `canEditCompletedLeagueGame`
- `getLeagueContextForGame`
- `buildLeagueViewerContext`

`viewerContext` on `GET /leagues/:leagueId` contains the viewer role and managed
team IDs. Reuse server gates for new behavior; do not infer authorization from
this client-facing context.

Automatic feed posts use the reserved system user. They are limited to public
league games and are removed when the league becomes private.
