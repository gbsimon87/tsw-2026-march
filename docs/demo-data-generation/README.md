# Demo Account Data Generation

> Implementation plan for the `testuser@gmail.com` demo account. See
> [`TRACKER.md`](./TRACKER.md) for live implementation status and
> [`DECISIONS.md`](./DECISIONS.md) for the open questions/decisions log.

## What this is

A standalone, additive, idempotent script —
[`server/src/scripts/seed-demo-account.js`](../../server/src/scripts/seed-demo-account.js)
— that populates a demo account showcasing TSW's full feature surface:
multiple leagues with different ownership/role structures, teams, rosters,
completed games with full stat tracking, and video-highlight playback.

Run it with:

```bash
pnpm --filter server seed:demo                       # dev (uses env/server/.env.development)
pnpm --filter server exec node src/scripts/seed-demo-account.js --dry-run   # preview only, no writes
```

Login after seeding: `testuser@gmail.com` / `password1!2@3#`.

## How this differs from `pnpm seed`

`server/src/scripts/seed.js` (the existing `pnpm seed` command) is a **dev-only,
destructive** script: every run wipes Users, Teams, Games, Leagues, and Posts
before recreating 10 sample users and one league. It's the right tool for
resetting a local dev database to a clean baseline, but it can never safely
run against production, and it never exercises the highlight/replay video
feature (no game ever gets a `videoUrl`).

`seed-demo-account.js` is the opposite shape on purpose:

|                       | `seed.js` (`pnpm seed`)                 | `seed-demo-account.js` (`pnpm seed:demo`)                                           |
| --------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Deletes existing data | Yes, every run                          | Never                                                                               |
| Safe to re-run        | Only in the sense that it always resets | Yes — fully idempotent, no-ops when data already exists                             |
| Safe in production    | No                                      | Designed to be, behind an explicit guard (see below)                                |
| Leagues created       | 1                                       | 3, with distinct owner/manager/player role structures                               |
| Video/highlight data  | None                                    | Every league game gets a `videoUrl`; highlight-eligible events get `videoTimestamp` |

## What gets created

Three leagues, each with 5 `LeagueTeam`s of 8 `LeaguePlayer`s, and at least 3
completed games per team:

1. **Demo League** (`demo-league`) — owned by the demo user
   (`ownerUserId`), who is also a rostered player on the first team
   (`demoUserRole: 'player'`). This is the primary league named in the
   requirements.
2. **Harborview Rec League** (`harborview-rec-league`) — owned by an
   auto-created synthetic "commissioner" user
   (`demo-commissioner-2@tsw.demo`). The demo user holds a `manager`
   `LeagueTeamMember` role on one of its teams.
3. **Summit City Hoops Circuit** (`summit-city-hoops-circuit`) — also owned
   by a synthetic commissioner (`demo-commissioner-3@tsw.demo`). The demo
   user is only a rostered `player` here, with no management role.

This distribution demonstrates all three permission tiers described in
[`../permissions.md`](../permissions.md) — a real user is rarely the owner of
every league they're in, so having the demo account hold different roles
across leagues is a more honest showcase than making it the owner of all
three. See [`DECISIONS.md`](./DECISIONS.md) for the full rationale.

### Player profiles

The demo user is `claimedByUserId` on one `LeaguePlayer` in each of the three
leagues (3 profiles total, exceeding the ">1" requirement), so `/my-sporty`
shows multiple distinct player profiles spanning different leagues and
teams.

### Games and stats

Each league gets an 8-game schedule (`FIVE_TEAM_SCHEDULE` in the script)
guaranteeing every one of its 5 teams appears in at least 3 completed games.
Games are `gameContext: 'league'`, `trackingMode: 'dual_team'`, spread over
the last ~3 months, with realistic per-player stat events (FG2/FG3/FT,
assists, rebounds, steals, turnovers, fouls) generated via the same
event-generation logic `pnpm seed` uses (`buildLeagueGameEvents`, reused from
`seed.js`).

### Video / highlights

Each game gets a `videoUrl` rotated from the 4 supplied YouTube URLs (a
global counter cycles through them across all games, for variety). Every
event whose `statType` is highlight-eligible (`FG2_MADE`, `FG2_MISS`,
`FG3_MADE`, `FG3_MISS`, `FT_MADE`, `FT_MISS`, `AST`, `STL`, `BLK` — the exact
`HIGHLIGHT_STAT_TYPES` set from `games.service.js`) gets a randomized
`videoTimestamp` (0–5400 seconds). This means `buildGameHighlights` produces
real, varied highlight clips for every seeded game, which no existing seed
data does.

## How the seed process works (file-by-file)

- **`server/src/scripts/seed.js`** — modified to add a `require.main ===
module` guard around its existing `main()` call (so `require()`-ing it no
  longer triggers a destructive reseed) and a `module.exports` block
  exposing the pure, stateless helpers reused below. No behavior change to
  `pnpm seed` itself.
- **`server/src/scripts/seed-demo-account.js`** (new) — the entire demo
  generator. Reuses from `seed.js`: `randomInt`, `buildPlayerBlueprints`,
  `buildLeagueRosterSnapshot`, `buildLeagueGameEvents`, `attachTeamSide`.
  Does **not** reuse `seed.js`'s `buildSeedLeagueGames` (hardcoded to exactly
  4 teams) — instead defines its own `buildDemoLeagueGames`, structurally
  similar but supporting 5 teams and injecting `videoUrl`/`videoTimestamp`.
  Also imports `computeGameFinalScore` and `HIGHLIGHT_STAT_TYPES` directly
  from `games.service.js` (both already-exported, no changes needed there).
- **`server/package.json`** — adds a `seed:demo` script entry alongside the
  existing `seed`/`seed:we-ball` entries.
- **No changes needed** to `games.service.js`, `leagues.service.js`,
  `leagues.repository.js`, or `stats.constants.js` — every field and
  function this script needs (`videoUrl`, `videoTimestamp`, `claimedByUserId`,
  `HIGHLIGHT_STAT_TYPES`, `computeGameFinalScore`) already exists.

### Write order inside the script

1. Upsert the demo user (`testuser@gmail.com`). If the account already
   exists, its password/plan/verification are updated to match the demo
   spec (documented exception — see [`DECISIONS.md`](./DECISIONS.md)); no
   other field on an existing account is touched.
2. For each of the 3 league blueprints:
   a. Upsert the league's owner (the demo user for Demo League, or an
   auto-created commissioner user for the other two).
   b. Upsert the `League` doc, keyed by slug.
   c. Upsert 5 `LeagueTeam`s, keyed by slug.
   d. Upsert 8 `LeaguePlayer`s per team, keyed by `(leagueTeamId,
   jerseyNumber)`.
   e. Claim one `LeaguePlayer` on the blueprint's designated team for the
   demo user (skipped if already claimed by anyone), and upsert a
   `LeagueTeamMember` row for the demo user's role.
   f. Generate and insert the league's games (skipped entirely if the
   league already has the expected number of games).
3. Print a summary and a reminder to optionally run
   `backfill-league-standings.js` to warm materialized standings/player-stat
   aggregates (optional — the read path self-backfills on miss regardless).

## Idempotency

Every entity is keyed by a natural, deterministic key and is
checked-before-created:

| Entity           | Key                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| User             | `email`                                                                                                                   |
| League           | `slug`                                                                                                                    |
| LeagueTeam       | `slug`                                                                                                                    |
| LeaguePlayer     | `(leagueTeamId, jerseyNumber)`                                                                                            |
| LeagueTeamMember | `(leagueId, leagueTeamId, userId)` (via `findOneAndUpdate` upsert)                                                        |
| Game             | league-level count check (skips generating a league's whole game schedule if it already has the expected number of games) |

Re-running the script is verified to be a clean no-op (see
[`TRACKER.md`](./TRACKER.md) for the verification log).

## Adapting for production

The script already includes the guard rails needed to run it against a
production database later:

- **Env guard**: refuses to run when `NODE_ENV=production` unless
  `ALLOW_DEMO_SEED=true` is explicitly set.
- **`--dry-run` flag**: prints what would be created/skipped without writing
  anything, matching the convention already used by
  `backfill-league-standings.js`.
- **No hardcoded ObjectIds**: every cross-reference comes from a
  just-created/just-found document in memory, so the script behaves
  identically regardless of what IDs already exist in the target database.
- **No collection-wide deletes or unscoped updates**: the script only ever
  creates new documents or updates documents it can identify by a specific
  `_id`/slug/email it already resolved.

To run against production once ready:

```bash
ALLOW_DEMO_SEED=true ENV_FILE=../env/server/.env.production node src/scripts/seed-demo-account.js --dry-run  # review first
ALLOW_DEMO_SEED=true ENV_FILE=../env/server/.env.production node src/scripts/seed-demo-account.js            # then apply
```

## Existing seed files — disposition

- `server/src/scripts/seed.js` — kept, unchanged in behavior (only gained a
  `require.main` guard + exports). Still the right tool for resetting a dev
  DB to a clean baseline.
- `server/src/scripts/seed-we-ball-saturday.js` — unrelated: a one-off real
  game-data importer from TSV files for a specific real league. Not touched,
  not obsolete.
- `server/src/scripts/backfill-*.js` — unrelated maintenance/migration
  scripts tied to specific `OPT-###` tickets. Not touched.

No seed scripts were removed — there was no duplicate or obsolete seed logic
to clean up; the gap was the _absence_ of an additive/production-safe path,
which this new script fills.

## Verification

See [`TRACKER.md`](./TRACKER.md) for the specific commands run and their
results. In summary:

- DB-level: user credentials/plan, league count/ownership, team/player
  counts, claimed-profile count and league diversity, per-team game counts
  (≥3), video URL rotation (4 distinct URLs used), and `videoTimestamp`
  coverage on highlight-eligible events — all verified directly against the
  dev database, then the script was re-run to confirm a clean idempotent
  no-op.
- App-level (via the real service layer, since Playwright browser access was
  unavailable in this session): `getMyLeagueProfiles` was called directly and
  returned all 3 claimed profiles with correct team/league/role data;
  `getGameForUser` was called on a seeded game and returned 225 highlight
  clips, each correctly pairing the game's `videoUrl` with its own event's
  `videoTimestamp`.
