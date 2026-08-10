# Schedule Builder — Implementation Tracker

> Spec: [`../superpowers/specs/2026-08-08-schedule-builder-design.md`](../superpowers/specs/2026-08-08-schedule-builder-design.md)
> Dashboard: [`STATUS-DASHBOARD.md`](./STATUS-DASHBOARD.md)
> Status keys: ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked

Tests are written before implementation per the project's TDD convention.

---

## Phase 0 — Design ✅

| #   | Task                                | Status | Notes             |
| --- | ----------------------------------- | ------ | ----------------- |
| 0.1 | Brainstorm + agree decisions D1–D10 | ✅     | 3 question rounds |
| 0.2 | Write spec + tracker folder         | ✅     | 2026-08-08        |

## Phase 1 — Server ✅

| #   | Task                                                                                                                                   | Files                                        | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------ |
| 1.1 | Add `venue` to `Game` schema (additive, no migration)                                                                                  | `games.repository.js`                        | ✅     |
| 1.2 | Repo helpers `insertManyLeagueGames`, `deleteReplaceableScheduledGames` (eventless + `scheduled` only)                                 | `games.repository.js`                        | ✅     |
| 1.3 | Zod `bulkCreateLeagueGamesSchema` — max 200, no self-pairing, venue ≤120                                                               | `leagues.validation.js`                      | ✅     |
| 1.4 | Service `bulkCreateLeagueGamesForUser` — `assertLeagueManagerOrOwner`, active-season resolve, cross-league team check, replace, insert | `leagues.service.js`                         | ✅     |
| 1.5 | Controller + route `POST /leagues/:leagueId/games/bulk` (`asyncHandler`)                                                               | `leagues.controller.js`, `leagues.routes.js` | ✅     |

**Server tests** (Jest, `server/src/tests/`)

| #    | Test                                                                                 | Status |
| ---- | ------------------------------------------------------------------------------------ | ------ |
| 1.T1 | unit: non-manager → 403                                                              | ✅     |
| 1.T2 | unit: no active season → 400                                                         | ✅     |
| 1.T3 | unit: team id from another league → 400                                              | ✅     |
| 1.T4 | unit: self-pairing → 400                                                             | ✅     |
| 1.T5 | unit: >200 games → 400                                                               | ✅     |
| 1.T6 | unit: replace deletes only eventless `scheduled` games, leaves completed/in-progress | ✅     |
| 1.T7 | integration: full bulk round trip incl. `replaceExisting`                            | ✅     |

## Phase 2 — Generation logic ✅

| #   | Task                                                                                                                 | Files                                 | Status |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ |
| 2.1 | `buildRoundRobin(teamIds)` — circle method, BYE sentinel for odd counts, alternating home/away                       | `features/leagues/scheduleBuilder.js` | ✅     |
| 2.2 | `assignDates(rounds, { startDate, weekdays, slots })` — slot fill, overflow to next game-day with `overflowed: true` | same                                  | ✅     |

**Client unit tests** (Vitest)

| #    | Test                                                                | Status |
| ---- | ------------------------------------------------------------------- | ------ |
| 2.T1 | even team count → `n(n-1)/2` games, every pair exactly once         | ✅     |
| 2.T2 | odd team count → one bye row per round, no bye in committed payload | ✅     |
| 2.T3 | home/away alternation is roughly even per team                      | ✅     |
| 2.T4 | slots fill in order across configured weekdays                      | ✅     |
| 2.T5 | slot exhaustion flags `overflowed` and reports a count              | ✅     |

## Phase 3 — Client UI ✅

| #   | Task                                                                                                                                          | Files                                                | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| 3.1 | `leaguesApi.bulkCreateGames`                                                                                                                  | `features/leagues/api/leaguesApi.js`                 | ✅     |
| 3.2 | `ScheduleDraftTable` — editable rows, swap sides, remove, mobile card layout, greyed bye rows                                                 | `features/leagues/components/ScheduleDraftTable.jsx` | ✅     |
| 3.3 | `AdminLeagueSchedulePage` — teams step, days/slots step, suggest-or-empty, overflow banner + acknowledgement, replace confirm, unload warning | `features/leagues/pages/AdminLeagueSchedulePage.jsx` | ✅     |
| 3.4 | Lazy route + "Build schedule" entry point on `AdminLeaguePage`                                                                                | `AppRouter.jsx`, `AdminLeaguePage.jsx`               | ✅     |

**Client component tests** (Vitest + RTL)

| #    | Test                                                    | Status |
| ---- | ------------------------------------------------------- | ------ |
| 3.T1 | draft table: edit time, swap sides, remove row          | ✅     |
| 3.T2 | commit disabled while an unacknowledged overflow exists | ✅     |
| 3.T3 | bye rows excluded from the submitted payload            | ✅     |
| 3.T4 | replace confirm names the count to be deleted           | ✅     |

Note: admin pages here use the original slate/sky-blue `PageHeader` palette
(§9.1 PROJECT-KNOWLEDGE) — not the scoreboard redesign.

## Phase 4 — Verification ✅

| #   | Task                                                                                              | Status |
| --- | ------------------------------------------------------------------------------------------------- | ------ |
| 4.1 | `pnpm --filter server test` green                                                                 | ✅     |
| 4.2 | `pnpm --filter client test` green (baseline: ~20 pre-existing failures per OPT-026)               | ✅     |
| 4.3 | `pnpm check-env && pnpm lint && pnpm build`; manual pass on a seeded league incl. mobile viewport | ✅     |

## Deviations from the plan

| Planned                                          | Actual                                  | Why                                                                                                                                                    |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'scheduled'` status assumed to exist            | Added it (Tasks 1–2)                    | The enum was `['in_progress','completed']`; a fixture would have been born "in progress". Additive, default unchanged, full suite green at every step. |
| Live-DB integration tests for repo helpers       | Unit tests asserting query construction | This codebase has **no live-DB tests** — integration specs mock the service layer and drive routes via Supertest. Followed the house pattern.          |
| `@testing-library/user-event` in component tests | `fireEvent`                             | `user-event` is not a dependency here; `fireEvent` + `cleanup` is the established style. Not worth adding a dep.                                       |
| `useQuery` on the builder page                   | `useState` + `useEffect`                | Several admin test trees have no `QueryClientProvider` — the exact trap documented for `useExportCsv` (PROJECT-KNOWLEDGE §11).                         |
| Home/away by round parity                        | Running per-team balance                | Parity strands the circle-method anchor and its opposite on one side (5 home / 0 away). Balance is optimal (max diff 1) for all sizes 2–16.            |
| `Breadcrumbs items={...}`                        | `crumbs={[{label, href}]}`              | Actual component contract.                                                                                                                             |

## Downstream fixes (post-merge of the feature work)

| Item                                                        | Status                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed-demo-account.js` assumed every league game was played | ✅ fixed — its idempotency guard and feed-post query now filter `status: 'completed'`, and demo games set the new `venue`. Without this, a demo league containing admin-created fixtures would silently skip seeding its played games. See [`../demo-data-generation/TRACKER.md`](../demo-data-generation/TRACKER.md) Session 5. |
| `seed.js`                                                   | ✅ no change needed — it is destructive (full reset) and writes explicit `status: 'completed'` on every game it creates.                                                                                                                                                                                                         |

## Follow-ups discovered during implementation

| Item                                                                                                                    | Status                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Draft-control accessible names leaked internal `row-N` ids (found in the manual mobile pass)                            | ✅ fixed in `ffee377`, regression test added    |
| Venue entities, blackout dates, double round-robin, divisions, brackets, server-persisted drafts, publish notifications | ⚪ deferred — see the dashboard's deferred list |
