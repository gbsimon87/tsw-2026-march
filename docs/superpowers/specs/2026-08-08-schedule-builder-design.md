# Schedule Builder / Bulk Game Creation — Design

**Date:** 2026-08-08
**Branch:** `feature/schedule-builder`
**Source idea:** [`docs/league-admin-ideas.md`](../../league-admin-ideas.md) #1
**Audience:** league owners and league managers

---

## 1. Problem

League games are created **one at a time** via `AdminNewLeagueGamePage` (pick home
team → pick away team → set date → submit). A 16-team league running a single
round-robin needs 120 games. At season start this is the single biggest manual
time sink for a league admin, and it is frequently done on a phone.

## 2. What we're building

A **bulk league-game creation tool** — not a general fixture engine. One page
where an admin assembles a list of games and commits them in a single action.

Two entry paths feed **the same editable draft**:

1. **Suggest pairings** — pick participating teams, game-days, and time slots →
   generates a single round-robin draft (every team plays every other team once).
2. **Start empty** — add rows by hand.

Either way the admin lands in one editable table and can add, remove, swap sides,
retime, or re-venue any row before committing.

**Explicit non-goals for v1:** double round-robin, divisions/groups, playoff
brackets, venue entities (free text only), blackout dates, server-persisted
drafts, notifications. The suggestion rule is fixed at single round-robin;
additional formats are a deliberate future extension.

## 3. Key decisions

| #   | Decision                                                                             | Rationale                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Draft is **client-only** state; nothing persists until commit                        | Cheap, instant interaction; a draft is built in one sitting                                                                                       |
| D2  | Suggestion logic is **client-side pure functions**                                   | No server round-trip while the admin adjusts slots; unit-testable with Vitest. Trade-off: not reusable by a future API consumer — accepted for v1 |
| D3  | **One bulk endpoint**, all-or-nothing                                                | Avoids N sequential creates and half-created seasons                                                                                              |
| D4  | Active `Season` **required** to generate or commit                                   | Matches existing league-game rules; standings/stats are season-keyed                                                                              |
| D5  | Regeneration **replaces only `scheduled` games with no events** in the active season | Never destroys in-progress or completed games                                                                                                     |
| D6  | Byes are **shown, never persisted**                                                  | Odd team counts are normal; a bye is informational, not a `Game`                                                                                  |
| D7  | Slot overflow is **explicit and acknowledged**, never silent                         | Silent date shuffling confuses players; admin must see and accept it                                                                              |
| D8  | Home/away **alternates** across the round-robin, plus a per-row swap button          | Roughly even home/away split without removing admin control                                                                                       |
| D9  | Auth via existing **`assertLeagueManagerOrOwner`**                                   | Reuses the canonical gate (§4 of PROJECT-KNOWLEDGE) rather than a fresh check                                                                     |
| D10 | Venue is a **free-text string on `Game`**                                            | Additive field, no migration; venue entities are a separate future idea                                                                           |

## 4. User flow

```
/admin/leagues/:leagueId  →  "Build schedule"
        ↓
/admin/leagues/:leagueId/schedule
        ↓
 ┌ Step 1: Teams ──────────────────────────────┐
 │ multi-select from league's LeagueTeams      │
 │ (all selected by default)                   │
 └─────────────────────────────────────────────┘
        ↓
 ┌ Step 2: Days & slots ───────────────────────┐
 │ start date; weekday(s) (e.g. Sat + Sun);    │
 │ time slots per game-day (10:00, 11:30, …);  │
 │ default venue (free text, per-row editable) │
 └─────────────────────────────────────────────┘
        ↓  [Suggest pairings]      [Start empty]
        ↓
 ┌ Step 3: Draft table ────────────────────────┐
 │ row: home ⇄ away | date+time | venue | ✕    │
 │ bye rows shown, greyed, non-committable     │
 │ overflow warning banner if slots ran out    │
 │ + Add game                                  │
 └─────────────────────────────────────────────┘
        ↓  [Create N games]  (+ replace-existing confirm if applicable)
        ↓
 back to /admin/leagues/:leagueId
```

Mobile-first: the draft table collapses to stacked cards below `sm`. A modal was
rejected — a 40-row editable list does not fit one on a phone.

## 5. Generation algorithm

`buildRoundRobin(teamIds)` — standard circle method:

- Odd team count → insert a `BYE` sentinel, so each round has one bye row.
- `n` teams → `n-1` rounds (or `n` rounds with a bye), `floor(n/2)` games per round.
- Home/away alternates per team across rounds (D8).

`assignDates(rounds, { startDate, weekdays, slots })`:

- Walk forward from `startDate` hitting each configured weekday in order.
- Fill that game-day's slots in order; when slots are exhausted, move remaining
  games to the **next available game-day** and mark each moved row
  `overflowed: true`.
- Return `{ rows, overflowCount }` so the UI can render the acknowledgement banner
  (D7). Commit is blocked until the admin either acknowledges the banner or adds
  slots and regenerates.

Both functions are pure, live in
`client/src/features/leagues/scheduleBuilder.js`, and are unit-tested.

## 6. API

**New endpoint**

```
POST /api/v1/leagues/:leagueId/games/bulk
```

Request:

```json
{
  "replaceExisting": false,
  "games": [
    {
      "homeLeagueTeamId": "…",
      "awayLeagueTeamId": "…",
      "scheduledAt": "2026-09-05T10:00:00.000Z",
      "venue": "Court 1"
    }
  ]
}
```

Validation (Zod, at the controller):

- `games` non-empty, **max 200**.
- `homeLeagueTeamId !== awayLeagueTeamId` per row.
- every team id resolves to a `LeagueTeam` in **this** league.
- `scheduledAt` a valid ISO date.
- `venue` optional string, max 120 chars.

Service (`leagues.service.js` or a new `schedule.service.js` helper):

1. `assertLeagueManagerOrOwner(leagueId, userId)`
2. resolve the league's active `Season`; `ApiError(400)` if none.
3. if `replaceExisting`: delete league games in that season where
   `status === 'scheduled'` **and** the game has no recorded events.
4. `insertMany` the full validated set.

Atomicity: validate everything first, then delete + `insertMany` back-to-back.
The codebase uses no Mongo transactions today, so a partial write is only
possible on an infra failure mid-insert; the replace semantics make a retry
safe.

Response: `{ games: [...], created: N, replaced: M }`.

## 7. Data model change

One additive field on the `Game` schema (`games.repository.js`):

```js
venue: { type: String, trim: true, maxlength: 120 },
```

No migration — absent on existing documents, rendered as blank. `scheduledAt`,
`status`, `seasonId`, and the league team refs already exist and are reused
unchanged.

## 8. Files

**Server**

| File                                               | Change                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `server/src/modules/games/games.repository.js`     | add `venue`; `insertManyLeagueGames`, `deleteReplaceableScheduledGames` |
| `server/src/modules/leagues/leagues.routes.js`     | `POST /:leagueId/games/bulk`                                            |
| `server/src/modules/leagues/leagues.controller.js` | `bulkCreateLeagueGames`                                                 |
| `server/src/modules/leagues/leagues.service.js`    | `bulkCreateLeagueGamesForUser`                                          |
| `server/src/modules/leagues/leagues.validation.js` | `bulkCreateLeagueGamesSchema`                                           |

**Client**

| File                                                            | Change                                           |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `client/src/features/leagues/scheduleBuilder.js`                | **new** — pure `buildRoundRobin` / `assignDates` |
| `client/src/features/leagues/pages/AdminLeagueSchedulePage.jsx` | **new** — the builder page                       |
| `client/src/features/leagues/components/ScheduleDraftTable.jsx` | **new** — editable rows / mobile cards           |
| `client/src/features/leagues/api/leaguesApi.js`                 | `bulkCreateGames`                                |
| `client/src/app/router/AppRouter.jsx`                           | lazy route `/admin/leagues/:leagueId/schedule`   |
| `client/src/features/leagues/pages/AdminLeaguePage.jsx`         | "Build schedule" entry point                     |

Styling follows the **existing slate/sky-blue `PageHeader` palette** — admin pages
are outside the scoreboard redesign (§9.1 of PROJECT-KNOWLEDGE); the new palette
is not spread opportunistically.

## 9. Testing

**Server (Jest + Supertest)**

- unit: bulk service — auth rejection for a non-manager, no-active-season 400,
  cross-league team id rejection, self-pairing rejection, replace deletes only
  eventless `scheduled` games, `>200` rejected.
- integration: full `POST /leagues/:id/games/bulk` round trip incl. replace.

**Client (Vitest + RTL)**

- unit `scheduleBuilder.js`: even/odd team counts, correct game count
  (`n(n-1)/2`), every pair exactly once, bye rows present for odd counts,
  home/away alternation, slot fill order, overflow flagging.
- component: draft table edit/remove/swap; commit disabled while an
  unacknowledged overflow exists; bye rows excluded from the committed payload.

## 10. Risks

| Risk                                            | Mitigation                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Admin accidentally wipes a schedule via replace | Explicit confirm naming the count to be deleted; completed/in-progress games are never eligible      |
| Client-only draft lost on reload                | Accepted (D1); the page warns before navigating away with unsaved rows                               |
| Timezone drift on `scheduledAt`                 | Build dates in the browser's local zone, send ISO/UTC, matching the existing single-game create path |
| 120-row payload on a phone                      | Well inside the 200 cap; a single request, not 120                                                   |
