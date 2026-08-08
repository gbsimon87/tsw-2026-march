# Data-Completeness Dashboard

An admin panel that flags incomplete league data for the current season —
unfinalised games, missing box scores, roster gaps — so silent data rot becomes
a to-do list.

**Status:** 🟨 in design — spec written, awaiting review
**Branch:** `feature/data-completeness-dashboard`
**Origin:** Idea #10 in [`../league-admin-ideas.md`](../league-admin-ideas.md),
rated the cheapest × highest-leverage next pick.

## Documents

| Doc                                                                                                                                              | Purpose                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| [`STATUS-DASHBOARD.md`](./STATUS-DASHBOARD.md)                                                                                                   | Progress, decision log, findings, risks    |
| [`../superpowers/specs/2026-08-09-data-completeness-dashboard-design.md`](../superpowers/specs/2026-08-09-data-completeness-dashboard-design.md) | Full design spec — checks, severities, API |

## The seven checks

| Check                   | Level  | Severity |
| ----------------------- | ------ | -------- |
| Overdue game            | League | High     |
| Stuck in progress       | League | High     |
| Missing box score       | League | High     |
| No recorded appearances | Team   | Medium   |
| Roster too small (< 5)  | Team   | Medium   |
| Missing jersey number   | Team   | Low      |
| No venue                | League | Low      |

**High** means the standings are wrong until it's fixed. That's the line — the
severity tiers aren't vibes, they're "does this corrupt the competition record".

## The two rules that matter most

- **48-hour grace.** A `scheduled` fixture is invisible to the dashboard until
  48h past tip-off. Without this, building a 60-game season with the schedule
  builder would immediately produce 60 warnings, and admins would learn to
  ignore the panel on day one.
- **Dismissals are permanent for the season.** They move to a collapsed section
  rather than disappearing, and are never deleted — a re-occurring issue stays
  dismissed. Next season resets naturally.

## Before you extend this

Two checks in the original idea described fields that **do not exist**:

- there is **no `minutes` field** anywhere — `LeaguePlayerStats` tracks
  `gamesCount` and box-score counters only;
- there is **no photo field** on `LeaguePlayer`.

Both were caught by reading the schema during design. If you add a check, verify
the field exists first and name the check after what it actually measures.

Related: the **5-player minimum is not enforced anywhere in the code** — this
panel is the first thing to assert it, and it does so advisorily. Don't mistake
it for a constraint.
