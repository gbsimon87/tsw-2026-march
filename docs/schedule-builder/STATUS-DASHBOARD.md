# Schedule Builder — Status Dashboard

> Updated: 2026-08-08 · Branch `feature/schedule-builder`
> Legend: ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked · ⚪ deferred

## Overall

|                    |                                              |
| ------------------ | -------------------------------------------- |
| **Phase**          | Design complete → implementation not started |
| **Tasks complete** | 0 / 14                                       |
| **Server suite**   | not yet run                                  |
| **Client suite**   | not yet run                                  |
| **Blockers**       | none                                         |

```
Progress  [░░░░░░░░░░░░░░░░░░░░]  0%
```

## Phases

| Phase          | Scope                                                      | Status | Tasks |
| -------------- | ---------------------------------------------------------- | ------ | ----- |
| 0 · Design     | Spec + tracker                                             | ✅     | 2 / 2 |
| 1 · Server     | Schema field, repo, service, controller, route, validation | ⬜     | 0 / 5 |
| 2 · Generation | Pure `scheduleBuilder.js` + unit tests                     | ⬜     | 0 / 2 |
| 3 · Client UI  | Builder page, draft table, api, route, entry point         | ⬜     | 0 / 4 |
| 4 · Verify     | Full suites, lint, build, manual pass                      | ⬜     | 0 / 3 |

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
