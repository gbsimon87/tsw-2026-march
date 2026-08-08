# Schedule Builder — Status Dashboard

> Updated: 2026-08-08 · Branch `feature/schedule-builder`
> Legend: ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked · ⚪ deferred

## Overall

|                    |                                                   |
| ------------------ | ------------------------------------------------- |
| **Phase**          | Phases 1–2 complete → Phase 3 (client UI) next    |
| **Tasks complete** | 9 / 14                                            |
| **Server suite**   | ✅ 592 / 592 passing (57 suites)                  |
| **Client suite**   | 17 failing — unchanged OPT-026 baseline, not ours |
| **Blockers**       | none                                              |

```
Progress  [█████████████░░░░░░░]  64%
```

## Phases

| Phase          | Scope                                                | Status | Tasks |
| -------------- | ---------------------------------------------------- | ------ | ----- |
| 0 · Design     | Spec + tracker                                       | ✅     | 2 / 2 |
| 1 · Server     | Status enum, venue, repo, validation, service, route | ✅     | 7 / 7 |
| 2 · Generation | Pure `scheduleBuilder.js` + unit tests               | ✅     | 2 / 2 |
| 3 · Client UI  | Builder page, draft table, api, route, entry point   | ⬜     | 0 / 4 |
| 4 · Verify     | Full suites, lint, build, manual pass                | ⬜     | 0 / 1 |

## Completed

| Task                        | Commit    | Note                                                                                       |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| 1 · `'scheduled'` status    | `0c7a1e5` | Additive enum value; default unchanged, 554/554 regression-checked                         |
| 2 · Status-check fixes      | `07e8315` | Lineup guard message + season-completion notice now distinguish scheduled from in-progress |
| 3 · `venue` field           | `f73f7f6` | Optional, trimmed, ≤120 chars; exposed on both game output shapes                          |
| 4–5 · Repo helpers + schema | `1000eb2` | `insertManyGames` (ordered), `deleteReplaceableLeagueGames`, `bulkCreateLeagueGamesSchema` |
| 6 · Bulk service            | `2481870` | Reuses `assertLeagueManagerOrOwner` / `ensureSeasonEditable`; validates all rows pre-write |
| 7 · Controller + route      | `8c71d50` | `POST /leagues/:leagueId/games/bulk` → 201                                                 |
| 8–9 · Generation            | `5bc69eb` | `buildRoundRobin` + `assignDates`, 34 unit tests                                           |

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

## Decision log

| #   | Decision                                            | Status    |
| --- | --------------------------------------------------- | --------- |
| D1  | Draft is client-only, nothing persists until commit | ✅ agreed |
| D2  | Generation is client-side pure functions            | ✅ agreed |
| D3  | One bulk endpoint, all-or-nothing                   | ✅ agreed |
| D4  | Active `Season` required                            | ✅ agreed |
| D5  | Replace only `scheduled` + eventless games          | ✅ agreed |
| D6  | Byes shown, never persisted                         | ✅ agreed |
| D7  | Slot overflow explicit + acknowledged               | ✅ agreed |
| D8  | Home/away alternates + per-row swap                 | ✅ agreed |
| D9  | `assertLeagueManagerOrOwner`                        | ✅ agreed |
| D10 | Venue = free-text string on `Game`                  | ✅ agreed |

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
