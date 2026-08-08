# Data-Completeness Dashboard — Design Spec

**Date:** 2026-08-09
**Source idea:** [`docs/league-admin-ideas.md`](../../league-admin-ideas.md) #10
**Branch:** `feature/data-completeness-dashboard`
**Status:** design agreed — awaiting user review before planning

---

## 1. Goal

Give league admins one panel that turns silent data rot into a to-do list: which
games never got finalised, which are missing stats, which players never appear,
and which teams can't field a side. Read-only in v1 — every item links to the
place where it gets fixed.

**Non-goal:** inline fixing. Deferred to v2 by explicit decision (D8).

---

## 2. Decisions

| #   | Decision                                                                              | Source                  |
| --- | ------------------------------------------------------------------------------------- | ----------------------- |
| D1  | New **tab** on `AdminLeaguePage`, not a standalone route                              | user                    |
| D2  | Both **league-level and team-level** checks; visible to league admins + team managers | user                    |
| D3  | **Current season only** (`league.currentSeasonId`)                                    | user                    |
| D4  | `scheduled` fixtures excluded until **48h past tip-off**                              | user                    |
| D5  | One-sided games: **only the tracked side** is ever flagged for missing stats          | user                    |
| D6  | All four original checks, plus three cosmetic ones, weighted by severity              | user                    |
| D6a | Player image = **claimed user's avatar**; check reframed as "unclaimed player"        | code (see §3.1)         |
| D7  | Minimum roster = **5 active players**                                                 | user                    |
| D8  | **Read-only** in v1; inline fixes explicitly deferred                                 | user                    |
| D9  | Items are **dismissible**; dismissed items move to a collapsed section at the bottom  | user                    |
| D10 | Everything is a **warning** — no error tier; severity orders, it doesn't alarm        | user                    |
| D11 | **Count per category**, no single health score                                        | user                    |
| D12 | Scoped per league + season; **not** a cross-league view in v1                         | user                    |
| D13 | "Zero minutes" reinterpreted as **zero recorded participation**                       | code (no minutes field) |
| D14 | Computed **on read**, no materialization                                              | see §7                  |

### D13 — why the check changed name

The idea said "players with zero recorded minutes". **There is no `minutes`
field in this codebase.** `LeaguePlayerStats` stores `gamesCount` plus box-score
counters (`ftm, fta, fg2m, fg2a, fg3m, fg3a, ast, oreb, dreb, reb, stl, blk,
tov, foul, points`) — no time tracking of any kind.

The intent survives: _someone on the roster who never actually appears_. That is
`gamesCount === 0` for the current season. Same signal, accurate name:
**"No recorded appearances"**.

### D7 — 5 is a new rule, not an existing one

No minimum roster size is enforced anywhere in the code today. Nothing prevents
tracking a game with fewer than 5 players. So this check is **advisory** — it
tells an admin their roster looks too small to field a side; it does not and
must not block anything. `activeRosterCount` already exists
(`leagues.service.js:853`) and counts `isActive` players — reused here.

---

## 3. The checks

Eight checks in three groups. Weights order the list; all render as warnings (D10).

### Group A — Games (league-level)

| Check                 | Condition                                                 | Severity | Why this weight                                                     |
| --------------------- | --------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| **Overdue game**      | `status: 'scheduled'` AND `scheduledAt < now - 48h`       | **High** | The game happened and nobody recorded it. Standings are wrong.      |
| **Stuck in progress** | `status: 'in_progress'` AND `scheduledAt < now - 48h`     | **High** | Same effect — an unfinalised game silently omits itself from stats. |
| **Missing box score** | `status: 'completed'` AND tracked side has zero events    | **High** | A "completed" game with no stats is actively misleading.            |
| **No venue**          | `status: 'scheduled'` AND `venue` empty AND in the future | Low      | Cosmetic; players don't know where to go, but data is intact.       |

**Severity rationale:** the three High checks share one property — **the
standings are wrong until fixed**. That's the line I drew. The Low check is
inconvenience, not incorrectness.

### Group B — Players (team-level)

| Check                       | Condition                                                                        | Severity   | Why this weight                                            |
| --------------------------- | -------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| **No recorded appearances** | `isActive` player, `gamesCount === 0` for the season, AND ≥1 completed team game | **Medium** | Either a roster ghost or missing stats. Ambiguous, so mid. |
| **Missing jersey number**   | `isActive` player with `jerseyNumber: null`                                      | Low        | Cosmetic, but blocks identifying a player in a box score.  |
| **Unclaimed player**        | `isActive` player with `claimedByUserId: null`                                   | Low        | No avatar, no follows, no shareable profile. See §3.1.     |

The "≥1 completed team game" guard is essential: before a team's first game,
_every_ player has zero appearances and none of it is a problem.

### 3.1 Player images — why "no photo" became "unclaimed"

There **is** a player image, but it is not stored on the player. The chain:

```
LeaguePlayer.claimedByUserId  →  User.avatar.url
  →  avatarUrl        (leagues.service.js:192, sanitizeLeaguePlayer)
  →  playerImage      (feed.service.js:195, buildPlayerCardSnapshot)
```

`playerImage` is a **feed-card snapshot field**, computed at card-build time. It
normalises two different sources — standalone players use `player.image`, league
players use `avatarUrl` (the TSW-005 comment at `feed.service.js:191` documents
exactly this split).

Consequences for this dashboard:

- `LeaguePlayer` itself has **no image field** —
  `leagueId, leagueTeamId, displayName, jerseyNumber, position, isActive, claimedByUserId`.
- A league player's picture is **the claimed account's avatar**.
- An **unclaimed** player therefore cannot have an image at all. There is nothing
  for an admin to upload.

So "player has no photo" is not an admin-fixable data gap — it is a **proxy for
being unclaimed**. Flagging it as a missing photo would be misleading twice
over: it implies the admin can fix it, and it hides the real, more useful fact.

The check is therefore **"Unclaimed player"**, severity **Low**. It is genuinely
worth surfacing — unclaimed players have no avatar on cards, can't be followed,
and have no public profile — but it is resolved by _the player claiming their
account_, not by admin data entry. The item's `detail` says so.

> A claimed player who simply hasn't set an avatar is **not** flagged. That's a
> personal account setting, not league data, and no admin can act on it.

### Group C — Teams (team-level)

| Check                | Condition                       | Severity   | Why this weight                                 |
| -------------------- | ------------------------------- | ---------- | ----------------------------------------------- |
| **Roster too small** | fewer than 5 `isActive` players | **Medium** | Blocks play, but is expected early in a season. |
| **No logo**          | `LeagueTeam.logo` is null       | Low        | Cosmetic; affects public pages only.            |

### Ordering

Sort by severity (High → Medium → Low), then by date/name within a tier.
Dismissed items always sort last regardless of severity (D9).

---

## 4. The 48-hour rule (D4)

The single most important design constraint. **Without it this feature is
useless**: an admin who builds a 60-game season with the schedule builder would
open the dashboard and see 60 warnings for games that haven't happened yet.

Rules:

- A `scheduled` game is **invisible** to the dashboard until `scheduledAt + 48h`.
- After that it becomes an **Overdue game** (High).
- `in_progress` follows the same clock — a game left open mid-tracking is just
  as invisible in standings as one never started.
- Future games are only ever eligible for the **No venue** check (Low), because
  that one is actionable _before_ tip-off and pointless after.

Threshold lives in one exported constant, not scattered literals:

```js
const OVERDUE_AFTER_MS = 48 * 60 * 60 * 1000;
```

---

## 5. Dismissals (D9)

Dismissal needs persistence, so this is the one part that isn't a pure read.

**New model `LeagueDataIssueDismissal`** (new file
`server/src/modules/leagues/dataCompleteness.repository.js`):

```js
{
  leagueId:    ObjectId, ref League,     required, index
  seasonId:    ObjectId, ref Season,     required, index
  issueKey:    String,                   required   // stable identity, see below
  dismissedByUserId: ObjectId, ref User, required
  note:        String, default null                 // optional "why"
}
// unique compound index: { leagueId, seasonId, issueKey }
```

### Issue keys must be stable

A dismissal is only meaningful if the item it dismissed can be recognised again
next time. Key format:

```
<checkType>:<targetId>
```

e.g. `overdue_game:6a5c...`, `roster_too_small:6a77...`,
`no_appearances:6b12...`.

**Deliberately excluded from the key:** anything mutable. If an admin dismisses
"no venue" for a game and then the game is rescheduled, the key must not change
— the dismissal should persist, because the admin's judgement was about _that
game_, not that date.

### Resurfacing rule

A dismissal is **permanent for that season** and does not expire. Rationale: the
alternative — expiry — means an admin re-dismisses the same known-fine item
forever, which trains them to ignore the panel. Season scoping already provides
a natural reset: next season, the check runs fresh.

Dismissals are **not deleted** when an issue resolves itself. They're cheap, and
keeping them means a re-occurring issue stays dismissed.

**Auth:** dismissing requires `assertLeagueManagerOrOwner`. Team managers can
_see_ team-level issues (D2) but only league admins may dismiss — a dismissal is
a league-wide judgement.

---

## 6. API

```
GET  /leagues/:leagueId/data-completeness
POST /leagues/:leagueId/data-completeness/dismissals
DELETE /leagues/:leagueId/data-completeness/dismissals/:issueKey
```

**GET response:**

```json
{
  "seasonId": "6a77...",
  "seasonName": "Spring 2026",
  "generatedAt": "2026-08-09T10:00:00.000Z",
  "counts": { "high": 3, "medium": 5, "low": 12, "dismissed": 2 },
  "categories": [
    {
      "key": "overdue_game",
      "label": "Overdue games",
      "severity": "high",
      "description": "Played more than 48 hours ago but never finalised.",
      "items": [
        {
          "issueKey": "overdue_game:6a5c...",
          "label": "Hoops at Ballers",
          "detail": "Scheduled 3 days ago",
          "href": "/admin/games/6a5c...",
          "dismissed": false
        }
      ]
    }
  ]
}
```

Every item carries an `href` — read-only means the panel's whole job is routing
you to the fix (D8). `counts` gives the per-category numbers (D11).

**No active season →** `200` with empty categories and an explanatory
`seasonId: null`, **not** a 400. An admin without a season has nothing wrong with
their data; erroring would be misleading.

**Auth:** GET requires league manager/owner **or** team manager (D2). Team
managers receive only their own team's items in Groups B and C, and the full
Group A list (games are league-wide). Enforced in the service, per house
convention — not middleware.

---

## 7. Computation (D14)

Computed **on read**, not materialized. Justification:

- Bounded input: one league, one season, ~16 teams (user-stated ceiling).
- Freshness matters — a stale completeness panel is worse than none.
- Materializing adds an invalidation problem to every game/roster/stat write,
  which is exactly the coupling that makes #10 XS instead of M.

Implementation: a handful of `find` + `countDocuments` queries against existing
indexes (`leagueId`, `seasonId`, `status` are all indexed), then assembled in
JS. `LeaguePlayerStats` is already materialized per season, so the appearance
check is a lookup, not an aggregation over games.

Re-evaluate if a league ever exceeds ~50 teams; noted, not built for.

---

## 8. Client

**New tab** `completeness` on `AdminLeaguePage` (D1), joining the existing
`TABS` array alongside games/teams/requests/settings.

| File                                                                    | Role                                      |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| `client/src/features/leagues/components/DataCompletenessPanel.jsx`      | The panel: categories, counts, dismissals |
| `client/src/features/leagues/components/DataCompletenessPanel.test.jsx` | Component tests                           |
| `client/src/features/leagues/api/leaguesApi.js`                         | `fetchDataCompleteness`, dismiss/restore  |
| `client/src/features/leagues/pages/AdminLeaguePage.jsx`                 | Tab registration + lazy fetch on select   |

**Data fetching:** `useState`/`useEffect`, following `AdminLeaguePage`'s existing
tab pattern and the constraint recorded in PROJECT-KNOWLEDGE §8 — admin test
trees lack a `QueryClientProvider`, so `useQuery` fails there. Same reason the
schedule builder fetches imperatively.

**Fetch on tab activation**, not page load — matching how `settings` and
`requests` already behave (`AdminLeaguePage.jsx:191`, `:199`). No cost for
admins who never open the tab.

**Layout:** severity-ordered category cards, each collapsible with a count
badge. Dismissed items in a collapsed **"Dismissed (n)"** section at the bottom
(D9), each with a restore control. Mobile-first: cards stack; no table.

**Empty state** is a real design case, not an afterthought — a clean league
should feel _reassuring_, not blank. "Everything looks complete" with the
season name.

**Palette:** original slate/sky-blue `PageHeader` family (PROJECT-KNOWLEDGE
§9.1), consistent with the rest of `AdminLeaguePage`.

---

## 9. Testing

**Server (Jest + Supertest)** — house pattern: unit-test the service with mocked
repositories, drive routes via Supertest with a mocked service.

| #   | Test                                                                                      |
| --- | ----------------------------------------------------------------------------------------- |
| S1  | scheduled game 47h old → **not** flagged                                                  |
| S2  | scheduled game 49h old → flagged overdue **(the D4 boundary)**                            |
| S3  | in_progress game 49h old → flagged                                                        |
| S4  | one-sided completed game, untracked side empty → **not** flagged (D5)                     |
| S5  | one-sided completed game, tracked side empty → flagged                                    |
| S6  | team with 4 active players → flagged; 5 → not (D7)                                        |
| S7  | inactive players don't count toward the roster minimum                                    |
| S8  | player with 0 appearances but team has no completed games → **not** flagged               |
| S8a | unclaimed active player → flagged; claimed player with no avatar → **not** flagged (§3.1) |
| S9  | dismissed issue returned with `dismissed: true`, sorted last                              |
| S10 | dismissal is idempotent (same key twice → one record)                                     |
| S11 | non-manager → 403                                                                         |
| S12 | team manager sees only their own team's items                                             |
| S13 | no active season → 200, empty, `seasonId: null`                                           |
| S14 | integration: full GET round trip                                                          |

S1/S2 straddle the 48h boundary deliberately — an off-by-one there silently
either floods or hides the panel.

**Client (Vitest + RTL)** — `fireEvent`, not `user-event` (not a dependency).

| #   | Test                                             |
| --- | ------------------------------------------------ |
| C1  | renders categories ordered by severity           |
| C2  | per-category counts render                       |
| C3  | dismiss moves an item into the dismissed section |
| C4  | restore moves it back                            |
| C5  | empty state when nothing is wrong                |
| C6  | each item links to its fix location              |

---

## 10. Risks

| Risk                                                    | Mitigation                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Panel cries wolf → admins ignore it**                 | The 48h rule (D4), the "≥1 completed game" guard, and dismissals all exist for this |
| Dismissals hide real problems                           | Dismissed items remain visible in a collapsed section with a count, never deleted   |
| Issue keys drift → dismissals resurface                 | Keys exclude all mutable fields; asserted by test                                   |
| "5 players" contradicts a league's real rules           | Advisory only, never blocking; per-league config is the natural v2                  |
| Check semantics diverge from reality (as "minutes" did) | Every check named for what it actually measures, not what we wish we measured       |

---

## 11. Deferred

Inline fix actions (D8) · per-league configurable thresholds · cross-league
operator view (D12 — that's idea #19) · historic-season audit (D3) · export to
CSV · notifications when new issues appear (needs idea #14) · a single health
score (D11).
