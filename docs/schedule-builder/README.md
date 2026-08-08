# Schedule Builder / Bulk Game Creation

Bulk creation of league games for league owners and managers — replacing the
current one-game-at-a-time flow.

**Status:** ✅ complete — 14/14 tasks, server 592/592, lint + build clean, manually verified
**Branch:** `feature/schedule-builder`
**Started / finished:** 2026-08-08

## Documents

| Doc                                                                                                                        | Purpose                            |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| [`STATUS-DASHBOARD.md`](./STATUS-DASHBOARD.md)                                                                             | At-a-glance progress               |
| [`IMPLEMENTATION-TRACKER.md`](./IMPLEMENTATION-TRACKER.md)                                                                 | Task-by-task tracker               |
| [`../superpowers/specs/2026-08-08-schedule-builder-design.md`](../superpowers/specs/2026-08-08-schedule-builder-design.md) | Full design spec (source of truth) |

## One-paragraph summary

An admin opens `/admin/leagues/:leagueId/schedule`, picks participating teams,
game-days and time slots, and either generates a single round-robin draft or
starts from an empty list. The draft is an editable client-side table (swap
sides, retime, re-venue, add/remove rows) with byes shown but never persisted
and slot-overflow explicitly flagged for acknowledgement. Committing posts the
whole set to a new bulk endpoint that validates everything, optionally replaces
existing not-yet-started games, and inserts them in one go.

## Origin

Idea #1 in [`../league-admin-ideas.md`](../league-admin-ideas.md) — "Schedule
builder / fixture generator", the highest-leverage league-admin gap.
