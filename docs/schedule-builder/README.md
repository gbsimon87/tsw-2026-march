# Schedule Builder / Bulk Game Creation

Bulk creation of league games for league owners and managers — replacing the
one-game-at-a-time flow for season setup.

**Status:** ✅ shipped — 14/14 tasks, server 592/592, lint + build clean, manually verified end-to-end
**Branch:** `feature/schedule-builder` (not yet merged to `dev` at time of writing)
**Started / finished:** 2026-08-08

## Documents

| Doc                                                                                                                        | Purpose                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`STATUS-DASHBOARD.md`](./STATUS-DASHBOARD.md)                                                                             | At-a-glance progress + final verification record |
| [`IMPLEMENTATION-TRACKER.md`](./IMPLEMENTATION-TRACKER.md)                                                                 | Task-by-task tracker, deviations, follow-ups     |
| [`../superpowers/specs/2026-08-08-schedule-builder-design.md`](../superpowers/specs/2026-08-08-schedule-builder-design.md) | Design spec — decisions D1–D11 and rationale     |
| [`../api.md`](../api.md)                                                                                                   | Endpoint contract (`POST …/games/bulk`)          |
| [`../PROJECT-KNOWLEDGE.md`](../PROJECT-KNOWLEDGE.md)                                                                       | §1 capability, §3 route, §5 schema, §11 summary  |

## What it does

An admin opens `/admin/leagues/:leagueId/schedule` (entry point: the **Build
Schedule** button on `AdminLeaguePage`'s Games tab), picks participating teams,
game-days and time slots, then either **Suggest pairings** — a single
round-robin laid onto real calendar dates — or **Start empty**. Both land in the
same editable draft: swap sides, retime, re-venue, add or remove any row.
Committing posts the whole set to one bulk endpoint.

Byes are shown but never persisted. Slot overflow is flagged and must be
acknowledged before commit. "Replace existing" deletes only fixtures that
haven't started, never completed or in-progress games.

## Where the code lives

**Server**

| File                                                              | Role                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `server/src/modules/games/games.repository.js`                    | `Game.status` enum (+`'scheduled'`), `venue` field, `insertManyGames`, `deleteReplaceableLeagueGames` |
| `server/src/modules/leagues/leagues.validation.js`                | `bulkCreateLeagueGamesSchema`                                                                         |
| `server/src/modules/leagues/leagues.service.js`                   | `bulkCreateLeagueGamesForUser` — auth, season resolve, row validation, replace + insert               |
| `server/src/modules/leagues/leagues.controller.js` / `.routes.js` | `POST /leagues/:leagueId/games/bulk`                                                                  |

**Client**

| File                                                            | Role                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| `client/src/features/leagues/scheduleBuilder.js`                | Pure `buildRoundRobin` + `assignDates` — no React, no I/O |
| `client/src/features/leagues/components/ScheduleDraftTable.jsx` | Editable rows; table at `sm`+, cards on phones            |
| `client/src/features/leagues/pages/AdminLeagueSchedulePage.jsx` | The page — draft state, overflow gate, replace confirm    |
| `client/src/features/leagues/api/leaguesApi.js`                 | `bulkCreateGames`                                         |

## If you change this, know these

- **`'scheduled'` is a real status now.** Any query meaning "games that were
  played" must say `status: 'completed'` — this already caught
  `seed-demo-account.js` twice (see
  [`../demo-data-generation/TRACKER.md`](../demo-data-generation/TRACKER.md)
  Session 5).
- **Home/away uses a running per-team balance**, not round/position parity.
  Parity strands the circle-method anchor on one side; two attempts produced a
  5-home/0-away team before this was fixed. The test asserts the split for 13
  team counts — don't narrow it back to one.
- **The page fetches imperatively on purpose.** `useQuery` fails in admin test
  trees that lack a `QueryClientProvider` (PROJECT-KNOWLEDGE §8).
- **The draft is client-only.** Nothing persists until commit; the page warns
  on unload while rows exist.

## Deferred (not built)

Double round-robin and other formats · divisions/groups · playoff brackets ·
venue entities with capacity and a map (free text only today) · blackout dates ·
server-persisted or shareable drafts · notifications on publish.

Several of these are separate items on the league-admin idea board.

## Origin

Idea #1 in [`../league-admin-ideas.md`](../league-admin-ideas.md) — "Schedule
builder / fixture generator", the highest-leverage league-admin gap.
