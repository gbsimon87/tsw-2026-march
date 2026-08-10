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
>
> **Ordered easiest → hardest to build.** The original idea numbers are kept as
> stable IDs (other docs link to "idea #2"), so the numbering below is
> deliberately out of sequence. Difficulty is _engineering_ effort against
> today's code — not product value. For value, see
> [Value vs. effort](#value-vs-effort) at the end; the best next picks are the
> ones that are cheap **and** high-leverage.

---

## Shipped

### 1. ✅ Schedule builder / fixture generator — **shipped**

Generate a full round-robin (or multi-round) fixture list for the active `Season`
from the league's `LeagueTeam` list, with configurable rounds, dates, and venues.
Today every league game is created one at a time. Biggest single time sink for an
admin at season start.

> **Built 2026-08-08.** Lives at `/admin/leagues/:leagueId/schedule`; games are
> created in bulk via `POST /leagues/:leagueId/games/bulk` as `status: 'scheduled'`.
> See [`schedule-builder/`](./schedule-builder/) for the feature docs.
> Venue is free text for now — the richer version is idea #2.

Listed separately rather than in an effort tier: ranking finished work by
difficulty tells you nothing. It shipped at roughly **M** if you need a
calibration point for the estimates below.

---

## Effort tiers at a glance

| Tier                 | Ideas            | What makes them this size                                                        |
| -------------------- | ---------------- | -------------------------------------------------------------------------------- |
| **XS — days**        | ~~10~~ ✅, 16, 3 | Read existing materialized data, or add one field. No new model.                 |
| **S — ~1 week**      | 7, 11, 9, 15     | One new model or config object, plus an admin screen. Established patterns.      |
| **M — 2–3 weeks**    | 2, 13, 4, 12, 18 | New model _and_ it changes an existing flow, or needs careful data handling.     |
| **L — a month+**     | 14, 17, 6, 5     | New subsystem, or it reshapes standings/billing — the two riskiest areas.        |
| **XL — multi-month** | 19, 20, 8        | Cross-cutting. Touches most of the app, or needs infrastructure that isn't here. |

---

## XS — cheapest to build

### 10. ✅ Data-completeness dashboard — **shipped**

One panel flagging games missing box scores, players with zero recorded minutes,
teams below a minimum roster size, and unfinalised games past their date. Turns
silent data rot into a to-do list.

> **Built 2026-08-09** as the **Data health** tab on `AdminLeaguePage`, backed by
> `GET /leagues/:leagueId/data-completeness`. Nine checks across three severity
> tiers, with dismissible items. See [`data-completeness/`](./data-completeness/).
>
> Two checks changed on contact with the schema: **there is no `minutes` field**
> (became "no recorded appearances"), and **player photos come from the claiming
> user's account** (became "unclaimed player"). It also needed one small model —
> `LeagueDataIssueDismissal` — so it wasn't quite the pure read predicted below.

### 16. Awards & season honours

Admin-selectable (or auto-suggested from `LeaguePlayerStats`) MVP, Defensive Player,
All-League team, plus weekly Player of the Week. Renders as shareable cards on the
public league page — engagement, at near-zero data cost.

**Why it's cheap:** the auto-suggest side is a sort over `LeaguePlayerStats`,
which is already materialized. The stored result is a small document
(`leagueId`, `seasonId`, award, `leaguePlayerId`). Card rendering follows the
existing `player_card` / `team_card` post types.

### 3. Reschedule / postponement workflow

Move a game to a new date with a reason, keep an audit trail, and (once
notifications exist) tell both team managers. Currently a reschedule is an
untracked edit.

**Why it's cheap:** date editing already exists on `Game`. The addition is a
reason string plus an append-only history array on the game document. Notifying
managers is the expensive half — but it's optional, and cleanly deferrable to
#14.

---

## S — small, well-understood

### 7. Custom rules & tiebreakers per league

Configurable points-for-win/draw/loss, and an ordered tiebreaker chain (head-to-head,
point differential, points scored). `LeagueStandings` is materialized, so this is
mostly a config object read by the recompute path.

**Why it's this size:** confirmed — recompute is a single guarded function
(`recomputeLeagueAggregates` in `leagues.service.js`), so there's exactly one
place to read the config. The work is a settings object on `League`, an admin
form, and a re-sort. The care needed is in _testing_ the tiebreaker chain, not
in wiring it.

### 11. Bulk roster import

CSV/paste import of teams and players (mirroring the existing CSV **export**),
with a dry-run preview and conflict resolution against existing `LeaguePlayer`
records. Season setup today is manual entry, player by player.

**Why it's this size:** the `export` module gives you the column contract for
free, and the schedule builder just established the draft-then-commit pattern
this should reuse. Real cost is conflict resolution UI — deciding what "this
player might already exist" looks like to an admin.

### 9. League audit log

An append-only record of admin actions: roster moves, role grants, game edits,
score overrides, visibility flips. Directly answers "who changed this?" — the
question every league organiser eventually asks.

**Why it's this size:** the model is trivial (actor, action, target, timestamp,
diff). The cost is _breadth_ — you must call it from every admin mutation in
`leagues.service.js` and `games.service.js`, and any path you forget is an
invisible gap. Mechanical, but wide.

### 15. Weekly league digest email

An automated Monday recap per league — results, updated standings, leaders,
upcoming fixtures — sent to team managers and (optionally) followers. Resend is
already wired; the content is all derivable from materialized stats.

**Why it's this size:** cheaper than it looks — `services/email.service.js`
already exists and is tested. Content is a read over materialized data. The
genuinely missing piece is a **scheduled job runner**, which the app doesn't
have today; that, plus unsubscribe handling, is the real work.

> "Upcoming fixtures" only became possible with the schedule builder. Before it,
> there was nothing future-dated to put in a digest.

---

## M — needs a new model and touches existing flows

### 2. Venue & time-slot management

A league-level list of courts/venues with slot capacity, so the schedule builder
can avoid double-booking and each `Game` carries a venue. Feeds public league
pages ("where do we play this week?") for free.

**Why it's this size:** partly begun — `Game.venue` shipped with the schedule
builder as free text. This promotes it to a real entity with capacity, and adds
double-booking detection to the generator. Includes a migration from existing
free-text venue strings.

### 13. League announcements

Admin-authored, pinned posts scoped to the league — shown on the public league page
and in the league's Pulse slice. Uses the existing `Post` model with a new type;
gives admins a broadcast channel that isn't a group chat.

**Why it's this size — larger than it reads:** the `Post` schema has **no
`leagueId` and no scoping field at all** (it's `creatorUserId` + type + card
payloads). So this isn't "add an enum value" — it needs league scoping on posts,
plus pinning, plus feed-query changes wherever posts are read. Check this
assumption before scoping the work.

### 4. Season lifecycle wizard

Guided close-out of the current `Season` → archive standings/stats snapshot →
open the next one, with a checklist (all games finalised? any unresolved join
requests?). `Season` (`status: active|completed`) already exists; the admin-facing
ceremony around it does not.

**Why it's this size:** the state machine exists; the risk is that rollover is
destructive-adjacent and touches `currentSeasonId`, standings, and stats
snapshots together. Wants careful transactional thinking and a dry-run — not
much code, but code you cannot get wrong.

### 12. Duplicate player detection & merge

Find likely duplicate `LeaguePlayer` records (same name across teams/seasons) and
merge them, preserving stats. Unavoidable once a league runs multiple seasons and
players change teams.

**Why it's this size:** matching heuristics are easy; **merging is irreversible
and rewrites historical stats**. Needs a preview, an undo path or a backup, and
a rewrite of embedded game events referencing the losing record. Small surface,
high blast radius.

### 18. Delegated admin roles with scopes

Finer-grained grants than the current `LeagueManager` all-or-nothing role — e.g.
scorekeeper (finalise games only), registrar (rosters only), comms (announcements
only). Lets an owner hand off work without handing over the league.

**Why it's this size:** authorization here is resource + league-role via
`assert*` helpers, **not** middleware RBAC — so scopes must be threaded through
every existing `assertLeagueManagerOrOwner` call site individually. A security
boundary, so it needs adversarial tests, not just happy-path ones.

---

## L — substantial subsystems

### 14. Notification centre for admins

Digest + inline alerts for join requests, unfinalised games, failed payments, and
correction requests. The follow system deliberately deferred notifications; admins
are the segment that most needs them.

**Why it's this size:** it's the notification _subsystem_ the app has so far
avoided — model, fan-out, read/unread, preferences, delivery, and emitters
across billing, leagues, and games. Several other ideas (#3, #8, #15) quietly
assume it exists, which makes it a common dependency.

### 17. League registration & team fees

Let an admin collect per-team or per-player registration fees through the existing
resource-scoped Stripe setup, with a paid/unpaid roster view. Turns billing from a
platform cost into a tool the admin uses to run their league.

**Why it's this size:** billing today charges _the admin for the platform_. This
inverts it — the admin collects from _players_ — which likely means Stripe
Connect, payouts, refunds, and tax handling. Money plus a new Stripe surface;
budget accordingly.

### 6. Divisions / conferences / age groups

Group `LeagueTeam`s into divisions with per-division standings and leaders. A
single flat standings table stops working the moment a league runs U14/U16/Senior
in one place.

**Why it's this size:** standings are materialized as a flat `rows` array per
league+season. Divisions add a grouping dimension through recompute, every
standings read, the public league page, and the schedule builder (teams should
mostly play within a division).

### 5. Playoffs & bracket support

Seed a bracket from final `LeagueStandings`, then track knockout games as normal
league games with a `bracketRound`. Most real leagues end in a playoff; today
that's modelled as "just more regular-season games".

**Why it's this size:** bracket progression is genuinely stateful — a result
must advance a winner into a game whose participants weren't known when it was
created. That's a new scheduling concept, not a variation on round-robin, and it
must be excluded from regular-season standings.

---

## XL — cross-cutting or infrastructure-heavy

### 19. Multi-league / organisation view

A single dashboard for an operator running several leagues (club, association,
franchise): cross-league standings health, upcoming fixtures, billing status.
Today each league is an island reached via `/admin/leagues/:id`.

**Why it's this size:** requires an **Organisation tenancy layer above League**
— a concept the data model doesn't have. Ownership, permissions, billing, and
routing all currently terminate at the league. Best treated as its own project.

### 20. Sponsor & branding slots

Per-league sponsor logos and a colour/branding theme applied to the public league,
team, and player pages plus shareable graphics. Sponsorship is how most amateur
leagues actually fund themselves — and it's a natural paid-tier lever.

**Why it's this size:** storing sponsors is trivial; _theming_ is not. Per-league
colours must flow through every public page and every shareable graphic, against
a design system with two coexisting palettes already (PROJECT-KNOWLEDGE §9.1).
Wide surface, heavy design involvement.

### 8. Stat-correction request queue

Team managers submit a correction ("that steal was mine, not #12"); the league admin
approves or rejects, and approval replays the fix into the game's embedded events +
triggers recompute. Right now a completed-game edit is an all-or-nothing manager
privilege with no paper trail.

**Why it's hardest:** it needs a request model, an approval workflow, **and** the
ability to replay a targeted edit into embedded game events and recompute
downstream stats — the one place where a bug silently corrupts historical
records. It also assumes #9 (audit log) and #14 (notifications). Do those first.

---

## Value vs. effort

Effort order alone would have you build the cheapest thing next, which isn't
always right. Cross-referencing the original leverage tiers:

| Idea                       | Effort | Leverage | Read                                        |
| -------------------------- | ------ | -------- | ------------------------------------------- |
| ~~10 · Completeness dash~~ | XS     | High     | ✅ **shipped 2026-08-09** — Data health tab |
| 16 · Awards                | XS     | Medium   | Cheap engagement win                        |
| 3 · Reschedule             | XS     | Medium   | Natural follow-on to the scheduler          |
| 7 · Tiebreakers            | S      | Medium   | Do when a league hits a real tie            |
| 11 · Roster import         | S      | High     | **Strong pick** — pairs with the scheduler  |
| 15 · Digest email          | S      | Medium   | Blocked on a job runner                     |
| 4 · Season wizard          | M      | High     | High value, needs care                      |
| 14 · Notifications         | L      | High     | Unblocks #3, #8, #15 — a dependency         |
| 8 · Corrections            | XL     | Medium   | Do last; depends on #9 + #14                |

**Suggested order:** ~~10~~ ✅ → **11 (next)** → 3 → 4, then 14 once several ideas are waiting on it.

Two caveats on this ranking. Effort estimates are from reading today's code, not
from spikes — #13 in particular was re-rated from "easy" to M once the `Post`
schema turned out to have no league scoping, and others may move the same way
under scrutiny. And difficulty is not sequencing: #14 is L but unblocks three
cheaper ideas, so building it earlier than its tier suggests may well be correct.
