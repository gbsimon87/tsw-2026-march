# Data-Completeness Dashboard — Status Dashboard

> Updated: 2026-08-09 · Branch `feature/data-completeness-dashboard`
> Legend: ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked · ⚪ deferred

## Overall

|                    |                                                      |
| ------------------ | ---------------------------------------------------- |
| **Phase**          | 🟨 Phase 0 — design agreed, awaiting spec review     |
| **Tasks complete** | 0 / TBD (set when the plan is written)               |
| **Server suite**   | 592 / 592 baseline at branch point                   |
| **Client suite**   | 17 failing — pre-existing OPT-026 baseline, not ours |
| **Blockers**       | none                                                 |
| **Next step**      | User reviews the spec → write implementation plan    |

```
Progress  [                    ] 0%
```

## Phases

| Phase             | Scope                                              | Status | Tasks |
| ----------------- | -------------------------------------------------- | ------ | ----- |
| 0 · Design        | Q&A, spec, tracker                                 | 🟨     | 2 / 3 |
| 1 · Server checks | Check engine + service + route                     | ⬜     | 0 / ? |
| 2 · Dismissals    | Model, repository, dismiss/restore endpoints       | ⬜     | 0 / ? |
| 3 · Client UI     | Panel component, tab registration, api client      | ⬜     | 0 / ? |
| 4 · Verify        | Full suites, lint, build, manual pass incl. mobile | ⬜     | 0 / ? |

## Decision log

| #   | Decision                                                  | Status                                                        |
| --- | --------------------------------------------------------- | ------------------------------------------------------------- |
| D1  | New tab on `AdminLeaguePage`                              | ✅ agreed                                                     |
| D2  | League **and** team level; admins + managers only         | ✅ agreed                                                     |
| D3  | Current season only                                       | ✅ agreed                                                     |
| D4  | 48h grace after tip-off before a fixture is "overdue"     | ✅ agreed — the rule that stops the panel crying wolf         |
| D5  | One-sided games: flag only the tracked side               | ✅ agreed                                                     |
| D6  | All checks kept, severity-weighted                        | ✅ agreed                                                     |
| D6a | Player image = claimed user's avatar → "Unclaimed player" | ⚠️ **changed from the original idea** — see below             |
| D7  | Minimum roster = 5 active players                         | ✅ agreed — advisory, never blocking                          |
| D8  | Read-only v1; inline fixes deferred                       | ✅ agreed                                                     |
| D9  | Dismissible items, collapsed section at the bottom        | ✅ agreed                                                     |
| D10 | Warnings only, no error tier                              | ✅ agreed                                                     |
| D11 | Count per category, no health score                       | ✅ agreed                                                     |
| D12 | Per-league; cross-league view is idea #19                 | ✅ agreed                                                     |
| D13 | "Zero minutes" → "no recorded appearances"                | ⚠️ **changed from the original idea** — see below             |
| D14 | Computed on read, not materialized                        | ✅ proposed — keeps this XS by avoiding invalidation coupling |

## Findings that changed the design

Two checks from the original idea could not be built as written. Both were
caught by reading the schema during design rather than during implementation.

| Original                        | Problem                                                                                                                           | Resolution                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| "players with zero **minutes**" | **No `minutes` field exists.** `LeaguePlayerStats` has `gamesCount` + box-score counters only                                     | Reinterpreted as `gamesCount === 0` → **"No recorded appearances"**              |
| "players with no **photo**"     | `playerImage` exists but is a **computed feed-card field**, sourced from the claimed user's avatar — not stored on `LeaguePlayer` | Reframed as **"Unclaimed player"** + added missing `jerseyNumber`; see spec §3.1 |

**On `playerImage`** — it is real, but the chain is
`LeaguePlayer.claimedByUserId → User.avatar.url → avatarUrl
(leagues.service.js:192) → playerImage (feed.service.js:195)`. So an unclaimed
player _cannot_ have an image, and a claimed one's avatar is a personal account
setting. Neither is admin-fixable, which is why the check reports the claim
status instead — the actionable fact underneath.

Also confirmed: **no minimum roster size is enforced anywhere in code**, so the
5-player rule (D7) is a new advisory product rule, not an existing constraint.

## Risk watchlist

| Risk                                        | Status                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Panel cries wolf after a schedule build     | mitigated by D4 (48h) + the "≥1 completed game" guard on appearance checks |
| Dismissals permanently hide real issues     | mitigated — kept visible in a collapsed, counted section; never deleted    |
| Issue keys drift, resurfacing dismissals    | keys exclude mutable fields; to be asserted by test                        |
| Check names drifting from what they measure | every check named for the field it actually reads (see findings above)     |

## Deferred

Inline fix actions · per-league thresholds · cross-league operator view (idea
#19) · historic seasons · CSV export · new-issue notifications (needs idea #14)
· single health score.
