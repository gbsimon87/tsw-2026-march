# Data-Completeness Dashboard — Status Dashboard

> Updated: 2026-08-09 · Branch `feature/data-completeness-dashboard`
> Legend: ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked · ⚪ deferred

## Overall

|                              |                                                         |
| ---------------------------- | ------------------------------------------------------- |
| **Phase**                    | ✅ All phases complete — awaiting review/merge          |
| **Tasks complete**           | 11 / 11                                                 |
| **Server suite**             | ✅ 654 / 654 passing (62 suites)                        |
| **Client suite**             | ✅ 249 passing; 17 failing = unchanged OPT-026 baseline |
| **check-env / lint / build** | ✅ all clean                                            |
| **Blockers**                 | none                                                    |
| **Next step**                | Final whole-branch review, then merge → `dev`           |

```
Progress  [████████████████████] 100%
```

## Phases

| Phase            | Scope                                    | Status | Tasks |
| ---------------- | ---------------------------------------- | ------ | ----- |
| 0 · Design       | Q&A, spec, plan, tracker                 | ✅     | 3 / 3 |
| 1 · Check engine | Game checks, roster checks, grouping     | ✅     | 3 / 3 |
| 2 · Persistence  | Dismissal model, repository, validation  | ✅     | 2 / 2 |
| 3 · Server API   | Service + auth, controller + routes      | ✅     | 2 / 2 |
| 4 · Client UI    | API methods, panel component, tab wiring | ✅     | 3 / 3 |
| 5 · Verify       | Full suites, lint, build, docs           | ✅     | 1 / 1 |

## Completed

| Task                    | Commit               | Note                                                                   |
| ----------------------- | -------------------- | ---------------------------------------------------------------------- |
| 1 · Game checks         | `bcb1760`            | 4 checks; 48h boundary mutation-tested                                 |
| 2 · Roster checks       | `18624cc`            | 5 checks; jersey `0` treated as present, not missing                   |
| 3 · Grouping + counts   | `6104a98`            | `CHECK_META` verified complete for all 9 emitted types                 |
| 4 · Dismissal model     | `b5ac59a`            | Unique on `(leagueId, seasonId, issueKey)`; guarded model registration |
| 5 · Validation          | `6d91d02`, `5267a2b` | issueKey regex tightened to a 24-char hex ObjectId target after review |
| 6 · Service + auth      | `4292bf8`            | 3 access tiers; team-manager scoping verified by review                |
| 7 · Controller + routes | `99523df`            | 3 endpoints; route wiring mutation-tested                              |
| 8 · Client API          | `6195423`            | 3 `leaguesApi` methods; `encodeURIComponent` on the colon-bearing key  |
| 9 · Panel component     | `a74320f`            | 11 tests; 4 distinct states; a11y names carry the item label           |
| 10 · Tab wiring         | `88fc168`            | Imperative fetch, no `useQuery`; zero new client failures              |
| 11 · Verify + docs      | this commit          | `api.md`, PROJECT-KNOWLEDGE §1/§5/§8/§11/§12, trackers                 |

## Final verification (2026-08-09)

| Check            | Result                                                      |
| ---------------- | ----------------------------------------------------------- |
| Server suite     | ✅ 654 / 654 (62 suites)                                    |
| Client suite     | ✅ 249 passing; 17 failing = **unchanged** OPT-026 baseline |
| `pnpm check-env` | ✅ environment files valid                                  |
| `pnpm lint`      | ✅ clean, both workspaces                                   |
| `pnpm build`     | ✅ clean                                                    |

## Findings that changed the design

Three items from the original idea could not be built as written. All were
caught by reading the schema — two during design, one during implementation.

| Original                        | Problem                                                                                                                 | Resolution                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| "players with zero **minutes**" | **No `minutes` field exists.** `LeaguePlayerStats` holds `gamesCount` + box-score counters only                         | Reinterpreted as `gamesCount === 0` → **"No recorded appearances"**    |
| "players with no **photo**"     | `playerImage` is a **computed feed-card field**, sourced from the claiming user's avatar — not stored on `LeaguePlayer` | Reframed as **"Unclaimed player"**, plus a real `jerseyNumber` check   |
| Appearances from game events    | **`event.leaguePlayerId` does not exist.** Events carry `playerId`, referencing a game's embedded roster _snapshot_     | Read the materialized `listLeaguePlayerStats(leagueId, seasonId)` rows |

The third would have been a silent wrong answer — an empty map flagging **every**
rostered player as having no appearances. It was caught in the pre-flight scan
before any code was written.

Also confirmed: **no minimum roster size is enforced anywhere in code**, so the
5-player rule is a new advisory product rule, not an existing constraint.

## Bugs caught in the plan during execution

The implementation plan contained four errors that subagents or the pre-flight
scan caught before they shipped:

| Plan said                                    | Reality                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `listLeaguePlayers(league._id)`              | Function is **team-scoped** — would have silently reported every roster empty   |
| Tests asserting `err.status`                 | `ApiError` stores **`statusCode`** — assertions would have passed **vacuously** |
| Integration tests using `../helpers/testApp` | No such helper exists; real pattern is `createApp` + Bearer `signAccessToken`   |
| Route prefix `/api`                          | Actual prefix is **`/api/v1`**                                                  |

## Final whole-branch review (2026-08-09)

The per-task reviews all passed, but the whole-branch review found **2 Critical
and 3 Important** issues that only a cross-task view could see. All were fixed
in one wave (`5cd1250`) and confirmed by a scoped re-review.

| #   | Severity  | Finding                                                                                               |
| --- | --------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Critical  | **Every issue link was a dead 404.** `/admin/games/:id` and `/admin/leagues/teams/:id` match no route |
| 2   | Critical  | `DELETE :issueKey` was unvalidated while `POST` validated — asymmetric contract on a write path       |
| 3   | Important | `canDismiss` hardcoded `true`, so team managers saw Dismiss buttons that always 403                   |
| 4   | Important | The 48h rule wasn't applied to `missing_box_score` — a just-finalised game flashed a HIGH warning     |
| 5   | Important | Full `events` arrays loaded for the whole season on every tab open **and** every dismiss              |

**Why per-task review missed #1** — the check engine is pure, so its tests
assert `href` strings against themselves. Nothing in a unit test compares them
to the actual router. Worth remembering: purity makes the boundary testable and
the _contract at the boundary_ untested.

## Decision log

| #   | Decision                                                  | Status                                                                                                                         |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| D1  | New tab on `AdminLeaguePage`                              | ✅ shipped                                                                                                                     |
| D2  | League **and** team level; admins + managers only         | ✅ shipped — team managers see only their own team's roster issues                                                             |
| D3  | Current season only                                       | ✅ shipped                                                                                                                     |
| D4  | 48h grace after tip-off before a fixture is "overdue"     | ✅ shipped — mutation-tested on both sides of the boundary                                                                     |
| D5  | One-sided games: flag only the tracked side               | ✅ shipped                                                                                                                     |
| D6  | All checks kept, severity-weighted                        | ✅ shipped — 9 checks total                                                                                                    |
| D6a | Player image = claimed user's avatar → "Unclaimed player" | ⚠️ changed from the original idea — see findings above                                                                         |
| D7  | Minimum roster = 5 active players                         | ✅ shipped — advisory, never blocking                                                                                          |
| D8  | Read-only v1; inline fixes deferred                       | ✅ shipped                                                                                                                     |
| D9  | Dismissible items, collapsed section at the bottom        | ✅ shipped                                                                                                                     |
| D10 | Warnings only, no error tier                              | ✅ shipped                                                                                                                     |
| D11 | Count per category, no health score                       | ✅ shipped                                                                                                                     |
| D12 | Per-league; cross-league view is idea #19                 | ✅ shipped                                                                                                                     |
| D13 | "Zero minutes" → "no recorded appearances"                | ⚠️ changed from the original idea — see findings above                                                                         |
| D14 | Computed on read, not materialized                        | ✅ shipped                                                                                                                     |
| D15 | `issueKey` target must be a 24-char hex ObjectId          | ✅ tightened after review — the plan's looser regex would have let a malformed key persist that could never match a real issue |

## Deferred minors (for the final review to triage)

| Item                                                                                       | From   |
| ------------------------------------------------------------------------------------------ | ------ |
| Exact-48h edge not directly asserted (bracketed by 47h/49h tests)                          | Task 1 |
| `stuck_in_progress` test asserts count only, thinner than `overdue_game`'s                 | Task 1 |
| Test named "claimed player regardless of avatar" varies no avatar — name overpromises      | Task 2 |
| Inactive players excluded from ALL per-player checks, not just roster count — undocumented | Task 2 |
| `deleteDismissal`'s `?? 0` fallback path untested                                          | Task 4 |
| `listLeagueTeams` fetched twice per team-manager request                                   | Task 6 |
| `.every()` assertion passes vacuously on an empty array (service test)                     | Task 6 |
| Category count badge shows `active.length`, always 0 inside the collapsed section          | Task 9 |

## Risk watchlist

| Risk                                        | Status                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Panel cries wolf after a schedule build     | ✅ mitigated by the 48h rule + the "team has played" guard                 |
| Dismissals permanently hide real issues     | ✅ mitigated — kept visible in a collapsed, counted section; never deleted |
| Issue keys drift, resurfacing dismissals    | ✅ keys exclude mutable fields; format asserted by validation + tests      |
| Check names drifting from what they measure | ✅ every check named for the field it actually reads                       |

## Deferred to future versions

Inline fix actions · per-league configurable thresholds · cross-league operator
view (idea #19) · historic-season audit · CSV export · notifications when new
issues appear (needs idea #14) · a single health score.
