# 20 Feature Ideas for League Administrators

> Audience: **league owners and league managers** (`AdminLeaguePage`, `LeagueManager`,
> `assertLeagueManagerOrOwner`) — the people who run a competition, not the players
> or public viewers who consume it.
>
> Companion to [`ideas.md`](./ideas.md) (segment-wide opportunities) and
> [`product-roadmap.md`](./product-roadmap.md). Nothing here is committed work —
> this is an idea board — except where an entry is marked ✅ **shipped**. Each entry
> notes roughly what it leans on in today's code
> (see [`PROJECT-KNOWLEDGE.md`](./PROJECT-KNOWLEDGE.md)).

---

## A. Running the competition

### 1. ✅ Schedule builder / fixture generator — **shipped**

Generate a full round-robin (or multi-round) fixture list for the active `Season`
from the league's `LeagueTeam` list, with configurable rounds, dates, and venues.
Today every league game is created one at a time. Biggest single time sink for an
admin at season start.

> **Built 2026-08-08.** Lives at `/admin/leagues/:leagueId/schedule`; games are
> created in bulk via `POST /leagues/:leagueId/games/bulk` as `status: 'scheduled'`.
> See [`schedule-builder/`](./schedule-builder/) for the feature docs.
> Venue is free text for now — the richer version is idea #2.

### 2. Venue & time-slot management

A league-level list of courts/venues with slot capacity, so the schedule builder
can avoid double-booking and each `Game` carries a venue. Feeds public league
pages ("where do we play this week?") for free.

### 3. Reschedule / postponement workflow

Move a game to a new date with a reason, keep an audit trail, and (once
notifications exist) tell both team managers. Currently a reschedule is an
untracked edit.

### 4. Season lifecycle wizard

Guided close-out of the current `Season` → archive standings/stats snapshot →
open the next one, with a checklist (all games finalised? any unresolved join
requests?). `Season` (`status: active|completed`) already exists; the admin-facing
ceremony around it does not.

### 5. Playoffs & bracket support

Seed a bracket from final `LeagueStandings`, then track knockout games as normal
league games with a `bracketRound`. Most real leagues end in a playoff; today
that's modelled as "just more regular-season games".

### 6. Divisions / conferences / age groups

Group `LeagueTeam`s into divisions with per-division standings and leaders. A
single flat standings table stops working the moment a league runs U14/U16/Senior
in one place.

### 7. Custom rules & tiebreakers per league

Configurable points-for-win/draw/loss, and an ordered tiebreaker chain (head-to-head,
point differential, points scored). `LeagueStandings` is materialized, so this is
mostly a config object read by the recompute path.

---

## B. Data quality & control

### 8. Stat-correction request queue

Team managers submit a correction ("that steal was mine, not #12"); the league admin
approves or rejects, and approval replays the fix into the game's embedded events +
triggers recompute. Right now a completed-game edit is an all-or-nothing manager
privilege with no paper trail.

### 9. League audit log

An append-only record of admin actions: roster moves, role grants, game edits,
score overrides, visibility flips. Directly answers "who changed this?" — the
question every league organiser eventually asks.

### 10. Data-completeness dashboard

One panel flagging games missing box scores, players with zero recorded minutes,
teams below a minimum roster size, and unfinalised games past their date. Turns
silent data rot into a to-do list.

### 11. Bulk roster import

CSV/paste import of teams and players (mirroring the existing CSV **export**),
with a dry-run preview and conflict resolution against existing `LeaguePlayer`
records. Season setup today is manual entry, player by player.

### 12. Duplicate player detection & merge

Find likely duplicate `LeaguePlayer` records (same name across teams/seasons) and
merge them, preserving stats. Unavoidable once a league runs multiple seasons and
players change teams.

---

## C. Communication & engagement

### 13. League announcements

Admin-authored, pinned posts scoped to the league — shown on the public league page
and in the league's Pulse slice. Uses the existing `Post` model with a new type;
gives admins a broadcast channel that isn't a group chat.

### 14. Notification centre for admins

Digest + inline alerts for join requests, unfinalised games, failed payments, and
correction requests. The follow system deliberately deferred notifications; admins
are the segment that most needs them.

### 15. Weekly league digest email

An automated Monday recap per league — results, updated standings, leaders,
upcoming fixtures — sent to team managers and (optionally) followers. Resend is
already wired; the content is all derivable from materialized stats.

### 16. Awards & season honours

Admin-selectable (or auto-suggested from `LeaguePlayerStats`) MVP, Defensive Player,
All-League team, plus weekly Player of the Week. Renders as shareable cards on the
public league page — engagement, at near-zero data cost.

---

## D. Money, access & scale

### 17. League registration & team fees

Let an admin collect per-team or per-player registration fees through the existing
resource-scoped Stripe setup, with a paid/unpaid roster view. Turns billing from a
platform cost into a tool the admin uses to run their league.

### 18. Delegated admin roles with scopes

Finer-grained grants than the current `LeagueManager` all-or-nothing role — e.g.
scorekeeper (finalise games only), registrar (rosters only), comms (announcements
only). Lets an owner hand off work without handing over the league.

### 19. Multi-league / organisation view

A single dashboard for an operator running several leagues (club, association,
franchise): cross-league standings health, upcoming fixtures, billing status.
Today each league is an island reached via `/admin/leagues/:id`.

### 20. Sponsor & branding slots

Per-league sponsor logos and a colour/branding theme applied to the public league,
team, and player pages plus shareable graphics. Sponsorship is how most amateur
leagues actually fund themselves — and it's a natural paid-tier lever.

---

## Rough prioritisation

| Tier                       | Ideas                   | Rationale                                                      |
| -------------------------- | ----------------------- | -------------------------------------------------------------- |
| **1 — highest leverage**   | ~~1~~ ✅, 4, 10, 14     | Remove the biggest manual/blind spots in running a season      |
| **2 — competition depth**  | 5, 6, 7, 8, 11          | Needed as soon as a league is bigger than one flat division    |
| **3 — engagement**         | 13, 15, 16, 20          | Cheap on data, high on perceived value                         |
| **4 — scale & commercial** | 2, 3, 9, 12, 17, 18, 19 | Matters when TSW runs many leagues, or is monetised per league |
