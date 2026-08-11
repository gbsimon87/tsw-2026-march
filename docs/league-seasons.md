# League Seasons

League games, standings, player stats, exports, schedules, public selectors,
and data health are keyed by `seasonId`. A league has at most one active season;
teams, players, and memberships carry across seasons.

Source: `server/src/modules/leagues/seasons.repository.js` and
`leagues.service.js`. Migration scripts:

```bash
cd server
node src/scripts/backfill-league-seasons.js --dry-run
node src/scripts/backfill-league-seasons.js
node src/scripts/backfill-league-standings.js --dry-run
node src/scripts/backfill-league-standings.js
```

Run dry runs first in shared environments.
