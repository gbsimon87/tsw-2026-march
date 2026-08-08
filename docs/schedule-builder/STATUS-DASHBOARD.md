# Schedule Builder — Status Dashboard

> Updated: 2026-08-08 · Branch `feature/schedule-builder`
> Legend: ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked · ⚪ deferred

## Overall

|                    |                                                       |
| ------------------ | ----------------------------------------------------- |
| **Phase**          | ✅ All phases complete — awaiting review/merge        |
| **Tasks complete** | 14 / 14                                               |
| **Server suite**   | ✅ 592 / 592 passing (57 suites)                      |
| **Client suite**   | 17 failing — unchanged OPT-026 baseline, not ours     |
| **Blockers**       | none                                                  |
| **Next step**      | Review `feature/schedule-builder`, then merge → `dev` |

```
Progress  [████████████████████] 100%
```

## Phases

| Phase          | Scope                                                | Status | Tasks |
| -------------- | ---------------------------------------------------- | ------ | ----- |
| 0 · Design     | Spec + tracker                                       | ✅     | 2 / 2 |
| 1 · Server     | Status enum, venue, repo, validation, service, route | ✅     | 7 / 7 |
| 2 · Generation | Pure `scheduleBuilder.js` + unit tests               | ✅     | 2 / 2 |
| 3 · Client UI  | Builder page, draft table, api, route, entry point   | ✅     | 4 / 4 |
| 4 · Verify     | Full suites, lint, build, manual pass                | ✅     | 1 / 1 |

## Completed

| Task                        | Commit                 | Note                                                                                       |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| 1 · `'scheduled'` status    | `0c7a1e5`              | Additive enum value; default unchanged, 554/554 regression-checked                         |
| 2 · Status-check fixes      | `07e8315`              | Lineup guard message + season-completion notice now distinguish scheduled from in-progress |
| 3 · `venue` field           | `f73f7f6`              | Optional, trimmed, ≤120 chars; exposed on both game output shapes                          |
| 4–5 · Repo helpers + schema | `1000eb2`              | `insertManyGames` (ordered), `deleteReplaceableLeagueGames`, `bulkCreateLeagueGamesSchema` |
| 6 · Bulk service            | `2481870`              | Reuses `assertLeagueManagerOrOwner` / `ensureSeasonEditable`; validates all rows pre-write |
| 7 · Controller + route      | `8c71d50`              | `POST /leagues/:leagueId/games/bulk` → 201                                                 |
| 8–9 · Generation            | `5bc69eb`              | `buildRoundRobin` + `assignDates`, 34 unit tests                                           |
| 10–11 · Draft table + api   | `0e7d8af`              | Table at `sm`+, cards on phones; `leaguesApi.bulkCreateGames`                              |
| 12–13 · Page, route, entry  | `968e8ff`              | `/admin/leagues/:leagueId/schedule` + "Build Schedule" button                              |
| a11y fix                    | `ffee377`              | Controls named after the matchup, not `row-N` — found in the manual mobile pass            |
| 14 · Docs                   | `661a9e5`              | `api.md`, PROJECT-KNOWLEDGE §5/§11/§12, trackers                                           |
| Downstream: demo seed       | `463fbda`              | `seed-demo-account.js` now filters `status: 'completed'` and sets `venue` — see below      |
| Docs pass                   | `1f8c544`, this commit | Legend fix; PROJECT-KNOWLEDGE §1/§3/§8/§10 + `schedule-builder/` README expansion          |

## Final verification (2026-08-08)

| Check                                          | Result                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Server suite                                   | ✅ 592 / 592 (57 suites)                                                                                    |
| Client suite                                   | ✅ 238 passing; 17 failing = **unchanged** OPT-026 baseline (was 172 passing / 17 failing before this work) |
| `pnpm check-env` / `lint` / `build`            | ✅ all clean                                                                                                |
| Manual pass (real dev DB, Metro Spring League) | ✅ see below                                                                                                |

Manual pass covered: no-active-season guard · 4-team generation (6 games, 3
rounds, consecutive Saturdays, correct slots) · venue applied · overflow warning
naming count + date, commit blocked until acknowledged · commit persisting 6
games as `scheduled` with the right `seasonId`/`venue` · **replace leaving all 6
completed games intact** (6 completed + 6 scheduled before and after, with new
`_id`s proving the swap ran) · 375px mobile card layout.

> Manual verification left a "Schedule Builder Test Season" plus 6 scheduled
> games in the shared **dev** DB (league `6a5c777ca58e60075a97c178`). Harmless,
> but delete when convenient — the pre-existing completed games were untouched.

## Verification notes

- **Mutation-tested**, not merely green: deliberately breaking the `scheduled`
  status and un-wiring the route each produced the expected failures, confirming
  the tests have teeth.
- **Home/away balance bug caught by test** in Phase 2. Two positional-parity
  attempts failed (one team drew 5 home / 0 away, another 0 / 5); replaced with a
  running-balance assignment. Now optimal (max diff 1) for every team count 2–16,
  asserted across 13 sizes rather than the single size that originally passed.
- **Existing games untouched**: the full server suite is green at every step, the
  status default is unchanged, and no document is rewritten.

## Downstream impact of the new `'scheduled'` status

Adding a third `Game.status` value is additive at the schema level but **not**
automatically a no-op for code that assumed two states. Audited and resolved:

| Area                                                                                          | Outcome                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server reads (`feed`, `export`, `gameRecap`, `games.service` `!== 'completed'` guards)        | ✅ correct as-is — they exclude non-completed games, which is right for a fixture                                                                                                                             |
| Client status checks (`GamesListPage`, `PublicTeamPage`, `AdminTeamPage`, `GameDetailHeader`) | ✅ correct as-is — explicit `=== 'in_progress'`, so a fixture falls through to the non-live branch                                                                                                            |
| `games.service#setGameLineup`                                                                 | ✅ fixed — said "completed game" for a fixture                                                                                                                                                                |
| `AdminLeaguePage` season-completion notice                                                    | ✅ fixed — counted fixtures as "in progress"                                                                                                                                                                  |
| `seed-demo-account.js`                                                                        | ✅ fixed (`463fbda`) — **two silent bugs**: the idempotency guard counted fixtures and so skipped seeding played games entirely; feed generation pulled eventless fixtures into highlight/game-card selection |
| `seed.js`                                                                                     | ✅ no change — destructive full reset, writes explicit `status: 'completed'`                                                                                                                                  |

**Rule for future work:** a query that means "games that were played" must say
`status: 'completed'`. Both seed-script failures were silent — skipped work and
empty-shell posts — the kind a green test run does not surface.

## Decision log

| #   | Decision                                            | Status                                                                                                                                                                             |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Draft is client-only, nothing persists until commit | ✅ agreed                                                                                                                                                                          |
| D2  | Generation is client-side pure functions            | ✅ agreed                                                                                                                                                                          |
| D3  | One bulk endpoint, all-or-nothing                   | ✅ agreed                                                                                                                                                                          |
| D4  | Active `Season` required                            | ✅ agreed                                                                                                                                                                          |
| D5  | Replace only `scheduled` + eventless games          | ✅ agreed                                                                                                                                                                          |
| D6  | Byes shown, never persisted                         | ✅ agreed                                                                                                                                                                          |
| D7  | Slot overflow explicit + acknowledged               | ✅ agreed                                                                                                                                                                          |
| D8  | Even home/away split + per-row swap                 | ✅ shipped — implemented as a **running per-team balance**, not the round-parity alternation first assumed (parity strands the circle-method anchor; see Verification notes)       |
| D9  | `assertLeagueManagerOrOwner`                        | ✅ agreed                                                                                                                                                                          |
| D10 | Venue = free-text string on `Game`                  | ✅ agreed                                                                                                                                                                          |
| D11 | Add `'scheduled'` to the `Game.status` enum         | ✅ agreed mid-plan — the enum was `['in_progress','completed']`, so a fixture would have been born "in progress". Additive; default unchanged, no migration, no document rewritten |

## Deferred to future versions

| Item                                | Note                                      |
| ----------------------------------- | ----------------------------------------- |
| Double round-robin / other formats  | Suggestion rule fixed at single RR for v1 |
| Divisions / groups / brackets       | Separate league-admin ideas (#5, #6)      |
| Venue entities + map                | Idea #2; free text only for now           |
| Blackout dates                      | Not requested for v1                      |
| Server-persisted / shareable drafts | D1 — revisit if admins report losing work |
| Notifications on schedule publish   | Depends on idea #14                       |

## Risk watchlist

| Risk                                 | Status                                                |
| ------------------------------------ | ----------------------------------------------------- |
| Accidental schedule wipe via replace | mitigated by explicit confirm + eventless-only filter |
| Client-only draft lost on reload     | accepted; unload warning planned                      |
| Timezone drift on `scheduledAt`      | mirror existing single-game create path               |
