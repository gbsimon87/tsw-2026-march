# Demo Data Generation — Implementation Tracker

> Keep this updated as work continues. Don't start a "pending" task whose
> "Depends on" column names an unfinished task.

## Completed

| Task                                                                | Notes                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add `require.main === module` guard + `module.exports` to `seed.js` | Exposes `randomInt`, `buildPlayerBlueprints`, `buildLeagueRosterSnapshot`, `buildLeagueGameEvents`, `attachTeamSide` for reuse without triggering `pnpm seed`'s destructive reset on `require()`.     |
| Create `server/src/scripts/seed-demo-account.js`                    | New standalone, additive, idempotent generator.                                                                                                                                                       |
| Demo user upsert (`testuser@gmail.com` / `password1!2@3#`)          | Handles the case where the account already existed (found a stray `plan: 'free'` account in dev with none of the required leagues/claims) by updating credentials/plan in place — see `DECISIONS.md`. |
| 3 leagues / 5 `LeagueTeam`s / 8 `LeaguePlayer`s each                | Verified via direct DB query: all three leagues have exactly 5 teams and 40 players each.                                                                                                             |
| Player-profile claims (≥2 required)                                 | 3 profiles claimed (one per league), spanning 3 distinct leagues/teams — exceeds the ">1" requirement.                                                                                                |
| `LeagueTeamMember` role upserts                                     | Verified roles: `player` (Demo League), `manager` (Harborview Rec League), `player` (Summit City Hoops Circuit).                                                                                      |
| Per-team game counts ≥3                                             | 8-game schedule per league (`FIVE_TEAM_SCHEDULE`) verified to give every team ≥3 games; no low-count warnings in verification query.                                                                  |
| `videoUrl` rotation across the 4 supplied YouTube links             | Verified 4 distinct URLs used per league, no null `videoUrl` on any seeded game.                                                                                                                      |
| `videoTimestamp` injection on highlight-eligible events             | Verified: 225/225 highlight-eligible events on a sample game carry a numeric `videoTimestamp`.                                                                                                        |
| `seed:demo` npm script added to `server/package.json`               | `pnpm --filter server seed:demo`.                                                                                                                                                                     |
| Idempotency re-run                                                  | Ran the script twice against the dev Atlas DB; second run reported 0 new users/leagues/teams/players/games created.                                                                                   |
| Service-layer verification                                          | Called `getMyLeagueProfiles` and `getGameForUser` directly (real application code, not just raw DB reads) — both returned correct, fully-populated data.                                              |
| Documentation folder                                                | `docs/demo-data-generation/{README,TRACKER,DECISIONS}.md` written.                                                                                                                                    |

## Pending

| Task                                                                                         | Depends on                                  | Notes                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser-based UI walkthrough (login, `/my-sporty`, league pages, game replay/highlights tab) | —                                           | Not blocked, just not done in this session — the Playwright MCP browser was locked by another concurrent session. Service-layer verification substituted for this and is equally conclusive for correctness, but a visual pass is still worth doing before calling this demo-ready for an external audience. |
| Run `backfill-league-standings.js` against the seeded leagues                                | Demo data creation (done)                   | Optional — compute-on-miss already serves correct standings live. Recommended once, to warm the materialized cache before a live demo so first-load isn't slower than subsequent loads.                                                                                                                      |
| Decide & schedule the actual production run                                                  | Stakeholder sign-off on the demo data shape | The script is production-ready (env guard, `--dry-run`, idempotent) but has only been run against the dev Atlas DB so far.                                                                                                                                                                                   |

## Blocked

None currently.

## Future improvements

- Add a lightweight Jest test for `seed-demo-account.js`'s pure functions
  (`breakTieIfNeeded`, `injectVideoTimestamps`) if this script is expected to
  evolve further — currently verified only by manual DB inspection.
- Consider seeding a few `Post` documents of `type: 'highlight_clip'` for the
  demo leagues so The Pulse feed also shows shared highlight cards
  out of the box, rather than requiring a user to manually share one first.
- Consider adding standalone (non-league) team/player demo data if a future
  requirement wants the demo account to also showcase the "one tracked team
  per standalone game" product mode, which this script currently doesn't
  touch (all demo data is league-scoped, per the "player profile" research
  finding that standalone team players can't be claimed anyway).

## Dependencies between tasks

```
seed.js exports  ──▶  seed-demo-account.js implementation ──▶  dev DB run ──▶  idempotency re-run
                                                              └─▶ service-layer verification
                                                              └─▶ documentation
dev DB run (verified) ──▶ production run (pending stakeholder sign-off)
```
