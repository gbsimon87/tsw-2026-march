# Auto Feed

When `AUTO_FEED_ENABLED=true`, finalizing a public league game can publish
system-authored game-card and highlight posts. Standalone, private, and archived
league games are excluded. Making a league private removes its automatic posts.

Code: `server/src/modules/feed/`, `server/src/modules/auth/auth.service.js`, and
`server/src/config/env.js`.

Backfill existing games only after reviewing a dry run:

```bash
cd server
node src/scripts/backfill-auto-feed.js --dry-run
node src/scripts/backfill-auto-feed.js
```
