# Demo Data

`seed-demo-account.js` idempotently creates the demo user and realistic leagues,
teams, roles, games, stats, schedules, media, and Pulse posts.

```bash
pnpm --filter server exec node src/scripts/seed-demo-account.js --dry-run
pnpm --filter server seed:demo
```

Default login: `testuser@gmail.com` / `password1!2@3#`.

Use a dry run before shared environments. This script is additive;
`pnpm seed` is the destructive development reset.
