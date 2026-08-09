# Data Health (Data-Completeness Dashboard)

An admin panel that audits a league's current season and lists incomplete data —
unfinalised games, missing box scores, roster gaps — so silent data rot becomes
a to-do list.

**Status:** ✅ shipped — 11/11 tasks, server 651/651, client baseline unchanged, lint + build clean
**Branch:** `feature/data-completeness-dashboard` (not yet merged to `dev` at time of writing)
**Built:** 2026-08-09
**Origin:** Idea #10 in [`../league-admin-ideas.md`](../league-admin-ideas.md)

## Documents

| Doc                                                                                                                                              | Purpose                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| [`STATUS-DASHBOARD.md`](./STATUS-DASHBOARD.md)                                                                                                   | Progress, decisions, findings, verification    |
| [`../superpowers/specs/2026-08-09-data-completeness-dashboard-design.md`](../superpowers/specs/2026-08-09-data-completeness-dashboard-design.md) | Design spec                                    |
| [`../superpowers/plans/2026-08-09-data-completeness-dashboard.md`](../superpowers/plans/2026-08-09-data-completeness-dashboard.md)               | Implementation plan (11 tasks)                 |
| [`../api.md`](../api.md)                                                                                                                         | Endpoint contracts                             |
| [`../PROJECT-KNOWLEDGE.md`](../PROJECT-KNOWLEDGE.md)                                                                                             | §1 capability, §5 model, §8 caveat, §11 detail |

## What it does

An admin opens the **Data health** tab on `/admin/leagues/:leagueId`. The server
audits the current season and returns issues grouped by category, ordered by
severity. Every item links to where it gets fixed — the panel is read-only.

Admins can **dismiss** an item they've judged fine. Dismissed items drop to a
collapsed "Dismissed (n)" section rather than disappearing, and can be restored.

## The nine checks

| Check               | Level  | Severity | Fires when                                                |
| ------------------- | ------ | -------- | --------------------------------------------------------- |
| `overdue_game`      | League | High     | `scheduled` and >48h past tip-off                         |
| `stuck_in_progress` | League | High     | `in_progress` and >48h past tip-off                       |
| `missing_box_score` | League | High     | `completed` with no events                                |
| `no_appearances`    | Team   | Medium   | active player, 0 appearances, **and** the team has played |
| `roster_too_small`  | Team   | Medium   | fewer than 5 active players                               |
| `missing_jersey`    | Team   | Low      | active player with no jersey number (`0` is valid)        |
| `unclaimed_player`  | Team   | Low      | active player with no claimed account                     |
| `no_venue`          | League | Low      | **future** scheduled game with no venue                   |
| `no_logo`           | Team   | Low      | team with no logo                                         |

**High** means the standings are wrong until it's fixed. That's the line — the
tiers aren't vibes.

## Where the code lives

**Server**

| File                                                              | Role                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `server/src/modules/leagues/dataCompleteness.checks.js`           | **Pure** engine: all 9 rules, `CHECK_META`, grouping, counting |
| `server/src/modules/leagues/dataCompleteness.repository.js`       | `LeagueDataIssueDismissal` model + query helpers               |
| `server/src/modules/leagues/dataCompleteness.service.js`          | Auth tiers, season resolve, data loading, dismissal merge      |
| `server/src/modules/leagues/dataCompleteness.validation.js`       | `dismissIssueSchema`                                           |
| `server/src/modules/leagues/leagues.controller.js` / `.routes.js` | The three endpoints                                            |

**Client**

| File                                                               | Role                      |
| ------------------------------------------------------------------ | ------------------------- |
| `client/src/features/leagues/components/DataCompletenessPanel.jsx` | The panel                 |
| `client/src/features/leagues/api/leaguesApi.js`                    | 3 methods on `leaguesApi` |
| `client/src/features/leagues/pages/AdminLeaguePage.jsx`            | Tab entry + lazy fetch    |

## If you change this, know these

- **The 48-hour grace period is load-bearing.** A `scheduled` fixture is
  invisible until 48h past tip-off. Without it, a freshly built 60-game season
  shows 60 warnings on day one and admins learn to ignore the panel. Same clock
  applies to `in_progress`.
- **`CHECK_META` must list every emitted check type.** `groupIntoCategories`
  filters through its keys, so a new check type that isn't declared there
  vanishes from the dashboard **silently**. There's a test asserting all nine.
- **Appearances come from `LeaguePlayerStats`, not game events.** There is no
  `event.leaguePlayerId` — events carry `playerId`, which references a game's
  embedded roster _snapshot_, not `LeaguePlayer._id`. Counting events directly
  yields an empty map and flags every player.
- **Jersey `0` is a legal number.** Test for null/undefined, never falsiness.
- **`issueKey` must stay free of mutable data.** It's the persisted dismissal
  identity; a rescheduled game must keep its key or the dismissal resurfaces.
- **Dismissing is stricter than viewing.** Team managers may view (their own
  team only) but must not dismiss — that's a league-wide judgement.
- **The engine is pure and `now` is injected.** Keep it that way; it's what
  makes the 48h boundary deterministically testable.
- **Issue `href`s must match real router paths.** The engine is pure, so its
  tests assert href strings against themselves — nothing catches a link that
  points nowhere. The first version shipped `/admin/games/:id` and
  `/admin/leagues/teams/:id`, neither of which exists; the real routes are
  `/games/:gameId` and `/admin/leagues/:leagueId/teams/:leagueTeamId`. Check
  `client/src/app/router/AppRouter.jsx` when adding a check.
- **Games are loaded through `listLeagueGamesForCompleteness`**, which projects
  `events: { $slice: 1 }` and uses `.lean()`. The engine only ever tests
  `events.length === 0`, so a sliced array is sufficient — but if you ever need
  to _iterate_ events here, that projection will silently give you wrong
  answers.

## Before you add a check

Verify the field exists **and** that an admin can act on it. Two checks from the
original idea described fields that don't exist (`minutes`, a player photo), and
one planned implementation read a field that isn't there
(`event.leaguePlayerId`). Name the check after what it measures, not what you
wish it measured.

## Deferred (not built)

Inline fix actions · per-league configurable thresholds · cross-league operator
view (idea #19) · historic seasons · CSV export · notifications on new issues
(needs idea #14) · a single health score.
