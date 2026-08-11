# Data Completeness

The league-admin Data health tab audits the active season. Owners and league
managers see all issues; team managers see league-wide game issues and their
teams' roster issues. Only owners and league managers can dismiss issues.

| Severity | Checks                                                                                 |
| -------- | -------------------------------------------------------------------------------------- |
| High     | scheduled, in-progress, or event-free completed games more than 48 hours past tip-off  |
| Medium   | active player with no appearance after team has played; fewer than five active players |
| Low      | missing jersey, claim, future-game venue, or team logo                                 |

Checks: `server/src/modules/leagues/dataCompleteness.checks.js`. Persistence and
API: adjacent `dataCompleteness.*` files and `leagues.routes.js`. Client:
`DataCompletenessPanel.jsx`.

Production disables automatic index creation. Before enabling dismissals, run:

```bash
cd server
ENV_FILE=../env/server/.env.production node src/scripts/migrate-data-issue-dismissal-index.js --dry-run
ENV_FILE=../env/server/.env.production node src/scripts/migrate-data-issue-dismissal-index.js
```
